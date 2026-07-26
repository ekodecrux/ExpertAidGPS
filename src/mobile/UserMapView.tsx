import React, { useState, useEffect, useRef } from 'react';
import MapComponent, { Marker, Popup, Polyline, vehicleIcon, stationIcon, createMarkerIcon } from '../components/MapComponent';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot, collection, query, where, limit, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { isValidCoordinate, getDistance, cn, getSortedStops, getLocalIcon, cleanMessage, getNotifications } from '../lib/utils';
import { Activity, Navigation, Info, Bell, MapPin, Clock, Shield, Truck, X, CheckCircle, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { saveMySQLRecord } from '../lib/mysql';

interface UserMapViewProps {
  userDbData?: any;
  userDbDataLoading?: boolean;
}

export default function UserMapView({ userDbData, userDbDataLoading }: UserMapViewProps = {}) {
  const { userData } = useAuth();
  const uData = userData as any;
  const [currentUserLive, setCurrentUserLive] = useState<any>(null);
  const effectiveUser = currentUserLive || userData || {};
  
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [route, setRoute] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [driverVehicleId, setDriverVehicleId] = useState<string | null>(null);
  const [driver, setDriver] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(() => {
    if (userDbData) return false;
    if (userData?.uid) {
      const cached = localStorage.getItem(`expert_gps_user_db_data_${userData.uid}`);
      if (cached) return false;
    }
    return true;
  });
  const [eta, setEta] = useState<string>('Analyzing...');
  const [roadPolyline, setRoadPolyline] = useState<[number, number][] | null>(null);
  const [manifest, setManifest] = useState<any[]>([]);
  const [infoTarget, setInfoTarget] = useState<'stop' | 'org'>('stop');
  
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Refs to prevent duplicate notifications within same session
  const notifiedNear = useRef<boolean>(false);
  const notifiedPickup = useRef<string | null>(null);
  const notifiedDropoff = useRef<string | null>(null);
  const notifiedTripStart = useRef<string | null>(null);

  useEffect(() => {
    if (userDbDataLoading && !userDbData) {
      setLoading(true);
    }
  }, [userDbDataLoading, userDbData]);

  // Poll the MySQL user-data endpoint to feed all route, trip, org, manifest, vehicle, and driver details
  useEffect(() => {
    if (!userData) return;
    const uData = userData as any;

    const processData = (res: any) => {
      // 1. Set Organization (straight from MySQL)
      if (res.org) {
        setOrg(res.org);
      }

      // 2. Set Route Details
      let matchedRoute = null;
      if (res.routes && uData.routeId) {
        matchedRoute = res.routes.find((r: any) => r.id === uData.routeId);
        if (matchedRoute) {
          setRoute(matchedRoute);
        }
      }

      // 3. Set Active Trip
      let matchedTrip = null;
      if (res.trips && uData.routeId) {
        matchedTrip = res.trips.find((t: any) => t.routeId === uData.routeId && (t.status === 'live' || t.status === 'ongoing'));
        if (matchedTrip) {
          setActiveTrip(matchedTrip);
        } else {
          setActiveTrip(null);
          notifiedNear.current = false;
        }
      }

      // 4. Set Route Manifest (users on this route) and update currentUserLive status
      if (res.users) {
        const liveMe = res.users.find((u: any) => u.uid === uData.uid || u.uid === uData.id);
        if (liveMe) {
          setCurrentUserLive(liveMe);
        }
        if (uData.routeId) {
          const matchedManifest = res.users.filter((u: any) => u.routeId === uData.routeId && (u.role === 'user' || u.role === 'member'));
          setManifest(matchedManifest);
        }
      }

      // 5. Set Route Driver (for vehicleId fallback)
      if (res.users && uData.routeId) {
        const matchedDriver = res.users.find((u: any) => u.routeId === uData.routeId && u.role === 'driver');
        if (matchedDriver && matchedDriver.vehicleId) {
          setDriverVehicleId(matchedDriver.vehicleId);
          if (matchedTrip && matchedTrip.driverId === matchedDriver.uid) {
            setDriver(matchedDriver);
          }
        } else {
          setDriverVehicleId(null);
        }
      }

      // 6. Set Active Trip Driver (if trip driver belongs to users but didn't match assignment fallback)
      if (matchedTrip && res.users) {
        const currentTripDriver = res.users.find((u: any) => u.uid === matchedTrip.driverId);
        if (currentTripDriver) {
          setDriver(currentTripDriver);
        }
      }

      // 7. Set Tracking Vehicle Coordinate
      if (res.vehicles && res.vehicles.length > 0) {
        const matchedVehicle = res.vehicles.find((v: any) => v && (
          v.id === matchedTrip?.vehicleId ||
          v.id === matchedRoute?.vehicleId ||
          v.id === uData?.vehicleId ||
          v.id === driverVehicleId ||
          (driver && v.driverId === driver.uid) ||
          (matchedRoute && v.routeId === matchedRoute.id)
        )) || res.vehicles[0];

        if (matchedVehicle) {
          const locObj = (matchedVehicle.latitude !== null && matchedVehicle.longitude !== null && matchedVehicle.latitude !== undefined && matchedVehicle.longitude !== undefined)
            ? { lat: Number(matchedVehicle.latitude), lng: Number(matchedVehicle.longitude) }
            : (typeof matchedVehicle.location === 'string' ? (() => { try { return JSON.parse(matchedVehicle.location); } catch(e) { return null; } })() : matchedVehicle.location || org?.location || null);

          setVehicle({
            ...matchedVehicle,
            plateNumber: matchedVehicle.plateNumber || matchedVehicle.number || "BUS-01",
            location: locObj
          });
        }
      }
    };

    if (userDbData) {
      processData(userDbData);
      setLoading(false);
      return;
    } else if (userData?.uid) {
      const cached = localStorage.getItem(`expert_gps_user_db_data_${userData.uid}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          processData(parsed);
          setLoading(false);
        } catch (e) {
          console.warn("Error parsing cached Map data:", e);
        }
      }
    }

    const fetchMySQLMobileData = async () => {
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
            processData(res);
          }
        }
      } catch (err: any) {
        if (err.message?.includes("Failed to fetch") || err.name === "TypeError") {
          console.warn("Transient network connection to /api/records/user-data in UserMapView is resolving...");
        } else {
          console.error("Error fetching map coordinates from MySQL backend", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMySQLMobileData();
    // Poll the backend every 3 seconds for extremely snappy and accurate live coordination updates!
    const interval = setInterval(fetchMySQLMobileData, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [userData, userDbData]);

  const addNotification = async (message: string, type?: string) => {
    if (!userData) return;
    const currentNotifs = getNotifications(userData);
    
    // Check if this specific notification already exists in the doc to avoid DB bloat
    const alreadyNotified = currentNotifs.some((n: any) => 
      n.message === message && 
      (new Date().getTime() - new Date(n.timestamp).getTime() < 3600000) // Within last hour
    );

    if (alreadyNotified) {
      return;
    }

    try {
      const updatedNotifs = [
        ...currentNotifs,
        {
          message,
          type: type || 'general',
          timestamp: new Date().toISOString(),
          dismissed: false
        }
      ];
      await saveMySQLRecord('update', 'users', userData.id || userData.uid, {
        notifications: updatedNotifs
      });
    } catch (e) {
      console.error("Error adding notification:", e);
    }
  };

  // 1. Proximity Notification (1km)
  useEffect(() => {
    if (!userData || !activeTrip || !vehicle?.location) return;
    const uData = userData as any;

    const currentStop = route?.pickupPoints?.find((p: any) => p.id === uData.pickupPointId);
    if (!currentStop) return;

    if (!notifiedNear.current) {
      const dist = getDistance(vehicle.location.lat, vehicle.location.lng, currentStop.lat, currentStop.lng);
      if (dist <= 1) {
        const driverName = driver?.name ? `Driver ${driver.name}` : 'The driver';
        addNotification(`${driverName} with Bus ${vehicle.plateNumber || ''} is within 1km of your stop ${currentStop.name}!`, 'proximity');
        notifiedNear.current = true;
      }
    }
  }, [activeTrip, vehicle?.location, route]);

  const userStop = route?.pickupPoints?.find((p: any) => String(p.id) === String(effectiveUser?.pickupPointId));

  const isToday = (dateVal: any) => {
    if (!dateVal) return false;
    try {
      let d: Date;
      if (typeof dateVal.toDate === 'function') {
        d = dateVal.toDate();
      } else if (dateVal instanceof Date) {
        d = dateVal;
      } else if (typeof dateVal === 'object' && dateVal.seconds !== undefined) {
        d = new Date(dateVal.seconds * 1000);
      } else if (typeof dateVal === 'object' && dateVal._seconds !== undefined) {
        d = new Date(dateVal._seconds * 1000);
      } else {
        let str = String(dateVal).trim();
        if (str.length >= 10 && str.charAt(10) === ' ') {
          str = str.substring(0, 10) + 'T' + str.substring(11);
        }
        if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/)) {
          str = str + 'Z';
        }
        d = new Date(str);
      }
      
      if (isNaN(d.getTime())) return false;
      
      const today = new Date();
      
      // 1. Time-window fallback: if updated within the last 18 hours, it is guaranteed part of the active run!
      const diffMs = Math.abs(today.getTime() - d.getTime());
      if (diffMs < 18 * 60 * 60 * 1000) {
        return true;
      }

      // 2. Local-day match
      const localMatch = d.getDate() === today.getDate() &&
                         d.getMonth() === today.getMonth() &&
                         d.getFullYear() === today.getFullYear();

      // 3. UTC-day match to handle server timezone skew
      const utcMatch = d.getUTCDate() === today.getUTCDate() &&
                       d.getUTCMonth() === today.getUTCMonth() &&
                       d.getUTCFullYear() === today.getUTCFullYear();
                       
      return localMatch || utcMatch;
    } catch (e) {
      return false;
    }
  };

  const isStatusFresh = (updatedAt: any) => {
    if (!updatedAt) return false;
    if (isToday(updatedAt)) return true;
    
    if (activeTrip?.startTime) {
      try {
        let tUpdate: number;
        if (typeof updatedAt.toDate === 'function') {
          tUpdate = updatedAt.toDate().getTime();
        } else if (updatedAt instanceof Date) {
          tUpdate = updatedAt.getTime();
        } else if (typeof updatedAt === 'object' && updatedAt.seconds !== undefined) {
          tUpdate = updatedAt.seconds * 1000;
        } else if (typeof updatedAt === 'object' && updatedAt._seconds !== undefined) {
          tUpdate = updatedAt._seconds * 1000;
        } else {
          let str = String(updatedAt).trim();
          if (str.length >= 10 && str.charAt(10) === ' ') {
            str = str.substring(0, 10) + 'T' + str.substring(11);
          }
          if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/)) {
            str = str + 'Z';
          }
          tUpdate = new Date(str).getTime();
        }

        const tStart = new Date(activeTrip.startTime).getTime();
        if (!isNaN(tUpdate) && tUpdate >= tStart - 10 * 60 * 1000) {
          return true;
        }
      } catch (err) {
        console.warn("Error comparing status update with active trip start time:", err);
      }
    }
    return false;
  };

  const pickupStatus = (effectiveUser?.pickupStatus && isStatusFresh(effectiveUser?.pickupUpdatedAt)) ? effectiveUser.pickupStatus : 'waiting';
  const dropoffStatus = (effectiveUser?.dropoffStatus && isStatusFresh(effectiveUser?.dropoffUpdatedAt)) ? effectiveUser.dropoffStatus : 'waiting';

  const isPickupHandled = pickupStatus === 'picked' || pickupStatus === 'absent';
  const isDropoffHandled = dropoffStatus === 'dropped' || dropoffStatus === 'absent';
  const tripDirection = activeTrip?.direction || 'pickup';

  const getRemainingRouteStops = () => {
    if (!route?.pickupPoints) return [];
    const sortedPoints = getSortedStops(route.pickupPoints, activeTrip);
    
    const currentStopId = activeTrip?.currentStopId;
    if (currentStopId === 'ORG') {
      return [];
    }

    const currentStopIdx = sortedPoints.findIndex((p: any) => p.id === currentStopId);
    const startIndex = currentStopIdx !== -1 ? currentStopIdx : 0;
    return sortedPoints.slice(startIndex);
  };

  // Auto-set the infoTarget tab based on direct trip status
  useEffect(() => {
    if (tripDirection === 'pickup') {
      if (isPickupHandled) {
        setInfoTarget('org');
      } else {
        setInfoTarget('stop');
      }
    } else {
      setInfoTarget('stop');
    }
  }, [tripDirection, pickupStatus, dropoffStatus]);

  // Distance to User Stop
  const distanceToUserStop = (vehicle?.location && userStop) 
    ? getDistance(vehicle.location.lat, vehicle.location.lng, userStop.lat, userStop.lng)
    : 0;
  
  // ETA to User Stop
  const etaToUserStopStr = distanceToUserStop > 0 
    ? (distanceToUserStop < 0.1 
        ? 'Arrived' 
        : `${Math.max(1, Math.round(distanceToUserStop * 1.8 + 1))} Mins (${distanceToUserStop.toFixed(1)} KM)`)
    : '-- mins (-- KM)';

  // Distance to Organization
  const distanceToOrg = (vehicle?.location && org?.location)
    ? getDistance(vehicle.location.lat, vehicle.location.lng, org.location.lat, org.location.lng)
    : 0;

  // ETA to Organization
  const etaToOrgStr = distanceToOrg > 0
    ? (distanceToOrg < 0.1
        ? 'Arrived'
        : `${Math.max(1, Math.round(distanceToOrg * 1.8 + 2))} Mins (${distanceToOrg.toFixed(1)} KM)`)
    : '-- mins (-- KM)';

  // Road-aware Routing Logic via OSRM
  useEffect(() => {
    if (!vehicle?.location || !activeTrip) {
      setRoadPolyline(null);
      return;
    }

    const start = vehicle.location;
    const coords: [number, number][] = [];

    if (isValidCoordinate(start.lat, start.lng)) {
      coords.push([start.lng, start.lat]);
    }

    let finalDest: any = userStop;

    if (tripDirection === 'pickup') {
      if (isPickupHandled) {
        const sortedPoints = getSortedStops(route?.pickupPoints, activeTrip);
        const currentStopId = activeTrip?.currentStopId;
        const currentStopIdx = sortedPoints.findIndex((p: any) => p.id === currentStopId);
        const userStopIdx = sortedPoints.findIndex((p: any) => String(p.id) === String(effectiveUser?.pickupPointId));
        
        // Pick-up is completed, so the user is onboard. Any targets prior to or including
        // userStopIdx are already visited/done. We only route to stops strictly after userStopIdx.
        const startIdx = Math.max(currentStopIdx !== -1 ? currentStopIdx : 0, userStopIdx !== -1 ? userStopIdx + 1 : 0);
        
        for (let i = startIdx; i < sortedPoints.length; i++) {
          const p = sortedPoints[i];
          if (isValidCoordinate(p.lat, p.lng)) {
            coords.push([p.lng, p.lat]);
          }
        }
        finalDest = org?.location;
      } else {
        const sortedPoints = getSortedStops(route?.pickupPoints, activeTrip);
        const currentStopId = activeTrip?.currentStopId;
        const currentStopIdx = sortedPoints.findIndex((p: any) => p.id === currentStopId);
        const userStopIdx = sortedPoints.findIndex((p: any) => String(p.id) === String(effectiveUser?.pickupPointId));
        
        let startIdx = currentStopIdx !== -1 ? currentStopIdx : 0;
        let endIdx = userStopIdx !== -1 ? userStopIdx : sortedPoints.length - 1;

        if (startIdx <= endIdx) {
          for (let i = startIdx; i < endIdx; i++) {
            const p = sortedPoints[i];
            if (isValidCoordinate(p.lat, p.lng)) {
              coords.push([p.lng, p.lat]);
            }
          }
        }
        finalDest = userStop;
      }
    } else if (tripDirection === 'dropoff') {
      if (isDropoffHandled) {
        finalDest = null;
      } else {
        const sortedPoints = getSortedStops(route?.pickupPoints, activeTrip);
        const currentStopId = activeTrip?.currentStopId;
        const currentStopIdx = sortedPoints.findIndex((p: any) => p.id === currentStopId);
        const userStopIdx = sortedPoints.findIndex((p: any) => String(p.id) === String(effectiveUser?.pickupPointId));
        
        let startIdx = currentStopIdx !== -1 ? currentStopIdx : 0;
        let endIdx = userStopIdx !== -1 ? userStopIdx : sortedPoints.length - 1;

        if (startIdx <= endIdx) {
          for (let i = startIdx; i < endIdx; i++) {
            const p = sortedPoints[i];
            if (isValidCoordinate(p.lat, p.lng)) {
              coords.push([p.lng, p.lat]);
            }
          }
        }
        finalDest = userStop;
      }
    }

    if (finalDest && isValidCoordinate(finalDest.lat, finalDest.lng)) {
      coords.push([finalDest.lng, finalDest.lat]);
    }

    const uniqueCoords: [number, number][] = [];
    coords.forEach(coord => {
      if (uniqueCoords.length === 0) {
        uniqueCoords.push(coord);
      } else {
        const last = uniqueCoords[uniqueCoords.length - 1];
        const diffLng = Math.abs(coord[0] - last[0]);
        const diffLat = Math.abs(coord[1] - last[1]);
        if (diffLng > 0.0001 || diffLat > 0.0001) {
          uniqueCoords.push(coord);
        }
      }
    });

    if (uniqueCoords.length < 2) {
      setRoadPolyline(null);
      return;
    }

    const fetchRoute = async () => {
      const coordsString = uniqueCoords.map(c => `${c[0]},${c[1]}`).join(';');
      const urls = [
        `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordsString}?overview=full&geometries=geojson`,
        `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`
      ];

      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;

          const data = await response.json();
          if (data.routes && data.routes[0]) {
            const pathCoords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
            setRoadPolyline(pathCoords);
            
            const durationMins = Math.round(data.routes[0].duration / 60);
            setEta(durationMins > 0 ? `${durationMins} Mins` : 'Arriving');
            return;
          }
        } catch (error) {
          console.warn(`OSRM Routing Error on ${url}:`, error);
        }
      }

      setRoadPolyline(uniqueCoords.map(c => [c[1], c[0]] as [number, number]));
    };

    const timer = setTimeout(fetchRoute, 500);
    return () => clearTimeout(timer);
  }, [
    vehicle?.location?.lat, 
    vehicle?.location?.lng, 
    userStop?.lat, 
    userStop?.lng, 
    org?.location?.lat, 
    org?.location?.lng, 
    activeTrip?.currentStopId, 
    pickupStatus, 
    dropoffStatus,
    manifest
  ]);

  const orgIconUrl = getLocalIcon(org?.logo || org?.logoUrl || (org?.sector === 'Education' ? (org?.eduType === 'College' ? 'graduation-cap' : 'school') : (org?.sector === 'Healthcare' ? 'hospital' : (org?.sector === 'Government' ? 'museum' : 'commercial'))));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4">Finding your bus...</p>
      </div>
    );
  }

  const navPolyline = activeTrip ? roadPolyline : null;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6 relative h-full flex flex-col"
    >
      <div className="flex items-center justify-between px-2 gap-2 mb-4">
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic leading-tight flex-shrink-0">Track your Bus</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeTrip && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm",
              isPickupHandled ? 'bg-blue-500/10 border-blue-500/20' : 'bg-emerald-500/10 border-emerald-500/20'
            )}>
               <div className={cn(
                 "w-1.5 h-1.5 rounded-full animate-pulse",
                 isPickupHandled ? 'bg-blue-50' : 'bg-emerald-500'
               )}></div>
               <span className={cn(
                 "text-[8px] font-black uppercase tracking-widest italic whitespace-nowrap",
                 isPickupHandled ? 'text-blue-600' : 'text-emerald-600'
               )}>
                 {isPickupHandled ? (pickupStatus === 'absent' ? 'Absent' : 'Onboard') : 'Bus is Live'}
               </span>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden border border-slate-200/80 rounded-3xl shadow-2xl bg-white relative flex-1 min-h-[350px]">
        <MapComponent 
          height="100%" 
          zoom={14} 
          center={
            (activeTrip && (tripDirection === 'pickup' ? !isPickupHandled : !isDropoffHandled) && userStop && isValidCoordinate(userStop.lat, userStop.lng))
              ? { lat: userStop.lat, lng: userStop.lng }
              : (vehicle?.location && isValidCoordinate(vehicle.location.lat, vehicle.location.lng))
              ? { lat: vehicle.location.lat, lng: vehicle.location.lng }
              : (org?.location && isValidCoordinate(org.location.lat, org.location.lng))
              ? { lat: org.location.lat, lng: org.location.lng }
              : { lat: 17.4504, lng: 78.3808 }
          }
          driverCoords={vehicle?.location ? { lat: vehicle.location.lat, lng: vehicle.location.lng } : null}
          targetStopCoords={userStop ? { lat: userStop.lat, lng: userStop.lng } : null}
        >
          {/* Road Style Navigation Polyline */}
          {navPolyline && (
            <>
              {/* Outer border for road effect */}
              <Polyline 
                positions={navPolyline} 
                color="#cbd5e1" 
                weight={8} 
                opacity={0.8} 
              />
              {/* Inner track */}
              <Polyline 
                positions={navPolyline} 
                color="#3b82f6" 
                weight={4} 
                opacity={1} 
              />
            </>
          )}

          {/* HUB / Organization */}
          {org?.location && isValidCoordinate(org.location.lat, org.location.lng) && (
            <Marker 
              key={`user-org-marker-${parseFloat(org.location.lat)}-${parseFloat(org.location.lng)}`}
              position={[parseFloat(org.location.lat), parseFloat(org.location.lng)]} 
              icon={createMarkerIcon(
                org?.sector === 'Education' ? (org?.eduType === 'College' ? '#6366f1' : '#4f46e5') : '#0f172a', 
                orgIconUrl, 
                org?.sector === 'Education' ? (org?.eduType === 'College' ? '#6366f1' : '#4f46e5') : '#0f172a', 
                org.name || 'Organization'
              )} 
            />
          )}

          {/* ACTIVE VEHICLE / BUS */}
          {vehicle?.location && isValidCoordinate(vehicle.location.lat, vehicle.location.lng) && (
            <Marker 
              key={`user-bus-marker-${parseFloat(vehicle.location.lat)}-${parseFloat(vehicle.location.lng)}`}
              position={[parseFloat(vehicle.location.lat), parseFloat(vehicle.location.lng)]} 
              icon={createMarkerIcon('#2563eb', getLocalIcon('bus'), '#3b82f6', `BUS: ${vehicle.plateNumber || 'ACTIVE'}`)} 
            />
          )}

          {/* ALL ROUTE STOPS (Monitor Style) - Only show relevant ones if trip finished */}
          {activeTrip?.currentStopId !== 'ORG' && route?.pickupPoints?.map((p: any) => {
            const isUserStop = String(p.id) === String(effectiveUser?.pickupPointId);
            const direction = tripDirection;
            const isHandled = direction === 'dropoff' ? isDropoffHandled : (direction === 'pickup' && isPickupHandled);
            
            // Map pin color logic
            const color = isUserStop ? (isHandled ? '#10b981' : '#2563eb') : '#64748b';
            const icon = getLocalIcon('bus-stop');
            const label = isUserStop ? (isHandled ? (pickupStatus === 'absent' || dropoffStatus === 'absent' ? `ABSENT: ${p.name}` : `HANDLED: ${p.name}`) : `YOUR STOP: ${p.name}`) : p.name;

            return isValidCoordinate(p.lat, p.lng) && (
              <Marker 
                key={`stop-${p.id}-${parseFloat(p.lat)}-${parseFloat(p.lng)}-${color}`} 
                position={[parseFloat(p.lat), parseFloat(p.lng)]} 
                icon={createMarkerIcon(color, icon, color, label)}
              >
                <Popup>
                   <div className="p-2">
                      <p className={`text-[10px] font-black uppercase mb-1 ${isUserStop ? 'text-blue-600' : 'text-slate-900'}`}>{label}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Scheduled Time: {p.time}</p>
                   </div>
                </Popup>
              </Marker>
            );
          })}
        </MapComponent>
      </div>

      {/* Trip Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-bl-full -mr-10 -mt-10 group-hover:scale-125 transition-transform duration-700"></div>
           <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Clock size={20} />
                 </div>
                 <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Estimated Arrival</p>
                    <p className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">
                      {activeTrip ? (isPickupHandled || isDropoffHandled ? 'Arrived/Done' : eta) : 'PENDING'}
                    </p>
                 </div>
              </div>
           </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/5 rounded-bl-full -mr-10 -mt-10 group-hover:scale-125 transition-transform duration-700"></div>
           <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <MapPin size={20} />
                 </div>
                 <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Current Route</p>
                    <p className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter truncate max-w-[150px]">{route?.name || 'SELECTING...'}</p>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Target Navigation & Option Panel */}
      {activeTrip && (
        <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 relative overflow-hidden group space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Navigation Option Details</span>
            <span className="text-[9px] font-bold text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded-full">Live Stats</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-[1.5rem] border border-slate-100/50">
            <button
              onClick={() => setInfoTarget('stop')}
              className={cn(
                "py-2.5 px-3 rounded-[1rem] text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                infoTarget === 'stop' 
                  ? "bg-slate-900 text-white shadow-md italic animate-none" 
                  : "text-slate-500 hover:bg-slate-100"
              )}
            >
              <span>📍</span> Your Stop
            </button>
            <button
              onClick={() => setInfoTarget('org')}
              disabled={tripDirection === 'dropoff'}
              className={cn(
                "py-2.5 px-3 rounded-[1rem] text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                infoTarget === 'org' 
                  ? "bg-slate-900 text-white shadow-md italic animate-none" 
                  : tripDirection === 'dropoff'
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-500 hover:bg-slate-100"
              )}
            >
              <span>🏢</span> Organization
            </button>
          </div>

          <div className="px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Navigation size={14} className="animate-pulse" />
              </div>
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                  {infoTarget === 'org' ? 'To Organization / Hub' : 'To Your Registered Stop'}
                </p>
                <p className="text-[10px] font-bold text-slate-800 uppercase tracking-tight">
                  {infoTarget === 'org' ? (org?.name || 'Main Office') : (userStop?.name || 'Your Stop')}
                </p>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-sm font-black text-slate-900 tracking-tight italic">
                {infoTarget === 'org' ? etaToOrgStr : etaToUserStopStr}
              </p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                Time & Distance
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trip Status Info Card */}
      <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600/5 rounded-bl-[4rem] -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-700"></div>
         <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div className="flex items-center gap-5">
               <div className="w-16 h-16 rounded-[1.5rem] bg-blue-50 flex items-center justify-center text-blue-600 shadow-inner border border-blue-100/50">
                  <MapPin size={32} strokeWidth={2.5} />
               </div>
               <div className="space-y-1">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.25em] leading-none mb-1">
                    {(tripDirection === 'pickup' && isPickupHandled) ? (pickupStatus === 'absent' ? 'Absent Today' : 'Heading To Destination') : (tripDirection === 'dropoff' && isDropoffHandled) ? 'Trip Finished' : 'Your Collection Point'}
                  </p>
                  <h3 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                    {(tripDirection === 'pickup' && isPickupHandled) ? 'Main Center' : (tripDirection === 'dropoff' && isDropoffHandled) ? (dropoffStatus === 'absent' ? 'Home (Absent)' : 'Home') : (userStop?.name || 'Searching...')}
                  </h3>
               </div>
            </div>
            
            {activeTrip ? (
              <div className="flex flex-col items-start sm:items-end bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100 shadow-sm w-full sm:w-auto">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1 shadow-sm">Live Movement</p>
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                   <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter italic whitespace-nowrap">Bus is in Motion</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100 w-full sm:w-auto">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">System Standby</p>
              </div>
            )}
         </div>
      </div>

      <AnimatePresence>
        {showNotifications && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[2000] bg-slate-900/40 backdrop-blur-sm -m-4 flex flex-col justify-end p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-[3rem] p-8 pb-12 max-h-[70vh] overflow-y-auto scrollbar-hide shadow-2xl flex flex-col gap-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Recent Alerts</h3>
                <button onClick={() => setShowNotifications(false)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-4">
                {getNotifications(userData).length > 0 ? (
                  getNotifications(userData).slice().reverse().map((n: any, i: number) => {
                    const messageCleaned = cleanMessage(n.message);
                    const isStart = n.type === 'trip_start' || n.type === 'start' || n.message?.toLowerCase().includes('started');
                    const isEnd = n.type === 'trip_end' || n.type === 'end' || n.message?.toLowerCase().includes('completed');
                    const isPicked = n.type === 'status_picked' || n.type === 'picked';
                    const isDropped = n.type === 'status_dropped' || n.type === 'dropped';
                    const isAbsent = n.type === 'status_absent' || n.type === 'absent';
                    
                    let bgClass = "bg-slate-50 border-slate-100";
                    let iconBg = "bg-blue-50 text-blue-600";
                    let IconComponent = Bell;
                    
                    if (isStart) {
                      bgClass = "bg-blue-50/50 border-blue-100/50";
                      iconBg = "bg-blue-100/80 text-blue-600";
                      IconComponent = Navigation;
                    } else if (isEnd) {
                      bgClass = "bg-emerald-50/50 border-emerald-100/50";
                      iconBg = "bg-emerald-100/80 text-emerald-600";
                      IconComponent = CheckCircle;
                    } else if (isPicked) {
                      bgClass = "bg-emerald-50/50 border-emerald-100/50";
                      iconBg = "bg-emerald-100/80 text-emerald-600";
                      IconComponent = CheckCircle;
                    } else if (isDropped) {
                      bgClass = "bg-blue-50/50 border-blue-100/50";
                      iconBg = "bg-blue-100/80 text-blue-600";
                      IconComponent = Home;
                    } else if (isAbsent) {
                      bgClass = "bg-rose-50/50 border-rose-100/50";
                      iconBg = "bg-rose-100/80 text-rose-600";
                      IconComponent = Bell; // Fallback or XCircle (we don't import XCircle, let's keep Bell or CheckCircle / Home)
                    }

                    return (
                      <div key={i} className={cn("flex gap-4 p-4 rounded-2xl items-center border", bgClass)}>
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm",
                          iconBg
                        )}>
                          <IconComponent size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-800 uppercase tracking-tighter leading-tight mb-1 break-words">{messageCleaned}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(n.timestamp).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-20 text-center text-slate-300">
                    <Bell size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Alerts Yet</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
