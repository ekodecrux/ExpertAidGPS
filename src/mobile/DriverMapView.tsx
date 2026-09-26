import React, { useState, useEffect, useRef } from 'react';
import MapComponent, { Marker, Popup, Polyline, vehicleIcon, stationIcon, createMarkerIcon } from '../components/MapComponent';
import { useAuth } from '../contexts/AuthContext';
import { db, auth } from '../lib/firebase';
import { isValidCoordinate, getSortedStops, getLocalAvatar, getLocalIcon, getUserAvatar } from '../lib/utils';
import { Activity, Navigation, Play, Target, Square, ChevronRight, MapPin, Truck, Shield, ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Users, X, Clock, Settings as SettingsIcon, CheckCircle, LogOut, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import { doc, onSnapshot, collection, query, where, addDoc, updateDoc, setDoc, serverTimestamp, getDocs, getDoc, arrayUnion } from 'firebase/firestore';
import { saveMySQLRecord, saveMySQLRecordsBatch } from '../lib/mysql';

export default function DriverMapView({ 
  activeTrip,
  setActiveTrip,
  isSelectingRoute,
  setIsSelectingRoute,
  driverData,
  setDriverData,
  driverDataLoading
}: { 
  activeTrip: any;
  setActiveTrip?: (v: any) => void;
  isSelectingRoute: boolean;
  setIsSelectingRoute: (v: boolean) => void;
  driverData?: any;
  setDriverData?: (v: any) => void;
  driverDataLoading?: boolean;
}) {
  const { userData } = useAuth();
  const [routes, setRoutes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [manifest, setManifest] = useState<any[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [tripType, setTripType] = useState<'pickup' | 'dropoff'>('pickup');
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [currentRoute, setCurrentRoute] = useState<any>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const [roadCoords, setRoadCoords] = useState<[number, number][]>([]);
  const driverUid = userData?.id || userData?.uid;
  const userVehicle = vehicles.find(v => v && (
    v.id === activeTrip?.vehicleId ||
    v.id === currentRoute?.vehicleId ||
    v.id === userData?.vehicleId ||
    (driverUid && v.driverId === driverUid) ||
    (currentRoute?.id && v.routeId === currentRoute.id)
  )) || vehicles[0] || null;

  const mapRef = useRef<any>(null);
  const transitionPending = useRef<string | null>(null);
  const optimisticUpdatesRef = useRef<Record<string, { status: string; timestamp: number; pickupStatus: string; dropoffStatus: string }>>({});
  
  const lastFetchedCoordsRef = useRef<string>('');
  
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // meters
  };

  // Helper to check if a date string is from today
  const isToday = (dateVal: any) => {
    if (!dateVal) return false;
    try {
      let d: Date;
      if (typeof dateVal.toDate === 'function') {
        d = dateVal.toDate();
      } else if (dateVal instanceof Date) {
        d = dateVal;
      } else {
        d = new Date(dateVal);
      }
      
      const today = new Date();
      return d.getDate() === today.getDate() &&
             d.getMonth() === today.getMonth() &&
             d.getFullYear() === today.getFullYear();
    } catch (e) {
      return false;
    }
  };

  // Helper to check if a student has been handled based on direction
  const isHandled = (u: any, direction: 'pickup' | 'dropoff') => {
    if (u.status === 'absent') return true;
    if (direction === 'dropoff') {
      return u.status === 'dropped';
    }
    // For pickup, 'dropped' also counts as 'picked'
    return u.status === 'picked' || u.status === 'dropped';
  };

  // Process manifest to ensure statuses are fresh for today and separate for pickup/dropoff
  const processedManifest = manifest.map(u => {
    const direction = activeTrip?.direction || tripType;
    
    // Choose appropriate status fields based on direction
    const dirStatus = direction === 'dropoff' ? u.dropoffStatus : u.pickupStatus;
    const dirUpdatedAt = direction === 'dropoff' ? u.dropoffUpdatedAt : u.pickupUpdatedAt;
    
    let currentStatus = dirStatus || 'waiting';
    let currentUpdatedAt = dirUpdatedAt;

    // Fallback/Migration: If direction-specific fields don't exist, 
    // try to use old generic 'status' if it matches the current focus
    if (!dirStatus && u.status && u.status !== 'waiting') {
      const oldUpdatedAt = u.statusUpdatedAt || u.pickedAt;
      if (isToday(oldUpdatedAt)) {
        // If we have an "absent" status, it usually belongs to pickup leg if generic
        if (u.status === 'absent' && direction === 'pickup') {
          currentStatus = 'absent';
          currentUpdatedAt = oldUpdatedAt;
        } else if (direction === 'dropoff' && u.status === 'dropped') {
          currentStatus = 'dropped';
          currentUpdatedAt = oldUpdatedAt;
        } else if (direction === 'pickup' && u.status === 'picked') {
          currentStatus = 'picked';
          currentUpdatedAt = oldUpdatedAt;
        }
      }
    }

    // Reset if status is not from today
    if (currentStatus !== 'waiting' && currentUpdatedAt && !isToday(currentUpdatedAt)) {
      currentStatus = 'waiting';
    }

    // Also track if they were absent in pickup for UI hint
    const wasAbsentAtPickup = u.pickupStatus === 'absent' || (u.status === 'absent' && isToday(u.statusUpdatedAt));

    return { ...u, status: currentStatus, wasAbsentAtPickup };
  });

  const sortedStopsList = React.useMemo(() => {
    return getSortedStops(currentRoute?.pickupPoints, activeTrip, activeTrip?.direction || tripType);
  }, [currentRoute?.pickupPoints, activeTrip, tripType]);

  // Helper to get route polyline coordinates (stops sequence)
  const getRouteStops = () => {
    if (!currentRoute?.pickupPoints) return [];
    const direction = activeTrip?.direction || tripType;
    const stops: [number, number][] = [];
    
    // 1. Initial point: Driver Location
    if (userVehicle?.location && isValidCoordinate(userVehicle.location.lat, userVehicle.location.lng)) {
      stops.push([userVehicle.location.lat, userVehicle.location.lng]);
    }

    const hub = org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
      ? [org.location.lat, org.location.lng] as [number, number] 
      : null;

    const points = sortedStopsList;
    const routeStops = points
      .filter(p => isValidCoordinate(p.lat, p.lng))
      .map(p => [p.lat, p.lng] as [number, number]);

    const allMembersHandled = processedManifest.length > 0 && processedManifest.every(m => isHandled(m, direction));
    
    // If everything is done, check if we need to terminate or go to Hub
    if (allMembersHandled) {
      if (hub) {
        const distToHub = userVehicle?.location ? getDistance(userVehicle.location.lat, userVehicle.location.lng, hub[0], hub[1]) : Infinity;
        if (distToHub < 50) return [];
        stops.push(hub);
        return stops;
      }
      return [];
    }

    const currentStopId = activeTrip?.currentStopId;
    const currentStopIdx = points.findIndex((p: any) => String(p.id) === String(currentStopId));

    if (direction === 'pickup') {
      // Sequence: Stops -> Hub
      if (currentStopId === 'ORG') {
        if (hub) stops.push(hub);
      } else if (currentStopIdx !== -1) {
        stops.push(...points.slice(currentStopIdx).map(p => [p.lat, p.lng] as [number, number]));
      } else {
        // Initial state or not targeting specific stop
        stops.push(...routeStops);
      }
    } else {
      // Sequence for Dropoff: Hub starting point -> Stops
      // If we haven't reached school yet, go to hub
      const distToHub = (hub && userVehicle?.location) ? getDistance(userVehicle.location.lat, userVehicle.location.lng, hub[0], hub[1]) : Infinity;
      if (hub && distToHub > 50 && !currentStopId) {
        stops.push(hub);
      }

      if (currentStopIdx !== -1) {
        stops.push(...points.slice(currentStopIdx).map(p => [p.lat, p.lng] as [number, number]));
      } else {
        stops.push(...routeStops);
      }
    }
    
    return stops;
  };

  // Helper to fetch road-following path from OSRM
  const fetchRoadPath = async (stops: [number, number][]) => {
    if (stops.length < 2) {
      setRoadCoords([]);
      return;
    }

    const coordinates = stops.map(s => `${s[1]},${s[0]}`).join(';');
    
    // Skip if we already fetched these exact coordinates recently
    if (lastFetchedCoordsRef.current === coordinates) return;
    lastFetchedCoordsRef.current = coordinates;
    
    const urls = [
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
      `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
      `/api/proxy/osrm/route/v1/driving/${coordinates}?overview=full&geometries=geojson`
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) continue;

        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
          const path: [number, number][] = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
          setRoadCoords(path);
          return; // Success! Exit early
        }
      } catch (err) {
        console.warn(`Failed fetching OSRM road path from ${url} in mobile view`, err);
      }
    }

    // fallback to straight lines if all fail
    setRoadCoords(stops);
  };

  // Update road path whenever current route or trip details change
  useEffect(() => {
    const stops = getRouteStops();
    if (stops.length >= 2) {
      fetchRoadPath(stops);
    } else {
      setRoadCoords([]);
    }
  }, [
    currentRoute?.id, 
    activeTrip?.currentStopId, 
    activeTrip?.direction, 
    tripType,
    // Round to 4 decimal places (~11m) to avoid hammering OSRM on tiny movements
    Math.round((userVehicle?.location?.lat || 0) * 10000) / 10000,
    Math.round((userVehicle?.location?.lng || 0) * 10000) / 10000
  ]);

  // 1. Fetch Comprehensive Data from MySQL (replaces Firestore listeners to prevent Quota limits & mismatches)
  useEffect(() => {
    if (!userData) return;

    const processMapData = (res: any) => {
      // 1. Set Organization (straight from MySQL)
      if (res.org) {
        setOrg(res.org);
      }

      // 2. Set Routes
      if (res.routes) {
        const driverId = userData?.id || userData?.uid;
        const assignedRoutes = res.routes.filter((r: any) => 
          r && (r.id === userData?.routeId || 
          (driverId && r.driverId === driverId))
        );
        setRoutes(assignedRoutes);
        
        // Set Current Route details
        let targetRouteId = activeTrip?.routeId || selectedRouteId || userData.routeId;
        
        // Automatically select and lock the single route if only one exists
        if (assignedRoutes.length === 1) {
          targetRouteId = assignedRoutes[0].id;
          if (selectedRouteId !== assignedRoutes[0].id) {
            setSelectedRouteId(assignedRoutes[0].id);
          }
        }

        if (targetRouteId) {
          const matchedRoute = res.routes.find((r: any) => r && r.id === targetRouteId);
          if (matchedRoute) {
            setCurrentRoute(matchedRoute);
          }
        }
      }

      // 3. Set Vehicles
      if (res.vehicles) {
        const mappedVehicles = res.vehicles.map((v: any) => {
          const locObj = (v.latitude !== null && v.longitude !== null && v.latitude !== undefined && v.longitude !== undefined)
            ? { lat: Number(v.latitude), lng: Number(v.longitude) }
            : (typeof v.location === 'string' ? (() => { try { return JSON.parse(v.location); } catch(e) { return null; } })() : v.location || res.org?.location || null);
          return {
            ...v,
            plateNumber: v.plateNumber || v.number || "BUS-01",
            location: locObj
          };
        });
        setVehicles(mappedVehicles);
      }

      // 4. Set Route Manifest (users on active route)
      const targetRouteId = activeTrip?.routeId || selectedRouteId || userData.routeId;
      if (targetRouteId && res.users) {
        const matchedManifest = res.users.map((u: any) => {
          const opt = optimisticUpdatesRef.current[u.id || u.uid];
          // If there's an optimistic update within the last 15 seconds, apply it to prevent interval flicker
          if (opt && Date.now() - opt.timestamp < 15000) {
            return {
              ...u,
              status: opt.status,
              pickupStatus: opt.pickupStatus,
              dropoffStatus: opt.dropoffStatus,
            };
          }
          return u;
        }).filter((u: any) => u.routeId === targetRouteId && (u.role === 'user' || u.role === 'member'));
        setManifest(matchedManifest);
      }
    };

    if (driverData) {
      processMapData(driverData);
      setLoading(false);
    }

    const fetchMySQLDriverMapData = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const resObj = await fetch('/api/records/user-data', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (resObj.ok) {
          const res = await resObj.json();
          if (res.success) {
            processMapData(res);
          }
        }
      } catch (err: any) {
        if (err.message?.includes("Failed to fetch") || err.name === "TypeError") {
          console.warn("Transient network connection to /api/records/user-data in DriverMapView is resolving...");
        } else {
          console.error("Error fetching driver map data from MySQL:", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMySQLDriverMapData();
    // Poll every 3 seconds for extremely smooth maps and location markers
    const interval = setInterval(fetchMySQLDriverMapData, 3000);

    return () => clearInterval(interval);
  }, [userData, activeTrip, selectedRouteId, driverData]);

  // Guarantee single route is auto-selected & active immediately
  useEffect(() => {
    if (routes.length === 1 && routes[0]?.id) {
      if (selectedRouteId !== routes[0].id) {
        setSelectedRouteId(routes[0].id);
      }
    }
  }, [routes, selectedRouteId]);

  // 1. Location-Independent completion-based auto advancement
  useEffect(() => {
    if (!activeTrip || !currentRoute?.pickupPoints) return;
    if (activeTrip.status !== 'live' && activeTrip.status !== 'ongoing') return;

    const currentStopId = activeTrip.currentStopId;
    if (!currentStopId || currentStopId === 'ORG') return;

    const stopMembers = processedManifest.filter(u => String(u.pickupPointId) === String(currentStopId));
    const direction = activeTrip?.direction || tripType;
    const allHandled = stopMembers.length > 0 && stopMembers.every(u => isHandled(u, direction));

    // If all passengers at this stop are completed/handled
    if (allHandled && stopMembers.length > 0) {
      const points = sortedStopsList;
      const currentIdx = points.findIndex((p: any) => String(p.id) === String(currentStopId));

      // Find the next pending stop
      let nextPendingStop: any = null;
      if (currentIdx !== -1) {
        for (let i = currentIdx + 1; i < points.length; i++) {
          const p = points[i];
          const members = processedManifest.filter(u => String(u.pickupPointId) === String(p.id));
          const isPending = members.length > 0 && members.some(u => !isHandled(u, direction));
          if (isPending) {
            nextPendingStop = p;
            break;
          }
        }
      }

      // If no pending stops found in sequence, look at all of them
      if (!nextPendingStop) {
        points.forEach((p: any) => {
          if (String(p.id) !== String(currentStopId)) {
            const members = processedManifest.filter(u => String(u.pickupPointId) === String(p.id));
            const isPending = members.length > 0 && members.some(u => !isHandled(u, direction));
            if (isPending && !nextPendingStop) {
              nextPendingStop = p;
            }
          }
        });
      }

      // Small elegant delay to let the driver see the UI state complete
      const timer = setTimeout(async () => {
        // Close the popup/modal
        setSelectedStopId(null);

        if (nextPendingStop) {
          try {
            // Optimistic local state updates to prevent delayed render loops
            if (setActiveTrip) {
              setActiveTrip({
                ...activeTrip,
                currentStopId: nextPendingStop.id
              });
            }
            if (setDriverData && driverData) {
              const updatedTrips = (driverData.trips || []).map((t: any) => {
                if (t && t.id === activeTrip.id) {
                  return { ...t, currentStopId: nextPendingStop.id };
                }
                return t;
              });
              setDriverData({
                ...driverData,
                trips: updatedTrips
              });
            }

            toast.success(`Advancing to next stop: ${nextPendingStop.name}`, { id: `auto-advance-${currentStopId}` });

            // Run database writes concurrently in background
            Promise.all([
              updateDoc(doc(db, 'trips', activeTrip.id), {
                currentStopId: nextPendingStop.id
              }),
              saveMySQLRecord('update', 'trips', activeTrip.id, {
                currentStopId: nextPendingStop.id
              })
            ]).catch((err) => {
              console.warn("[AutoAdvance] background write failed:", err);
            });
          } catch (e) {
            console.error("Error auto-advancing stop:", e);
          }
        } else {
          // If no more pending stops at all, navigate to ORG!
          try {
            // Optimistic local state updates
            if (setActiveTrip) {
              setActiveTrip({
                ...activeTrip,
                currentStopId: 'ORG'
              });
            }
            if (setDriverData && driverData) {
              const updatedTrips = (driverData.trips || []).map((t: any) => {
                if (t && t.id === activeTrip.id) {
                  return { ...t, currentStopId: 'ORG' };
                }
                return t;
              });
              setDriverData({
                ...driverData,
                trips: updatedTrips
              });
            }

            if (direction === 'pickup') {
              toast.success("All stops completed! Returning to base.", { id: 'auto-advance-org' });
            } else {
              toast.success("All drops completed! Returning to base.", { id: 'auto-advance-finished' });
            }

            // Run database writes concurrently in background
            Promise.all([
              updateDoc(doc(db, 'trips', activeTrip.id), {
                currentStopId: 'ORG'
              }),
              saveMySQLRecord('update', 'trips', activeTrip.id, {
                currentStopId: 'ORG'
              })
            ]).catch((err) => {
              console.warn("[AutoAdvance to ORG] background write failed:", err);
            });
          } catch (e) {
            console.error("Error auto-advancing to ORG:", e);
          }
        }
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [activeTrip?.id, activeTrip?.currentStopId, activeTrip?.status, activeTrip?.direction, processedManifest, sortedStopsList]);

  // 2. Automated stop advancement based on proximity (GPS)
  useEffect(() => {
    if (!activeTrip || !userVehicle?.location) return;

    const points = sortedStopsList;
    const currentIdx = points.findIndex((p: any) => String(p.id) === String(activeTrip.currentStopId));
    
    // Auto-Target First Pending Stop in Sequence if none active OR if we are lost
    if ((currentIdx === -1 || !activeTrip.currentStopId) && activeTrip.status === 'live') {
      let firstPendingStopId = null;

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (isValidCoordinate(p.lat, p.lng)) {
          // Only consider stops that have pending members
          const stopMembers = processedManifest.filter(u => String(u.pickupPointId) === String(p.id));
          const direction = activeTrip?.direction || tripType;
          const allHandled = stopMembers.length === 0 || stopMembers.every(u => isHandled(u, direction));
          if (!allHandled) {
            firstPendingStopId = p.id;
            break;
          }
        }
      }
      
      if (firstPendingStopId && String(firstPendingStopId) !== String(activeTrip.currentStopId) && !transitionPending.current) {
        handleUpdateStop(String(firstPendingStopId));
      }
    }

    // Advance to next stop logic based on proximity
    if (activeTrip.currentStopId && userVehicle?.location && currentIdx !== -1) {
      const currentStop = points[currentIdx];
      
      // Prevent multiple notifications/transitions behavior for the SAME stop
      if (transitionPending.current === activeTrip.currentStopId) return;

      if (currentStop && isValidCoordinate(currentStop.lat, currentStop.lng)) {
        const distToCurrent = getDistance(userVehicle.location.lat, userVehicle.location.lng, currentStop.lat, currentStop.lng);
        
        // If driver is at the stop (within 50m)
        if (distToCurrent < 50) {
           // Find the NEXT PENDING stop in the sequence
           let nextPendingStop: any = null;
           for (let i = currentIdx + 1; i < points.length; i++) {
             const p = points[i];
             const members = processedManifest.filter(u => String(u.pickupPointId) === String(p.id));
             const direction = activeTrip?.direction || tripType;
             const isPending = members.length > 0 && members.some(u => !isHandled(u, direction));
             if (isPending && isValidCoordinate(p.lat, p.lng)) {
               nextPendingStop = p;
               break;
             }
           }

           // Fallback: search the whole sequence if we missed some before
           if (!nextPendingStop) {
             for (let i = 0; i < points.length; i++) {
               const p = points[i];
               if (String(p.id) !== String(activeTrip.currentStopId)) {
                 const members = processedManifest.filter(u => String(u.pickupPointId) === String(p.id));
                 const direction = activeTrip?.direction || tripType;
                 const isPending = members.length > 0 && members.some(u => !isHandled(u, direction));
                 if (isPending && isValidCoordinate(p.lat, p.lng)) {
                   nextPendingStop = p;
                   break;
                 }
               }
             }
           }

           if (nextPendingStop) {
               transitionPending.current = activeTrip.currentStopId;
               const timer = setTimeout(() => {
                 handleUpdateStop(nextPendingStop.id);
                 toast.success(`Arrived at stop. Advancing to next scheduled: ${nextPendingStop.name}`, { id: `transition-${currentStop.id}` });
               }, 8000);

               return () => clearTimeout(timer);
           } else if (activeTrip.currentStopId !== 'ORG') {
             // If no more pending stops, but we aren't at HUB yet, check if ALL stops are handled
             const direction = activeTrip?.direction || tripType;
             const anyManifestPending = processedManifest.some(u => !isHandled(u, direction));
             
             if (!anyManifestPending) {
                transitionPending.current = activeTrip.currentStopId;
                const timer = setTimeout(() => {
                  handleUpdateStop('ORG');
                  if (direction === 'pickup') {
                    toast.success("Route completed. Returning to base.", { id: 'transition-org' });
                  } else {
                    toast.success("All drops completed! Returning to base.", { id: 'transition-finished' });
                  }
                  setSelectedStopId(null);
                }, 8000);
                return () => clearTimeout(timer);
             }
           }
        }
      } else if (activeTrip.currentStopId === 'ORG' && org?.location) {
        const distToOrg = getDistance(userVehicle.location.lat, userVehicle.location.lng, org.location.lat, org.location.lng);
        if (distToOrg < 50 && transitionPending.current !== 'ORG_ARRIVED') {
           transitionPending.current = 'ORG_ARRIVED';
           toast.success("Arrived at Organization!", { id: 'org-arrival' });
        }
      }
    }
  }, [userVehicle?.location, activeTrip?.currentStopId, activeTrip?.status, org, processedManifest, sortedStopsList]);

  // Reset transition pending when the firestore stop actually updates
  useEffect(() => {
    if (activeTrip?.currentStopId) {
      if (transitionPending.current !== activeTrip.currentStopId) {
        transitionPending.current = null;
      }
    }
  }, [activeTrip?.currentStopId]);

  const findAndTargetNearestStop = () => {
    if (!currentRoute?.pickupPoints || !userVehicle?.location) return;
    const points = currentRoute.pickupPoints;
    let nearestStopId = null;
    let minDistance = Infinity;

    points.forEach((p: any) => {
      if (isValidCoordinate(p.lat, p.lng)) {
        // Only consider stops that have pending members
        const stopMembers = processedManifest.filter(u => String(u.pickupPointId) === String(p.id));
        const targetStatus = activeTrip?.direction === 'dropoff' ? 'dropped' : 'picked';
        const allHandled = stopMembers.length === 0 || stopMembers.every(u => u.status === targetStatus || u.status === 'absent');
        if (allHandled) return;

        const dist = getDistance(userVehicle.location.lat, userVehicle.location.lng, p.lat, p.lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestStopId = p.id;
        }
      }
    });
    
    if (nearestStopId) {
      handleUpdateStop(nearestStopId);
      if (mapRef.current && userVehicle.location) {
        mapRef.current.flyTo([userVehicle.location.lat, userVehicle.location.lng], 16);
      }
      toast.success("Recalibrated to nearest stop", { id: 'nearest-recalc' });
    }
  };

  const handleStartTrip = async () => {
    if (!userData) return;
    if (!selectedRouteId) {
      toast.error("Please select a route first");
      return;
    }
    
    try {
      toast.loading("Initializing trip...", { id: 'start-trip' });
      const tripId = `TRIP-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Reset statuses in MySQL for starting trip direction to waiting in a single fast batch!
      const isPickup = tripType === 'pickup';
      const batchOps = manifest.map((m) => {
        const resetData: any = {};
        if (isPickup) {
          resetData.pickupStatus = 'waiting';
          resetData.pickupUpdatedAt = null;
        } else {
          resetData.dropoffStatus = 'waiting';
          resetData.dropoffUpdatedAt = null;
        }
        return {
          operation: 'update' as const,
          table: 'users',
          id: m.uid || m.id,
          data: resetData
        };
      });

      // Create a clean manifest based on the direction resetting
      const cleanManifest = manifest.map((m) => ({
        ...m,
        pickupStatus: isPickup ? 'waiting' : m.pickupStatus,
        dropoffStatus: !isPickup ? 'waiting' : m.dropoffStatus,
        pickupUpdatedAt: isPickup ? null : m.pickupUpdatedAt,
        dropoffUpdatedAt: !isPickup ? null : m.dropoffUpdatedAt,
      }));
      setManifest(cleanManifest);

      const vehicleId = userData.vehicleId || 'DEV-V1';

      // Determine the first stop with pending members in the sorted order
      let initialStopId: any = null;
      if (currentRoute?.pickupPoints && currentRoute.pickupPoints.length > 0) {
        const sortedPoints = getSortedStops(currentRoute.pickupPoints, null, tripType);
        for (const p of sortedPoints) {
          if (isValidCoordinate(p.lat, p.lng)) {
            const stopMembers = cleanManifest.filter(u => String(u.pickupPointId) === String(p.id));
            const targetStatus = tripType === 'dropoff' ? 'dropped' : 'picked';
            const allHandled = stopMembers.length === 0 || stopMembers.every(u => u.status === targetStatus || u.status === 'absent');
            if (!allHandled) {
              initialStopId = p.id;
              break;
            }
          }
        }
        if (!initialStopId && sortedPoints.length > 0) {
          initialStopId = sortedPoints[0].id;
        }
      }

      // Construct local trip object
      const newTrip = {
        id: tripId,
        orgId: userData.orgId,
        routeId: selectedRouteId,
        driverId: userData.id || userData.uid,
        vehicleId: vehicleId,
        status: 'live',
        direction: tripType,
        startTime: new Date().toISOString(),
        currentLat: org?.location?.lat || 0,
        currentLng: org?.location?.lng || 0,
        currentStopId: initialStopId,
        manifest: JSON.stringify(
          cleanManifest.map((m) => ({
            uid: m.uid || m.id,
            studentId: m.studentId || "",
            name: m.name,
            pickupStatus: m.pickupStatus,
            dropoffStatus: m.dropoffStatus,
            pickupUpdatedAt: m.pickupUpdatedAt,
            dropoffUpdatedAt: m.dropoffUpdatedAt,
            pickupPointId: m.pickupPointId,
          }))
        )
      };

      // 1. Instantly trigger optimistic UI updates
      if (setActiveTrip) {
        setActiveTrip(newTrip);
      }
      if (setDriverData && driverData) {
        const updatedTrips = [...(driverData.trips || []).filter((t: any) => t && t.id !== tripId), newTrip];
        setDriverData({
          ...driverData,
          trips: updatedTrips
        });
      }

      setIsSelectingRoute(false);
      toast.success("Trip engaged successfully!", { id: 'start-trip' });

      // 2. Perform database writes in the background concurrently
      Promise.all([
        saveMySQLRecordsBatch(batchOps).catch((err) => {
          console.warn("[StartTrip] MySQL reset statuses batch failed:", err.message);
        }),
        saveMySQLRecord('insert', 'trips', tripId, {
          orgId: userData.orgId,
          routeId: selectedRouteId,
          driverId: userData.id || userData.uid,
          vehicleId: vehicleId,
          status: 'live',
          direction: tripType,
          startTime: new Date().toISOString(),
          currentLat: org?.location?.lat || 0,
          currentLng: org?.location?.lng || 0,
          currentStopId: initialStopId,
          manifest: JSON.stringify(
            cleanManifest.map((m) => ({
              uid: m.uid || m.id,
              studentId: m.studentId || "",
              name: m.name,
              pickupStatus: m.pickupStatus,
              dropoffStatus: m.dropoffStatus,
              pickupUpdatedAt: m.pickupUpdatedAt,
              dropoffUpdatedAt: m.dropoffUpdatedAt,
              pickupPointId: m.pickupPointId,
            }))
          )
        }).catch((err) => {
          console.warn("[StartTrip] MySQL trip insert failed:", err.message);
        }),
        setDoc(doc(db, 'trips', tripId), {
          orgId: userData.orgId,
          routeId: selectedRouteId,
          driverId: userData.id || userData.uid,
          vehicleId: vehicleId,
          status: 'live',
          direction: tripType,
          startTime: serverTimestamp(),
          currentLocation: { lat: org?.location?.lat || 0, lng: org?.location?.lng || 0 },
          currentStopId: initialStopId
        }).catch((err) => {
          console.warn("[StartTrip] Firestore trip set failed:", err.message);
        }),
        saveMySQLRecord('update', 'vehicles', vehicleId, { status: 'on-trip' }).catch((err) => {
          console.warn("[StartTrip] MySQL vehicle status update failed:", err.message);
        }),
        updateDoc(doc(db, 'vehicles', vehicleId), { status: 'on-trip' }).catch((err) => {
          console.warn("[StartTrip] Firestore vehicle status update failed:", err.message);
        })
      ]).then(() => {
        console.log("[StartTrip] Background writes finished.");
      });

    } catch (e) {
      console.error("Error starting trip:", e);
      toast.error("Failed to start trip", { id: 'start-trip' });
    }
  };

  const handleUpdateStop = async (stopId: string) => {
    if (!activeTrip || !currentRoute) return;
    if (String(activeTrip.currentStopId) === String(stopId)) {
      setSelectedStopId(null);
      return; 
    }
    
    try {
      // 1. Optimistic local updates to prevent endless useEffect loops
      if (setActiveTrip) {
        setActiveTrip({
          ...activeTrip,
          currentStopId: stopId
        });
      }
      if (setDriverData && driverData) {
        const updatedTrips = (driverData.trips || []).map((t: any) => {
          if (t && t.id === activeTrip.id) {
            return { ...t, currentStopId: stopId };
          }
          return t;
        });
        setDriverData({
          ...driverData,
          trips: updatedTrips
        });
      }

      setSelectedStopId(null); // Close modal when manual target set
      toast.success("Tracking new target stop", { id: 'stop-update' });

      // 2. Perform database writes in the background
      Promise.all([
        updateDoc(doc(db, 'trips', activeTrip.id), {
          currentStopId: stopId
        }),
        saveMySQLRecord('update', 'trips', activeTrip.id, {
          currentStopId: stopId
        })
      ]).catch((err) => {
        console.warn("[handleUpdateStop] background write failed:", err);
      });
    } catch (e) {
      console.error("Error updating stop:", e);
    }
  };

  const updateMemberStatus = async (memberId: string, newStatus: string) => {
    try {
      const direction = activeTrip?.direction || tripType;
      const userRef = doc(db, 'users', memberId);
      
      const updateData: any = {};
      const now = new Date().toISOString();

      if (direction === 'dropoff') {
        updateData.dropoffStatus = newStatus;
        updateData.dropoffUpdatedAt = now;
      } else {
        updateData.pickupStatus = newStatus;
        updateData.pickupUpdatedAt = now;
      }
      
      // Keep generic 'status' for backward compatibility and other views
      updateData.status = newStatus;
      updateData.statusUpdatedAt = serverTimestamp();
      
      if (newStatus === 'picked') updateData.pickedAt = now;

      // Keep optimistic record to prevent immediate polling overwriting
      const prevMember = manifest.find(m => m.id === memberId || m.uid === memberId);
      const prevPickup = prevMember?.pickupStatus || 'waiting';
      const prevDropoff = prevMember?.dropoffStatus || 'waiting';

      optimisticUpdatesRef.current[memberId] = {
        status: newStatus,
        timestamp: Date.now(),
        pickupStatus: direction === 'dropoff' ? prevPickup : newStatus,
        dropoffStatus: direction === 'dropoff' ? newStatus : prevDropoff,
      };
      
      // Calculate the fully updated manifest list object and set state
      const updatedManifest = manifest.map(m => {
        if (m.id === memberId || m.uid === memberId) {
          return {
            ...m,
            ...updateData,
            status: newStatus,
            statusUpdatedAt: now,
            pickupStatus: direction === 'dropoff' ? m.pickupStatus : newStatus,
            dropoffStatus: direction === 'dropoff' ? newStatus : m.dropoffStatus,
            pickupUpdatedAt: direction === 'dropoff' ? m.pickupUpdatedAt : now,
            dropoffUpdatedAt: direction === 'dropoff' ? now : m.dropoffUpdatedAt
          };
        }
        return m;
      });
      setManifest(updatedManifest);

      // Keep active trip manifest synchronized dynamically
      if (activeTrip) {
        await saveMySQLRecord("update", "trips", activeTrip.id, {
          manifest: JSON.stringify(
            updatedManifest.map((m) => ({
              uid: m.uid || m.id,
              studentId: m.studentId || "",
              name: m.name,
              pickupStatus: m.pickupStatus || "waiting",
              dropoffStatus: m.dropoffStatus || "waiting",
              pickupUpdatedAt: m.pickupUpdatedAt || null,
              dropoffUpdatedAt: m.dropoffUpdatedAt || null,
              pickupPointId: m.pickupPointId,
            }))
          ),
        });
      }

      // Update in MySQL!
      const sqlUpdate: any = {
        status: newStatus,
        statusUpdatedAt: now,
        updatedAt: now
      };
      if (direction === 'dropoff') {
        sqlUpdate.dropoffStatus = newStatus;
        sqlUpdate.dropoffUpdatedAt = now;
      } else {
        sqlUpdate.pickupStatus = newStatus;
        sqlUpdate.pickupUpdatedAt = now;
      }
      if (newStatus === 'picked') sqlUpdate.pickedAt = now;

      await saveMySQLRecord('update', 'users', memberId, sqlUpdate);

      // Match Firestore updates
      await updateDoc(userRef, updateData);
      
      // Notify User - Enhanced Logic
      if (newStatus === 'picked' || newStatus === 'dropped' || newStatus === 'absent') {
        const currentUser = manifest.find(m => m.id === memberId);
        const stopId = currentUser?.pickupPointId;
        const stop = currentRoute?.pickupPoints?.find((p: any) => p.id === stopId);
        const driverName = userData?.name || 'Your driver';
        
        let message = '';
        let type = `status_${newStatus}`;
        if (newStatus === 'picked') message = `✅ You have been picked up from ${stop?.name || 'your stop'} by ${driverName}.`;
        else if (newStatus === 'dropped') message = `🏠 You have been dropped off securely by ${driverName}. Thank you!`;
        else if (newStatus === 'absent') message = `⚠️ You were recorded as ABSENT for the ${direction === 'pickup' ? 'Pick-up' : 'Drop-off'} trip.`;
        
        const existingNotifs = Array.isArray(currentUser?.notifications) ? currentUser.notifications : [];
        const updatedNotifs = [
          ...existingNotifs,
          { 
            message, 
            timestamp: new Date().toISOString(), 
            type: type, 
            dismissed: false 
          }
        ];

        // Update notifications in MySQL as serialized string
        await saveMySQLRecord('update', 'users', memberId, {
          notifications: JSON.stringify(updatedNotifs)
        });

        await updateDoc(userRef, {
          notifications: arrayUnion({ 
            message, 
            timestamp: new Date().toISOString(), 
            type: type, 
            dismissed: false 
          })
        });

        // Attractive Custom Notification - Modernized (matches Dashboard)
        toast.custom((t) => (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9, rotate: -2 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className={cn(
              "flex items-center gap-4 px-6 py-4 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-2 backdrop-blur-xl",
              newStatus === 'picked' ? "bg-emerald-500/90 border-emerald-400 text-white" : 
              newStatus === 'dropped' ? "bg-blue-500/90 border-blue-400 text-white" : "bg-rose-500/90 border-rose-400 text-white"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center bg-white/20 shadow-inner"
            )}>
              {newStatus === 'picked' ? <CheckCircle size={26} strokeWidth={3} /> : 
               newStatus === 'dropped' ? <Navigation size={26} strokeWidth={3} /> : <XCircle size={26} strokeWidth={3} />}
            </div>
            <div>
              <p className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em] leading-none mb-1">Live Update</p>
              <p className="text-sm font-black text-white uppercase italic tracking-tight leading-none">
                {manifest.find(m => m.id === memberId)?.name || 'Passenger'} {newStatus}
              </p>
            </div>
          </motion.div>
        ), { duration: 3000, position: 'top-center' });
      }
    } catch (e) {
      console.error("Error updating member status:", e);
      // Clean up optimistic updates on failure
      delete optimisticUpdatesRef.current[memberId];
    }
  };

  const handleCompleteTrip = async () => {
    if (!activeTrip) return;
    try {
      toast.loading("Completing trip...", { id: 'end-trip' });

      const vehicleId = activeTrip.vehicleId || userData?.vehicleId || 'DEV-V1';

      // 1. Instantly trigger optimistic UI updates
      if (setActiveTrip) {
        setActiveTrip(null);
      }
      if (setDriverData && driverData) {
        const updatedTrips = (driverData.trips || []).map((t: any) => {
          if (t && t.id === activeTrip.id) {
            return { ...t, status: 'completed', endTime: new Date().toISOString() };
          }
          return t;
        });
        setDriverData({
          ...driverData,
          trips: updatedTrips
        });
      }

      toast.success("Trip completed!", { id: 'end-trip' });

      // 2. Perform database writes in the background concurrently
      Promise.all([
        saveMySQLRecord('update', 'trips', activeTrip.id, {
          status: 'completed',
          endTime: new Date().toISOString(),
          manifest: JSON.stringify(
            manifest.map((m) => ({
              uid: m.uid || m.id,
              studentId: m.studentId || "",
              name: m.name,
              pickupStatus: m.pickupStatus || "waiting",
              dropoffStatus: m.dropoffStatus || "waiting",
              pickupUpdatedAt: m.pickupUpdatedAt || null,
              dropoffUpdatedAt: m.dropoffUpdatedAt || null,
              pickupPointId: m.pickupPointId,
            }))
          )
        }).catch((err) => {
          console.warn("[CompleteTrip] MySQL trip status update failed:", err.message);
        }),
        saveMySQLRecord('update', 'vehicles', vehicleId, { status: 'active' }).catch((err) => {
          console.warn("[CompleteTrip] MySQL vehicle status update failed:", err.message);
        }),
        updateDoc(doc(db, 'trips', activeTrip.id), {
          status: 'completed',
          endTime: serverTimestamp()
        }).catch((err) => {
          console.warn("[CompleteTrip] Firestore trip completion failed:", err.message);
        }),
        updateDoc(doc(db, 'vehicles', vehicleId), { status: 'active' }).catch((err) => {
          console.warn("[CompleteTrip] Firestore vehicle completion failed:", err.message);
        })
      ]).then(() => {
        console.log("[CompleteTrip] Background completion writes finished.");
      });

    } catch (e) {
      console.error("Error completing trip:", e);
      toast.error("Failed to complete trip", { id: 'end-trip' });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Automatically advance stop when driver is near
  // No strict React state change in body, using useEffect below
  
  const orgIconUrl = getLocalIcon(org?.logo || org?.logoUrl || (org?.sector === 'Education' ? (org?.eduType === 'College' ? 'graduation-cap' : 'school') : (org?.sector === 'Healthcare' ? 'hospital' : (org?.sector === 'Government' ? 'museum' : 'commercial'))));

  const mapCenter = userVehicle?.location && isValidCoordinate(userVehicle.location.lat, userVehicle.location.lng)
    ? { lat: userVehicle.location.lat, lng: userVehicle.location.lng }
    : (org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
        ? { lat: org.location.lat, lng: org.location.lng } 
        : { lat: 17.4504, lng: 78.3808 });

  const currentTargetStop = currentRoute?.pickupPoints?.find((p: any) => String(p.id) === String(activeTrip?.currentStopId));
  const targetStopCoords = activeTrip?.currentStopId === 'ORG'
    ? (org?.location ? { lat: org.location.lat, lng: org.location.lng } : null)
    : (currentTargetStop ? { lat: currentTargetStop.lat, lng: currentTargetStop.lng } : null);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-slate-100">
      {/* 1. Precise Stats Overlay */}
      <div className="absolute top-4 left-4 right-4 z-[1000]">
        <header className="px-4 py-3 bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/50 flex items-center justify-between gap-3">
          <div className="flex gap-4 items-center">
             <div className="flex flex-col items-center">
                <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                   {org?.sector === 'Education' ? 'Students' : 'Passengers'}
                </span>
                <span className="text-xl font-black text-slate-900 tabular-nums leading-none">
                   {processedManifest.filter(u => {
                     const direction = activeTrip?.direction || tripType;
                     if (direction === 'dropoff') return u.status === 'dropped';
                     return u.status === 'picked' || u.status === 'dropped';
                   }).length}
                   <span className="text-[10px] text-slate-400 font-normal ml-0.5">/ {processedManifest.length}</span>
                 </span>
              </div>
              <div className="w-px h-6 bg-slate-100"></div>
              <div className="flex flex-col items-center">
                 <span className={`text-[7px] font-black uppercase tracking-widest leading-none mb-1 text-rose-500`}>
                    ABSENT
                 </span>
                 <span className={`text-xl font-black tabular-nums leading-none text-rose-600`}>
                   {processedManifest.filter(u => u.status === 'absent').length}
                 </span>
              </div>
             <div className="w-px h-6 bg-slate-100"></div>
              <div className="flex flex-col items-center">
                 <span className="text-[7px] font-black text-blue-500 uppercase tracking-widest leading-none mb-1">STOPS</span>
                 <span className="text-lg font-black text-slate-900 tabular-nums leading-none">
                   {(() => {
                     const totalStopsCount = currentRoute?.pickupPoints?.length || 0;
                     const direction = activeTrip?.direction || tripType;
                     const completedStopsCount = currentRoute?.pickupPoints?.filter((p: any) => {
                       const members = processedManifest.filter(m => m.pickupPointId === p.id);
                       return members.length > 0 && members.every(m => isHandled(m, direction));
                     }).length || 0;
                     
                     return completedStopsCount;
                   })()}
                   <span className="text-[10px] text-slate-400 font-normal ml-0.5">
                     / {currentRoute?.pickupPoints?.length || 0}
                   </span>
                 </span>
              </div>
          </div>

          <div className="flex items-center gap-2">
             {activeTrip ? (
                <div className={`h-7 px-3 rounded-full flex items-center gap-2 border transition-all ${
                  activeTrip?.direction === 'dropoff' 
                    ? 'bg-amber-50 text-amber-700 border-amber-100' 
                    : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                }`}>
                   <div className={`w-1 h-1 rounded-full animate-pulse ${
                     activeTrip?.direction === 'dropoff' ? 'bg-amber-500' : 'bg-indigo-500'
                   }`}></div>
                   <span className="text-[8px] font-black uppercase tracking-widest leading-none">
                      {activeTrip?.direction === 'dropoff' ? 'Drop to Home' : 'Pick to ORG'}
                   </span>
                </div>
             ) : (
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
                   <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                   <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Idle</span>
                </div>
             )}
          </div>
        </header>
      </div>

      {/* 2. Map Feed */}
      <div className="flex-1 relative">
        <MapComponent 
          height="100%" 
          zoom={15} 
          center={mapCenter}
          className="z-0"
          hideControls={false}
          hideMapStyles={false}
          hideUserLocation={false}
          highAccuracy={true}
          controlsPosition="top-right"
          onMapReady={(map) => { mapRef.current = map; }}
          driverCoords={userVehicle?.location ? { lat: userVehicle.location.lat, lng: userVehicle.location.lng } : null}
          targetStopCoords={targetStopCoords}
        >
          {activeTrip && roadCoords.length > 1 && (
            <Polyline 
              positions={roadCoords} 
              color="#3b82f6" 
              weight={6} 
              opacity={0.8}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {org?.location && isValidCoordinate(org.location.lat, org.location.lng) && (
            <Marker 
              key={`driver-org-marker-${parseFloat(org.location.lat)}-${parseFloat(org.location.lng)}`}
              position={[parseFloat(org.location.lat), parseFloat(org.location.lng)]} 
              icon={createMarkerIcon(activeTrip?.currentStopId === 'ORG' ? '#2563eb' : '#f97316', orgIconUrl, activeTrip?.currentStopId === 'ORG' ? '#2563eb' : '#f97316', org?.name || 'OFFICE')} 
            />
          )}

          {currentRoute?.pickupPoints?.map((p: any, idx: number) => {
            const userCount = processedManifest.filter(u => String(u.pickupPointId) === String(p.id)).length;
            const isCurrent = String(activeTrip?.currentStopId) === String(p.id);
            const direction = activeTrip?.direction || tripType;
            const stopMembers = processedManifest.filter(m => m.pickupPointId === p.id);
            const isHandledStop = stopMembers.length > 0 && stopMembers.every(m => isHandled(m, direction));
            
            // A stop is "passed" only if it's handled, regardless of target index
            const isPassed = isHandledStop;
            
            // Colors based on status
            const markerColor = isCurrent ? '#2563eb' : isPassed ? '#10b981' : '#94a3b8';
            const labelBg = isCurrent ? '#2563eb' : isPassed ? '#10b981' : '#0f172a';
            
            return isValidCoordinate(p.lat, p.lng) && (
              <Marker 
                key={`stop-${p.id}-${parseFloat(p.lat)}-${parseFloat(p.lng)}-${markerColor}`} 
                position={[parseFloat(p.lat), parseFloat(p.lng)]} 
                icon={createMarkerIcon(
                  markerColor, 
                  getLocalIcon('bus-stop'), 
                  markerColor, 
                  `${p.name} (${userCount})`,
                  labelBg
                )} 
                eventHandlers={{
                  click: () => setSelectedStopId(p.id)
                }}
              />
            );
          })}

          {userVehicle && userVehicle.location && isValidCoordinate(userVehicle.location.lat, userVehicle.location.lng) && (
            <Marker 
              key={`bus-${userVehicle.id}-${parseFloat(userVehicle.location.lat)}-${parseFloat(userVehicle.location.lng)}`} 
              position={[parseFloat(userVehicle.location.lat), parseFloat(userVehicle.location.lng)]} 
              icon={createMarkerIcon(
                '#2563eb', 
                getLocalIcon('bus'), 
                '#2563eb', 
                userVehicle.plateNumber ? `BUS: ${userVehicle.plateNumber}` : 'YOUR BUS'
              )} 
            />
          )}
        </MapComponent>


      </div>

      {/* 3. Bottom Interface Panel (Revitalized Sectional Stops Bar) */}
      <div className={`absolute bottom-6 left-4 right-4 z-[2000] transition-all duration-500 ${(activeTrip || currentRoute) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
         <div className="flex items-center gap-3">
            
            {/* Left: Completed/Dropped Stops Section */}
            <div className="flex items-center gap-2">
               <button 
                 onClick={() => setShowCompleted(!showCompleted)}
                 className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg border ${showCompleted ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white text-slate-300 border-slate-100'}`}
                 title={showCompleted ? "Hide Completed" : "Show Completed"}
               >
                  <CheckCircle size={24} strokeWidth={showCompleted ? 3 : 2} />
               </button>
            </div>

            {/* Unified Scroll Section: Targeted + Pending (and optionally Completed) */}
            <div className="flex-1 flex items-center gap-3 overflow-x-auto scrollbar-hide py-2 pr-4">
               
               {/* 1. Completed Stops (Conditional) */}
               {showCompleted && currentRoute?.pickupPoints?.filter((p: any) => {
                  const direction = activeTrip?.direction || tripType;
                  const stopMembers = processedManifest.filter(u => String(u.pickupPointId) === String(p.id));
                  const allHandled = stopMembers.length > 0 && stopMembers.every(u => isHandled(u, direction));
                  
                  // A stop is "completed" ONLY if everyone there is finished
                  return allHandled && String(p.id) !== String(activeTrip?.currentStopId);
               }).map((p: any) => (
                 <button
                   key={p.id}
                   onClick={() => setSelectedStopId(p.id)}
                   className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 shadow-sm animate-in zoom-in duration-300"
                 >
                    <CheckCircle size={12} />
                    <span className="text-[10px] font-black uppercase whitespace-nowrap">{p.name}</span>
                 </button>
               ))}

               {/* 2. Targeted Stop (Always visible/first in main sequence) */}
               {(() => {
                 const currentStop = currentRoute?.pickupPoints?.find((p: any) => String(p.id) === String(activeTrip?.currentStopId));
                 if (!currentStop && activeTrip?.currentStopId !== 'ORG') return null;
                 
                 const isOrg = activeTrip?.currentStopId === 'ORG';
                 const name = isOrg ? (org?.name || 'Organization') : currentStop?.name;
                 const targetStatus = activeTrip?.direction === 'dropoff' ? 'dropped' : 'picked';
                 const userCount = isOrg ? 0 : processedManifest.filter(u => String(u.pickupPointId) === String(currentStop?.id)).length;
                 const handledCount = isOrg ? 0 : processedManifest.filter(u => String(u.pickupPointId) === String(currentStop?.id) && (u.status === targetStatus || u.status === 'absent')).length;

                 return (
                   <button
                     onClick={() => !isOrg && setSelectedStopId(currentStop.id)}
                     className="flex-shrink-0 flex items-center gap-3 px-5 py-3.5 bg-blue-600 text-white rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.2)] border border-blue-400 active:scale-95 transition-all min-w-[160px]"
                   >
                      <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-blue-600 font-bold text-[10px] shadow-sm">
                         {isOrg ? <Shield size={14} /> : `${handledCount}/${userCount}`}
                      </div>
                      <div className="flex flex-col items-start overflow-hidden">
                        <span className="text-[8px] font-black uppercase text-blue-200 tracking-widest leading-none mb-1">Current Stop</span>
                        <span className="text-[11px] font-bold uppercase truncate w-full">{name}</span>
                      </div>
                   </button>
                 );
               })()}

                {/* 3. Pending Stops Section (Any stop that has pending members and isn't the target) */}
                {currentRoute?.pickupPoints?.filter((p: any) => {
                   const stopMembers = processedManifest.filter(u => String(u.pickupPointId) === String(p.id));
                   const targetStatus = activeTrip?.direction === 'dropoff' ? 'dropped' : 'picked';
                   const hasPending = stopMembers.length > 0 && stopMembers.some(u => u.status !== targetStatus && u.status !== 'absent');
                   return hasPending && String(p.id) !== String(activeTrip?.currentStopId);
                }).map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedStopId(p.id)}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-3 bg-white border border-slate-100 rounded-xl text-slate-500 shadow-sm active:scale-95 transition-all"
                  >
                     <div className="w-5 h-5 bg-slate-50 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-400">
                        {processedManifest.filter(u => String(u.pickupPointId) === String(p.id)).filter((u: any) => {
                          const targetStatus = activeTrip?.direction === 'dropoff' ? 'dropped' : 'picked';
                          return u.status !== targetStatus && u.status !== 'absent';
                        }).length}
                     </div>
                     <span className="text-[10px] font-bold uppercase whitespace-nowrap">{p.name}</span>
                  </button>
                ))}
            </div>
         </div>
      </div>

      <AnimatePresence>
        {selectedStopId && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[9000] flex flex-col justify-end p-4 pointer-events-none"
          >
             <motion.div 
               initial={{ y: "100%", scale: 0.95 }} 
               animate={{ y: 0, scale: 1 }} 
               exit={{ y: "100%", scale: 0.95 }} 
               transition={{ type: 'spring', damping: 25, stiffness: 200 }} 
               className="bg-white/95 backdrop-blur-3xl w-full max-w-sm mx-auto rounded-[3.5rem] p-6 pb-12 space-y-6 overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.3)] pointer-events-auto border border-white/50"
             >
                {(() => {
                    const stop = currentRoute?.pickupPoints?.find((p: any) => p.id === selectedStopId);
                    const stopUsers = processedManifest.filter(u => u.pickupPointId === selectedStopId);
                    const isActive = String(activeTrip?.currentStopId) === String(selectedStopId);
                    
                    return (
                      <>
                         {/* Header */}
                         <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                                  <Users size={20} />
                               </div>
                               <div>
                                  <h4 className="text-sm font-black text-slate-900 uppercase italic leading-none mb-1">{stop?.name || 'Passenger List'}</h4>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                     {stopUsers.length} {activeTrip?.direction === 'dropoff' ? 'Students to Drop' : 'Students Waiting'}
                                  </p>
                               </div>
                            </div>
                            <div className="flex gap-2">
                               {((stop && isValidCoordinate(stop.lat, stop.lng)) || (selectedStopId === 'ORG' && org?.location && isValidCoordinate(org.location.lat, org.location.lng))) && (
                                 <button 
                                   onClick={() => {
                                     const lat = selectedStopId === 'ORG' ? org?.location?.lat : stop?.lat;
                                     const lng = selectedStopId === 'ORG' ? org?.location?.lng : stop?.lng;
                                     if (mapRef.current && isValidCoordinate(lat, lng)) {
                                       mapRef.current.flyTo([lat, lng], 16);
                                       setSelectedStopId(null);
                                       toast.success(`Navigating map to ${selectedStopId === 'ORG' ? 'Hub' : (stop?.name || 'stop')}`);
                                     } else {
                                       toast.error("Location coordinate is invalid");
                                     }
                                   }}
                                   className="w-10 h-10 bg-blue-50 text-blue-600 border border-blue-100 rounded-full flex items-center justify-center transition-all hover:bg-blue-100 active:scale-90 shrink-0 cursor-pointer"
                                   title="Navigate Map Here"
                                 >
                                    <Navigation size={16} />
                                 </button>
                               )}
                             <button onClick={() => setSelectedStopId(null)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                                <X size={20} />
                             </button>
                           </div>
                        </div>

                        {/* Scheduled Target Badge */}
                        {activeTrip && isActive && (
                          <div className="px-1 py-1">
                            <div className="flex-1 py-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2">
                              <CheckCircle size={14} />
                              Current Scheduled Stop
                            </div>
                          </div>
                        )}

                        {/* List */}
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                           {stopUsers.length === 0 ? (
                              <div className="py-12 flex flex-col items-center justify-center text-slate-300">
                                 <Users size={40} className="opacity-10 mb-2" />
                                 <p className="text-[10px] font-black uppercase italic">No passengers assigned to this stop</p>
                              </div>
                           ) : (
                              stopUsers.map((user: any) => (
                                 <div key={user.id} className="bg-slate-50/50 p-4 rounded-[2rem] flex items-center justify-between border border-slate-50 group hover:bg-white transition-colors">
                                    <div className="flex items-center gap-4">
                                       <div className="relative">
                                          <img 
                                             src={getUserAvatar(user.avatarUrl, user.photoURL, user.name, user.uid)} 
                                             className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm" 
                                             alt={user.name} 
                                          />
                                          {(user.status === 'picked' || user.status === 'dropped') && <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm"></div>}
                                          {user.status === 'absent' && <div className="absolute -bottom-0.5 -right-0.5 bg-rose-500 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm"></div>}
                                       </div>
                                       <div>
                                          <p className="text-[10px] font-black text-slate-900 uppercase italic leading-none mb-1">{user.name}</p>
                                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest italic tracking-tighter">
                                             {user.status === 'picked' ? 'On Board' : user.status === 'dropped' ? 'Dropped' : user.status === 'absent' ? 'Reported Absent' : 'Pending Boarding'}
                                          </p>
                                          {activeTrip?.direction === 'dropoff' && user.wasAbsentAtPickup && user.status !== 'absent' && (
                                            <p className="text-[6px] font-black text-rose-400 uppercase tracking-widest mt-0.5">
                                              Absent at Pickup
                                            </p>
                                          )}
                                       </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                          onClick={() => {
                                            if (!activeTrip) {
                                              toast.error("Start the trip first to update member status", { id: 'no-active-trip' });
                                              return;
                                            }
                                            const direction = activeTrip?.direction || tripType;
                                            const targetStatus = direction === 'dropoff' ? 'dropped' : 'picked';
                                            updateMemberStatus(user.id, user.status === targetStatus ? 'waiting' : targetStatus);
                                          }}
                                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                                            (() => {
                                              const direction = activeTrip?.direction || tripType;
                                              const targetStatus = direction === 'dropoff' ? 'dropped' : 'picked';
                                              return user.status === targetStatus;
                                            })()
                                              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                                              : 'bg-white text-slate-400 border border-slate-100 shadow-sm'
                                          }`}
                                        >
                                          <CheckCircle size={18} />
                                       </button>
                                       <button 
                                         onClick={() => {
                                           if (!activeTrip) {
                                              toast.error("Start the trip first to update member status", { id: 'no-active-trip' });
                                              return;
                                           }
                                           updateMemberStatus(user.id, user.status === 'absent' ? 'waiting' : 'absent');
                                         }}
                                         className={`px-3 h-9 rounded-xl text-[8px] font-black uppercase transition-all ${
                                           user.status === 'absent' 
                                             ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
                                             : 'bg-white text-slate-400 border border-slate-100 shadow-sm'
                                         }`}
                                       >
                                          ABSENT
                                       </button>
                                    </div>
                                 </div>
                              ))
                           )}
                        </div>

                        <div className="pt-2 text-center">
                           <p className="text-[7px] font-black text-slate-300 uppercase tracking-[0.2em] italic">Current stop information</p>
                        </div>
                     </>
                   );
                })()}
             </motion.div>
          </motion.div>
        )}

         {isSelectingRoute && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[8000] flex flex-col justify-end pointer-events-none">
             <motion.div 
               initial={{ y: "100%" }} 
               animate={{ y: 0 }} 
               exit={{ y: "100%" }} 
               transition={{ type: 'spring', damping: 25, stiffness: 200 }} 
               className="bg-white w-full max-w-md mx-auto rounded-t-[3.5rem] p-8 pb-12 space-y-8 overflow-y-auto max-h-[90vh] shadow-[0_-20px_50px_rgba(0,0,0,0.1)] pointer-events-auto custom-scrollbar"
             >
                <div className="flex justify-between items-center bg-white sticky -top-8 pt-2 pb-4 z-10 border-b border-slate-50 mb-4">
                  <h3 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">
                    {routes.length === 1 ? 'Start Trip' : 'Select Route'}
                  </h3>
                  <button onClick={() => setIsSelectingRoute(false)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                    <X size={24} />
                  </button>
                </div>

                {routes.length === 1 ? (
                  // SINGLE ROUTE WORKFLOW: Skip route selection, choose Pick Up vs Drop Off directly
                  <div className="space-y-6">
                    <div className="px-6 py-4 rounded-[1.5rem] bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Assigned Route</p>
                        <p className="text-sm font-black text-slate-800 uppercase italic leading-none">{routes[0].name}</p>
                      </div>
                      <span className="text-[9px] font-black px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wider">
                        Active
                      </span>
                    </div>

                    <div className="space-y-4">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] px-1">Choose Direction</p>
                      
                      {/* Pick-up Option */}
                      <button 
                        onClick={() => setTripType('pickup')}
                        className={`w-full flex items-center gap-5 p-5 rounded-[2rem] border-2 transition-all text-left ${
                          tripType === 'pickup' 
                            ? 'border-emerald-500 bg-emerald-50/50 shadow-md shadow-emerald-500/5' 
                            : 'border-slate-50 bg-slate-50 hover:bg-slate-100/50'
                        }`}
                      >
                        <div className={`p-3.5 rounded-xl transition-colors ${
                          tripType === 'pickup' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-200/60'
                        }`}>
                          <ArrowUpRight size={20} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-black text-slate-900 uppercase italic leading-none mb-1">Pick Up to Center</p>
                           <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wide leading-tight">Pick students up from home stops and drive to Center</p>
                        </div>
                      </button>

                      {/* Drop-off Option */}
                      <button 
                        onClick={() => setTripType('dropoff')}
                        className={`w-full flex items-center gap-5 p-5 rounded-[2rem] border-2 transition-all text-left ${
                          tripType === 'dropoff' 
                            ? 'border-indigo-600 bg-indigo-50/50 shadow-md shadow-indigo-600/5' 
                            : 'border-slate-50 bg-slate-50 hover:bg-slate-100/50'
                        }`}
                      >
                        <div className={`p-3.5 rounded-xl transition-colors ${
                          tripType === 'dropoff' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 border border-slate-200/60'
                        }`}>
                          <ArrowDownLeft size={20} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-black text-slate-900 uppercase italic leading-none mb-1">Drop Off to Home</p>
                           <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wide leading-tight">Pick students up from Center and drop them off home</p>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  // MULTI ROUTE WORKFLOW: Select route, then choose trip type
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                      {routes.map(r => (
                        <button key={r.id} onClick={() => setSelectedRouteId(r.id)} className={`flex items-center justify-between p-6 rounded-[2.5rem] border-2 transition-all ${selectedRouteId === r.id ? 'border-blue-600 bg-blue-50/50' : 'border-slate-50 bg-slate-50'}`}>
                          <div className="flex items-center gap-5 text-left">
                            <div className={`p-4 rounded-2xl transition-colors ${selectedRouteId === r.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-300'}`}><Navigation size={20} /></div>
                            <div>
                               <p className="text-sm font-black text-slate-900 uppercase italic leading-none mb-2">{r.name}</p>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{r.pickupPoints?.length || 0} Stops</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-4 p-2 bg-slate-50 rounded-[2.5rem]">
                       {['pickup', 'dropoff'].map(t => (
                          <button key={t} onClick={() => setTripType(t as any)} className={`flex-1 py-6 rounded-[2rem] font-black text-[10px] uppercase transition-all ${tripType === t ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-400 bg-white'}`}>
                            {t}
                          </button>
                       ))}
                    </div>
                  </div>
                )}

                <button 
                  onClick={handleStartTrip} 
                  disabled={!selectedRouteId}
                  className={`w-full py-7 rounded-[3rem] text-sm font-black uppercase tracking-widest italic shadow-2xl transition-all ${selectedRouteId ? 'bg-slate-900 text-white active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                  Start Trip
                </button>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
