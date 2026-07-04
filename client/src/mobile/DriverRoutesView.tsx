import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Users, CheckCircle, XCircle, Clock, ChevronRight, User as UserIcon, AlertTriangle, Navigation, Phone, ArrowUp, ArrowDown, SlidersHorizontal } from 'lucide-react';
import { doc, onSnapshot, updateDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { cn, getSectorTerminology, getSortedStops, getLocalAvatar, isValidCoordinate, getUserAvatar } from '../lib/utils';
import { saveMySQLRecord } from '../lib/mysql';
import toast from 'react-hot-toast';

interface DriverRoutesViewProps {
  driverData?: any;
  driverDataLoading?: boolean;
}

export default function DriverRoutesView({ driverData, driverDataLoading }: DriverRoutesViewProps = {}) {
  const { userData } = useAuth();
  const [route, setRoute] = useState<any>(null);
  const [allRouteUsers, setAllRouteUsers] = useState<any[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [editMode, setEditMode] = useState<'pickup' | 'dropoff'>('pickup');

  // Synchronize editMode with active trip direction if a live trip exists
  useEffect(() => {
    if (activeTrip?.direction) {
      setEditMode(activeTrip.direction);
    }
  }, [activeTrip?.direction]);

  const sortedStops = React.useMemo(() => {
    return getSortedStops(route?.pickupPoints, activeTrip, editMode);
  }, [route?.pickupPoints, activeTrip, editMode]);

  const reorderStops = async (index: number, direction: 'up' | 'down') => {
    if (!route || !route.id || !sortedStops.length) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedStops.length) return;

    // Clone current sorted stops and swap elements
    const updatedList = [...sortedStops];
    const temp = updatedList[index];
    updatedList[index] = updatedList[targetIndex];
    updatedList[targetIndex] = temp;

    const loadingToast = toast.loading(
      activeTrip 
        ? "Updating sequence for this trip only..." 
        : `Updating default ${editMode === 'pickup' ? 'pickup' : 'dropoff'} sequence...`
    );

    try {
      if (activeTrip) {
        // Change is only for THIS active trip
        const orderIds = updatedList.map(stop => stop.id);
        
        // Update in MySQL (we can store inside customized JSON configurations, or if field is virtual, save in best-effort)
        await saveMySQLRecord('update', 'trips', activeTrip.id, {
          customStopsOrder: orderIds,
          updatedAt: new Date().toISOString()
        }).catch(err => console.warn("Failed to write customStopsOrder directly to MySQL trips table:", err));

        // Update Firestore as best-effort
        try {
          await updateDoc(doc(db, 'trips', activeTrip.id), {
            customStopsOrder: orderIds,
            updatedAt: serverTimestamp()
          });
        } catch (fErr) {
          console.warn("Firestore trip update silenced:", fErr);
        }
        
        toast.success("Current trip stop sequence updated!", { id: loadingToast });
      } else {
        // Change is for the ROUTE default
        let updatedPickupPoints = [];
        if (editMode === 'pickup') {
          // Reassign order (1-based index) for pickupPoints array
          updatedPickupPoints = (route.pickupPoints || []).map((pt: any) => {
            const foundIdx = updatedList.findIndex(u => u.id === pt.id);
            return {
              ...pt,
              order: foundIdx !== -1 ? foundIdx + 1 : (pt.order || 999)
            };
          });
        } else {
          // Reassign dropoffOrder (1-based index) for pickupPoints array
          updatedPickupPoints = (route.pickupPoints || []).map((pt: any) => {
            const foundIdx = updatedList.findIndex(u => u.id === pt.id);
            return {
              ...pt,
              dropoffOrder: foundIdx !== -1 ? foundIdx + 1 : (pt.dropoffOrder || 999)
            };
          });
        }

        // 1. MUST save to MySQL so that Driver Dashboard / Map gets the immediate sequence!
        await saveMySQLRecord('update', 'routes', route.id, {
          pickupPoints: updatedPickupPoints,
          updatedAt: new Date().toISOString()
        });

        // 2. Best-effort update Firestore
        try {
          await updateDoc(doc(db, 'routes', route.id), {
            pickupPoints: updatedPickupPoints,
            updatedAt: serverTimestamp()
          });
        } catch (fErr) {
          console.warn("Firestore default sequence sync silenced:", fErr);
        }

        toast.success(`Default ${editMode === 'pickup' ? 'pickup' : 'dropoff'} sequence configured!`, { id: loadingToast });
      }
    } catch (err: any) {
      console.error("Failed to reorder stops:", err);
      toast.error("Failed to update sequence: " + err.message, { id: loadingToast });
    }
  };

  // 1. Fetch Comprehensive Driver Route Data from MySQL (decoupled from Firestore)
  useEffect(() => {
    if (!userData?.orgId || !userData?.routeId) return;

    const processRoutesData = (res: any) => {
      // Set Organization (straight from MySQL)
      if (res.org) {
        setOrg(res.org);
      }

      // Set Route details
      if (res.routes) {
        const matchedRoute = res.routes.find((r: any) => r && r.id === userData.routeId);
        if (matchedRoute) {
          setRoute(matchedRoute);
        }
      }

      // Set Active Trip
      if (res.trips) {
        const matchedTrip = res.trips.find(
          (t: any) => t && t.routeId === userData.routeId && (t.status === 'live' || t.status === 'ongoing') && t.driverId === (userData?.id || userData?.uid)
        );
        setActiveTrip(matchedTrip || null);
      }

      // Set Assigned Users (under this route)
      if (res.users) {
        const routeUsers = res.users.filter((u: any) => u.routeId === userData.routeId && (u.role === 'user' || u.role === 'member'));
        setAllRouteUsers(routeUsers);
      }
    };

    if (driverData) {
      processRoutesData(driverData);
      setLoading(false);
      return;
    }

    const fetchMySQLDriverRoutesData = async () => {
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
            processRoutesData(res);
          }
        }
      } catch (err: any) {
        if (err.message?.includes("Failed to fetch") || err.name === "TypeError") {
          console.warn("Transient network connection to /api/records/user-data in DriverRoutesView is resolving...");
        } else {
          console.error("Error fetching driver routes data from MySQL:", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMySQLDriverRoutesData();
    // Poll from MySQL every 4 seconds
    const interval = setInterval(fetchMySQLDriverRoutesData, 4000);

    return () => clearInterval(interval);
  }, [userData?.routeId, userData?.orgId, driverData]);

  const getStopUsers = (stopId: string) => {
    return allRouteUsers.filter(u => u.pickupPointId === stopId);
  };

  const termPlural = getSectorTerminology(org?.sector);
  const termSingular = getSectorTerminology(org?.sector, false);

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

  const getStatusLabelAndColor = (user: any) => {
    const direction = activeTrip?.direction || 'pickup';
    const dirStatus = direction === 'dropoff' ? user.dropoffStatus : user.pickupStatus;
    const dirUpdatedAt = direction === 'dropoff' ? user.dropoffUpdatedAt : user.pickupUpdatedAt;
    
    let status = dirStatus || 'waiting';
    let updatedAt = dirUpdatedAt;

    // Reset if status is not from today
    if (status !== 'waiting' && updatedAt && !isToday(updatedAt)) {
      status = 'waiting';
    }

    if (status === 'picked') return { label: 'Picked', color: 'bg-green-500/10 text-green-600 border-green-500/20' };
    if (status === 'dropped') return { label: 'Dropped', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
    if (status === 'absent') return { label: 'Absent', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' };
    
    return { label: 'Pending', color: 'bg-slate-100 text-slate-400 border-slate-200' };
  };

  // Derive current stop index from active trip or default to -1
  const currentStopIndex = activeTrip?.lastStopIndex ?? -1;
  const nextStopIndex = currentStopIndex + 1;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Loading Route Map...</p>
    </div>
  );

  if (!route) return (
    <div className="text-center py-20 px-8">
      <AlertTriangle className="mx-auto mb-4 text-amber-500" size={48} />
      <h3 className="text-xl font-black text-slate-900 uppercase italic">No Active Route</h3>
      <p className="text-sm text-slate-400 mt-2">You are not currently assigned to a route.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1 italic">Current Route</p>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">{route.name}</h2>
        </div>
        <div className="bg-slate-900 text-white px-4 py-2 rounded-2xl flex items-center gap-2 shadow-lg shadow-slate-900/20">
          <Clock size={14} className="text-blue-400" />
          <span className="text-[10px] font-black tracking-tighter">{route.startTime}</span>
        </div>
      </div>

      {/* Route Summary Card */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-1">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <MapPin size={14} className="fill-blue-100" />
            <p className="text-[8px] font-black uppercase tracking-widest">Total Stops</p>
          </div>
          <p className="text-2xl font-black text-slate-900 italic leading-none">{route.pickupPoints?.length || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-1">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Users size={14} className="fill-blue-100" />
            <p className="text-[8px] font-black uppercase tracking-widest">Route Capacity</p>
          </div>
          <p className="text-2xl font-black text-slate-900 italic leading-none">{allRouteUsers.length}</p>
        </div>
      </div>

      {/* Stops Timeline Header & Toggle */}
      <div className="flex justify-between items-center px-1 pt-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Stop Order</p>
          <h3 className="text-sm font-black text-slate-800 uppercase italic">Stops Sequence</h3>
        </div>
        <button
          onClick={() => {
            setArrangeMode(!arrangeMode);
            setSelectedStopId(null); // Collapse any open details
          }}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 shadow-sm border active:scale-95",
            arrangeMode 
              ? "bg-blue-600 border-blue-600 text-white shadow-blue-500/20" 
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          )}
        >
          <SlidersHorizontal size={12} className={arrangeMode ? "animate-pulse" : ""} />
          {arrangeMode ? "Roster View" : "Reorder Stops"}
        </button>
      </div>

      {/* Edit / View Mode Selector */}
      <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1.5 items-center">
        <button
          type="button"
          disabled={!!activeTrip}
          onClick={() => setEditMode('pickup')}
          className={cn(
            "flex-1 py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-xl transition-all duration-300",
            editMode === 'pickup'
              ? "bg-white text-blue-600 shadow-sm"
              : "text-slate-500 hover:text-slate-800",
            activeTrip && activeTrip.direction !== 'pickup' && "opacity-50 cursor-not-allowed"
          )}
        >
          Pickup Sequence {activeTrip?.direction === 'pickup' && '● Live'}
        </button>
        
        <button
          type="button"
          disabled={!!activeTrip}
          onClick={() => setEditMode('dropoff')}
          className={cn(
            "flex-1 py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-xl transition-all duration-300",
            editMode === 'dropoff'
              ? "bg-white text-blue-600 shadow-sm"
              : "text-slate-500 hover:text-slate-800",
            activeTrip && activeTrip.direction !== 'dropoff' && "opacity-50 cursor-not-allowed"
          )}
        >
          Dropoff Sequence {activeTrip?.direction === 'dropoff' && '● Live'}
        </button>
      </div>

      {arrangeMode ? (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-2"
        >
          <div className="bg-blue-50/70 border border-blue-100/50 rounded-3xl p-4 flex gap-3 text-blue-900">
            <SlidersHorizontal className="text-blue-500 shrink-0 mt-0.5" size={16} />
            <div className="space-y-0.5">
              <p className="text-[10px] font-black uppercase tracking-wider">Arrange Sequence Mode</p>
              <p className="text-[9px] font-semibold leading-relaxed opacity-90">Tap the Up (▲) and Down (▼) arrow controllers on any stop to immediately rearrange. Changes instantly update the trip sequence for all live tracking users and admins.</p>
            </div>
          </div>
          
          {activeTrip ? (
            <div className="bg-amber-50 border border-amber-200/50 rounded-[1.5rem] p-3 flex.5 flex gap-2.5 text-amber-900 text-xs items-center shadow-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
              <div className="text-[9px] font-bold">
                <span className="font-black uppercase tracking-wider block mb-0.5">Live Custom Order Active</span>
                Any changes made to the sequence will apply <span className="underline font-black">ONLY</span> to this active {activeTrip.direction} trip. Existing route defaults will remain completely safe.
              </div>
            </div>
          ) : (
            <div className="bg-teal-50 border border-teal-200/50 rounded-[1.5rem] p-3 flex.5 flex gap-2.5 text-teal-950 text-xs items-center shadow-xs">
              <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
              <div className="text-[9px] font-bold">
                <span className="font-black uppercase tracking-wider block mb-0.5">Managing Route Defaults</span>
                You are currently editing the default {editMode === 'pickup' ? 'pickup' : 'dropoff'} sequence. All future trips started on this route will use this sequence template.
              </div>
            </div>
          )}
        </motion.div>
      ) : (
        activeTrip && (
          <div className="bg-amber-50/60 border border-amber-200/40 rounded-2xl p-3 flex gap-2.5 text-amber-850 items-center">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <div className="text-[9px] font-semibold">
              <span className="font-black uppercase tracking-wider block">Live {activeTrip.direction === 'pickup' ? 'Pickup' : 'Dropoff'} Trip is Active</span>
              Viewing {activeTrip.direction === 'pickup' ? 'pickup' : 'dropoff'} stops order. Toggle 'Reorder Stops' above to adjust today's scheduled stops sequence dynamically.
            </div>
          </div>
        )
      )}

      {/* Stops Timeline */}
      <div className="space-y-4 pb-12">
        {sortedStops.map((stop: any, index: number) => {
          const isSelected = selectedStopId === stop.id;
          const isLast = index === (sortedStops.length - 1);
          const currentStopUsers = getStopUsers(stop.id);
          
          const isPassed = index <= currentStopIndex;
          const isNext = index === nextStopIndex;
          const isUpcoming = index > nextStopIndex;

          return (
            <motion.div 
              key={stop.id} 
              layoutId={`stop-card-${stop.id}`} 
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="relative"
            >
              <div 
                onClick={() => {
                  if (arrangeMode) return; // Prevent roster expansion during sequence reordering
                  setSelectedStopId(isSelected ? null : stop.id);
                }}
                className={cn(
                  "w-full transition-all duration-500 rounded-[2rem] p-3.5 flex gap-4 items-center group relative z-10 cursor-pointer overflow-hidden",
                  isSelected ? "bg-white text-slate-900 shadow-xl scale-[1.02] ring-2 ring-blue-500" : "bg-white text-slate-900 shadow-sm border border-slate-100",
                  isNext && !isSelected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-50",
                  arrangeMode && "cursor-default"
                )}
              >
                {/* Status Indicator Background for Next or Selected Stop */}
                {(isNext || isSelected) && (
                  <div className="absolute inset-0 bg-blue-50/40 pointer-events-none" />
                )}

                {/* Show Arrange Grid Handle indicator when reordering */}
                {arrangeMode && (
                  <div className="text-blue-500/50 pl-0.5 select-none shrink-0 flex items-center justify-center">
                    <SlidersHorizontal size={14} className="rotate-90 stroke-[2.5]" />
                  </div>
                )}

                <div className={cn(
                  "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 relative z-20",
                  isSelected ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]" : 
                  isPassed ? "bg-blue-100 text-blue-600" :
                  isNext ? "bg-blue-600 text-white animate-pulse" :
                  "bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600"
                )}>
                  {isPassed ? <CheckCircle size={18} strokeWidth={3} /> : <MapPin size={18} strokeWidth={isSelected || isNext ? 3 : 2} />}
                </div>
                
                <div className="flex-1 relative z-20">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-[7px] font-black uppercase tracking-wider italic",
                        isSelected || isNext ? "text-blue-600" : "text-slate-400"
                      )}>Stop #{index + 1} • {stop.time}</p>
                      {isNext && (
                        <span className="bg-blue-600 text-white text-[6px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter italic">Coming Up</span>
                      )}
                    </div>
                    <div className={cn(
                      "flex items-center gap-1 py-0.5 px-2 rounded-lg text-[8px] font-black uppercase tracking-widest",
                      isSelected ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"
                    )}>
                      <Users size={8} />
                      {currentStopUsers.length}
                    </div>
                  </div>
                  <h4 className="text-xs font-black uppercase tracking-tight line-clamp-1 mb-1.5">{stop.name}</h4>
                  
                  {!arrangeMode && (
                    <div className={cn(
                        "inline-flex items-center gap-2 py-0.5 px-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all",
                        isSelected ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "bg-slate-50 text-slate-500 group-hover:bg-slate-100"
                      )}
                    >
                      {isSelected ? `Hide ${termPlural}` : `View ${termPlural}`}
                    </div>
                  )}

                  {arrangeMode && (
                    <span className="text-[7.5px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-1.5 py-0.5 rounded">
                      Arrange sequence
                    </span>
                  )}
                </div>

                {arrangeMode ? (
                  <div className="flex items-center gap-1.5 shrink-0 relative z-30" onClick={(e) => e.stopPropagation()}>
                    {/* Move Up */}
                    <button
                      disabled={index === 0}
                      onClick={() => reorderStops(index, 'up')}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border transition-all active:scale-90",
                        index === 0 
                          ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed opacity-30" 
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm"
                      )}
                      title="Move Up"
                    >
                      <ArrowUp size={13} strokeWidth={2.5} />
                    </button>

                    {/* Move Down */}
                    <button
                      disabled={index === sortedStops.length - 1}
                      onClick={() => reorderStops(index, 'down')}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border transition-all active:scale-90",
                        index === sortedStops.length - 1
                          ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed opacity-30" 
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm"
                      )}
                      title="Move Down"
                    >
                      <ArrowDown size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                ) : (
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center transition-transform shrink-0",
                    isSelected ? "bg-blue-50 text-blue-600 rotate-90" : "bg-slate-50 text-slate-400"
                  )}>
                    <ChevronRight size={14} />
                  </div>
                )}
              </div>

              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-slate-50 rounded-b-[1.5rem] -mt-6 pt-8 pb-3 px-3 space-y-2 z-0 border-x border-b border-slate-100"
                  >
                    <div className="flex items-center justify-between px-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-2.5 bg-blue-500 rounded-full" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{termSingular} Status</span>
                      </div>
                      <div className="bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                         <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Total: {currentStopUsers.length}</span>
                      </div>
                    </div>

                    {currentStopUsers.length === 0 ? (
                      <div className="py-6 text-center bg-white rounded-xl border border-slate-200/50">
                        <Users size={18} className="mx-auto mb-1 opacity-20 text-slate-400" />
                        <p className="text-[8px] font-black text-slate-400 uppercase">None Assigned</p>
                      </div>
                    ) : (
                      currentStopUsers.map((user) => (
                        <div key={user.id} className="bg-white rounded-xl p-2.5 border border-slate-200/60 flex items-center justify-between shadow-xs">
                          <div className="flex gap-3 items-center">
                            <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200/50 overflow-hidden shadow-inner shrink-0">
                              <img src={getUserAvatar(user.avatarUrl, user.photoURL, user.name, user.uid)} alt="User" className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight italic leading-none mb-0.5">{user.name}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                  <Phone size={10} className="text-slate-300" />
                                  {user.phone || '---'}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {(() => {
                              const { label, color } = getStatusLabelAndColor(user);
                              return (
                                <div className={cn(
                                  "px-2 py-1 rounded-lg text-[6px] font-black uppercase tracking-widest border",
                                  color
                                )}>
                                  {label}
                                </div>
                              );
                            })()}
                            <a
                              href={`tel:${user.phone}`}
                              className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all border border-slate-200/50 active:scale-90"
                            >
                              <Phone size={14} />
                            </a>
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
