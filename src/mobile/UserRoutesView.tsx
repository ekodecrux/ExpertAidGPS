import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { MapPin, Clock, Bus, ChevronRight, CheckCircle2, History, Truck, ChevronDown, Compass } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSortedStops, getLocalIcon, isValidCoordinate, getDistance, calculateArrivalTime } from '../lib/utils';
import { getBackendUrl } from '../lib/apiPatch';

export interface StopEtaInfo {
  mins: number;
  timeStr: string;
}

interface UserRoutesViewProps {
  userDbData?: any;
  userDbDataLoading?: boolean;
}

export default function UserRoutesView({ userDbData, userDbDataLoading }: UserRoutesViewProps = {}) {
  const { userData } = useAuth();
  const [route, setRoute] = useState<any>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(() => {
    if (userDbData) return false;
    if (userData?.uid) {
      const cached = localStorage.getItem(`expert_gps_user_db_data_${userData.uid}`);
      if (cached) return false;
    }
    return true;
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [stopEtas, setStopEtas] = useState<Record<string, StopEtaInfo>>({});

  useEffect(() => {
    if (userDbDataLoading && !userDbData) {
      setLoading(true);
    }
  }, [userDbDataLoading, userDbData]);

  // 1. Poll the MySQL user-data endpoint to feed all route, trip, org, and vehicle details
  useEffect(() => {
    if (!userData?.uid) {
      setLoading(false);
      return;
    }

    const routeIdToFetch = (userData as any)?.routeId;
    const orgId = userData.orgId;

    if (!routeIdToFetch || !orgId) {
      setRoute(null);
      setLoading(false);
      return;
    }

    const processData = (res: any) => {
      // Set organization straight from MySQL
      if (res.org) {
        setOrg(res.org);
      }

      // Set Route details
      let matchedRoute = null;
      if (res.routes && routeIdToFetch) {
        matchedRoute = res.routes.find((r: any) => r.id === routeIdToFetch);
        if (matchedRoute) {
          setRoute(matchedRoute);
        }
      }

      // Set active trip
      let matchedTrip = null;
      if (res.trips && routeIdToFetch) {
        matchedTrip = res.trips.find((t: any) => t.routeId === routeIdToFetch && (t.status === 'live' || t.status === 'ongoing'));
        if (matchedTrip) {
          setActiveTrip(matchedTrip);
        } else {
          setActiveTrip(null);
        }
      }

      // Set vehicle coordinate
      if (res.vehicles) {
        const vehicleIdToFetch = matchedTrip?.vehicleId || matchedRoute?.vehicleId;
        if (vehicleIdToFetch) {
          const matchedVehicle = res.vehicles.find((v: any) => v.id === vehicleIdToFetch);
          if (matchedVehicle) {
            const locObj = (matchedVehicle.latitude !== null && matchedVehicle.longitude !== null && matchedVehicle.latitude !== undefined && matchedVehicle.longitude !== undefined)
              ? { lat: Number(matchedVehicle.latitude), lng: Number(matchedVehicle.longitude) }
              : (typeof matchedVehicle.location === 'string' ? (() => { try { return JSON.parse(matchedVehicle.location); } catch(e) { return null; } })() : matchedVehicle.location || null);

            setVehicle({
              ...matchedVehicle,
              plateNumber: matchedVehicle.plateNumber || matchedVehicle.number || "",
              location: locObj
            });
          } else {
            setVehicle(null);
          }
        } else {
          setVehicle(null);
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
          console.warn("Error parsing cached routes data:", e);
        }
      }
    }

    const fetchMySQLMobileData = async () => {
      try {
        let token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token) {
          token = localStorage.getItem("expert_gps_fallback_token") || undefined;
        }
        if (!token) return;
        const backendUrl = getBackendUrl();
        const resObj = await fetch(`${backendUrl}/api/records/user-data`, {
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
          console.warn("Transient network connection to /api/records/user-data in UserRoutesView is resolving...");
        } else {
          console.error("Error fetching specific route details from MySQL", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMySQLMobileData();
    // Poll every 4 seconds for immediate feeling of real-time update
    const interval = setInterval(fetchMySQLMobileData, 4000);

    return () => {
      clearInterval(interval);
    };
  }, [userData?.uid, userData?.routeId, userData?.orgId, userDbData]);

  // Real-time dynamic ETA estimation to each stop based on vehicle location and route sequence
  useEffect(() => {
    const fetchLiveEtas = async () => {
      const pickupPoints = route?.pickupPoints;
      const sortedStops = getSortedStops(pickupPoints, activeTrip);
      if (!vehicle?.location || !isValidCoordinate(vehicle.location.lat, vehicle.location.lng) || !sortedStops.length) {
        return;
      }

      const activeStops = sortedStops;
      const currentStopId = activeTrip?.currentStopId;
      const currentStopIndex = activeStops.findIndex((s: any) => s?.id === currentStopId);
      const activeIdx = currentStopIndex !== -1 ? currentStopIndex : 0;
      const coordsList: [number, number][] = [[parseFloat(vehicle.location.lng), parseFloat(vehicle.location.lat)]];

      // Build upcoming stops sequence
      const upcomingStops: any[] = [];
      for (let i = activeIdx; i < activeStops.length; i++) {
        const stop = activeStops[i];
        if (stop && isValidCoordinate(stop.lat, stop.lng)) {
          coordsList.push([parseFloat(stop.lng), parseFloat(stop.lat)]);
          upcomingStops.push(stop);
        }
      }

      if (coordsList.length < 2) return;

      // Deduplicate consecutive identical coordinates
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

      if (uniqueCoords.length < 2) return;

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
          console.warn(`OSRM fetch failed for URL ${url} in UserRoutesView:`, e);
        }
      }

      const newEtas: Record<string, StopEtaInfo> = {};

      if (data && data.routes?.[0] && data.routes[0].legs) {
        const legs = data.routes[0].legs;
        let cumulativeDuration = 0; // seconds
        legs.forEach((leg: any, idx: number) => {
          cumulativeDuration += leg.duration; // in seconds
          const targetStop = upcomingStops[idx];
          if (targetStop) {
            const mins = Math.max(1, Math.ceil(cumulativeDuration / 60));
            newEtas[targetStop.id] = {
              mins,
              timeStr: calculateArrivalTime(mins)
            };
          }
        });
      } else {
        // Fallback: Haversine distance-based math
        let cumulativeDistance = 0;
        let prevLat = parseFloat(vehicle.location.lat);
        let prevLng = parseFloat(vehicle.location.lng);

        upcomingStops.forEach((stop, idx) => {
          if (isValidCoordinate(stop.lat, stop.lng)) {
            cumulativeDistance += getDistance(prevLat, prevLng, parseFloat(stop.lat), parseFloat(stop.lng));
            prevLat = parseFloat(stop.lat);
            prevLng = parseFloat(stop.lng);

            // estimate speed of 30 km/h (2 mins/km) + 1.5 mins dwell time per intermediate stop
            const estMins = Math.max(1, Math.round(cumulativeDistance * 1.8 + 2 + idx * 1.5));
            newEtas[stop.id] = {
              mins: estMins,
              timeStr: calculateArrivalTime(estMins)
            };
          }
        });
      }

      setStopEtas(newEtas);
    };

    fetchLiveEtas();
    const interval = setInterval(fetchLiveEtas, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [vehicle?.location, route?.pickupPoints, activeTrip?.currentStopId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

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

  const uData = userData as any;
  const pickupStatus = (uData?.pickupStatus && isStatusFresh(uData?.pickupUpdatedAt)) ? uData.pickupStatus : 'waiting';

  const stops = getSortedStops(route?.pickupPoints, activeTrip);
  const userStop = stops.find((s: any) => s?.id === uData?.pickupPointId);
  const currentStopId = activeTrip?.currentStopId;
  const currentStopIndex = stops.findIndex((s: any) => s?.id === currentStopId);
  const isReturningToBase = currentStopId === 'ORG';

  return (
    <div className="space-y-6 pb-24">
      {!route ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center min-h-[50vh] bg-white rounded-3xl border border-slate-100 shadow px-6">
          <div className="w-16 h-16 rounded-[1.5rem] bg-slate-50 flex items-center justify-center text-slate-400 mb-4 shadow-xl border border-slate-100/60 ring-4 ring-slate-50">
            <Compass size={24} className="text-slate-400 stroke-[2]" />
          </div>
          <h3 className="text-base font-black text-slate-900 uppercase tracking-tighter italic mb-1">No Assigned Route</h3>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest max-w-[260px] leading-relaxed">
            You do not have a route assigned to your profile. Please contact your administrator to assign you to a specific route.
          </p>
        </div>
      ) : (
        <>
          <div 
            className={`bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 -mx-4 rounded-b-[3.5rem] shadow-2xl mb-8 relative overflow-hidden transition-all duration-500 ease-in-out ${isExpanded ? 'p-8 pt-6' : 'p-6 pt-4'}`}
          >
            {/* Decorative atmosphere */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl font-black"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/20 rounded-full -ml-12 -mb-12 blur-xl font-black"></div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <div className={`flex-1 min-w-0 transition-all duration-300 ${isExpanded ? '' : 'mr-4'}`}>
                  <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-0.5 drop-shadow-sm opacity-80">
                    {pickupStatus === 'picked' ? 'Trip Status' : 'Route Assigned'}
                  </p>
                  <h2 className={`font-black text-white uppercase tracking-tighter italic drop-shadow-md transition-all duration-300 ${isExpanded ? 'text-2xl leading-tight' : 'text-xl truncate whitespace-nowrap'}`}>
                    {pickupStatus === 'picked' ? `Onboard: ${route?.name}` : (route?.name || 'Assigned Route')}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {!isExpanded && (
                    <motion.div 
                      initial={{ opacity: 1, scale: 1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center flex-shrink-0 border border-white/20 shadow-inner"
                    >
                      <Bus className="text-white" size={20} />
                    </motion.div>
                  )}
                  <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white active:scale-95 transition-all shadow-lg"
                  >
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown size={18} />
                    </motion.div>
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-3 mt-4 mb-4">
                      <div className="bg-white/10 backdrop-blur-sm p-3.5 rounded-2xl border border-white/10 shadow-sm flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/30 flex items-center justify-center">
                            <MapPin size={12} className="text-blue-100" />
                        </div>
                        <div>
                            <p className="text-[7px] font-black text-blue-200 uppercase tracking-widest leading-none mb-1">Stops</p>
                            <p className="text-xs font-black text-white">{stops.length} Total</p>
                        </div>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm p-3.5 rounded-2xl border border-white/10 shadow-sm flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/30 flex items-center justify-center">
                            <Truck size={12} className="text-blue-100" />
                        </div>
                        <div>
                            <p className="text-[7px] font-black text-blue-200 uppercase tracking-widest leading-none mb-1">Bus Info</p>
                            <p className="text-xs font-black text-white">{vehicle?.plateNumber || 'TBD'}</p>
                        </div>
                      </div>
                    </div>

                    {/* User's Stop Highlight at bottom of card */}
                    {userStop && (
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                            <CheckCircle2 size={16} className="text-white" />
                          </div>
                          <div>
                            <p className="text-[7px] font-black text-blue-200 uppercase tracking-widest leading-none mb-1">Your Assigned Stop</p>
                            <p className="text-xs font-black text-white uppercase tracking-tighter truncate max-w-[180px]">
                              {userStop.name}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[7px] font-black text-blue-200 uppercase tracking-widest leading-none mb-1">
                            {stopEtas[userStop.id]?.timeStr ? 'Estimated Arrival' : 'Scheduled Time'}
                          </p>
                          <p className="text-xs font-black text-white">
                            {stopEtas[userStop.id]?.timeStr || userStop.time}
                          </p>
                          {stopEtas[userStop.id]?.mins !== undefined && (
                            <p className="text-[9px] font-bold text-blue-200/90 mt-0.5">
                              ({stopEtas[userStop.id].mins <= 1 ? 'Arriving now' : `${stopEtas[userStop.id].mins} Mins`})
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 px-2">
              <History size={16} />
              Route Stops Timeline
            </h3>
            
            <div className="relative pl-10 pt-4 pb-4">
              {/* Vertical Progress Line */}
              <div className="absolute left-[15px] top-0 bottom-0 w-1 bg-slate-100 rounded-full">
                {/* Bus Progress Indicator */}
                {activeTrip && (
                   <motion.div 
                     className="absolute left-[-14px] z-20 w-8 h-8 rounded-xl bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center overflow-hidden"
                     initial={false}
                     animate={{ 
                       top: isReturningToBase ? '100%' : `${Math.max(0, (currentStopIndex / (stops.length || 1)) * 100)}%` 
                     }}
                     transition={{ type: "spring", stiffness: 100, damping: 20 }}
                   >
                     <img src={getLocalIcon('bus')} className="w-6 h-6 object-contain" alt="Bus" />
                   </motion.div>
                )}
                {/* Completion indicator line */}
                <motion.div 
                  className="absolute top-0 left-0 w-full bg-blue-500 rounded-full"
                  initial={{ height: 0 }}
                  animate={{ 
                    height: isReturningToBase ? '100%' : `${Math.max(0, ((currentStopIndex + 1) / (stops.length || 1)) * 100)}%` 
                  }}
                />
              </div>

              <div className="space-y-8">
                {stops.map((stop: any, index: number) => {
                  const isPast = isReturningToBase || currentStopIndex > index;
                  const isCurrent = currentStopIndex === index;
                  const isUserStop = stop.id === (userData as any)?.pickupPointId;

                  return (
                    <motion.div 
                      key={stop.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`relative flex items-center justify-between p-5 rounded-[2rem] border transition-all ${
                        isCurrent ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 border-transparent scale-[1.02]' : 
                        isUserStop ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-50 shadow-sm'
                      }`}
                    >
                      {/* Dot on line */}
                      <div className={`absolute -left-[23px] w-4 h-4 rounded-full border-4 border-white shadow-sm transition-colors z-10 ${
                        isPast ? 'bg-emerald-500' : isCurrent ? 'bg-blue-600 animate-pulse' : 'bg-slate-200'
                      }`}></div>

                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isCurrent ? 'bg-white/20' : isUserStop ? 'bg-blue-100' : 'bg-slate-50'}`}>
                          {isPast ? <CheckCircle2 size={18} className={isCurrent ? 'text-white' : 'text-emerald-500'} /> : <MapPin size={18} className={isCurrent ? 'text-white' : 'text-slate-400'} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-black uppercase tracking-tighter ${isCurrent ? 'text-white' : 'text-slate-900'}`}>
                              {stop.name}
                            </p>
                            {isUserStop && (
                              <span className={`text-[7px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${isCurrent ? 'bg-white/20 text-white' : 'bg-blue-600 text-white'}`}>
                                Your Stop
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest ${isCurrent ? 'text-white/70' : 'text-slate-400'}`}>
                              <Clock size={10} />
                              <span>{stop.time}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${isCurrent ? 'text-white/70' : 'text-slate-400'}`}>
                          {isPast ? 'Reached' : isCurrent ? 'Active • Arriving' : 'Estimated'}
                        </p>
                        <p className={`text-xs sm:text-sm font-black tracking-tight ${isCurrent ? 'text-white' : 'text-slate-900'}`}>
                          {isPast 
                            ? (stop.reachedTime || stop.time) 
                            : (stopEtas[stop.id]?.timeStr || stop.time)
                          }
                        </p>
                        {!isPast && stopEtas[stop.id]?.mins !== undefined && (
                          <span className={`text-[10px] font-extrabold mt-0.5 ${isCurrent ? 'text-blue-100' : 'text-blue-600'}`}>
                            {stopEtas[stop.id].mins <= 1 ? 'Arriving now' : `${stopEtas[stop.id].mins} Mins`}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {/* Final Organization Stop */}
                <div className="relative pt-4">
                   <div className={`absolute -left-[23px] w-4 h-4 rounded-full border-4 border-white shadow-sm bg-slate-200`}></div>
                   <div className="bg-slate-900/5 p-6 rounded-[2rem] border border-dashed border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center">
                          <Bus className="text-white" size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Final Destination</p>
                          <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{org?.name || 'Base'}</p>
                        </div>
                      </div>
                      <ChevronRight className="text-slate-300" size={20} />
                   </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
