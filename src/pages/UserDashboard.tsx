import React, { useState, useEffect } from 'react';
import { Navigation, Bell, Clock, MapPin, Bus, Activity, ShieldCheck, ArrowRight, CheckCircle, Home, X } from 'lucide-react';
import toast from 'react-hot-toast';
import MapComponent, { Marker, Popup, vehicleIcon, stationIcon, createMarkerIcon } from '../components/MapComponent';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { cn, isValidCoordinate, getSectorTerminology, getSortedStops, getLocalIcon, cleanMessage, getNotifications, calculateArrivalTime } from '../lib/utils';

interface UserDashboardProps {
  userDbData?: any;
  userDbDataLoading?: boolean;
}

export default function UserDashboard({ userDbData, userDbDataLoading }: UserDashboardProps = {}) {
  const { userData } = useAuth();
  const [route, setRoute] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [targetVehicleId, setTargetVehicleId] = useState<string | null>(null);
  const [driverVehicleId, setDriverVehicleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => {
    if (userDbData) return false;
    if (userData?.uid) {
      const cached = localStorage.getItem(`expert_gps_user_db_data_${userData.uid}`);
      if (cached) return false;
    }
    return true;
  });
  const [eta, setEta] = useState<string>('--');
  const [distance, setDistance] = useState<string>('--');

  const termPlural = getSectorTerminology(org?.sector);
  const termSingular = getSectorTerminology(org?.sector, false);

  const userStop = route?.pickupPoints?.find((p: any) => String(p.id) === String(userData?.pickupPointId));

  // Global Notification Listener for Toasts
  const processedNotifs = React.useRef(new Set<string>());
  const mountTime = React.useRef(Date.now());

  useEffect(() => {
    if (!userData) return;
    const notifs = getNotifications(userData);
    if (notifs.length === 0) return;

    // Check recent notifications for any new undismissed ones
    notifs.forEach((notif: any) => {
      if (notif.dismissed) return;
      
      const notifTime = new Date(notif.timestamp).getTime();
      const notifKey = `${notif.timestamp}_${notif.message}`;

      // CRITICAL: Only toast if:
      // 1. We haven't processed this key yet
      // 2. The notification arrived after the app was opened (or is very recent < 30s)
      if (processedNotifs.current.has(notifKey)) return;

      const isNew = notifTime > mountTime.current - 5000; // 5s buffer
      const isVeryRecent = (Date.now() - notifTime) < 30000; // Received in last 30s

      if (isNew || isVeryRecent) {
        processedNotifs.current.add(notifKey);
        
        toast.dismiss();
        toast.custom((t) => (
          <div
            className={cn(
              "flex items-center gap-3 px-6 py-4 rounded-[2rem] border shadow-2xl backdrop-blur-md transition-all duration-300 max-w-sm w-full mx-auto ring-4 ring-black/5",
              t.visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-4 scale-95",
              notif.type === 'status_picked' ? "bg-emerald-500 text-white border-emerald-400/30" : 
              notif.type === 'status_dropped' ? "bg-blue-600 text-white border-blue-400/30" : 
              notif.type === 'status_absent' ? "bg-rose-500 text-white border-rose-400/30" :
              "bg-slate-800 text-white border-slate-700"
            )}
          >
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              {notif.type === 'status_picked' ? <CheckCircle size={20} className="text-white" /> : 
               notif.type === 'status_dropped' ? <Home size={20} className="text-white" /> : 
               <Bus size={20} className="text-white" />}
            </div>
            <div className="flex-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/70 leading-none mb-1">
                {notif.type === 'status_picked' ? 'Onboard Confirmed' : 
                 notif.type === 'status_dropped' ? 'Dropoff Confirmed' : 'Alert'}
              </p>
              <p className="text-xs font-black uppercase tracking-tight leading-tight">
                {cleanMessage(notif.message)}
              </p>
            </div>
            <button 
              onClick={() => toast.dismiss(t.id)} 
              className="p-1 rounded-full hover:bg-white/10 active:scale-95 transition-all text-white/50 hover:text-white shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        ), { id: notifKey, duration: 6000 });
      } else {
        // Mark old ones as processed so they don't toast even if dismissed state changes
        processedNotifs.current.add(notifKey);
      }
    });
  }, [userData]);

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

  const pickupStatus = (userData as any)?.pickupStatus && isStatusFresh((userData as any)?.pickupUpdatedAt) ? (userData as any).pickupStatus : 'waiting';
  const dropoffStatus = (userData as any)?.dropoffStatus && isStatusFresh((userData as any)?.dropoffUpdatedAt) ? (userData as any).dropoffStatus : 'waiting';

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getTimelineNodes = () => {
    if (!route?.pickupPoints) return [];
    const sorted = getSortedStops(route.pickupPoints, activeTrip);
    
    const nodes = sorted.map((p: any) => ({
      id: String(p.id),
      name: p.name,
      type: 'stop',
      lat: p.lat,
      lng: p.lng,
      isUserStop: String(p.id) === String(userData?.pickupPointId)
    }));

    if (org) {
      nodes.push({
        id: 'ORG',
        name: org.name || 'Office',
        type: 'org',
        lat: org.location?.lat,
        lng: org.location?.lng,
        isUserStop: false
      });
    }

    return nodes;
  };

  const getStopStatusAndLabel = (node: any, idx: number, tNodes: any[]) => {
    if (!activeTrip) return { status: 'pending', label: 'Pending' };

    const currentStopId = activeTrip?.currentStopId;
    const currentStopIdx = tNodes.findIndex(n => n.id === currentStopId);

    // Trip is live
    if (currentStopId === 'ORG') {
      if (node.id === 'ORG') return { status: 'active', label: 'Arrived' };
      return { status: 'completed', label: 'Completed' };
    }

    if (currentStopIdx === -1) {
      if (idx === 0) return { status: 'active', label: 'Next Stop' };
      return { status: 'pending', label: 'Pending' };
    }

    if (idx < currentStopIdx) {
      return { status: 'completed', label: 'Completed' };
    } else if (idx === currentStopIdx) {
      return { status: 'active', label: 'Next Stop' };
    } else {
      return { status: 'pending', label: 'Pending' };
    }
  };

  useEffect(() => {
    if (!vehicle?.location || !userStop) {
      setEta('--');
      setDistance('--');
      return;
    }

    const fetchETA = async () => {
      try {
        const nodes = getTimelineNodes();
        if (nodes.length === 0) {
          setEta('--');
          setDistance('--');
          return;
        }

        const userStopIdx = nodes.findIndex(n => n.id === String(userData?.pickupPointId));
        const currentStopIdx = nodes.findIndex(n => n.id === activeTrip?.currentStopId);

        const isPickup = activeTrip?.direction === 'pickup' || !activeTrip;
        
        // Check if user stop is completed
        const isUserCompleted = isPickup
          ? (pickupStatus === 'picked' || (currentStopIdx !== -1 && userStopIdx !== -1 && currentStopIdx > userStopIdx) || activeTrip?.currentStopId === 'ORG')
          : (dropoffStatus === 'dropped' || (currentStopIdx !== -1 && userStopIdx !== -1 && currentStopIdx > userStopIdx));

        const coordsList: [number, number][] = [[vehicle.location.lng, vehicle.location.lat]];

        if (isPickup) {
          if (isUserCompleted) {
            // User Completed/Onboarded -> destination is Organization, routing via remaining active stops
            const startIdx = currentStopIdx !== -1 ? currentStopIdx : 0;
            for (let i = startIdx; i < nodes.length; i++) {
              const node = nodes[i];
              if (isValidCoordinate(node.lat, node.lng)) {
                coordsList.push([node.lng, node.lat]);
              }
            }
          } else {
            // User not completed yet -> destination is userStop, routing via stops from current index to userStopIdx
            const startIdx = currentStopIdx !== -1 ? currentStopIdx : 0;
            const endIdx = userStopIdx !== -1 ? userStopIdx : nodes.length - 1;
            for (let i = startIdx; i <= endIdx; i++) {
              const node = nodes[i];
              if (isValidCoordinate(node.lat, node.lng)) {
                coordsList.push([node.lng, node.lat]);
              }
            }
          }
        } else {
          // Dropoff direction
          if (isUserCompleted) {
            if (userStop && isValidCoordinate(userStop.lat, userStop.lng)) {
              coordsList.push([userStop.lng, userStop.lat]);
            }
          } else {
            const startIdx = currentStopIdx !== -1 ? currentStopIdx : 0;
            const endIdx = userStopIdx !== -1 ? userStopIdx : nodes.length - 1;
            for (let i = startIdx; i <= endIdx; i++) {
              const node = nodes[i];
              if (isValidCoordinate(node.lat, node.lng)) {
                coordsList.push([node.lng, node.lat]);
              }
            }
          }
        }

        // Deduplicate coordinates
        const uniqueCoords: [number, number][] = [];
        coordsList.forEach(coord => {
          if (uniqueCoords.length === 0) {
            uniqueCoords.push(coord);
          } else {
            const last = uniqueCoords[uniqueCoords.length - 1];
            if (Math.abs(coord[0] - last[0]) > 0.0001 || Math.abs(coord[1] - last[1]) > 0.0001) {
              uniqueCoords.push(coord);
            }
          }
        });

        if (uniqueCoords.length < 2) {
          setEta('--');
          setDistance('--');
          return;
        }

        const coordsString = uniqueCoords.map(c => `${c[0]},${c[1]}`).join(';');
        const urls = [
          `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordsString}?overview=false`,
          `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=false`,
          `/api/proxy/osrm/route/v1/driving/${coordsString}?overview=false`
        ];

        let data = null;
        for (const url of urls) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              const json = await response.json();
              if (json.code === 'Ok' && json.routes?.[0]) {
                data = json;
                break;
              }
            }
          } catch (e) {
            console.warn(`Fetch OSRM to ${url} failed:`, e);
          }
        }

        if (data && data.routes?.[0]) {
          const routeRes = data.routes[0];
          const mins = Math.ceil(routeRes.duration / 60);
          const km = (routeRes.distance / 1000).toFixed(1);
          const arrivalTime = calculateArrivalTime(mins);
          setEta(`${arrivalTime} (${mins}m)`);
          setDistance(`${km} KM`);
        } else {
          // Fallback direct distance calculation
          const targetNode = isUserCompleted ? org?.location : userStop;
          if (targetNode && isValidCoordinate(targetNode.lat, targetNode.lng)) {
            const dist = getDistance(vehicle.location.lat, vehicle.location.lng, targetNode.lat, targetNode.lng);
            const estMins = Math.max(1, Math.round(dist * 1.8 + 2));
            const arrivalTime = calculateArrivalTime(estMins);
            setEta(`${arrivalTime} (${estMins}m)`);
            setDistance(`${dist.toFixed(1)} KM`);
          } else {
            setEta('--');
            setDistance('--');
          }
        }
      } catch (err) {
        console.warn("ETA fetch failed", err);
      }
    };

    fetchETA();
    const interval = setInterval(fetchETA, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [vehicle?.location, userStop, org?.location, activeTrip?.currentStopId, activeTrip?.direction, pickupStatus, dropoffStatus, route?.pickupPoints]);

  useEffect(() => {
    if (userDbDataLoading && !userDbData) {
      setLoading(true);
    }
  }, [userDbDataLoading, userDbData]);

  useEffect(() => {
    if (!userData?.uid) {
      setLoading(false);
      return;
    }

    const orgId = userData.orgId;
    const routeId = userData.routeId;

    if (!orgId || !routeId) {
      setLoading(false);
      return;
    }

    const processData = (res: any) => {
      // 1. Organization Identification
      if (res.org) {
        const d = res.org;
        let location = null;
        if (d.latitude !== undefined && d.longitude !== undefined && d.latitude !== null && d.longitude !== null && isValidCoordinate(d.latitude, d.longitude)) {
          location = { lat: parseFloat(d.latitude), lng: parseFloat(d.longitude) };
        } else {
          let loc = d.location;
          if (typeof loc === 'string') {
            try { loc = JSON.parse(loc); } catch (e) {}
          }
          if (loc) {
            const lat = loc.lat !== undefined ? loc.lat : loc.latitude;
            const lng = loc.lng !== undefined ? loc.lng : loc.longitude;
            if (isValidCoordinate(lat, lng)) {
              location = { lat: parseFloat(lat), lng: parseFloat(lng) };
            }
          }
        }
        setOrg({ ...d, location });
      }

      // 2. Active Route Information
      let matchedRouteObj = null;
      if (res.routes) {
        const matchedRoute = res.routes.find((r: any) => r.id === routeId);
        if (matchedRoute) {
          setRoute(matchedRoute);
          matchedRouteObj = matchedRoute;
        }
      }

      // 3. activeTrip Status
      let matchedTrip = null;
      if (res.trips) {
        matchedTrip = res.trips.find((t: any) => t.routeId === routeId && (t.status === 'live' || t.status === 'ongoing'));
        if (matchedTrip) {
          let currentLoc = matchedTrip.currentLocation;
          if (typeof currentLoc === 'string') {
            try { currentLoc = JSON.parse(currentLoc); } catch (e) {}
          }
          setActiveTrip({ ...matchedTrip, currentLocation: currentLoc, isRealtime: true });
        } else {
          setActiveTrip(null);
        }
      }

      // 4. Vehicle & location tracking resolution
      if (res.vehicles && res.vehicles.length > 0) {
        const assignedDriver = res.users?.find((u: any) => u.role === 'driver' && (u.routeId === routeId || u.uid === matchedTrip?.driverId));
        const matchedVehicle = res.vehicles.find((v: any) => v && (
          v.id === matchedTrip?.vehicleId ||
          v.id === matchedRouteObj?.vehicleId ||
          v.id === (userData as any)?.vehicleId ||
          (assignedDriver && (v.driverId === assignedDriver.uid || v.id === assignedDriver.vehicleId)) ||
          (matchedRouteObj && v.routeId === matchedRouteObj.id)
        )) || res.vehicles[0];

        if (matchedVehicle) {
          setTargetVehicleId(matchedVehicle.id);
          const locObj = (matchedVehicle.latitude !== null && matchedVehicle.longitude !== null && matchedVehicle.latitude !== undefined && matchedVehicle.longitude !== undefined)
            ? { lat: Number(matchedVehicle.latitude), lng: Number(matchedVehicle.longitude) }
            : (typeof matchedVehicle.location === 'string' ? (() => { try { return JSON.parse(matchedVehicle.location); } catch(e) { return null; } })() : matchedVehicle.location || org?.location || null);
          
          setVehicle({
            ...matchedVehicle,
            plateNumber: matchedVehicle.plateNumber || matchedVehicle.number || "BUS-01",
            location: locObj,
            isRealtime: true
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
          console.warn("Error parsing cached dashboard data:", e);
        }
      }
    }

    const fetchMySQLUserDashboardData = async () => {
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
      } catch (e) {
        console.warn("User MySQL load failed:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchMySQLUserDashboardData();
    const interval = setInterval(fetchMySQLUserDashboardData, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [userData?.uid, userData?.routeId, userData?.orgId, userDbData]);



  const orgIconUrl = getLocalIcon(org?.logo || org?.logoUrl || (org?.sector === 'Education' ? (org?.eduType === 'College' ? 'graduation-cap' : 'school') : (org?.sector === 'Healthcare' ? 'hospital' : (org?.sector === 'Government' ? 'museum' : 'commercial'))));

  const mapCenter = (activeTrip && (activeTrip.direction === 'pickup' ? pickupStatus !== 'picked' : dropoffStatus !== 'dropped') && userStop && isValidCoordinate(userStop.lat, userStop.lng))
    ? { lat: userStop.lat, lng: userStop.lng }
    : (vehicle?.location && isValidCoordinate(vehicle.location.lat, vehicle.location.lng))
    ? { lat: vehicle.location.lat, lng: vehicle.location.lng }
    : (org?.location && isValidCoordinate(org.location.lat, org.location.lng))
    ? { lat: org.location.lat, lng: org.location.lng }
    : undefined;

  const timelineNodes = getTimelineNodes();
  const currentStopId = activeTrip?.currentStopId;
  const currentStopIdx = timelineNodes.findIndex(n => n.id === currentStopId);
  const isPickup = activeTrip?.direction === 'pickup' || !activeTrip;
  const userStopIdx = timelineNodes.findIndex(n => n.id === String(userData?.pickupPointId));
  const isUserCompleted = isPickup
    ? (pickupStatus === 'picked' || (currentStopIdx !== -1 && userStopIdx !== -1 && currentStopIdx > userStopIdx) || currentStopId === 'ORG')
    : (dropoffStatus === 'dropped' || (currentStopIdx !== -1 && userStopIdx !== -1 && currentStopIdx > userStopIdx));

  const getProgressPercentage = () => {
    if (!activeTrip || timelineNodes.length <= 1) return 0;
    if (currentStopId === 'ORG') return 100;
    if (currentStopIdx === -1) return 0;
    return (currentStopIdx / (timelineNodes.length - 1)) * 100;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full space-y-6"
    >
      {/* Live Status Card */}
      <div className="bg-white rounded-[2rem] p-8 shadow-2xl border border-slate-200 relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-600 mb-2">Live Updates</p>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">
                {activeTrip 
                  ? (isUserCompleted ? `HEADING TO ${org?.name || 'BASE'}` : 'Bus on Route')
                  : 'Standby Mode'}
              </h2>
            </div>
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-900/20 group-hover:bg-blue-600 transition-colors duration-500 transform group-hover:rotate-6">
              <Bus className="w-6 h-6 text-white" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none">
                  {isUserCompleted ? `ETA to ${org?.name || 'Base'}` : 'Arrival ETA'}
                </p>
                <p className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{activeTrip && vehicle ? eta : '--'}</p>
              </div>
              <div className="w-px h-10 bg-slate-200"></div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none">Remaining Distance</p>
                <p className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{activeTrip && vehicle ? distance : '--'}</p>
              </div>
            </div>

            {/* Dynamic Stops visual progress line */}
            {timelineNodes.length > 0 && (
              <div className="space-y-4 pt-1">
                <div className="w-full overflow-x-auto pb-2 pt-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent -mx-4 px-4 sm:-mx-6 sm:px-6">
                  <div 
                    className="relative pt-10 pb-4 px-2 bg-slate-50/50 rounded-2xl border border-slate-100/80 shadow-sm"
                    style={{ 
                      width: `${Math.max(340, timelineNodes.length * 110)}px`, 
                      minWidth: '100%' 
                    }}
                  >
                    {/* Background Track Line - mathematically centered from first dot center to last dot center */}
                    <div 
                      className="absolute top-[56px] h-1.5 bg-slate-100 rounded-full z-0" 
                      style={{
                        left: `${50 / timelineNodes.length}%`,
                        right: `${50 / timelineNodes.length}%`
                      }}
                    />
                    
                    {/* Progress Line representation - mathematically scaled to current stop center */}
                    {activeTrip && currentStopIdx !== -1 && (
                      <motion.div 
                        className="absolute top-[56px] h-1.5 bg-blue-600 rounded-full origin-left z-0"
                        style={{
                          left: `${50 / timelineNodes.length}%`,
                        }}
                        initial={{ width: 0 }}
                        animate={{ 
                          width: `${(currentStopIdx / (timelineNodes.length - 1)) * (100 - (100 / timelineNodes.length))}%`
                        }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    )}

                    {/* Waypoints Render block */}
                    <div className="relative z-10 flex justify-between items-center w-full">
                      {timelineNodes.map((node: any, idx: number) => {
                        const statusInfo = getStopStatusAndLabel(node, idx, timelineNodes);
                        const isUserStop = node.isUserStop;

                        // Styles
                        let dotColor = "bg-white border-slate-300 text-slate-400 shadow-sm";
                        let pulseEffect = null;
                        let stopTitleColor = "text-slate-400 font-bold";

                        if (statusInfo.status === 'completed') {
                          dotColor = "bg-green-500 border-green-500 text-white shadow-md shadow-green-500/20 scale-105";
                          stopTitleColor = "text-green-600 font-extrabold";
                        } else if (statusInfo.status === 'active') {
                          dotColor = "bg-blue-600 border-blue-600 text-white scale-110 shadow-lg shadow-blue-500/30";
                          stopTitleColor = "text-blue-600 font-black";
                          pulseEffect = (
                            <span className="absolute inset-0 rounded-full bg-blue-500/40 animate-ping z-0 scale-110" style={{ animationDuration: '2s' }} />
                          );
                        }

                        if (isUserStop) {
                          stopTitleColor = `${stopTitleColor} underline decoration-orange-500 decoration-2`;
                        }

                        return (
                          <div key={node.id} className="flex flex-col items-center relative group/node min-w-[80px] flex-1">
                            {/* Anchor Marker or User Tag directly above user stop */}
                            {isUserStop && (
                              <div className="absolute top-[-38px] flex flex-col items-center z-20">
                                <span className="bg-orange-600 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shadow-lg shadow-orange-600/30 tracking-wider flex items-center gap-0.5 whitespace-nowrap">
                                  <MapPin className="w-2.5 h-2.5 fill-white shrink-0" />
                                  Your Stop
                                </span>
                                <div className="w-1.5 h-1.5 bg-orange-600 rotate-45 -mt-0.5"></div>
                              </div>
                            )}

                            {/* Interactive Stop Dot */}
                            <div className="relative w-10 h-10 flex items-center justify-center z-10">
                              {pulseEffect}
                              <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center border-2 text-[9px] font-black transition-all duration-300 relative z-10 cursor-pointer",
                                dotColor,
                                isUserStop ? "ring-4 ring-orange-500/20 border-orange-500 bg-orange-50" : ""
                              )}>
                                {statusInfo.status === 'completed' ? (
                                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : node.type === 'org' ? (
                                  <span className="text-[10px]">🏢</span>
                                ) : isUserStop ? (
                                  <span className="text-[10px] text-orange-600 font-bold">⭐</span>
                                ) : (
                                  <span>{idx + 1}</span>
                                )}
                              </div>

                              {/* Floating Card tooltips on Hover */}
                              <div className="absolute bottom-full mb-3 hidden group-hover/node:flex flex-col items-center z-50 pointer-events-none drop-shadow-xl animate-fade-in">
                                <div className="bg-slate-900 text-white text-[9px] font-bold py-1.5 px-3 rounded-xl whitespace-nowrap border border-white/10 flex flex-col items-center gap-0.5">
                                  <span className="uppercase tracking-widest">{node.name}</span>
                                  <span className="text-blue-400 text-[8px] tracking-wider uppercase font-black">{statusInfo.label}</span>
                                </div>
                                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1"></div>
                              </div>
                            </div>

                            {/* Stop labels text, auto responsive styling */}
                            <div className="text-center mt-2 w-full px-1 flex flex-col items-center">
                              <span className={cn(
                                "text-[10px] uppercase tracking-tight truncate max-w-[95px] transition-colors leading-normal block font-semibold",
                                stopTitleColor
                              )}>
                                {node.type === 'org' ? 'BASE' : node.name}
                              </span>
                              <span className="text-[8px] text-slate-400 font-medium tracking-widest mt-0.5 uppercase">
                                {statusInfo.status === 'completed' ? 'Passed' :
                                 statusInfo.status === 'active' ? 'Active' : 'Pending'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Legend showing statuses */}
                <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-400 px-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                    <span>Passed Stops</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                    <span>Next Active Stop</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-300"></span>
                    <span>Pending Route</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="absolute top-[-10%] right-[-10%] w-48 h-48 bg-blue-500/5 blur-3xl rounded-full"></div>
      </div>

      {/* Map Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center leading-none">
            <Activity className="w-4 h-4 mr-2 text-blue-600" />
            Bus Map
          </h3>
          <div className="flex items-center gap-1.5 bg-green-100 px-2 py-0.5 rounded text-green-700">
             <div className="w-1 h-1 rounded-full bg-green-500"></div>
             <span className="text-[9px] font-black uppercase tracking-tight">System Online</span>
          </div>
        </div>
        <div className="rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-white">
          <MapComponent 
            height="400px" 
            zoom={activeTrip ? 16 : 14} 
            center={mapCenter}
          >
            {org?.location && isValidCoordinate(org.location.lat, org.location.lng) && (
              <Marker 
                key="desktop-org-marker"
                position={[org.location.lat, org.location.lng]} 
                icon={createMarkerIcon(
                  org?.sector === 'Education' ? (org?.eduType === 'College' ? '#6366f1' : '#4f46e5') : '#0f172a', 
                  orgIconUrl, 
                  org?.sector === 'Education' ? (org?.eduType === 'College' ? '#6366f1' : '#4f46e5') : '#0f172a', 
                  org?.name || 'BASE'
                )} 
              >
                 <Popup>
                   <div className="p-2 text-center">
                     <p className="text-[10px] font-black text-slate-800 uppercase italic leading-none">{org.name}</p>
                     <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{org.sector || 'Main Base'}</p>
                   </div>
                 </Popup>
              </Marker>
            )}
            {vehicle?.location && isValidCoordinate(vehicle.location.lat, vehicle.location.lng) && (
              <Marker 
                key="desktop-vehicle-marker"
                position={[vehicle.location.lat, vehicle.location.lng]} 
                icon={createMarkerIcon('#2563eb', getLocalIcon('bus'), '#3b82f6', `BUS: ${vehicle.plateNumber || 'ACTIVE'}`)}
              >
                <Popup>
                  <div className="p-1 font-black text-[10px] uppercase">
                    Bus: {vehicle.plateNumber || 'ACTIVE'}
                  </div>
                </Popup>
              </Marker>
            )}
            {userStop && isValidCoordinate(userStop.lat, userStop.lng) && (
              <Marker 
                key="desktop-userstop-marker"
                position={[userStop.lat, userStop.lng]} 
                icon={stationIcon}
              >
                <Popup>
                  <div className="p-1 font-black text-[10px] uppercase">
                    {userStop.name} (Your Stop)
                  </div>
                </Popup>
              </Marker>
            )}
          </MapComponent>
        </div>
      </div>

      {/* Notifications Feed */}
      <div className="bg-slate-900 rounded-[2rem] p-8 shadow-2xl text-white relative overflow-hidden border border-slate-800 group">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <h4 className="text-xs font-black uppercase tracking-[0.25em] flex items-center text-blue-400">
              Live Feed
            </h4>
            <div className="h-px flex-1 mx-4 bg-slate-800"></div>
            {getNotifications(userData).filter((n: any) => !n.dismissed).length > 0 && (
              <span className="text-[9px] font-black bg-blue-600/20 text-blue-400 px-2.5 py-1 rounded-full uppercase tracking-widest border border-blue-600/30">
                {getNotifications(userData).filter((n: any) => !n.dismissed).length} New
              </span>
            )}
          </div>
          <div className="space-y-4">
            {getNotifications(userData).length > 0 ? (
              getNotifications(userData).slice(-3).reverse().map((n: any, i: number) => (
                <AlertItem key={i} text={cleanMessage(n.message)} time={new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toUpperCase()} />
              ))
            ) : (
              <p className="text-[10px] text-slate-500 font-black uppercase text-center py-4">No recent activity</p>
            )}
          </div>
          
          <button className="w-full mt-8 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors group/btn">
             Complete Dispatch Log
             <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
          </button>
        </div>
        
        {/* Background Atmosphere */}
        <div className="absolute top-[-20%] right-[-20%] w-64 h-64 bg-blue-500/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-48 h-48 bg-purple-500/5 rounded-full blur-[80px]"></div>
      </div>
    </motion.div>
  );
}

function AlertItem({ text, time }: { text: string, time: string }) {
  return (
    <div className="flex items-start justify-between gap-6 p-4 rounded-2xl bg-slate-800/30 border border-white/5 transition-all hover:bg-slate-800/80 group">
      <div className="flex gap-4">
         <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 group-hover:scale-150 transition-transform"></div>
         <p className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors leading-relaxed font-medium">{cleanMessage(text)}</p>
      </div>
      <span className="text-[9px] font-black text-slate-600 group-hover:text-slate-400 whitespace-nowrap uppercase tracking-tighter shrink-0 pt-0.5 transition-colors">{time}</span>
    </div>
  );
}
