import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, Users, Route, TrendingUp, AlertCircle, Calendar, ShieldCheck, MapPin, Plus, Search, Trash2, Edit2, Edit3, X, Save, UserCheck, UserPlus, Navigation, ArrowRight, Gauge, Activity, Maximize2, UserCircle, Map as MapIcon, ChevronRight, Mail, Building2, CheckCircle, Check, Pencil, Link2Off, ChevronDown, School, GraduationCap, Clock, Download, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { cn, isValidCoordinate, getDistance, getLocalAvatar, getLocalIcon, getUserAvatar } from '../lib/utils';
import MapComponent, { Marker, Popup, vehicleIcon, stationIcon, terminalIcon, createMarkerIcon, Polyline } from '../components/MapComponent';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot, collection, query, where, getDocs, addDoc, serverTimestamp, deleteDoc, updateDoc, orderBy, setDoc, arrayUnion, arrayRemove, writeBatch } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { saveMySQLRecord } from '../lib/mysql';
import { getBackendUrl } from '../lib/apiPatch';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { PhoneInput } from '../components/PhoneInput';

type View = 'overview' | 'vehicles' | 'drivers' | 'members' | 'routes' | 'parents' | 'employees' | 'map' | 'settings' | 'reports';

const sanitizeCenter = (coord: any): { lat: number; lng: number } => {
  if (!coord) return { lat: 17.4504, lng: 78.3808 };
  const lat = parseFloat(coord.lat ?? coord.latitude);
  const lng = parseFloat(coord.lng ?? coord.longitude);
  if (isNaN(lat) || isNaN(lng)) return { lat: 17.4504, lng: 78.3808 };
  if (lat >= 12.0 && lat <= 14.1 && lng >= 79.0 && lng <= 81.1) {
    return { lat: 17.4504, lng: 78.3808 };
  }
  return { lat, lng };
};

export default function OrgAdminDashboard({ view = 'overview' }: { view?: View }) {
  const { userData } = useAuth();
  const [activeView, setActiveView] = useState<View>(view);
  const [org, setOrg] = useState<any>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(userData?.orgId || null);

  useEffect(() => {
    setActiveView(view);
  }, [view]);

  useEffect(() => {
    if (userData?.orgId) {
      setSelectedOrgId(userData.orgId);
    }
  }, [userData?.orgId]);

  // If super_admin and no orgId, find the first available organization
  useEffect(() => {
    if (userData?.role === 'super_admin' && !selectedOrgId) {
      getDocs(query(collection(db, 'organizations'), orderBy('name'))).then(snapshot => {
        if (!snapshot.empty) {
          setSelectedOrgId(snapshot.docs[0].id);
        }
      }).catch(err => console.error("Error finding default org", err));
    }
  }, [userData?.role, selectedOrgId]);

  const [stats, setStats] = useState({
    vehicles: 0,
    trips: 0,
    drivers: 0,
    members: 0,
    alerts: 0
  });

  const isEducation = org?.sector === 'Education';
  const isCollege = isEducation && (org?.eduType === 'College' || (!org?.eduType && (org?.name?.toLowerCase().includes('college') || org?.name?.toLowerCase().includes('university'))));
  const classLabel = isEducation ? (isCollege ? 'Group' : 'Class') : 'Department';
  const memberLabel = isEducation ? 'Student' : 'Employee';
  const membersLabel = isEducation ? 'Students' : 'Employees';

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [liveTrips, setLiveTrips] = useState<any[]>([]);
  const [tripsMySQL, setTripsMySQL] = useState<any[]>([]);
  const [tripStats, setTripStats] = useState<Record<string, { eta: string, distance: string }>>({});
  const [loading, setLoading] = useState(true);

  // Filter live trips to only show active trips corresponding to currently registered drivers, vehicles & routes
  // Ensure that each driver/vehicle has AT MOST ONE unique active trip (the most recent one) and is active today
  const filteredLiveTrips = useMemo(() => {
    if (!drivers || drivers.length === 0) return [];

    const isTodayTrip = (dateField: any) => {
      if (!dateField) return false;
      try {
        let d: Date;
        if (typeof dateField.toDate === 'function') {
          d = dateField.toDate();
        } else if (dateField.seconds !== undefined) {
          d = new Date(dateField.seconds * 1000);
        } else if (dateField instanceof Date) {
          d = dateField;
        } else {
          d = new Date(dateField);
        }

        if (isNaN(d.getTime())) return false;

        const today = new Date();
        const isSameDay = d.getDate() === today.getDate() &&
                          d.getMonth() === today.getMonth() &&
                          d.getFullYear() === today.getFullYear();
        if (isSameDay) return true;

        const diffMs = Math.abs(today.getTime() - d.getTime());
        const sixteenHours = 16 * 60 * 60 * 1000;
        return diffMs < sixteenHours;
      } catch (e) {
        return false;
      }
    };

    // Filter trips that match currently registered drivers, routes & vehicles AND are active today
    const validTrips = liveTrips.filter((t: any) => {
      if (!t) return false;
      const driverExists = drivers.some((d: any) => d && (d.uid === t.driverId || d.id === t.driverId));
      const routeExists = routes.some((r: any) => r && r.id === t.routeId);
      const vehicleExists = vehicles.some((v: any) => v && v.id === t.vehicleId);
      const isActiveToday = isTodayTrip(t.startTime) || isTodayTrip(t.updatedAt);
      return driverExists && routeExists && vehicleExists && isActiveToday;
    });

    // Sort to make sure most recently started trips come first
    const sortedTrips = [...validTrips].sort((a: any, b: any) => {
      const timeA = new Date(a?.startTime || a?.updatedAt || 0).getTime();
      const timeB = new Date(b?.startTime || b?.updatedAt || 0).getTime();
      return timeB - timeA;
    });

    const activeDriverIds = new Set<string>();
    const activeVehicleIds = new Set<string>();
    const finalTrips: any[] = [];

    for (const t of sortedTrips) {
      if (!t || !t.driverId || !t.vehicleId) continue;
      const driverId = t.driverId;
      const vehicleId = t.vehicleId;

      if (!activeDriverIds.has(driverId) && !activeVehicleIds.has(vehicleId)) {
        activeDriverIds.add(driverId);
        activeVehicleIds.add(vehicleId);
        finalTrips.push(t);
      }
    }

    return finalTrips;
  }, [liveTrips, drivers, vehicles, routes]);

  // Stats calculation effect - shared across views
  useEffect(() => {
    if (!org?.location || filteredLiveTrips.length === 0) return;

    const fetchAllStats = async () => {
      const newStats = { ...tripStats };
      for (const trip of filteredLiveTrips) {
        const vehicle = vehicles.find((v: any) => v.id === trip.vehicleId);
        const loc = vehicle?.location || trip.location;
        if (!loc || !isValidCoordinate(loc.lat, loc.lng) || !isValidCoordinate(org.location.lat, org.location.lng)) continue;
        
        // Immediate fallback/initial estimate
        const distKm = getDistance(loc.lat, loc.lng, org.location.lat, org.location.lng);
        if (!newStats[trip.id]) {
          newStats[trip.id] = {
            distance: `${distKm.toFixed(1)} KM`,
            eta: `${Math.max(1, Math.round(distKm * 2.5))} MINS`
          };
        }

        try {
          const coords = `${String(loc.lng)},${String(loc.lat)};${String(org.location.lng)},${String(org.location.lat)}`;
          const res = await fetch(`/api/proxy/osrm/route/v1/driving/${coords}?overview=false`);
          const data = await res.json();
          if (data.code === 'Ok' && data.routes?.[0]) {
            const r = data.routes[0];
            newStats[trip.id] = {
              eta: `${Math.round(r.duration / 60)} MINS`,
              distance: `${(r.distance / 1000).toFixed(1)} KM`
            };
          }
        } catch (err) {
          console.warn(`Failed OSRM update for trip ${trip.id}, using fallback`, err);
        }
      }
      setTripStats(newStats);
    };

    fetchAllStats();
    const interval = setInterval(fetchAllStats, 30000);
    return () => clearInterval(interval);
  }, [filteredLiveTrips, org?.location, vehicles]);

  // High-performance data-refresh mechanism driven entirely and end-to-end by MySQL (bypassing Firestore)
  const fetchMySQLData = async () => {
    try {
      let token = await auth.currentUser?.getIdToken().catch(() => null);
      if (!token) {
        token = localStorage.getItem("expert_gps_fallback_token") || undefined;
      }
      if (!token) return;
      const backendUrl = getBackendUrl();
      const resObj = await fetch(`${backendUrl}/api/records/admin-data`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resObj.ok) {
        const res = await resObj.json();
        if (res.success) {
          if (res.org) setOrg(res.org);
          if (res.drivers) setDrivers(res.drivers);
          if (res.members) setMembers(res.members);
          if (res.routes) setRoutes(res.routes);
          if (res.classes) setClasses(res.classes);

          if (res.vehicles) {
            setVehicles(prevVehicles => {
              const mysqlVehicles = (res.vehicles || [])
                .filter((v: any) => v.id !== "DEV-V1")
                .map((v: any) => {
                const locObj = (v.latitude !== null && v.longitude !== null && v.latitude !== undefined && v.longitude !== undefined)
                  ? { lat: Number(v.latitude), lng: Number(v.longitude) }
                  : null;
                return {
                  ...v,
                  plateNumber: v.plateNumber || v.number || "",
                  model: v.model || v.name || "",
                  yearMade: v.yearMade || v.type || "",
                  location: locObj
                };
              });

              // Overwrite with any real-time tracking data already present in previous state
              const merged = [...mysqlVehicles];
              prevVehicles.forEach(prevV => {
                const idx = merged.findIndex(v => v.id === prevV.id);
                if (idx !== -1) {
                  if (prevV.location) {
                    merged[idx] = {
                      ...merged[idx],
                      location: prevV.location,
                      status: prevV.status || merged[idx].status,
                      latitude: prevV.latitude !== undefined ? prevV.latitude : merged[idx].latitude,
                      longitude: prevV.longitude !== undefined ? prevV.longitude : merged[idx].longitude
                    };
                  }
                } else if (prevV.location) {
                  merged.push(prevV);
                }
              });
              return merged;
            });
          }

          if (res.trips) {
            setTripsMySQL(res.trips);
            const mysqlLiveTrips = (res.liveTrips || res.trips || [])
              .filter((t: any) => t.status === 'live' || t.status === 'ongoing')
              .map((t: any) => {
                const locObj = (t.currentLat !== null && t.currentLng !== null && t.currentLat !== undefined && t.currentLng !== undefined)
                  ? { lat: Number(t.currentLat), lng: Number(t.currentLng) }
                  : null;
                let parsedManifest = [];
                try {
                  parsedManifest = typeof t.manifest === 'string' ? JSON.parse(t.manifest) : (Array.isArray(t.manifest) ? t.manifest : []);
                } catch (e) {
                  parsedManifest = Array.isArray(t.manifest) ? t.manifest : [];
                }
                return {
                  ...t,
                  location: locObj,
                  manifest: parsedManifest
                };
              });

            setLiveTrips(prevTrips => {
              const merged = [...mysqlLiveTrips];
              prevTrips.forEach(pt => {
                const idx = merged.findIndex(t => t.id === pt.id);
                if (idx !== -1) {
                  merged[idx] = { ...merged[idx], ...pt };
                } else {
                  merged.push(pt);
                }
              });
              return merged;
            });
          }
        }
      }
    } catch (e) {
      console.warn("MySQL data fetch failover skipped:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedOrgId) return;

    fetchMySQLData();

    // Setup polling interval for Bluehost database (every 10 seconds for real-time live map updates)
    const interval = setInterval(fetchMySQLData, 10000);
    setLoading(false);

    return () => {
      clearInterval(interval);
    };
  }, [selectedOrgId]);

  // Real-time Firestore synchronizer for Live Tracking maps and active positions
  useEffect(() => {
    if (!selectedOrgId) return;

    if (!auth.currentUser || !selectedOrgId) return;

    // Listen to real-time vehicles transitions so Admin map is responsive to driver GPS positioning ticks in high frequency
    const vehiclesQuery = query(
      collection(db, 'vehicles'),
      where('orgId', '==', selectedOrgId)
    );
    const unsubVehiclesFS = onSnapshot(vehiclesQuery, (snap) => {
      const fsVehicles = snap.docs
        .filter(d => d.id !== "DEV-V1")
        .map(d => {
        const data = d.data();
        let location = null;
        if (data.latitude !== undefined && data.longitude !== undefined && data.latitude !== null && data.longitude !== null && isValidCoordinate(data.latitude, data.longitude)) {
          location = { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) };
        } else {
          let loc = data.location;
          if (loc) {
            const lat = loc.lat !== undefined ? loc.lat : loc.latitude;
            const lng = loc.lng !== undefined ? loc.lng : loc.longitude;
            if (isValidCoordinate(lat, lng)) {
              location = { lat: parseFloat(lat), lng: parseFloat(lng) };
            }
          }
        }
        return { id: d.id, ...data, location };
      });

      // Merge/override existing MySQL vehicle items with real-time Firestore values (for GPS coordination accuracy)
      setVehicles(prevVehicles => {
        const merged = [...prevVehicles];
        fsVehicles.forEach(fsV => {
          const idx = merged.findIndex(v => v.id === fsV.id);
          if (idx !== -1) {
            // Keep existing MySQL parameters but overwrite location, status & high-frequency variables
            merged[idx] = { ...merged[idx], ...fsV };
          } else {
            merged.push(fsV);
          }
        });
        return merged;
      });
    }, (err) => {
      console.warn("[OrgAdminDashboard] Firestore vehicles listener notice (using relational sync):", err?.message || err);
    });

    // Listen to real-time trips events
    const tripsQuery = query(
      collection(db, 'trips'),
      where('orgId', '==', selectedOrgId)
    );
    const unsubTripsFS = onSnapshot(tripsQuery, (snap) => {
      const fsTrips = snap.docs
        .map(d => {
          const data = d.data();
          let location = null;
          if (data.currentLat !== undefined && data.currentLng !== undefined && data.currentLat !== null && data.currentLng !== null && isValidCoordinate(data.currentLat, data.currentLng)) {
            location = { lat: parseFloat(data.currentLat), lng: parseFloat(data.currentLng) };
          } else if (data.latitude !== undefined && data.longitude !== undefined && data.latitude !== null && data.longitude !== null && isValidCoordinate(data.latitude, data.longitude)) {
            location = { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) };
          } else {
            let loc = data.location;
            if (loc) {
              const lat = loc.lat !== undefined ? loc.lat : loc.latitude;
              const lng = loc.lng !== undefined ? loc.lng : loc.longitude;
              if (isValidCoordinate(lat, lng)) {
                location = { lat: parseFloat(lat), lng: parseFloat(lng) };
              }
            }
          }
          let parsedManifest = [];
          try {
            parsedManifest = typeof data.manifest === 'string' ? JSON.parse(data.manifest) : (Array.isArray(data.manifest) ? data.manifest : []);
          } catch (e) {
            parsedManifest = Array.isArray(data.manifest) ? data.manifest : [];
          }
          return { 
            id: d.id, 
            ...data, 
            location, 
            manifest: parsedManifest 
          };
        })
        .filter((t: any) => t.status === 'live' || t.status === 'ongoing');

      setLiveTrips(fsTrips);
    }, (err) => {
      console.warn("[OrgAdminDashboard] Firestore trips listener notice (using relational sync):", err?.message || err);
    });

    return () => {
      unsubVehiclesFS();
      unsubTripsFS();
    };
  }, [selectedOrgId]);

  useEffect(() => {
    setStats(prev => ({
      ...prev,
      vehicles: vehicles.length,
      drivers: drivers.length,
      members: members.length
    }));
  }, [vehicles.length, drivers.length, members.length]);

  const getExpiryDateObject = (dateField: any): Date | null => {
    if (!dateField) return null;
    if (typeof dateField.toDate === 'function') return dateField.toDate();
    if (dateField.seconds !== undefined) return new Date(dateField.seconds * 1000);
    const parsed = new Date(dateField);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const orgExpiryDateObj = getExpiryDateObject(org?.expiryDate);
  const isExpiringSoon = orgExpiryDateObj ? (orgExpiryDateObj.getTime() - new Date().getTime()) < (7 * 24 * 60 * 60 * 1000) : false;
  const isExpired = orgExpiryDateObj ? orgExpiryDateObj < new Date() : false;

  if (!selectedOrgId) {
    return (
      <div className="bg-white rounded-[2.5rem] p-12 text-center border border-slate-100 shadow-sm animate-in fade-in duration-500">
        <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-6" />
        <h2 className="text-2xl font-black text-slate-900 uppercase italic mb-2">Organization Identification Missing</h2>
        <p className="text-slate-500 font-medium max-w-md mx-auto mb-8 tracking-tight">Your administrative credentials are valid, but they have not been correctly linked to an active organization entity. Contact system super-admin to verify OrgID assignment.</p>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-mono text-left max-w-sm mx-auto overflow-auto">
           <p className="text-slate-400 mb-2 uppercase font-black">Debug Information</p>
           <p><span className="text-blue-600">UID:</span> {userData?.uid}</p>
           <p><span className="text-blue-600">Email:</span> {userData?.email}</p>
           <p><span className="text-blue-600">Role:</span> {userData?.role}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Syncing Tactical Data...</p>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeView) {
      case 'overview': return <Overview stats={stats} org={org} userData={userData} membersLabel={membersLabel} vehicles={vehicles} routes={routes} liveTrips={filteredLiveTrips} tripStats={tripStats} setActiveView={setActiveView} />;
      case 'vehicles': return <VehiclesList vehicles={vehicles} orgId={selectedOrgId!} routes={routes} members={members} onRefresh={fetchMySQLData} />;
      case 'drivers': return <DriversList drivers={drivers} orgId={selectedOrgId!} routes={routes} vehicles={vehicles} members={members} onRefresh={fetchMySQLData} />;
      case 'members': {
        const filtered = members.filter(m => (isEducation ? m.role === 'user' : (m.role === 'user' || m.role === 'employee')));
        return <MembersList members={filtered} orgId={selectedOrgId!} label={memberLabel} labels={membersLabel} routes={routes} allMembers={members} classes={classes} isCollege={isCollege} isEducation={isEducation} onRefresh={fetchMySQLData} />;
      }
      case 'routes': return <RoutesList routes={routes} vehicles={vehicles} drivers={drivers} members={members} orgId={selectedOrgId!} memberLabel={memberLabel} membersLabel={membersLabel} classes={classes} classLabel={classLabel} org={org} onRefresh={fetchMySQLData} />;
      case 'map': return <LiveMap vehicles={vehicles} routes={routes} org={org} members={members} drivers={drivers} liveTrips={filteredLiveTrips} tripStatsData={tripStats} />;
      case 'reports': return <Reports org={org} vehicles={vehicles} routes={routes} members={members} drivers={drivers} tripsMySQL={tripsMySQL} />;
      case 'settings': return <Settings org={org} classes={classes} orgId={selectedOrgId!} isEducation={isEducation} isCollege={isCollege} members={members} onRefresh={fetchMySQLData} />;
      default: return null;
    }
  };

  return (
    <div className="space-y-8">
      {renderContent()}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest",
        active ? "bg-white text-blue-600 shadow-lg shadow-blue-500/10" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/40"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function Overview({ stats, org, userData, membersLabel, vehicles, routes, liveTrips = [], tripStats = {}, setActiveView }: any) {
  const isEducation = org?.sector === 'Education';
  const isCollege = org?.eduType === 'College' || (!org?.eduType && (org?.name?.toLowerCase().includes('college') || org?.name?.toLowerCase().includes('university')));

  const activeTrips = liveTrips.map((lt: any) => {
    const vehicle = vehicles.find((v: any) => v.id === lt.vehicleId);
    const busLoc = vehicle?.location || lt.location;
    
    let distanceStr = '-- KM';
    let etaStr = '-- MINS';

    if (tripStats[lt.id]) {
      distanceStr = tripStats[lt.id].distance;
      etaStr = tripStats[lt.id].eta;
    } else if (org?.location && busLoc && isValidCoordinate(busLoc.lat, busLoc.lng) && isValidCoordinate(org.location.lat, org.location.lng)) {
      const dist = getDistance(busLoc.lat, busLoc.lng, org.location.lat, org.location.lng);
      distanceStr = dist.toFixed(1) + ' KM';
      etaStr = Math.max(1, Math.round(dist * 2.5)) + ' MINS';
    }

    return {
      id: lt.id,
      routeId: lt.routeId,
      type: 'Vehicle',
      action: 'Live Tracking',
      locationName: routes.find((r: any) => r.id === lt.routeId)?.name || 'Unknown Route',
      status: 'Live',
      plateNumber: vehicle?.plateNumber || '...',
      distanceStr,
      etaStr
    };
  });

  const navigate = useNavigate();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Dashboard</h2>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={Bus} label="Vehicle" value={stats.vehicles} total={stats.vehicles} onClick={() => setActiveView('vehicles')} />
        <StatCard icon={Users} label="Driver" value={stats.drivers} total={stats.drivers} onClick={() => setActiveView('drivers')} />
        <StatCard icon={Route} label="Route" value={stats.routes || routes.length} total={stats.routes || routes.length} onClick={() => setActiveView('routes')} />
        <StatCard icon={UserCircle} label={membersLabel} value={stats.members} total={stats.members} onClick={() => setActiveView('members')} />
      </div>

      {/* Dashboard Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4">
         {/* Active Trips List - 5 cols */}
         <div className="lg:col-span-5 bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8 px-2">
               <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Active Fleet</h4>
               </div>
               <span className="text-[10px] font-black px-3 py-1 bg-green-50 text-green-600 rounded-full uppercase tracking-widest border border-green-100">{activeTrips.length} live</span>
            </div>

            <div className="space-y-4 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
               {activeTrips.map((trip: any) => (
                  <div key={trip.id} className="flex items-center justify-between p-5 bg-slate-50/50 rounded-2xl border border-slate-100 group hover:shadow-xl hover:shadow-slate-200/50 transition-all hover:bg-white cursor-pointer" onClick={() => setActiveView('map')}>
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-500 group-hover:scale-110 transition-transform">
                           <Bus className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                           <h5 className="text-sm font-black text-slate-900 uppercase italic leading-none mb-1 truncate">{trip.plateNumber}</h5>
                           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">{trip.locationName}</p>
                           <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">{trip.distanceStr}</span>
                              <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">{trip.etaStr}</span>
                           </div>
                        </div>
                     </div>
                     <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-100 rounded-full">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                        <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Live</span>
                     </div>
                  </div>
               ))}
               {activeTrips.length === 0 && (
                 <div className="py-12 text-center text-slate-400 italic text-xs uppercase tracking-widest">No active fleet on road</div>
               )}
            </div>
         </div>

         {/* Map Preview - 7 cols */}
         <div className="lg:col-span-7 bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm relative h-[450px] lg:h-auto min-h-[450px]">
          <MapComponent 
            height="100%" 
            zoom={13} 
            center={sanitizeCenter(org?.location)}
          >
               {org?.location && isValidCoordinate(org.location.lat, org.location.lng) && (
                  <Marker 
                    key="admin-preview-org-marker"
                    position={[org.location.lat, org.location.lng]} 
                    icon={createMarkerIcon(
                      org?.sector === 'Education' ? (isCollege ? '#6366f1' : '#4f46e5') : '#0f172a', 
                      getLocalIcon(org?.logo || org?.logoUrl || (org?.sector === 'Education' ? (isCollege ? 'graduation-cap' : 'school') : (org?.sector === 'Healthcare' ? 'hospital' : (org?.sector === 'Government' ? 'museum' : 'commercial')))), 
                      org?.sector === 'Education' ? (isCollege ? '#6366f1' : '#4f46e5') : '#0f172a', 
                      org?.name || 'BASE'
                    )}
                  >
                    <Popup>
                      <div className="p-2 text-center">
                        <p className="text-[10px] font-black text-slate-800 uppercase italic leading-none">{org.name}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{org.sector || 'Main Hub'}</p>
                      </div>
                    </Popup>
                  </Marker>
               )}
               {vehicles.map((v: any) => v.location && isValidCoordinate(v.location.lat, v.location.lng) && (
                  <Marker 
                     key={v.id} 
                     position={[v.location.lat, v.location.lng]} 
                     icon={vehicleIcon}
                  />
               ))}
            </MapComponent>
            
            <button 
              onClick={() => setActiveView('map')}
              className="absolute bottom-6 right-6 z-[999] p-3 bg-white rounded-xl shadow-xl border border-slate-200 text-slate-400 hover:text-blue-500 transition-all active:scale-95 group"
            >
               <Maximize2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
         </div>
      </div>
    </motion.div>
  );
}

function StatCard({ icon: Icon, label, value, total, onClick }: any) {
  const colorMap: Record<string, { bg: string, text: string, hoverBg: string, accentLine: string }> = {
    'vehicle': { bg: 'bg-amber-50', text: 'text-amber-500', hoverBg: 'group-hover:bg-amber-500 group-hover:shadow-[0_4px_12px_rgba(245,158,11,0.3)]', accentLine: 'bg-amber-500' },
    'driver': { bg: 'bg-violet-50', text: 'text-violet-500', hoverBg: 'group-hover:bg-violet-500 group-hover:shadow-[0_4px_12px_rgba(139,92,246,0.3)]', accentLine: 'bg-violet-500' },
    'route': { bg: 'bg-emerald-50', text: 'text-emerald-500', hoverBg: 'group-hover:bg-emerald-500 group-hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)]', accentLine: 'bg-emerald-500' },
    'members': { bg: 'bg-blue-50', text: 'text-blue-500', hoverBg: 'group-hover:bg-blue-500 group-hover:shadow-[0_4px_12px_rgba(59,130,246,0.3)]', accentLine: 'bg-blue-500' },
  };

  let key = String(label).toLowerCase();
  if (key.includes('student') || key.includes('passenger') || key.includes('member')) {
    key = 'members';
  }

  const theme = colorMap[key] || { bg: 'bg-blue-50', text: 'text-blue-500', hoverBg: 'group-hover:bg-blue-500', accentLine: 'bg-blue-500' };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white rounded-[1.25rem] p-4 md:p-5 border border-slate-100 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-slate-200/50 relative overflow-hidden group flex items-center justify-between",
        onClick && "cursor-pointer active:scale-95"
      )}
    >
      {/* Sleek left-accent glow bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5", theme.accentLine)} />

      <div className="flex items-center gap-4 relative z-10 pl-1">
        {/* Modern styled Icon Frame */}
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center transition-all group-hover:text-white", theme.bg, theme.text, theme.hoverBg)}>
          <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
          <h3 className="text-2xl font-black text-slate-900 leading-none tracking-tight mt-1 italic">{value}</h3>
        </div>
      </div>

      <div className="text-right relative z-10 pr-1">
        <span className="text-[9px] font-black tracking-widest text-slate-400 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-100 transition-colors uppercase">
          {total} total
        </span>
      </div>

      {/* Modern ambient corner glow on hover */}
      <div className="absolute top-[-20%] right-[-10%] w-20 h-20 bg-slate-500/0 group-hover:bg-slate-500/5 blur-2xl rounded-full transition-all" />
    </div>
  );
}

function StatPill({ label, value, color, inverse }: any) {
  const colors: any = {
    blue: inverse ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-600 border-blue-100",
    green: inverse ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-green-50 text-green-600 border-green-100",
  };
  return (
    <div className={cn("px-5 py-3 rounded-2xl border flex flex-col items-center min-w-[90px]", colors[color])}>
      <span className="text-[9px] font-black uppercase tracking-widest mb-1 leading-none opacity-60">{label}</span>
      <span className="text-xl font-black tracking-tighter leading-none italic">{value}</span>
    </div>
  );
}

function ProtocolItem({ icon: Icon, label, sub, onClick }: any) {
  return (
    <button 
      onClick={onClick} 
      className="w-full flex items-center p-5 rounded-[2rem] bg-white/5 border border-white/5 hover:bg-white/10 hover:border-blue-500/30 transition-all group overflow-hidden relative"
    >
      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mr-5 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:rotate-6">
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-left">
        <p className="text-sm font-black text-white tracking-tight uppercase group-hover:text-blue-400 transition-colors leading-none mb-1.5 italic">{label}</p>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{sub}</p>
      </div>
      <ArrowRight className="w-4 h-4 ml-auto text-slate-700 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
      <div className="absolute top-0 right-0 w-1 h-full bg-blue-500/0 group-hover:bg-blue-500/20 transition-all"></div>
    </button>
  );
}


function CommandAction({ icon: Icon, label, sub, onClick }: any) {
  return (
    <button 
      onClick={onClick} 
      className="w-full flex items-center p-5 rounded-[2rem] bg-slate-50 border border-slate-200 hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-500/5 transition-all group overflow-hidden relative"
    >
      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mr-5 text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 transform group-hover:scale-110 shadow-sm">
        <Icon className="w-6 h-6" />
      </div>
      <div className="text-left">
        <p className="text-base font-black text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors uppercase italic leading-none mb-1.5">{label}</p>
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest group-hover:text-slate-600 transition-colors">{sub}</p>
      </div>
      <ArrowRight className="w-5 h-5 ml-auto text-slate-200 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
      <div className="absolute bottom-0 right-0 w-24 h-24 bg-blue-500/0 group-hover:bg-blue-500/5 blur-3xl rounded-full transition-all"></div>
    </button>
  );
}

function IncidentItem({ time, msg, status }: any) {
  return (
    <div className="flex gap-4 items-start">
       <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5", status === 'ok' ? "bg-green-500" : "bg-blue-500")}></div>
       <div>
          <p className="text-xs font-bold text-slate-700 leading-tight mb-0.5">{msg}</p>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{time}</p>
       </div>
    </div>
  );
}

function VehiclesList({ vehicles, orgId, routes = [], members = [], onRefresh }: any) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ plateNumber: '', model: '', yearMade: '', status: 'active' });
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<any>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const generatedId = 'VEH-' + Math.random().toString(36).substring(2, 9).toUpperCase();
      await saveMySQLRecord('insert', 'vehicles', generatedId, {
        plateNumber: newVehicle.plateNumber,
        model: newVehicle.model,
        yearMade: newVehicle.yearMade,
        status: newVehicle.status,
        orgId
      });
      toast.success('Vehicle registered successfully');
      setIsAddModalOpen(false);
      setNewVehicle({ plateNumber: '', model: '', yearMade: '', status: 'active' });
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Network failure saving vehicle');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicle) return;
    try {
      await saveMySQLRecord('update', 'vehicles', editingVehicle.id, {
        plateNumber: editingVehicle.plateNumber,
        model: editingVehicle.model,
        yearMade: editingVehicle.yearMade || '',
        status: editingVehicle.status || 'active'
      });
      toast.success('Vehicle updated successfully');
      setIsEditModalOpen(false);
      setEditingVehicle(null);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    }
  };

  const handleDelete = async (v: any) => {
    // Check if vehicle is linked with any route
    const linkedRoute = routes.find((r: any) => r.vehicleId === v.id);
    if (linkedRoute) {
      toast.error(`Cannot delete: This vehicle/bus is currently assigned specifically to route "${linkedRoute.name}". Please unassign it first!`);
      return;
    }
    // Check if vehicle is assigned directly to a member/user
    const linkedUser = members.find((m: any) => m.vehicleId === v.id);
    if (linkedUser) {
      toast.error(`Cannot delete: This vehicle/bus is assigned directly to user/driver "${linkedUser.name}". Please unassign them first!`);
      return;
    }
    setVehicleToDelete(v);
  };

  const confirmDelete = async () => {
    if (!vehicleToDelete) return;
    try {
      await saveMySQLRecord('delete', 'vehicles', vehicleToDelete.id);
      toast.success('Vehicle deleted successfully');
      setVehicleToDelete(null);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1">Vehicle</h3>
          <p className="text-xs text-slate-400 font-medium tracking-tight">Fleet and asset management</p>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl hover:bg-blue-600 transition-all active:scale-95">
          <Plus className="w-4 h-4" /> Add Vehicle
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Vehicle Model</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Vehicle Number</th>
                <th className="px-8 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Track</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {vehicles.map((v: any) => {
                const isActive = routes.some((r: any) => r.vehicleId === v.id && members.some((m: any) => m.routeId === r.id));
                return (
                  <tr key={v.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-50/80 rounded-xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all transform group-hover:rotate-3 shadow-sm border border-indigo-100/50">
                          <Bus className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{v.model || "Unknown Model"}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 whitespace-nowrap">
                      <span className="text-xs font-mono font-black text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100/50 shadow-sm whitespace-nowrap inline-block">{v.plateNumber || "UNREGISTERED"}</span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex justify-center">
                        <button 
                          onClick={() => {
                            const route = routes.find((r: any) => r.vehicleId === v.id);
                            if (route) {
                              window.location.href = `/map?routeId=${route.id}`;
                            } else {
                              toast.error("Vehicle not currently assigned to any route");
                            }
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all"
                        >
                          <Navigation className="w-3 h-3" /> Track
                        </button>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all",
                        isActive 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.05)]" 
                          : "bg-rose-50 text-rose-600 border-rose-100 opacity-80"
                      )}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-rose-400")}></div>
                        {isActive ? 'Active' : 'Inactive'}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-end gap-2">
                         <button 
                           onClick={() => { setEditingVehicle(v); setIsEditModalOpen(true); }}
                           className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                           title="Edit Vehicle"
                         >
                            <Edit3 className="w-4 h-4" />
                         </button>
                         <button onClick={() => handleDelete(v)} className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                            <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <Bus className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No assets registered in fleet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100"
          >
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Register Vehicle</h3>
               <button onClick={() => setIsAddModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Vehicle Number</label>
                <input required type="text" value={newVehicle.plateNumber} onChange={e => setNewVehicle({...newVehicle, plateNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" placeholder="TS 09 AB 1234" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Vehicle Model</label>
                <input required type="text" value={newVehicle.model} onChange={e => setNewVehicle({...newVehicle, model: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" placeholder="Vehicle Model (e.g. 50-Seater Bus)" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Year Made</label>
                <input required type="text" value={newVehicle.yearMade} onChange={e => setNewVehicle({...newVehicle, yearMade: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" placeholder="2024" />
              </div>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 active:scale-95 transition-all">Register</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {isEditModalOpen && editingVehicle && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100"
          >
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Edit Vehicle</h3>
               <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Vehicle Number</label>
                <input required type="text" value={editingVehicle.plateNumber} onChange={e => setEditingVehicle({...editingVehicle, plateNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Vehicle Model</label>
                <input required type="text" value={editingVehicle.model} onChange={e => setEditingVehicle({...editingVehicle, model: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Year Made</label>
                <input required type="text" value={editingVehicle.yearMade || ''} onChange={e => setEditingVehicle({...editingVehicle, yearMade: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold" />
              </div>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Update Asset</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {vehicleToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
          >
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none uppercase italic mb-2">Delete Vehicle?</h3>
              <p className="text-xs text-slate-400 font-medium">
                Are you sure you want to delete vehicle{' '}
                <span className="font-bold text-slate-600">
                  {vehicleToDelete.plateNumber || 'this registration'}
                </span>
                ? This action is irreversible.
              </p>
            </div>
            <div className="flex gap-4">
              <button 
                type="button" 
                onClick={() => setVehicleToDelete(null)} 
                className="flex-1 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-colors"
              >
                No, Keep
              </button>
              <button 
                type="button" 
                onClick={confirmDelete} 
                className="flex-1 py-3.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-600/10 hover:bg-red-700 transition-all active:scale-95"
              >
                Yes, Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function DriversList({ drivers, orgId, routes = [], vehicles = [], members = [], onRefresh }: any) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: '', email: '', phone: '', licenseNumber: '' });
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [tempCreds, setTempCreds] = useState<{ email: string, pass: string } | null>(null);
  const [driverToDelete, setDriverToDelete] = useState<any>(null);
  const { user } = useAuth();

  const handleDelete = async (d: any) => {
    const driverId = d.uid || d.id;
    // Check if driver is assigned as the driverId for any route
    const linkedRoute = routes.find((r: any) => r.driverId === driverId);
    if (linkedRoute) {
      toast.error(`Cannot delete: This driver is currently assigned/linked to route "${linkedRoute.name}". Please unassign them first!`);
      return;
    }
    // Check if driver has routeId assigned in user doc
    if (d.routeId) {
      const activeRt = routes.find((r: any) => r.id === d.routeId);
      toast.error(`Cannot delete: This driver is linked to route "${activeRt?.name || d.routeId}". Please unassign them first!`);
      return;
    }
    // Check if driver has vehicleId set
    if (d.vehicleId) {
      const activeVh = vehicles.find((v: any) => v.id === d.vehicleId);
      toast.error(`Cannot delete: This driver is associated with vehicle/bus "${activeVh?.plateNumber || d.vehicleId}". Please unassign them first!`);
      return;
    }
    setDriverToDelete({ driver: d, message: 'Are you sure you want to delete this driver?' });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setCreating(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/create-org-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...newDriver,
          role: 'driver',
          orgId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error === "Email already exists") {
          toast.error((t) => (
            <div className="flex flex-col gap-2 p-1 text-left">
              <span className="font-bold flex items-center gap-1.5 text-rose-600">
                <AlertCircle size={14} /> Email Already Exists
              </span>
              <span className="text-[10px] leading-tight text-slate-600 font-medium">
                This email address is already registered to another user in the system. Please use a unique email address.
              </span>
              <div className="flex gap-2 mt-1 self-end">
                <button 
                  onClick={() => toast.dismiss(t.id)}
                  className="text-[10px] bg-slate-100 text-slate-500 px-3 py-1.5 rounded hover:bg-slate-200 uppercase font-black tracking-widest"
                >
                  Okay
                </button>
              </div>
            </div>
          ), { duration: 8000 });
          return;
        }
        if (data.error === "API_OR_IAM_ERROR") {
          toast.error((t) => (
            <div className="flex flex-col gap-2 p-1">
              <span className="font-bold flex items-center gap-1 text-red-600">
                <AlertCircle size={14} /> Service Restricted
              </span>
              <span className="text-[10px] leading-tight">
                {data.message || "Identity service is restricted. Please contact Super Admin to enable Firebase Auth API."}
              </span>
              <button 
                onClick={() => toast.dismiss(t.id)}
                className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300 self-end"
              >
                Dismiss
              </button>
            </div>
          ), { duration: 10000 });
          return;
        }
        throw new Error(data.error || 'Creation failed');
      }
      
      toast.success('Driver account created and email sent');
      setTempCreds({ email: data.credentials?.email || newDriver.email, pass: data.tempPassword });
      setNewDriver({ name: '', email: '', phone: '', licenseNumber: '' });
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create driver');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    setCreating(true);
    const loadingToast = toast.loading('Updating driver profile...');
    try {
      const token = await user?.getIdToken();
      const response = await fetch('/api/admin/update-user-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: editingDriver.uid || editingDriver.id,
          name: editingDriver.name,
          email: editingDriver.email,
          phone: editingDriver.phone || '',
          licenseNumber: editingDriver.licenseNumber || ''
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Update failed');
      }

      toast.success('Driver profile updated successfully', { id: loadingToast });
      setIsEditModalOpen(false);
      setEditingDriver(null);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Update failed', { id: loadingToast });
    } finally {
      setCreating(false);
    }
  };

  const handleResend = async (uid: string) => {
    if (!user) return;
    setResending(uid);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/resend-creds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid })
      });
      
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "API_OR_IAM_ERROR") {
          toast.error((t) => (
            <div className="flex flex-col gap-2 p-1">
              <span className="font-bold flex items-center gap-1 text-red-600">
                <AlertCircle size={14} /> Service Restricted
              </span>
              <span className="text-[10px] leading-tight">
                {data.message || "Identity or database service is restricted. Please contact Super Admin."}
              </span>
              <button 
                onClick={() => toast.dismiss(t.id)}
                className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300 self-end"
              >
                Dismiss
              </button>
            </div>
          ), { duration: 10000 });
          return;
        }
        throw new Error(data.error || 'Failed to resend');
      }
      
      toast.success('New credentials sent via email');
      setTempCreds({ email: data.email || 'the user', pass: data.tempPassword });
      setIsAddModalOpen(true); // Open modal to show credentials
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResending(null);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1">Driver</h3>
          <p className="text-xs text-slate-400 font-medium">Manage driver identity and assignments</p>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl hover:bg-blue-600 transition-all active:scale-95">
          <UserPlus className="w-4 h-4" /> Add Driver
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Operator</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Assignments</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {drivers.map((d: any) => (
                <tr key={d.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 group-hover:scale-110 transition-transform">
                        <img src={getUserAvatar(d.avatarUrl, d.photoURL, d.name, d.uid)} alt="Avatar" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 uppercase italic leading-none mb-1">{d.name}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{d.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {d.phone && <span className="text-[8px] font-mono text-slate-400">PH: {d.phone}</span>}
                          {d.licenseNumber && <span className="text-[8px] font-mono text-slate-400">DL: {d.licenseNumber}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Route</span>
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-tight">
                          {routes.find((r: any) => r.id === d.routeId)?.name || 'Unassigned'}
                        </span>
                      </div>
                      <div className="w-px h-6 bg-slate-100"></div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Vehicle</span>
                        <span className="text-[10px] font-black text-green-600 uppercase tracking-tight">
                          {vehicles.find((v: any) => v.id === d.vehicleId)?.plateNumber || 'Unassigned'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {(() => {
                      const isActive = routes.some((r: any) => r.driverId === d.uid && members.some((m: any) => m.routeId === r.id));
                      return (
                        <div className={cn(
                          "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all",
                          isActive 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                            : "bg-rose-50 text-rose-600 border-rose-100"
                        )}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-500 animate-pulse" : "bg-rose-400")}></div>
                          {isActive ? 'Active' : 'Inactive'}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex justify-end gap-2">
                       <button 
                         onClick={() => { setEditingDriver(d); setIsEditModalOpen(true); }}
                         className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" 
                         title="Edit Operator"
                       >
                          <Edit3 className="w-4 h-4" />
                       </button>
                       <button 
                         disabled={resending === d.uid}
                         onClick={() => handleResend(d.uid)}
                         className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-50" 
                         title="Resend Access"
                       >
                          {resending === d.uid ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Mail className="w-4 h-4" />}
                       </button>
                       <button onClick={() => handleDelete(d)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <Users className="w-16 h-16 text-slate-100 mx-auto mb-4 opacity-50" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No active operators found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100"
          >
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Add Driver</h3>
               <button onClick={() => { setIsAddModalOpen(false); setTempCreds(null); }} className="p-2 text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>

            {tempCreds ? (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl space-y-4">
                  <div className="flex items-center gap-3 text-blue-600 mb-2">
                    <ShieldCheck className="w-6 h-6" />
                    <h4 className="text-sm font-black uppercase tracking-widest">Temporary Credentials</h4>
                  </div>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    Account successfully provisioned. An email has been dispatched with these details. Please copy them if immediate access is required.
                  </p>
                  <div className="space-y-2 pt-2">
                    <div className="bg-white p-4 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Email</p>
                      <p className="text-sm font-bold text-slate-900">{tempCreds.email}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Temporary Password</p>
                      <p className="text-sm font-mono font-bold text-blue-600">{tempCreds.pass}</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setIsAddModalOpen(false); setTempCreds(null); }} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all hover:bg-blue-600 shadow-xl shadow-slate-900/10 active:scale-95">Dismiss & Continue</button>
              </div>
            ) : (
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                  <input required type="text" value={newDriver.name} onChange={e => setNewDriver({...newDriver, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" placeholder="John Doe" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email</label>
                  <input required type="email" value={newDriver.email} onChange={e => setNewDriver({...newDriver, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" placeholder="john@example.com" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Phone Number</label>
                    <PhoneInput 
                      value={newDriver.phone} 
                      onChange={val => setNewDriver({...newDriver, phone: val})} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">DL Number</label>
                    <input type="text" value={newDriver.licenseNumber} onChange={e => setNewDriver({...newDriver, licenseNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" placeholder="License #" />
                  </div>
                </div>
                <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors">Cancel</button>
                  <button disabled={creating} type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                    {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                    Create Account
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}

      {isEditModalOpen && editingDriver && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100"
          >
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Edit Profile</h3>
               <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                <input required type="text" value={editingDriver.name} onChange={e => setEditingDriver({...editingDriver, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                <input required type="email" value={editingDriver.email || ''} onChange={e => setEditingDriver({...editingDriver, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Phone Number</label>
                  <PhoneInput 
                    value={editingDriver.phone || ''} 
                    onChange={val => setEditingDriver({...editingDriver, phone: val})} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">DL Number</label>
                  <input type="text" value={editingDriver.licenseNumber || ''} onChange={e => setEditingDriver({...editingDriver, licenseNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold" />
                </div>
              </div>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Save Changes</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {driverToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
          >
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none uppercase italic mb-2">Delete Driver?</h3>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                {driverToDelete.message}
              </p>
            </div>
            <div className="flex gap-4">
              <button 
                type="button" 
                onClick={() => setDriverToDelete(null)} 
                className="flex-1 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-colors font-black"
              >
                No, Keep
              </button>
              <button 
                type="button" 
                onClick={async () => {
                  try {
                    const id = driverToDelete.driver.uid || driverToDelete.driver.id;
                    await saveMySQLRecord('delete', 'users', id);
                    toast.success('Driver deleted successfully');
                    setDriverToDelete(null);
                    if (onRefresh) onRefresh();
                  } catch (e: any) {
                    toast.error(e.message || 'Delete failed');
                  }
                }} 
                className="flex-1 py-3.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-600/10 hover:bg-red-700 transition-all active:scale-95"
              >
                Yes, Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function MembersList({ members, orgId, label, labels, routes, classes, isCollege, isEducation, onRefresh }: any) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', phone: '', routeId: '', pickupPointId: '', classId: '', section: '', studentId: '' });
  const [editingMember, setEditingMember] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [tempCreds, setTempCreds] = useState<{ email: string, pass: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [memberToDelete, setMemberToDelete] = useState<any>(null);
  const { user } = useAuth();

  const classLabel = isEducation ? (isCollege ? 'Group' : 'Class') : 'Department';
  const classLabelPlural = isEducation ? (isCollege ? 'Groups' : 'Classes') : 'Departments';
  const sectionLabel = isEducation ? 'Section' : 'Roll';
  const sectionLabelPlural = isEducation ? 'Sections' : 'Rolls';

  const selectedRoute = routes.find((r: any) => r.id === newMember.routeId);
  const editingSelectedRoute = routes.find((r: any) => r.id === editingMember?.routeId);

  const filteredMembers = members.filter((m: any) => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (m.studentId && m.studentId.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesClass = !filterClass || m.classId === filterClass;
    const matchesSection = !filterSection || m.section === filterSection;
    const matchesRoute = !filterRoute || m.routeId === filterRoute;
    return matchesSearch && matchesClass && matchesSection && matchesRoute;
  });

  const selectedClass = classes.find((c: any) => c.id === newMember.classId);
  const editingSelectedClass = classes.find((c: any) => c.id === editingMember?.classId);

  const handleDeassignRoute = async (m: any) => {
    toast((t) => (
      <div className="flex flex-col gap-3 p-1">
        <div className="flex items-center gap-2 text-rose-600">
           <AlertCircle className="w-5 h-5" />
           <p className="text-sm font-black uppercase italic">Confirm Deassignment</p>
        </div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
          Are you sure you want to remove the route assignment for <span className="text-slate-900">{m.name}</span>?
        </p>
        <div className="flex gap-2 justify-end mt-2">
           <button 
             onClick={() => toast.dismiss(t.id)} 
             className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
           >
             Cancel
           </button>
           <button 
             onClick={async () => {
               toast.dismiss(t.id);
               try {
                 await saveMySQLRecord('update', 'users', m.uid || m.id, {
                   routeId: '',
                   pickupPointId: ''
                 });
                 toast.success('Route deassigned successfully');
                 if (onRefresh) onRefresh();
               } catch (e: any) {
                 toast.error(e.message || 'Deassignment failed');
               }
             }}
             className="px-4 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-90 transition-all"
           >
             Deassign
           </button>
        </div>
      </div>
    ), { duration: 6000 });
  };

  const handleDelete = async (m: any) => {
    if (m.routeId) {
      const rt = routes.find((r: any) => r.id === m.routeId);
      toast.error(`Cannot delete: This ${label.toLowerCase()} is currently assigned/linked to route "${rt?.name || m.routeId}". Please deassign them first!`);
      return;
    }
    setMemberToDelete({ member: m, message: `Are you sure you want to delete this ${label.toLowerCase()}?` });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setCreating(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/create-org-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...newMember,
          role: 'user',
          orgId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error === "Email already exists") {
          toast.error((t) => (
            <div className="flex flex-col gap-2 p-1 text-left">
              <span className="font-bold flex items-center gap-1.5 text-rose-600">
                <AlertCircle size={14} /> Email Already Exists
              </span>
              <span className="text-[10px] leading-tight text-slate-600 font-medium">
                This email address is already registered to another user in the system. Please use a unique email address.
              </span>
              <div className="flex gap-2 mt-1 self-end">
                <button 
                  onClick={() => toast.dismiss(t.id)}
                  className="text-[10px] bg-slate-100 text-slate-500 px-3 py-1.5 rounded hover:bg-slate-200 uppercase font-black tracking-widest"
                >
                  Okay
                </button>
              </div>
            </div>
          ), { duration: 8000 });
          return;
        }
        if (data.error === "API_OR_IAM_ERROR") {
          toast.error((t) => (
            <div className="flex flex-col gap-2 p-1">
              <span className="font-bold flex items-center gap-1 text-red-600">
                <AlertCircle size={14} /> Service Restricted
              </span>
              <span className="text-[10px] leading-tight">
                {data.message || "Identity service is restricted. Please contact Super Admin to enable Firebase Auth API."}
              </span>
              <button 
                onClick={() => toast.dismiss(t.id)}
                className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300 self-end"
              >
                Dismiss
              </button>
            </div>
          ), { duration: 10000 });
          return;
        }
        throw new Error(data.error || 'Creation failed');
      }

      toast.success(`${label} record created and email sent`);
      setTempCreds({ email: data.credentials?.email || newMember.email, pass: data.tempPassword });
      setNewMember({ name: '', email: '', phone: '', routeId: '', pickupPointId: '', classId: '', section: '', studentId: '' });
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create record');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    const originalRouteId = members.find(m => m.id === editingMember.id)?.routeId || '';
    const originalPickupPointId = members.find(m => m.id === editingMember.id)?.pickupPointId || '';
    
    const hasAssignmentChanged = (editingMember.routeId || '') !== originalRouteId || 
                                (editingMember.pickupPointId || '') !== originalPickupPointId;

    const performUpdate = async () => {
      try {
        await saveMySQLRecord('update', 'users', editingMember.uid || editingMember.id, {
          name: editingMember.name,
          studentId: editingMember.studentId || null,
          routeId: editingMember.routeId || '',
          pickupPointId: editingMember.pickupPointId || '',
          classId: editingMember.classId || null,
          section: editingMember.section || null,
          phone: editingMember.phone || null
        });
        toast.success(`${label} updated successfully`);
        setIsEditModalOpen(false);
        setEditingMember(null);
        if (onRefresh) onRefresh();
      } catch (e: any) {
        toast.error(e.message || 'Update failed');
      }
    };

    if (hasAssignmentChanged) {
      toast((t) => (
        <div className="flex flex-col gap-3 p-1">
          <div className="flex items-center gap-2 text-amber-600">
             <AlertCircle className="w-5 h-5" />
             <p className="text-sm font-black uppercase italic">Confirm Assignment Change</p>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
            You are changing the route/pickup point for <span className="text-slate-900">{editingMember.name}</span>. Do you want to proceed?
          </p>
          <div className="flex gap-2 justify-end mt-2">
             <button 
               onClick={() => toast.dismiss(t.id)} 
               className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
             >
               Keep Original
             </button>
             <button 
               onClick={async () => {
                 toast.dismiss(t.id);
                 await performUpdate();
               }}
               className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-90 transition-all"
             >
               Save Changes
             </button>
          </div>
        </div>
      ), { duration: 6000 });
      return;
    }

    await performUpdate();
  };

  const handleResend = async (uid: string) => {
    if (!user) return;
    setResending(uid);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/resend-creds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid })
      });
      
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "API_OR_IAM_ERROR") {
          toast.error((t) => (
            <div className="flex flex-col gap-2 p-1">
              <span className="font-bold flex items-center gap-1 text-red-600">
                <AlertCircle size={14} /> Service Restricted
              </span>
              <span className="text-[10px] leading-tight">
                {data.message || "Identity or database service is restricted. Please contact Super Admin."}
              </span>
              <button 
                onClick={() => toast.dismiss(t.id)}
                className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300 self-end"
              >
                Dismiss
              </button>
            </div>
          ), { duration: 10000 });
          return;
        }
        throw new Error(data.error || 'Failed to resend');
      }
      
      toast.success('New credentials sent via email');
      setTempCreds({ email: data.email || 'the user', pass: data.tempPassword });
      setIsAddModalOpen(true); // Open modal to show credentials
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResending(null);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1">{labels}</h3>
          <p className="text-xs text-slate-400 font-medium tracking-tight">Directory of registered {labels.toLowerCase()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group/search min-w-[240px]">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/search:text-blue-500 transition-colors" />
             <input 
               type="text" 
               placeholder={`Search ${labels.toLowerCase()}...`}
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all"
             />
          </div>
          {classes.length > 0 && (
            <>
              <select 
                value={filterClass}
                onChange={(e) => { setFilterClass(e.target.value); setFilterSection(''); }}
                className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-blue-500/5 outline-none cursor-pointer"
              >
                <option value="">All {classLabelPlural}</option>
                {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {filterClass && classes.find((c: any) => c.id === filterClass)?.sections?.length > 0 && (
                <select 
                  value={filterSection}
                  onChange={(e) => setFilterSection(e.target.value)}
                  className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-blue-500/5 outline-none cursor-pointer"
                >
                  <option value="">All {sectionLabelPlural}</option>
                  {classes.find((c: any) => c.id === filterClass)?.sections?.map((s: string) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </>
          )}
          <select 
            value={filterRoute}
            onChange={(e) => setFilterRoute(e.target.value)}
            className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-blue-500/5 outline-none cursor-pointer"
          >
            <option value="">All Routes</option>
            {routes.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={() => setIsAddModalOpen(true)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl hover:bg-blue-600 transition-all active:scale-95">
            <UserPlus className="w-4 h-4" /> Add {label}
          </button>
        </div>
      </div>      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden hidden md:block w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full border-collapse table-auto">
            <thead>
              <tr className="border-b border-slate-50">
                  <th className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</th>
                  <th className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{classLabel}/{sectionLabel}</th>
                  <th className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Assigned Route</th>
                <th className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Status</th>
                <th className="px-4 lg:px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredMembers.map((m: any) => (
                <tr key={m.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 lg:px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                        <img src={getUserAvatar(m.avatarUrl, m.photoURL, m.name, m.uid)} alt="Avatar" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <p className="text-xs font-black text-slate-900 uppercase italic leading-none mb-1 truncate max-w-[120px] lg:max-w-[160px]" title={m.name}>{m.name}</p>
                          {m.studentId && (
                            <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest shadow-sm shrink-0 whitespace-nowrap">
                              ID: {m.studentId}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight truncate max-w-[150px] lg:max-w-[180px]" title={m.email}>{m.email}</p>
                          {m.phone && (
                            <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest leading-tight whitespace-nowrap">
                              PH: {m.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                    {m.classId ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-900 uppercase italic leading-none">
                          {classes.find((c: any) => c.id === m.classId)?.name || 'Unknown'}
                        </span>
                        {m.section && (
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                            {sectionLabel}: {m.section}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-300 font-black uppercase italic tracking-widest">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 lg:px-6 py-4 min-w-[200px] lg:min-w-[240px]">
                    {m.routeId ? (
                      <div className="flex items-center justify-between bg-slate-50/50 p-2 rounded-xl border border-slate-100 group/route shadow-sm">
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                             <div className="w-4 h-4 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                               <Route className="w-2.5 h-2.5 text-blue-500" />
                             </div>
                             <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight truncate max-w-[110px] lg:max-w-[150px] block" title={routes.find((r: any) => r.id === m.routeId)?.name || 'Linked Route'}>
                                {routes.find((r: any) => r.id === m.routeId)?.name || 'Linked Route'}
                             </span>
                          </div>
                          {m.pickupPointId && (
                            <div className="flex items-center gap-1.5 pl-0.5 min-w-0">
                              <div className="w-3.5 h-3.5 rounded-full bg-blue-50/50 flex items-center justify-center shrink-0">
                                <MapPin className="w-2 text-blue-400" />
                              </div>
                              <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.05em] truncate max-w-[110px] lg:max-w-[150px] block" title={routes.find((r: any) => r.id === m.routeId)?.pickupPoints?.find((p: any) => p.id === m.pickupPointId)?.name || 'Selected Point'}>
                                {routes.find((r: any) => r.id === m.routeId)?.pickupPoints?.find((p: any) => p.id === m.pickupPointId)?.name || 'Selected Point'}
                              </span>
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={() => handleDeassignRoute(m)}
                          className="p-1.5 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all shadow-sm border border-transparent hover:border-rose-100 ml-2 shrink-0"
                          title="Deassign Route"
                        >
                          <Link2Off className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="bg-slate-50/30 border border-slate-100/50 rounded-xl px-3 py-2 text-center">
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.15em] italic whitespace-normal">No Assigned Route</p>
                      </div>
                    )}
                  </td>
                  <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                    <div className={cn(
                       "inline-flex items-center gap-1.5 px-2.5 py-0.5  rounded-full text-[9px] font-black uppercase tracking-widest border whitespace-nowrap",
                       !!m.routeId 
                         ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                         : "bg-rose-50 text-rose-600 border-rose-100"
                      )}>
                        <div className={cn("w-1 h-1 rounded-full", !!m.routeId ? "bg-emerald-500 animate-pulse" : "bg-rose-400")}></div>
                        {!!m.routeId ? 'Active' : 'Inactive'}
                      </div>
                  </td>
                  <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                       <button 
                         onClick={() => { setEditingMember(m); setIsEditModalOpen(true); }}
                         className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" 
                         title={`Edit ${label}`}
                       >
                          <Edit3 className="w-3.5 h-3.5" />
                       </button>
                       <button 
                         disabled={resending === m.uid} 
                         onClick={() => handleResend(m.uid)}
                         className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-50"
                         title="Resend Credentials"
                       >
                          {resending === m.uid ? <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                       </button>
                       <button onClick={() => handleDelete(m)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-wrap">
                    <Users className="w-16 h-16 text-slate-100 mx-auto mb-4 opacity-50" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registry is currently empty or no results for filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden grid grid-cols-1 gap-4">
        {filteredMembers.map((m: any) => (
          <div key={m.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden">
                  <img src={getUserAvatar(m.avatarUrl, m.photoURL, m.name, m.uid)} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-slate-900 uppercase italic leading-none">{m.name}</p>
                    {m.studentId && (
                      <span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm ring-4 ring-blue-500/10">
                        ID: {m.studentId}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{m.email}</p>
                </div>
              </div>
              <div className={cn(
                "px-3 py-1 rounded-full ring-1 shrink-0 text-[10px] font-black uppercase tracking-widest",
                !!m.routeId ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
              )}>
                {!!m.routeId ? 'Active' : 'Inactive'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
              <div>
                <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Affiliation</p>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-900 uppercase italic">
                    {classes.find((c: any) => c.id === m.classId)?.name || 'Unassigned'}
                  </span>
                  {m.section && (
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      {sectionLabel}: {m.section}
                    </span>
                  )}
                </div>
              </div>
              {m.phone && (
                <div>
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Contact</p>
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest font-mono">{m.phone}</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">Assigned Route</p>
              {m.routeId ? (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Route className="w-3.5 h-3.5 text-blue-500" />
                       <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">
                          {routes.find((r: any) => r.id === m.routeId)?.name || 'Linked Route'}
                       </span>
                    </div>
                    <button onClick={() => handleDeassignRoute(m)} className="p-2 text-rose-400 hover:text-rose-600 bg-white shadow-sm rounded-xl border border-slate-100">
                      <Link2Off className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {m.pickupPointId && (
                    <div className="flex items-center gap-2 pl-1 py-1.5 border-t border-slate-100 border-dashed">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        {routes.find((r: any) => r.id === m.routeId)?.pickupPoints?.find((p: any) => p.id === m.pickupPointId)?.name || 'Selected Point'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest italic tracking-[0.2em]">No assigned route</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button 
                onClick={() => { setEditingMember(m); setIsEditModalOpen(true); }} 
                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-900/10 hover:bg-blue-600 transition-all active:scale-95"
              >
                Edit Profile
              </button>
              <div className="flex gap-2">
                <button 
                  disabled={resending === m.uid}
                  onClick={() => handleResend(m.uid)}
                  className="p-4 bg-slate-50 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-2xl transition-all border border-slate-100"
                >
                  <Mail className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(m)}
                  className="p-4 bg-slate-50 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all border border-slate-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredMembers.length === 0 && (
          <div className="bg-white py-20 rounded-[2rem] border border-slate-100 shadow-sm text-center">
             <Users className="w-16 h-16 text-slate-100 mx-auto mb-4 opacity-50" />
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No results found</p>
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 max-h-[95vh] overflow-y-auto custom-scrollbar"
          >
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Add {label}</h3>
               <button onClick={() => { setIsAddModalOpen(false); setTempCreds(null); }} className="p-2 text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>

            {tempCreds ? (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl space-y-4">
                  <div className="flex items-center gap-3 text-blue-600 mb-2">
                    <ShieldCheck className="w-6 h-6" />
                    <h4 className="text-sm font-black uppercase tracking-widest">Temporary Credentials</h4>
                  </div>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    Account successfully provisioned. An email has been dispatched with these details. Please copy them if immediate access is required.
                  </p>
                  <div className="space-y-2 pt-2">
                    <div className="bg-white p-4 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Email</p>
                      <p className="text-sm font-bold text-slate-900">{tempCreds.email}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Temporary Password</p>
                      <p className="text-sm font-mono font-bold text-blue-600">{tempCreds.pass}</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setIsAddModalOpen(false); setTempCreds(null); }} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all hover:bg-blue-600 shadow-xl shadow-slate-900/10 active:scale-95">Dismiss & Continue</button>
              </div>
            ) : (
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                  <input required type="text" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" placeholder="Enter name" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email</label>
                  <input required type="email" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" placeholder="Enter email" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">{isEducation ? (isCollege ? 'Roll Number / ID' : 'Student ID') : 'Employee ID'}</label>
                  <input 
                    type="text" 
                    value={newMember.studentId} 
                    onChange={e => setNewMember({...newMember, studentId: e.target.value})} 
                    placeholder="Enter Unique ID"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all" 
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Phone Number</label>
                  <PhoneInput 
                    value={newMember.phone} 
                    onChange={val => setNewMember({...newMember, phone: val})} 
                  />
                </div>

                {classes.length > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">{classLabel}</label>
                      <select 
                        required
                        value={newMember.classId} 
                        onChange={e => setNewMember({...newMember, classId: e.target.value, section: ''})} 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold"
                      >
                        <option value="">Select {classLabel}</option>
                        {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    {selectedClass?.sections?.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">{sectionLabel}</label>
                        <select 
                          required
                          value={newMember.section} 
                          onChange={e => setNewMember({...newMember, section: e.target.value})} 
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold"
                        >
                          <option value="">Select {sectionLabel}</option>
                          {selectedClass?.sections?.map((s: string) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Route Assignment</label>
                  <select 
                    value={newMember.routeId} 
                    onChange={e => setNewMember({...newMember, routeId: e.target.value, pickupPointId: ''})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold"
                  >
                    <option value="">No Route Assigned</option>
                    {routes.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                {newMember.routeId && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Pickup Point</label>
                    <select 
                      required
                      value={newMember.pickupPointId} 
                      onChange={e => setNewMember({...newMember, pickupPointId: e.target.value})} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold"
                    >
                      <option value="">Select Pickup Point</option>
                      {selectedRoute?.pickupPoints?.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.time})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors">Cancel</button>
                  <button disabled={creating} type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                    {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                    Create Record
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}

      {isEditModalOpen && editingMember && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 max-h-[95vh] overflow-y-auto custom-scrollbar"
          >
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Edit {label}</h3>
               <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                <input required type="text" value={editingMember.name} onChange={e => setEditingMember({...editingMember, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">{isEducation ? (isCollege ? 'Roll Number / ID' : 'Student ID') : 'Employee ID'}</label>
                <input 
                  type="text" 
                  value={editingMember.studentId || ''} 
                  onChange={e => setEditingMember({...editingMember, studentId: e.target.value})} 
                  placeholder="Enter Unique ID"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Phone Number</label>
                <PhoneInput 
                  value={editingMember.phone || ''} 
                  onChange={val => setEditingMember({...editingMember, phone: val})} 
                />
              </div>

              {classes.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">{classLabel}</label>
                    <select 
                      value={editingMember.classId || ''} 
                      onChange={e => setEditingMember({...editingMember, classId: e.target.value, section: ''})} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold"
                    >
                      <option value="">Select {classLabel}</option>
                      {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {editingSelectedClass?.sections?.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">{sectionLabel}</label>
                      <select 
                        value={editingMember.section || ''} 
                        onChange={e => setEditingMember({...editingMember, section: e.target.value})} 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold"
                      >
                        <option value="">Select {sectionLabel}</option>
                        {editingSelectedClass?.sections?.map((s: string) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Route Assignment</label>
                <select 
                  value={editingMember.routeId || ''} 
                  onChange={e => setEditingMember({...editingMember, routeId: e.target.value, pickupPointId: ''})} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold"
                >
                  <option value="">No Route Assigned</option>
                  {routes.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              {editingMember.routeId && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Pickup Point</label>
                  <select 
                    required
                    value={editingMember.pickupPointId || ''} 
                    onChange={e => setEditingMember({...editingMember, pickupPointId: e.target.value})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold"
                  >
                    <option value="">Select Pickup Point</option>
                    {editingSelectedRoute?.pickupPoints?.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.time})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Save Changes</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {memberToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
          >
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none uppercase italic mb-2">Delete {label}?</h3>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                {memberToDelete.message}
              </p>
            </div>
            <div className="flex gap-4">
              <button 
                type="button" 
                onClick={() => setMemberToDelete(null)} 
                className="flex-1 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-colors font-black"
              >
                No, Keep
              </button>
              <button 
                type="button" 
                onClick={async () => {
                  try {
                    const id = memberToDelete.member.uid || memberToDelete.member.id;
                    await saveMySQLRecord('delete', 'users', id);
                    toast.success(`${label} deleted successfully`);
                    setMemberToDelete(null);
                    if (onRefresh) onRefresh();
                  } catch (e: any) {
                    toast.error(e.message || 'Delete failed');
                  }
                }} 
                className="flex-1 py-3.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-600/10 hover:bg-red-700 transition-all active:scale-95"
              >
                Yes, Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function RoutesList({ routes, vehicles, drivers, members, orgId, memberLabel, membersLabel, classes, classLabel, org, onRefresh }: any) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newRoute, setNewRoute] = useState<any>({ 
    name: '', 
    description: '', 
    start: '', 
    startCoord: null,
    end: '', 
    endCoord: null,
    vehicleId: '', 
    driverId: '', 
    pickupPoints: [] 
  });
  const [editingRoute, setEditingRoute] = useState<any>(null);
  const [pickMode, setPickMode] = useState<'start' | 'end' | 'stop'>('stop');
  const [assignModal, setAssignModal] = useState<{ open: boolean, route: any }>({ open: false, route: null });
  const [assignSearch, setAssignSearch] = useState('');
  const [assignClassFilter, setAssignClassFilter] = useState('');
  const [assignSectionFilter, setAssignSectionFilter] = useState('');
  const [newPickupPoint, setNewPickupPoint] = useState({ name: '', time: '', lat: '', lng: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [viewingRoutePoints, setViewingRoutePoints] = useState<any>(null);
  const [editingPickupPointId, setEditingPickupPointId] = useState<string | null>(null);
  const [routeToDelete, setRouteToDelete] = useState<any>(null);

  const isEducation = org?.sector === 'Education';
  const isCollege = org?.eduType === 'College' || (!org?.eduType && (org?.name?.toLowerCase().includes('college') || org?.name?.toLowerCase().includes('university')));
  const orgIconUrl = getLocalIcon(org?.logo || org?.logoUrl || (org?.sector === 'Education' ? (isCollege ? 'graduation-cap' : 'school') : (org?.sector === 'Healthcare' ? 'hospital' : (org?.sector === 'Government' ? 'museum' : 'commercial'))));
  const orgColor = isEducation ? (isCollege ? '#6366f1' : '#4f46e5') : '#0f172a';

  const classLabelPlural = isEducation ? (isCollege ? 'Groups' : 'Classes') : 'Departments';
  const sectionLabel = isEducation ? 'Section' : 'Roll';
  const sectionLabelPlural = isEducation ? 'Sections' : 'Rolls';

  useEffect(() => {
    if (org?.location && isAddModalOpen && !newRoute.end && !newRoute.endCoord) {
       setNewRoute(prev => ({ ...prev, end: org.name || 'Organization', endCoord: org.location }));
    }
  }, [org, isAddModalOpen]);

  const filteredRoutes = routes.filter((r: any) => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.start?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.end?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (r: any) => {
    // 1. Check if route is linked with any students/members
    const assignedStudents = members.filter((m: any) => m.routeId === r.id);
    if (assignedStudents.length > 0) {
      toast.error(`Cannot delete: This route is currently linked to ${assignedStudents.length} active ${membersLabel.toLowerCase()}. Please unassign them first!`);
      return;
    }
    // 2. Check if route has an assigned driver
    if (r.driverId) {
      const drv = drivers.find((d: any) => d.uid === r.driverId || d.id === r.driverId);
      toast.error(`Cannot delete: This route is currently linked to driver "${drv?.name || r.driverId}". Please unassign the driver first!`);
      return;
    }
    // 3. Check if route has an assigned vehicle/bus
    if (r.vehicleId) {
      const veh = vehicles.find((v: any) => v.id === r.vehicleId);
      toast.error(`Cannot delete: This route is currently linked to vehicle/bus "${veh?.plateNumber || r.vehicleId}". Please unassign the vehicle first!`);
      return;
    }
    setRouteToDelete({ route: r, message: 'Are you sure you want to delete this route?' });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoute) return;
    try {
      const finalName = editingRoute.name || `${editingRoute.start} → ${editingRoute.end}`;
      await saveMySQLRecord('update', 'routes', editingRoute.id, {
        name: finalName,
        description: editingRoute.description || '',
        startPoint: JSON.stringify({
          name: editingRoute.start || '',
          location: editingRoute.startCoord || null
        }),
        endPoint: JSON.stringify({
          name: editingRoute.end || '',
          location: editingRoute.endCoord || null
        }),
        vehicleId: editingRoute.vehicleId || '',
        driverId: editingRoute.driverId || '',
        pickupPoints: editingRoute.pickupPoints || [],
        distance: editingRoute.distance || '0',
        orgId
      });

      // Update driver assignments in MySQL if changed
      if (editingRoute.driverId) {
        await saveMySQLRecord('update', 'users', editingRoute.driverId, {
          routeId: editingRoute.id,
          vehicleId: editingRoute.vehicleId
        });
      }

      toast.success('Route updated successfully');
      setIsEditModalOpen(false);
      setEditingRoute(null);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    }
  };

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 3 || searchQuery.startsWith('http')) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const center = org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
          ? org.location 
          : { lat: 17.4504, lng: 78.3808 };
        const left = center.lng - 1.0;
        const right = center.lng + 1.0;
        const top = center.lat + 1.0;
        const bottom = center.lat - 1.0;
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=15&addressdetails=1&countrycodes=in&viewbox=${left},${top},${right},${bottom}`);
        const data = await response.json();
        setSuggestions(data || []);
      } catch (e) {
        console.warn('Suggestions fetch failed', e);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [searchQuery, org]);

  const handlePastedUrl = (url: string) => {
    // Regex for Google Maps coordinates
    // Standard: https://www.google.com/maps/@17.4339679,78.3687355,15z
    const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      const [, lat, lng] = coordMatch;
      setNewPickupPoint(prev => ({
        ...prev,
        lat: parseFloat(lat).toFixed(6),
        lng: parseFloat(lng).toFixed(6)
      }));
      toast.success('Location extracted from URL');
      return true;
    }
    
    // Check for "ll" or "q" params
    const llMatch = url.match(/[?&](ll|q)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (llMatch) {
      const [, , lat, lng] = llMatch;
      setNewPickupPoint(prev => ({
        ...prev,
        lat: parseFloat(lat).toFixed(6),
        lng: parseFloat(lng).toFixed(6)
      }));
      toast.success('Coordinates extracted');
      return true;
    }
    return false;
  };

  const handleSearchLocation = async (e?: React.FormEvent, forceQuery?: string) => {
    if (e) e.preventDefault();
    const queryToUse = forceQuery || searchQuery;
    if (!queryToUse) return;

    setSuggestions([]);

    // Check for shortened Google Maps links
    if (queryToUse.includes('maps.app.goo.gl') || (queryToUse.includes('goo.gl/maps') && !queryToUse.includes('@'))) {
      setIsSearching(true);
      try {
        const proxyRes = await fetch(`/api/proxy/resolve-url?url=${encodeURIComponent(queryToUse)}`);
        const proxyData = await proxyRes.json();
        if (proxyData.resolvedUrl) {
          if (handlePastedUrl(proxyData.resolvedUrl)) {
             setIsSearching(false);
             return;
          }
        }
      } catch (err) {
        console.error("Link resolution failed", err);
      } finally {
        setIsSearching(false);
      }
    }

    if (handlePastedUrl(queryToUse)) return;

    setIsSearching(true);
    try {
      const center = org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
        ? org.location 
        : { lat: 17.4504, lng: 78.3808 };
      const left = center.lng - 1.0;
      const right = center.lng + 1.0;
      const top = center.lat + 1.0;
      const bottom = center.lat - 1.0;
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryToUse)}&limit=1&addressdetails=1&countrycodes=in&viewbox=${left},${top},${right},${bottom}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        setNewPickupPoint(prev => ({
          ...prev,
          lat: parseFloat(lat).toFixed(6),
          lng: parseFloat(lon).toFixed(6),
          name: display_name.split(',')[0]
        }));
        setSearchQuery(display_name.split(',')[0]);
        toast.success(`Found: ${display_name.split(',')[0]}`);
      } else {
        toast.error('Location not found');
      }
    } catch (e) {
      toast.error('Search service unavailable');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSuggestion = (suggestion: any) => {
    const { lat, lon, display_name } = suggestion;
    const shortName = display_name.split(',')[0];
    setNewPickupPoint(prev => ({
      ...prev,
      lat: parseFloat(lat).toFixed(6),
      lng: parseFloat(lon).toFixed(6),
      name: shortName
    }));
    setSearchQuery(shortName);
    setSuggestions([]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalName = newRoute.name || `${newRoute.start} → ${newRoute.end}`;
      const generatedId = 'ROUTE-' + Math.random().toString(36).substring(2, 9).toUpperCase();
      await saveMySQLRecord('insert', 'routes', generatedId, {
        name: finalName,
        description: newRoute.description || '',
        startPoint: JSON.stringify({
          name: newRoute.start || '',
          location: newRoute.startCoord || null
        }),
        endPoint: JSON.stringify({
          name: newRoute.end || '',
          location: newRoute.endCoord || null
        }),
        vehicleId: newRoute.vehicleId || '',
        driverId: newRoute.driverId || '',
        pickupPoints: newRoute.pickupPoints || [],
        distance: newRoute.distance || '0',
        orgId
      });
      
      // Sync driver doc if assigned
      if (newRoute.driverId) {
        await saveMySQLRecord('update', 'users', newRoute.driverId, { 
          routeId: generatedId,
          vehicleId: newRoute.vehicleId
        });
      }

      toast.success('Route created successfully');
      setIsAddModalOpen(false);
      setNewRoute({ 
        name: '', 
        description: '', 
        start: '', 
        startCoord: null,
        end: '', 
        endCoord: null,
        vehicleId: '', 
        driverId: '', 
        pickupPoints: [] 
      });
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create route');
    }
  };

  const handleMapClick = async (lat: number, lng: number) => {
    const target = isEditModalOpen ? editingRoute : newRoute;
    const setTarget = isEditModalOpen ? setEditingRoute : setNewRoute;

    if (pickMode === 'start') {
      setTarget({ ...target, startCoord: { lat, lng } });
      setPickMode('stop');
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        if (data && data.display_name) {
          setTarget((prev: any) => ({ ...prev, start: data.display_name.split(',')[0] }));
        }
      } catch (e) {}
    } else if (pickMode === 'end') {
      setTarget({ ...target, endCoord: { lat, lng } });
      setPickMode('stop');
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        if (data && data.display_name) {
          setTarget((prev: any) => ({ ...prev, end: data.display_name.split(',')[0] }));
        }
      } catch (e) {}
    } else {
      setNewPickupPoint(prev => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
      
      // Try to get address via reverse geocoding
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        if (data && data.display_name) {
          const displayName = data.display_name.split(',')[0];
          setNewPickupPoint(prev => ({ ...prev, name: displayName }));
        }
      } catch (e) {
        console.warn('Reverse geocoding failed', e);
      }
    }
  };

  const addPickupPoint = () => {
    if (!newPickupPoint.name || !newPickupPoint.time) {
      toast.error('Point Name and Time are required');
      return;
    }
    const target = isEditModalOpen ? editingRoute : newRoute;
    const setTarget = isEditModalOpen ? setEditingRoute : setNewRoute;

    if (editingPickupPointId) {
      // Update existing
      setTarget({
        ...target,
        pickupPoints: target.pickupPoints.map((p: any) => 
          p.id === editingPickupPointId 
            ? { 
                ...p, 
                ...newPickupPoint,
                lat: newPickupPoint.lat ? parseFloat(newPickupPoint.lat) : null,
                lng: newPickupPoint.lng ? parseFloat(newPickupPoint.lng) : null
              } 
            : p
        )
      });
      setEditingPickupPointId(null);
    } else {
      // Add new
      setTarget({ 
        ...target, 
        pickupPoints: [
          ...(target.pickupPoints || []), 
          { 
            ...newPickupPoint, 
            id: Date.now().toString(),
            lat: newPickupPoint.lat ? parseFloat(newPickupPoint.lat) : null,
            lng: newPickupPoint.lng ? parseFloat(newPickupPoint.lng) : null
          }
        ] 
      });
    }
    setNewPickupPoint({ name: '', time: '', lat: '', lng: '' });
  };

  const startEditPickupPoint = (p: any) => {
    setNewPickupPoint({
      name: p.name || '',
      time: p.time || '',
      lat: p.lat?.toString() || '',
      lng: p.lng?.toString() || ''
    });
    setEditingPickupPointId(p.id);
  };

  const removePickupPoint = (id: string) => {
    const target = isEditModalOpen ? editingRoute : newRoute;
    const setTarget = isEditModalOpen ? setEditingRoute : setNewRoute;
    setTarget({ ...target, pickupPoints: (target.pickupPoints || []).filter((p: any) => p.id !== id) });
  };

  const assignMemberToRoute = async (member: any, routeId: string | null, pickupPointId?: string) => {
    if (!routeId) {
      toast((t) => (
        <div className="flex flex-col gap-3 p-1">
          <div className="flex items-center gap-2 text-rose-600">
             <AlertCircle className="w-5 h-5" />
             <p className="text-sm font-black uppercase italic">Confirm Deassignment</p>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
            Are you sure you want to remove <span className="text-slate-900">{member.name}</span> from this route?
          </p>
          <div className="flex gap-2 justify-end mt-2">
             <button 
               onClick={() => toast.dismiss(t.id)} 
               className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
             >
               Cancel
             </button>
             <button 
               onClick={async () => {
                 toast.dismiss(t.id);
                 try {
                   await saveMySQLRecord('update', 'users', member.uid || member.id, { 
                     routeId: '',
                     pickupPointId: ''
                   });
                   toast.success('Unassigned successfully');
                   if (onRefresh) onRefresh();
                 } catch (e: any) {
                   toast.error(e.message || 'Operation failed');
                 }
               }}
               className="px-4 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-90 transition-all"
             >
               Deassign
             </button>
          </div>
        </div>
      ), { duration: 6000 });
      return;
    }

    try {
      await saveMySQLRecord('update', 'users', member.uid || member.id, { 
        routeId: routeId || '',
        pickupPointId: pickupPointId || (routeId ? null : '') // Clear if unassigning
      });
      toast.success(routeId ? 'Assigned successfully' : 'Unassigned successfully');
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Operation failed');
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1">Route</h3>
          <p className="text-xs text-slate-400 font-medium tracking-tight">Design and manage transport corridors</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text"
              placeholder="Search route name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 pr-6 py-3 bg-white border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-200 w-full sm:w-64 transition-all"
            />
          </div>
          <button 
            onClick={() => {
              setNewPickupPoint({ name: '', time: '', lat: '', lng: '' });
              setIsAddModalOpen(true);
            }} 
            className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:bg-blue-600 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Create Route
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Route Details</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Stops</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Assignments</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRoutes.map((r: any) => (
                <tr key={r.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-black text-slate-900 uppercase italic leading-none">{r.name}</p>
                      {r.description && <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[200px]">{r.description}</p>}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-2">
                       <div className="space-y-1">
                         <div className="flex items-center gap-2">
                            <Activity className="w-3 h-3 text-blue-500" />
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{r.pickupPoints?.length || 0} STOPS</span>
                         </div>
                         {r.pickupPoints && r.pickupPoints.length > 0 && (
                           <div className="pl-5 space-y-1">
                             {r.pickupPoints.slice(0, 3).map((p: any, idx: number) => (
                               <div key={p.id || idx} className="flex items-center gap-2">
                                 <div className="w-1 h-1 rounded-full bg-slate-300" />
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate max-w-[120px]">{p.name}</span>
                               </div>
                             ))}
                             {r.pickupPoints.length > 3 && (
                               <button 
                                 onClick={() => setViewingRoutePoints(r)}
                                 className="text-[9px] font-black text-blue-500 uppercase tracking-widest hover:text-blue-700 transition-colors mt-1 flex items-center gap-1 group/more"
                               >
                                 VIEW MORE ({r.pickupPoints.length - 3}+)
                                 <ChevronRight className="w-2.5 h-2.5 group-hover/more:translate-x-0.5 transition-transform" />
                               </button>
                             )}
                           </div>
                         )}
                       </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex gap-4">
                       <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase leading-none mt-1">Bus</span>
                          <span className="text-[10px] font-black text-slate-900">{vehicles.find((v: any) => v.id === r.vehicleId)?.plateNumber || 'NA'}</span>
                       </div>
                       <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase leading-none mt-1">Driver</span>
                          <span className="text-[10px] font-black text-slate-900">{drivers.find((d: any) => d.id === r.driverId)?.name || 'NA'}</span>
                       </div>
                       <div className="flex flex-col gap-1 border-l border-slate-100 pl-4">
                          <span className="text-[9px] font-black text-slate-400 uppercase leading-none mt-1">{membersLabel}</span>
                          <span className="text-[10px] font-black text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded-md text-center">
                             {members.filter((m: any) => m.routeId === r.id).length}
                          </span>
                       </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {(() => {
                      const isActive = members.some((m: any) => m.routeId === r.id);
                      return (
                        <div className={cn(
                          "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all",
                          isActive 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                            : "bg-rose-50 text-rose-600 border-rose-100"
                        )}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-500 animate-pulse" : "bg-rose-400")}></div>
                          {isActive ? 'Active' : 'Inactive'}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex justify-end gap-2">
                       <button 
                         onClick={() => { 
                           setNewPickupPoint({ name: '', time: '', lat: '', lng: '' });
                           setEditingRoute({ ...r }); 
                           setIsEditModalOpen(true); 
                         }}
                         className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                         title="Edit Route"
                       >
                          <Edit3 className="w-4 h-4" />
                       </button>
                       <button 
                         onClick={() => setAssignModal({ open: true, route: r })} 
                         className="p-2.5 text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                         title={`Assign ${membersLabel}`}
                       >
                          <UserCheck className="w-4 h-4" />
                       </button>
                       <button onClick={() => handleDelete(r)} className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRoutes.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-24 text-center">
                    <Route className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No routes designed yet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden space-y-4">
        {filteredRoutes.map((r: any) => {
          const assigned = members.filter((m: any) => m.routeId === r.id).length;
          const vehicle = vehicles.find((v: any) => v.id === r.vehicleId);
          return (
            <div key={r.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
               <div className="flex items-center justify-between">
                 <div>
                   <h4 className="text-sm font-black text-slate-900 uppercase italic tracking-tight">{r.name}</h4>
                   <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">ID: {r.id.slice(0, 8)}</p>
                 </div>
                 <div className="flex gap-2">
                   <button 
                     onClick={() => setAssignModal({ open: true, route: r })} 
                     className="p-3 bg-blue-50 text-blue-600 rounded-xl"
                   >
                     <UserPlus className="w-4 h-4" />
                   </button>
                   <button 
                     onClick={() => { 
                       setNewPickupPoint({ name: '', time: '', lat: '', lng: '' });
                       setEditingRoute({ ...r }); 
                       setIsEditModalOpen(true); 
                     }}
                     className="p-3 bg-slate-50 text-slate-400 rounded-xl"
                   >
                     <Edit3 className="w-4 h-4" />
                   </button>
                 </div>
               </div>
               
               <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Network Path</p>
                    <p className="text-[10px] font-black text-slate-900 uppercase italic truncate">{r.start} → {r.end}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Stops / Enrolled</p>
                    <p className="text-[10px] font-black text-blue-500 uppercase italic">
                      {r.pickupPoints?.length || 0} STOPS • {assigned} {membersLabel.slice(0, 3)}
                    </p>
                  </div>
               </div>

               <div className="flex items-center justify-between pt-2">
                 <div className="flex items-center gap-3">
                   <Bus className="w-3.5 h-3.5 text-slate-300" />
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{vehicle?.plateNumber || 'No Bus'}</p>
                 </div>
                 <button onClick={() => handleDelete(r)} className="text-[9px] font-black text-rose-300 uppercase tracking-widest italic hover:text-rose-500 transition-colors">
                   Terminate Route
                 </button>
               </div>
            </div>
          );
        })}
      </div>

      {assignModal.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] p-6 md:p-10 max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]"
          >
            <div className="flex justify-between items-center mb-8 shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Assign {membersLabel}</h3>
                <div className="flex items-center gap-2 mt-2">
                   <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest">Route: {assignModal.route?.name}</p>
                   <span className="text-slate-300">•</span>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Direct Enrollment</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setAssignModal({ open: false, route: null });
                  setAssignSearch('');
                  setAssignClassFilter('');
                  setAssignSectionFilter('');
                }} 
                className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-2xl transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 mb-8 shrink-0">
              <div className="relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="text"
                  placeholder={`Search ${membersLabel.toLowerCase()} by name, id, or email...`}
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:bg-white focus:border-blue-200 transition-all shadow-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <select 
                    value={assignClassFilter}
                    onChange={(e) => setAssignClassFilter(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all appearance-none pr-12"
                  >
                    <option value="">All {classLabelPlural}</option>
                    {classes.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select 
                    value={assignSectionFilter}
                    onChange={(e) => setAssignSectionFilter(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all appearance-none pr-12"
                  >
                    <option value="">All {sectionLabelPlural}</option>
                    {Array.from(new Set(members.map((m: any) => m.section).filter(Boolean))).sort().map((s: any) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2 custom-scrollbar pb-6">
              {members.filter((m: any) => {
                const searchLower = assignSearch.toLowerCase();
                const matchesSearch = !assignSearch || 
                  m.name.toLowerCase().includes(searchLower) || 
                  m.email.toLowerCase().includes(searchLower) ||
                  (m.studentId && m.studentId.toLowerCase().includes(searchLower));
                const matchesClass = !assignClassFilter || m.classId === assignClassFilter;
                const matchesSection = !assignSectionFilter || m.section === assignSectionFilter;
                return matchesSearch && matchesClass && matchesSection;
              }).map((m: any) => (
                <div key={m.id} className={cn(
                  "p-5 rounded-[2rem] border transition-all space-y-5",
                  m.routeId === assignModal.route?.id 
                    ? "bg-blue-50/50 border-blue-200" 
                    : "bg-slate-50/20 border-slate-100 hover:border-slate-200"
                )}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 overflow-hidden shadow-sm shrink-0">
                         <img src={getUserAvatar(m.avatarUrl, m.photoURL, m.name, m.uid)} alt="Avatar" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-black text-slate-900 uppercase italic leading-none truncate">{m.name}</p>
                          {m.studentId && (
                            <span className="bg-blue-600 text-[8px] font-black text-white px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
                              ID: {m.studentId}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">{m.email}</p>
                        <div className="flex items-center gap-2 mt-1 min-w-0">
                           <Route className="w-3 h-3 text-blue-500 shrink-0" />
                           <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest italic truncate">
                             {routes.find((rt: any) => rt.id === m.routeId)?.name || 'Needs Route'}
                             {m.pickupPointId && ` • ${assignModal.route?.pickupPoints?.find((p: any) => p.id === m.pickupPointId)?.name || '...'}`}
                           </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 border-t sm:border-t-0 pt-4 sm:pt-0">
                       {m.routeId === assignModal.route?.id ? (
                         <button 
                            onClick={() => assignMemberToRoute(m, null)}
                            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl text-rose-500 hover:bg-rose-50 border border-rose-100 transition-all shadow-sm group flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
                          >
                            <Link2Off className="w-4 h-4" />
                            <span>Unassign</span>
                          </button>
                       ) : (
                         <div className="flex items-center gap-2 w-full">
                           <div className="relative flex-1 sm:w-40">
                             <select 
                               className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3.5 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-blue-500/10 appearance-none pr-10"
                               id={`point-select-${m.id}`}
                             >
                               <option value="">Select Point</option>
                               {assignModal.route?.pickupPoints?.map((p: any) => (
                                 <option key={p.id} value={p.id}>{p.name}</option>
                               ))}
                             </select>
                             <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                           </div>
                           <button 
                              onClick={() => {
                                const sel = document.getElementById(`point-select-${m.id}`) as HTMLSelectElement;
                                if (!sel.value) return toast.error('Please select a pickup point');
                                assignMemberToRoute(m, assignModal.route?.id, sel.value);
                              }}
                              className="px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-600/10 transition-all active:scale-95 whitespace-nowrap"
                            >
                              Assign
                            </button>
                         </div>
                       )}
                    </div>
                  </div>
                </div>
              ))}
              {members.filter((m: any) => {
                const searchLower = assignSearch.toLowerCase();
                const matchesSearch = !assignSearch || 
                  m.name.toLowerCase().includes(searchLower) || 
                  m.email.toLowerCase().includes(searchLower) ||
                  (m.studentId && m.studentId.toLowerCase().includes(searchLower));
                const matchesClass = !assignClassFilter || m.classId === assignClassFilter;
                const matchesSection = !assignSectionFilter || m.section === assignSectionFilter;
                return matchesSearch && matchesClass && matchesSection;
              }).length === 0 && (
                <div className="text-center py-20 bg-slate-50/50 rounded-[2.5rem] border border-dashed border-slate-200">
                  <Users className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest italic opacity-50">Empty results directory</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 p-y-8">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[3rem] p-8 md:p-12 max-w-7xl w-full shadow-2xl border border-slate-100 overflow-y-auto max-h-[95vh] custom-scrollbar"
          >
            <div className="flex justify-between items-center mb-10">
               <div>
                 <h3 className="text-3xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Create Route</h3>
                 <p className="text-sm font-medium text-slate-400 mt-2">Pick stops on the map and choose a vehicle and driver</p>
               </div>
               <button onClick={() => setIsAddModalOpen(false)} className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-full transition-all hover:rotate-90">
                 <X className="w-6 h-6" />
               </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-8">
              {/* ROUTE SETTINGS */}
              <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  <div className="space-y-1.5 focus-within:z-10 relative">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Start Point</label>
                    <div className="relative">
                      <Navigation className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                      <input 
                        required 
                        type="text" 
                        value={newRoute.start} 
                        onChange={e => setNewRoute({...newRoute, start: e.target.value})} 
                        onBlur={async () => {
                          if (!newRoute.startCoord && newRoute.start) {
                            try {
                              const center = org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
                                ? org.location 
                                : { lat: 17.4504, lng: 78.3808 };
                              const left = center.lng - 1.0;
                              const right = center.lng + 1.0;
                              const top = center.lat + 1.0;
                              const bottom = center.lat - 1.0;
                              const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newRoute.start)}&limit=1&countrycodes=in&viewbox=${left},${top},${right},${bottom}`);
                              const data = await res.json();
                              if (data && data.length > 0) {
                                setNewRoute(prev => ({ ...prev, startCoord: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } }));
                              }
                            } catch (e) {}
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-12 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all" 
                        placeholder="Where it starts" 
                      />
                      <button
                        type="button"
                        onClick={() => setPickMode(pickMode === 'start' ? 'stop' : 'start')}
                        className={cn(
                          "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors flex items-center justify-center",
                          pickMode === 'start' 
                            ? "bg-rose-500 text-white shadow-md shadow-rose-500/15" 
                            : "text-slate-400 hover:text-rose-500 hover:bg-slate-50"
                        )}
                        title="Pick Start Point on Map"
                      >
                        <MapIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 focus-within:z-10 relative">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">End Point</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-500" />
                      <input 
                        required 
                        type="text" 
                        value={newRoute.end} 
                        onChange={e => setNewRoute({...newRoute, end: e.target.value})} 
                        onBlur={async () => {
                          if (!newRoute.endCoord && newRoute.end) {
                            try {
                              const center = org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
                                ? org.location 
                                : { lat: 17.4504, lng: 78.3808 };
                              const left = center.lng - 1.0;
                              const right = center.lng + 1.0;
                              const top = center.lat + 1.0;
                              const bottom = center.lat - 1.0;
                              const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newRoute.end)}&limit=1&countrycodes=in&viewbox=${left},${top},${right},${bottom}`);
                              const data = await res.json();
                              if (data && data.length > 0) {
                                setNewRoute(prev => ({ ...prev, endCoord: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } }));
                              }
                            } catch (e) {}
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-12 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all" 
                        placeholder="Where it ends" 
                      />
                      <button
                        type="button"
                        onClick={() => setPickMode(pickMode === 'end' ? 'stop' : 'end')}
                        className={cn(
                          "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors flex items-center justify-center",
                          pickMode === 'end' 
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/15" 
                            : "text-slate-400 hover:text-blue-500 hover:bg-slate-50"
                        )}
                        title="Pick End Point on Map"
                      >
                        <MapIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Select Vehicle</label>
                    <select required value={newRoute.vehicleId} onChange={e => setNewRoute({...newRoute, vehicleId: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 outline-none cursor-pointer">
                      <option value="">Choose Bus</option>
                      {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.plateNumber || "Unregistered Vehicle"}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5 flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Select Driver</label>
                    <select required value={newRoute.driverId} onChange={e => setNewRoute({...newRoute, driverId: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 outline-none cursor-pointer">
                      <option value="">Choose Driver</option>
                      {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2 lg:col-span-1 border-l-0 lg:border-l border-slate-100 lg:pl-6">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Route Details</label>
                    <input 
                      type="text"
                      value={newRoute.description} 
                      onChange={e => setNewRoute({...newRoute, description: e.target.value})} 
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 outline-none" 
                      placeholder="Optional notes..."
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-0">
                {/* MAP & STOPS WORKSPACE (LEFT) */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                  <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 flex-1 flex flex-col min-h-[600px] shadow-sm overflow-hidden">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 group">
                      <div className="w-full md:w-auto">
                        <h4 className="text-xl font-black text-slate-800 uppercase italic leading-none mb-2">Map & Stops</h4>
                        <div className="flex gap-2 w-full max-w-xl relative">
                          <div className="relative flex-1 group/search">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/search:text-blue-500 transition-colors" />
                            <input 
                              type="text" 
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSearchLocation();
                                }
                              }}
                              placeholder="Search location, address or area..."
                              className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-12 py-4 text-sm font-bold focus:ring-8 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all shadow-sm"
                            />
                            {searchQuery && (
                              <button 
                                type="button"
                                onClick={() => { setSearchQuery(''); setSuggestions([]); }}
                                className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-slate-900 transition-all"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {isSearching && (
                              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                            <AnimatePresence>
                              {suggestions.length > 0 && (
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                  className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[2rem] border border-slate-100 shadow-2xl z-[2000] overflow-hidden backdrop-blur-xl"
                                >
                                  {suggestions.map((s, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => handleSelectSuggestion(s)}
                                      className="w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors flex items-start gap-4 border-b border-slate-50 last:border-0 group/item"
                                    >
                                      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-300 group-hover/item:text-blue-500 group-hover/item:bg-blue-50 transition-colors shrink-0">
                                         <MapPin className="w-4 h-4" />
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex justify-between items-center gap-2 mb-1">
                                          <p className="text-[11px] font-black text-slate-900 uppercase italic leading-none">{s.display_name.split(',')[0]}</p>
                                          {s.address?.postcode && (
                                            <span className="text-[8px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-500">{s.address.postcode}</span>
                                          )}
                                        </div>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest line-clamp-1">{s.display_name.split(',').slice(1).join(',').trim()}</p>
                                      </div>
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-full border border-slate-200 shadow-sm self-end">
                        <div className={cn("w-2.5 h-2.5 rounded-full", newRoute.pickupPoints.length > 0 ? "bg-green-500 animate-pulse" : "bg-slate-300")}></div>
                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{newRoute.pickupPoints.length} Stops Added</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6 bg-white/60 p-4 rounded-[2rem] border border-white backdrop-blur shadow-sm">
                      <div className="col-span-12 md:col-span-4">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] pl-4 mb-2 block">Stop Name</label>
                        <input type="text" value={newPickupPoint.name} onChange={e => setNewPickupPoint({...newPickupPoint, name: e.target.value})} className="w-full bg-white border border-slate-100 rounded-xl px-5 py-3.5 text-xs font-black focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300" placeholder="e.g. Main Gate" />
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] pl-4 mb-2 block text-center">Stop Time</label>
                        <input type="time" value={newPickupPoint.time} onChange={e => setNewPickupPoint({...newPickupPoint, time: e.target.value})} className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3.5 text-sm font-black text-center focus:ring-4 focus:ring-blue-500/10 transition-all" />
                      </div>
                      <div className="col-span-12 md:col-span-4 grid grid-cols-2 gap-3">
                        <div className="relative group">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] text-center mb-2 block">Latitude</label>
                          <input type="text" value={newPickupPoint.lat} onChange={e => setNewPickupPoint({...newPickupPoint, lat: e.target.value})} className="w-full bg-white border border-slate-100 rounded-xl px-2 py-3.5 text-[10px] font-mono font-black text-center" placeholder="00.000" />
                        </div>
                        <div className="relative group">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] text-center mb-2 block">Longitude</label>
                          <input type="text" value={newPickupPoint.lng} onChange={e => setNewPickupPoint({...newPickupPoint, lng: e.target.value})} className="w-full bg-white border border-slate-100 rounded-xl px-2 py-3.5 text-[10px] font-mono font-black text-center" placeholder="00.000" />
                        </div>
                      </div>
                      <div className="col-span-12 md:col-span-1 flex items-end">
                        <button 
                          type="button" 
                          onClick={addPickupPoint} 
                          title={editingPickupPointId ? "Update Stop" : "Add Stop"}
                          className={cn(
                            "w-full h-[46px] text-white flex items-center justify-center rounded-xl transition-all shadow-xl active:scale-90",
                            editingPickupPointId ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20" : "bg-slate-900 hover:bg-blue-600 shadow-slate-900/10"
                          )}
                        >
                          {editingPickupPointId ? <CheckCircle className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="relative flex-1 rounded-[2.5rem] overflow-hidden border border-slate-200 bg-slate-100 h-[350px] lg:h-auto min-h-[300px]">
                      {pickMode !== 'stop' && (
                        <div className="absolute top-4 left-4 right-16 z-[3000] bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-6 py-3.5 rounded-2xl shadow-xl flex items-center justify-between animate-pulse">
                          <span>
                            {pickMode === 'start' ? '📍 Click map to pick Start Point' : '🏁 Click map to pick End Point'}
                          </span>
                          <button 
                            type="button" 
                            onClick={() => setPickMode('stop')}
                            className="bg-white/10 hover:bg-white/20 p-1.5 rounded-lg transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <MapComponent 
                        height="100%" 
                        zoom={14} 
                        onClick={handleMapClick}
                        center={sanitizeCenter(
                          isValidCoordinate(newPickupPoint.lat, newPickupPoint.lng) 
                            ? { lat: parseFloat(newPickupPoint.lat), lng: parseFloat(newPickupPoint.lng) }
                            : (newRoute.startCoord && isValidCoordinate(newRoute.startCoord.lat, newRoute.startCoord.lng)
                                ? { lat: parseFloat(newRoute.startCoord.lat), lng: parseFloat(newRoute.startCoord.lng) }
                                : (newRoute.pickupPoints.length > 0 && isValidCoordinate(newRoute.pickupPoints[newRoute.pickupPoints.length-1].lat, newRoute.pickupPoints[newRoute.pickupPoints.length-1].lng)
                                    ? { 
                                        lat: parseFloat(newRoute.pickupPoints[newRoute.pickupPoints.length-1].lat), 
                                        lng: parseFloat(newRoute.pickupPoints[newRoute.pickupPoints.length-1].lng) 
                                      } 
                                    : org?.location))
                        )}
                      >
                        {org?.location && isValidCoordinate(org.location.lat, org.location.lng) && (
                          <Marker 
                            key="creator-org-marker"
                            position={[org.location.lat, org.location.lng]} 
                            icon={createMarkerIcon(orgColor, orgIconUrl, orgColor, '')}
                          >
                            <Popup>
                              <div className="p-3 text-center">
                                <p className="text-[9px] font-black uppercase text-indigo-600 italic mb-1 tracking-widest">{org?.sector || 'Main Hub'}</p>
                                <p className="text-xs font-black text-slate-800 uppercase italic truncate max-w-[150px]">{org.name}</p>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                        {newRoute.startCoord && (!org?.location || Math.abs(newRoute.startCoord.lat - org.location.lat) >= 0.0001 || Math.abs(newRoute.startCoord.lng - org.location.lng) >= 0.0001) && (
                          <Marker 
                            key="creator-start-marker"
                            position={[newRoute.startCoord.lat, newRoute.startCoord.lng]} 
                            icon={createMarkerIcon('#f43f5e', 'https://img.icons8.com/fluency/50/marker.png', '#fb7185', '')}
                          >
                            <Popup>
                              <div className="p-3 text-center">
                                <p className="text-[9px] font-black uppercase text-rose-500 italic mb-1 tracking-widest">Starting Terminal</p>
                                <p className="text-xs font-black text-slate-800 uppercase italic truncate max-w-[150px]">{newRoute.start || 'Start'}</p>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                        {newRoute.endCoord && (!org?.location || Math.abs(newRoute.endCoord.lat - org.location.lat) >= 0.0001 || Math.abs(newRoute.endCoord.lng - org.location.lng) >= 0.0001) && (
                          <Marker 
                            key="creator-end-marker"
                            position={[newRoute.endCoord.lat, newRoute.endCoord.lng]} 
                            icon={createMarkerIcon('#3b82f6', 'https://img.icons8.com/fluency/50/marker.png', '#60a5fa', '')}
                          >
                            <Popup>
                              <div className="p-3 text-center">
                                <p className="text-[9px] font-black uppercase text-rose-500 italic mb-1 tracking-widest">Arrival Terminal</p>
                                <p className="text-xs font-black text-slate-800 uppercase italic truncate max-w-[150px]">{newRoute.end || 'End'}</p>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                        {newRoute.pickupPoints.map((p: any) => p.lat !== null && p.lng !== null && isValidCoordinate(p.lat, p.lng) && (
                          <Marker key={p.id} position={[parseFloat(p.lat), parseFloat(p.lng)]} icon={createMarkerIcon('#10b981', 'https://img.icons8.com/fluency/50/bus-stop.png', '#34d399', '')}>
                            <Popup>
                              <div className="p-3 min-w-[140px] text-center">
                                <p className="text-[9px] font-black uppercase text-blue-600 mb-1 border-b border-blue-50 pb-1 tracking-widest">{p.time}</p>
                                <p className="text-xs font-black text-slate-800 uppercase italic leading-tight">{p.name}</p>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                        {isValidCoordinate(newPickupPoint.lat, newPickupPoint.lng) && (
                          <Marker 
                            key="creator-newpickup-marker"
                            position={[parseFloat(newPickupPoint.lat), parseFloat(newPickupPoint.lng)]} 
                            icon={createMarkerIcon('#f59e0b', 'https://img.icons8.com/fluency/50/bus-stop.png', '#fbbf24', '')}
                          >
                            <Popup>
                              <div className="p-3 text-center">
                                <p className="text-[9px] font-black uppercase text-amber-500 italic mb-1 tracking-widest">New Selection</p>
                                <p className="text-xs font-black text-slate-800 uppercase italic">{newPickupPoint.name || 'Set Stop Name'}</p>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                      </MapComponent>
                    </div>
                  </div>
                </div>

                {/* STOPS LIST (RIGHT) */}
                <div className="lg:col-span-4 flex flex-col bg-slate-50 p-8 rounded-[3.5rem] border border-slate-100 shadow-sm max-h-[800px]">
                  <div className="flex items-center justify-between mb-8">
                     <div>
                        <h4 className="text-xl font-black text-slate-900 uppercase italic leading-none mb-1">Stops List</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-60">Sequence of stops</p>
                     </div>
                     <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-xl shadow-blue-500/5">
                        <Activity className="w-6 h-6 animate-pulse" />
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-3 space-y-3 custom-scrollbar">
                    {newRoute.pickupPoints.map((p: any, idx: number) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={p.id} 
                        className="group relative bg-white border border-slate-100 p-4 rounded-2xl hover:border-blue-400 transition-all shadow-sm hover:shadow-md"
                      >
                         <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-blue-500 rounded-r-full opacity-0 group-hover:opacity-100 transition-all"></div>
                         <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0 flex items-center gap-3">
                               <div className="shrink-0 flex flex-col items-center">
                                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100/50 leading-none mb-1">{p.time}</span>
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                               </div>
                               <div className="min-w-0 flex-1">
                                  <span className="text-xs font-black text-slate-800 uppercase italic truncate block leading-tight">{p.name}</span>
                                  {(p.lat !== null && p.lng !== null) && (
                                    <div className="flex items-center gap-1.5 mt-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                        <MapIcon className="w-2.5 h-2.5 text-blue-500" />
                                        <span className="text-[8px] font-mono font-bold text-slate-400">{typeof p.lat === 'number' ? p.lat.toFixed(4) : p.lat}, {typeof p.lng === 'number' ? p.lng.toFixed(4) : p.lng}</span>
                                    </div>
                                  )}
                               </div>
                            </div>
                            <div className="flex gap-0.5 shrink-0">
                                <button type="button" onClick={() => startEditPickupPoint(p)} className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all" title="Edit Stop">
                                   <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" onClick={() => removePickupPoint(p.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-rose-50 rounded-xl transition-all" title="Remove Stop">
                                   <Trash2 className="w-3.5 h-3.5" />
                                </button>
                             </div>
                         </div>
                      </motion.div>
                    ))}
                    {newRoute.pickupPoints.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center py-20 bg-white/40 rounded-[2.5rem] border-2 border-dashed border-slate-100 italic">
                        <Navigation className="w-12 h-12 text-slate-100 mb-4" />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] text-center max-w-[140px]">No sequence nodes registered via interface</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* FORM ACTIONS */}
              <div className="flex justify-end gap-3 pt-8 border-t border-slate-100">
                 <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-all">Cancel</button>
                 <button type="submit" className="px-12 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-600 active:scale-95 transition-all flex items-center gap-3 group">
                    Save Route <CheckCircle className="w-4 h-4" />
                 </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {isEditModalOpen && editingRoute && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 p-y-8">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[3rem] p-8 md:p-12 max-w-7xl w-full shadow-2xl border border-slate-100 overflow-y-auto max-h-[95vh] custom-scrollbar"
          >
            <div className="flex justify-between items-center mb-10">
               <div>
                 <h3 className="text-3xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Edit Route</h3>
                 <p className="text-sm font-medium text-slate-400 mt-2">Adjust stops on the map and route configuration</p>
               </div>
               <button onClick={() => { setIsEditModalOpen(false); setEditingRoute(null); }} className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-full transition-all hover:rotate-90">
                 <X className="w-6 h-6" />
               </button>
            </div>

            <form onSubmit={handleEdit} className="space-y-8">
              <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  <div className="space-y-1.5 focus-within:z-10 relative">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Route Name</label>
                    <input 
                      required 
                      type="text" 
                      value={editingRoute.name} 
                      onChange={e => setEditingRoute({...editingRoute, name: e.target.value})} 
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all" 
                    />
                  </div>
                  <div className="space-y-1.5 focus-within:z-10 relative">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Start Point</label>
                    <div className="relative">
                      <Navigation className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                      <input 
                        required 
                        type="text" 
                        value={editingRoute.start} 
                        onChange={e => setEditingRoute({...editingRoute, start: e.target.value})} 
                        onBlur={async () => {
                          if (!editingRoute.startCoord && editingRoute.start) {
                            try {
                              const center = org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
                                ? org.location 
                                : { lat: 17.4504, lng: 78.3808 };
                              const left = center.lng - 1.0;
                              const right = center.lng + 1.0;
                              const top = center.lat + 1.0;
                              const bottom = center.lat - 1.0;
                              const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(editingRoute.start)}&limit=1&countrycodes=in&viewbox=${left},${top},${right},${bottom}`);
                              const data = await res.json();
                              if (data && data.length > 0) {
                                setEditingRoute((prev: any) => ({ ...prev, startCoord: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } }));
                              }
                            } catch (e) {}
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-12 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all" 
                      />
                      <button
                        type="button"
                        onClick={() => setPickMode(pickMode === 'start' ? 'stop' : 'start')}
                        className={cn(
                          "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors flex items-center justify-center",
                          pickMode === 'start' 
                            ? "bg-rose-500 text-white shadow-md shadow-rose-500/15" 
                            : "text-slate-400 hover:text-rose-500 hover:bg-slate-50"
                        )}
                        title="Pick Start Point on Map"
                      >
                        <MapIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 focus-within:z-10 relative">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">End Point</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-500" />
                      <input 
                        required 
                        type="text" 
                        value={editingRoute.end} 
                        onChange={e => setEditingRoute({...editingRoute, end: e.target.value})} 
                        onBlur={async () => {
                          if (!editingRoute.endCoord && editingRoute.end) {
                            try {
                              const center = org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
                                ? org.location 
                                : { lat: 17.4504, lng: 78.3808 };
                              const left = center.lng - 1.0;
                              const right = center.lng + 1.0;
                              const top = center.lat + 1.0;
                              const bottom = center.lat - 1.0;
                              const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(editingRoute.end)}&limit=1&countrycodes=in&viewbox=${left},${top},${right},${bottom}`);
                              const data = await res.json();
                              if (data && data.length > 0) {
                                setEditingRoute((prev: any) => ({ ...prev, endCoord: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } }));
                              }
                            } catch (e) {}
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-12 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all" 
                      />
                      <button
                        type="button"
                        onClick={() => setPickMode(pickMode === 'end' ? 'stop' : 'end')}
                        className={cn(
                          "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors flex items-center justify-center",
                          pickMode === 'end' 
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/15" 
                            : "text-slate-400 hover:text-blue-500 hover:bg-slate-50"
                        )}
                        title="Pick End Point on Map"
                      >
                        <MapIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Select Vehicle</label>
                    <select required value={editingRoute.vehicleId} onChange={e => setEditingRoute({...editingRoute, vehicleId: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 outline-none cursor-pointer">
                      <option value="">NA</option>
                      {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.plateNumber || "Unregistered Vehicle"}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5 flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Select Driver</label>
                    <select required value={editingRoute.driverId} onChange={e => setEditingRoute({...editingRoute, driverId: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 outline-none cursor-pointer">
                      <option value="">NA</option>
                      {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-0">
                <div className="lg:col-span-8 flex flex-col gap-6">
                  <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 flex-1 flex flex-col min-h-[600px] shadow-sm overflow-hidden">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 group">
                      <div className="w-full md:w-auto">
                        <h4 className="text-xl font-black text-slate-800 uppercase italic leading-none mb-2">Map & Stops</h4>
                        <div className="flex gap-2 w-full max-w-xl relative">
                          <div className="relative flex-1 group/search">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/search:text-blue-500 transition-colors" />
                            <input 
                              type="text" 
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSearchLocation();
                                }
                              }}
                              placeholder="Search location, address or area..."
                              className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-12 py-4 text-sm font-bold focus:ring-8 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all shadow-sm"
                            />
                            {searchQuery && (
                              <button 
                                type="button"
                                onClick={() => { setSearchQuery(''); setSuggestions([]); }}
                                className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-slate-900 transition-all"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {isSearching && (
                              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                            <AnimatePresence>
                              {suggestions.length > 0 && (
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                  className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[2rem] border border-slate-100 shadow-2xl z-[2100] overflow-hidden backdrop-blur-xl"
                                >
                                  {suggestions.map((s, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => handleSelectSuggestion(s)}
                                      className="w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors flex items-start gap-4 border-b border-slate-50 last:border-0 group/item"
                                    >
                                      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-300 group-hover/item:text-blue-500 group-hover/item:bg-blue-50 transition-colors shrink-0">
                                         <MapPin className="w-4 h-4" />
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex justify-between items-center gap-2 mb-1">
                                          <p className="text-[11px] font-black text-slate-900 uppercase italic leading-none">{s.display_name.split(',')[0]}</p>
                                          {s.address?.postcode && (
                                            <span className="text-[8px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-500">{s.address.postcode}</span>
                                          )}
                                        </div>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest line-clamp-1">{s.display_name.split(',').slice(1).join(',').trim()}</p>
                                      </div>
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-full border border-slate-200 shadow-sm self-end">
                        <div className={cn("w-2.5 h-2.5 rounded-full", (editingRoute.pickupPoints?.length || 0) > 0 ? "bg-green-500 animate-pulse" : "bg-slate-300")}></div>
                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{editingRoute.pickupPoints?.length || 0} Stops Configured</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6 bg-white/60 p-4 rounded-[2rem] border border-white backdrop-blur shadow-sm">
                      <div className="col-span-12 md:col-span-4">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] pl-4 mb-2 block">Stop Name</label>
                        <input type="text" value={newPickupPoint.name} onChange={e => setNewPickupPoint({...newPickupPoint, name: e.target.value})} className="w-full bg-white border border-slate-100 rounded-xl px-5 py-3.5 text-xs font-black" placeholder="Point name" />
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] pl-4 mb-2 block text-center">Stop Time</label>
                        <input type="time" value={newPickupPoint.time} onChange={e => setNewPickupPoint({...newPickupPoint, time: e.target.value})} className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3.5 text-sm font-black text-center" />
                      </div>
                      <div className="col-span-12 md:col-span-4 grid grid-cols-2 gap-3">
                        <input type="text" value={newPickupPoint.lat} onChange={e => setNewPickupPoint({...newPickupPoint, lat: e.target.value})} className="w-full bg-white border border-slate-100 rounded-xl px-2 py-3.5 text-[10px] font-mono font-black text-center" placeholder="Lat" />
                        <input type="text" value={newPickupPoint.lng} onChange={e => setNewPickupPoint({...newPickupPoint, lng: e.target.value})} className="w-full bg-white border border-slate-100 rounded-xl px-2 py-3.5 text-[10px] font-mono font-black text-center" placeholder="Lng" />
                      </div>
                      <div className="col-span-12 md:col-span-1 flex items-end">
                        <button 
                          type="button" 
                          onClick={addPickupPoint}
                          title={editingPickupPointId ? "Update Stop" : "Add Stop"}
                          className={cn(
                            "w-full h-[46px] text-white flex items-center justify-center rounded-xl transition-all shadow-xl active:scale-90",
                            editingPickupPointId ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20" : "bg-slate-900 hover:bg-blue-600 shadow-slate-900/10"
                          )}
                        >
                          {editingPickupPointId ? <CheckCircle className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="relative flex-1 rounded-[2.5rem] overflow-hidden border border-slate-200 bg-slate-100 h-[350px] lg:h-auto min-h-[300px]">
                      {pickMode !== 'stop' && (
                        <div className="absolute top-4 left-4 right-16 z-[3000] bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-6 py-3.5 rounded-2xl shadow-xl flex items-center justify-between animate-pulse">
                          <span>
                            {pickMode === 'start' ? '📍 Click map to pick Start Point' : '🏁 Click map to pick End Point'}
                          </span>
                          <button 
                            type="button" 
                            onClick={() => setPickMode('stop')}
                            className="bg-white/10 hover:bg-white/20 p-1.5 rounded-lg transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <MapComponent 
                        height="100%" 
                        zoom={14} 
                        onClick={handleMapClick}
                        center={sanitizeCenter(
                          isValidCoordinate(newPickupPoint.lat, newPickupPoint.lng) 
                            ? { lat: parseFloat(newPickupPoint.lat), lng: parseFloat(newPickupPoint.lng) }
                            : (editingRoute.startCoord && isValidCoordinate(editingRoute.startCoord.lat, editingRoute.startCoord.lng)
                                ? { lat: parseFloat(editingRoute.startCoord.lat), lng: parseFloat(editingRoute.startCoord.lng) }
                                : (editingRoute.pickupPoints?.length > 0 && isValidCoordinate(editingRoute.pickupPoints[editingRoute.pickupPoints.length-1].lat, editingRoute.pickupPoints[editingRoute.pickupPoints.length-1].lng)
                                    ? { 
                                        lat: parseFloat(editingRoute.pickupPoints[editingRoute.pickupPoints.length-1].lat), 
                                        lng: parseFloat(editingRoute.pickupPoints[editingRoute.pickupPoints.length-1].lng) 
                                      } 
                                    : org?.location))
                        )}
                      >
                        {org?.location && isValidCoordinate(org.location.lat, org.location.lng) && (
                          <Marker 
                            key="editor-org-marker"
                            position={[org.location.lat, org.location.lng]} 
                            icon={createMarkerIcon(orgColor, orgIconUrl, orgColor, '')}
                          >
                            <Popup>
                              <div className="p-3 text-center">
                                <p className="text-[9px] font-black uppercase text-indigo-600 italic mb-1 tracking-widest">{org?.sector || 'Main Hub'}</p>
                                <p className="text-xs font-black text-slate-800 uppercase italic truncate max-w-[150px]">{org.name}</p>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                        {editingRoute.startCoord && (!org?.location || Math.abs(editingRoute.startCoord.lat - org.location.lat) >= 0.0001 || Math.abs(editingRoute.startCoord.lng - org.location.lng) >= 0.0001) && (
                          <Marker 
                            key="editor-start-marker"
                            position={[editingRoute.startCoord.lat, editingRoute.startCoord.lng]} 
                            icon={createMarkerIcon('#f43f5e', 'https://img.icons8.com/fluency/50/marker.png', '#fb7185', '')}
                          >
                            <Popup><div className="p-2 text-xs font-bold uppercase">{editingRoute.start || 'Start'}</div></Popup>
                          </Marker>
                        )}
                        {editingRoute.endCoord && (!org?.location || Math.abs(editingRoute.endCoord.lat - org.location.lat) >= 0.0001 || Math.abs(editingRoute.endCoord.lng - org.location.lng) >= 0.0001) && (
                          <Marker 
                            key="editor-end-marker"
                            position={[editingRoute.endCoord.lat, editingRoute.endCoord.lng]} 
                            icon={createMarkerIcon('#3b82f6', 'https://img.icons8.com/fluency/50/marker.png', '#60a5fa', '')}
                          >
                            <Popup><div className="p-2 text-xs font-bold uppercase">{editingRoute.end || 'End'}</div></Popup>
                          </Marker>
                        )}
                        {editingRoute.pickupPoints?.map((p: any) => p.lat !== null && p.lng !== null && isValidCoordinate(p.lat, p.lng) && (
                          <Marker key={p.id} position={[parseFloat(p.lat), parseFloat(p.lng)]} icon={createMarkerIcon('#10b981', 'https://img.icons8.com/fluency/50/bus-stop.png', '#34d399', '')}>
                            <Popup><div className="p-2 text-xs font-bold uppercase">{p.time} - {p.name}</div></Popup>
                          </Marker>
                        ))}
                        {isValidCoordinate(newPickupPoint.lat, newPickupPoint.lng) && (
                          <Marker 
                            key="editor-newpickup-marker"
                            position={[parseFloat(newPickupPoint.lat), parseFloat(newPickupPoint.lng)]} 
                            icon={createMarkerIcon('#f59e0b', 'https://img.icons8.com/fluency/50/bus-stop.png', '#fbbf24', '')}
                          >
                            <Popup>
                              <div className="p-3 text-center">
                                <p className="text-[9px] font-black uppercase text-amber-500 italic mb-1 tracking-widest">New Selection</p>
                                <p className="text-xs font-black text-slate-800 uppercase italic">{newPickupPoint.name || 'Set Stop Name'}</p>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                      </MapComponent>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 flex flex-col bg-slate-50 p-8 rounded-[3.5rem] border border-slate-100 shadow-sm max-h-[800px]">
                  <h4 className="text-xl font-black text-slate-900 uppercase italic leading-none mb-8">Stops List</h4>

                  <div className="flex-1 overflow-y-auto pr-3 space-y-3 custom-scrollbar">
                    {editingRoute.pickupPoints?.map((p: any, idx: number) => (
                      <div key={p.id} className="group relative bg-white border border-slate-100 p-4 rounded-2xl hover:border-blue-400 transition-all shadow-sm">
                         <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full opacity-0 group-hover:opacity-100 transition-all"></div>
                         <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0 flex items-center gap-3">
                               <div className="shrink-0 flex flex-col items-center">
                                  <span className="text-[9px] font-black text-blue-600 leading-none mb-1">{p.time}</span>
                                  <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                               </div>
                               <div className="min-w-0 flex-1">
                                  <span className="text-[11px] font-black text-slate-900 uppercase italic truncate block leading-none">{p.name}</span>
                               </div>
                            </div>
                            <div className="flex gap-0.5 shrink-0">
                               <button type="button" onClick={() => startEditPickupPoint(p)} className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all" title="Edit Stop">
                                  <Edit2 className="w-3.5 h-3.5" />
                               </button>
                               <button type="button" onClick={() => removePickupPoint(p.id)} className="p-2 text-slate-300 hover:text-red-500 transition-all" title="Remove Stop">
                                  <Trash2 className="w-3.5 h-3.5" />
                               </button>
                            </div>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-8 border-t border-slate-100">
                 <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingRoute(null); }} className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-all">Cancel</button>
                 <button type="submit" className="px-12 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-600 active:scale-95 transition-all flex items-center gap-3 group">
                    Update Route <CheckCircle className="w-4 h-4" />
                 </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {viewingRoutePoints && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[3rem] p-10 max-w-lg w-full shadow-2xl border border-slate-100"
          >
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase italic">{viewingRoutePoints.name}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Full Stop Sequence</p>
              </div>
              <button 
                onClick={() => setViewingRoutePoints(null)} 
                className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-full transition-all hover:rotate-90"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar">
              {viewingRoutePoints.pickupPoints?.map((p: any, idx: number) => (
                <div key={p.id || idx} className="group relative flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-300 hover:shadow-sm transition-all">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full opacity-0 group-hover:opacity-100 transition-all"></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-sm font-black text-slate-900 uppercase italic leading-none truncate">{p.name}</p>
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md shrink-0 leading-none">{p.time}</span>
                    </div>
                    {p.lat && p.lng && (
                      <div className="flex items-center gap-1 opacity-40">
                         <MapIcon className="w-2.5 h-2.5 text-blue-500" />
                         <span className="text-[8px] font-mono font-bold text-slate-400">{parseFloat(p.lat).toFixed(4)}, {parseFloat(p.lng).toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <button 
              onClick={() => setViewingRoutePoints(null)}
              className="w-full mt-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-blue-600 active:scale-95 transition-all"
            >
              Close Stops View
            </button>
          </motion.div>
        </div>
      )}

      {routeToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
          >
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none uppercase italic mb-2">Delete Route?</h3>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                {routeToDelete.message}
              </p>
            </div>
            <div className="flex gap-4">
              <button 
                type="button" 
                onClick={() => setRouteToDelete(null)} 
                className="flex-1 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-colors font-black"
              >
                No, Keep
              </button>
              <button 
                type="button" 
                onClick={async () => {
                  try {
                    await saveMySQLRecord('delete', 'routes', routeToDelete.route.id);
                    toast.success('Route deleted successfully');
                    setRouteToDelete(null);
                    if (onRefresh) onRefresh();
                  } catch (e: any) {
                    toast.error(e.message || 'Delete failed');
                  }
                }} 
                className="flex-1 py-3.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-600/10 hover:bg-red-700 transition-all active:scale-95"
              >
                Yes, Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function LiveMap({ org, members, drivers = [], routes: allRoutes = [], vehicles: allVehicles = [], liveTrips = [], tripStatsData }: any) {
  const [activeTrips, setActiveTrips] = useState<any[]>(liveTrips);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(new URLSearchParams(window.location.search).get('tripId'));
  const [loading, setLoading] = useState(liveTrips.length === 0);
  const [sidebarOpen, setSidebarOpen] = useState(true); // Toggle for mobile view
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('list');

  useEffect(() => {
    if (selectedTripId) {
      setViewMode('map');
    } else {
      setViewMode('list');
    }
  }, [selectedTripId]);
  
  const [roadCoords, setRoadCoords] = useState<[number, number][]>([]);
  const lastFetchedCoordsRef = useRef<string>('');
  const [focusedLocation, setFocusedLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>({});

  const toggleStopExpand = (e: React.MouseEvent, stopId: string) => {
    e.stopPropagation(); // Prevent triggering focus/map change
    setExpandedStops(prev => ({ ...prev, [stopId]: !prev[stopId] }));
  };

  const filteredActiveTrips = useMemo(() => {
    if (!searchQuery.trim()) return activeTrips;
    const q = searchQuery.toLowerCase().trim();
    return activeTrips.filter(trip => {
      const vehicle = allVehicles.find((v: any) => v.id === trip.vehicleId);
      const route = allRoutes.find((r: any) => r.id === trip.routeId);
      const driver = drivers.find((d: any) => d.uid === trip.driverId);
      
      const vMatch = vehicle?.plateNumber?.toLowerCase().includes(q) || false;
      const rMatch = route?.name?.toLowerCase().includes(q) || false;
      const dMatch = driver?.name?.toLowerCase().includes(q) || false;
      const mMatch = driver?.mobile?.toLowerCase().includes(q) || false;
      
      return vMatch || rMatch || dMatch || mMatch;
    });
  }, [activeTrips, searchQuery, allVehicles, allRoutes, drivers]);

  const selectedTripRaw = activeTrips.find(t => t.id === selectedTripId);
  const selectedTrip = useMemo(() => {
    if (!selectedTripRaw) return null;

    const isToday = (dateField: any) => {
      if (!dateField) return false;
      try {
        const d = dateField.toDate ? dateField.toDate() : new Date(dateField);
        const today = new Date();
        return d.getDate() === today.getDate() &&
               d.getMonth() === today.getMonth() &&
               d.getFullYear() === today.getFullYear();
      } catch (e) {
        return false;
      }
    };

    let baseManifest = selectedTripRaw.manifest || [];
    
    // Fallback: If no manifest is saved in trip record (e.g., started on mobile),
    // build one dynamically from the route passengers in members state.
    if (baseManifest.length === 0 && selectedTripRaw.routeId) {
      const routeMembers = members?.filter((u: any) => u.routeId === selectedTripRaw.routeId) || [];
      baseManifest = routeMembers.map((m: any) => ({
        id: m.id || m.uid,
        uid: m.uid || m.id,
        name: m.name,
        pickupPointId: m.pickupPointId,
        stopId: m.pickupPointId
      }));
    }

    if (selectedTripRaw.status === 'completed') {
      const formattedManifest = baseManifest.map((m: any) => ({
        ...m,
        id: m.id || m.uid,
        uid: m.uid || m.id,
        stopId: m.pickupPointId || m.stopId
      }));
      return {
        ...selectedTripRaw,
        manifest: formattedManifest
      };
    }

    const mappedManifest = baseManifest.map((m: any) => {
      const liveMember = members?.find((u: any) => u.id === m.id || u.uid === m.id || u.id === m.uid || u.uid === m.uid);
      if (liveMember) {
        const pStatus = liveMember.pickupStatus || 'waiting';
        const pUpdated = liveMember.pickupUpdatedAt;
        const finalPickupStatus = (pStatus !== 'waiting' && pUpdated && isToday(pUpdated)) ? pStatus : 'waiting';

        const dStatus = liveMember.dropoffStatus || 'waiting';
        const dUpdated = liveMember.dropoffUpdatedAt;
        const finalDropoffStatus = (dStatus !== 'waiting' && dUpdated && isToday(dUpdated)) ? dStatus : 'waiting';

        const gStatus = liveMember.status || 'waiting';
        const gUpdated = liveMember.statusUpdatedAt || liveMember.pickedAt;
        const finalStatus = (gStatus !== 'waiting' && gUpdated && isToday(gUpdated)) ? gStatus : 'waiting';

        return {
          ...m,
          name: liveMember.name || m.name,
          pickupPointId: liveMember.pickupPointId || m.pickupPointId,
          stopId: liveMember.pickupPointId || m.stopId || pStatus,
          pickupStatus: finalPickupStatus,
          dropoffStatus: finalDropoffStatus,
          status: finalStatus
        };
      }
      return {
        ...m,
        pickupStatus: m.pickupStatus || 'waiting',
        dropoffStatus: m.dropoffStatus || 'waiting',
        status: m.status || 'waiting'
      };
    });

    return {
      ...selectedTripRaw,
      manifest: mappedManifest
    };
  }, [selectedTripRaw, members]);

  const selectedRoute = allRoutes.find((r: any) => r.id === (selectedTrip?.routeId || selectedTrip?.id));
  const selectedVehicle = allVehicles.find((v: any) => v.id === selectedTrip?.vehicleId);

  const getStopStatus = (stopId: string, trip: any) => {
    if (!trip) return 'pending';
    
    // Check if all members of this stop are handled or not
    const stopMembers = trip.manifest?.filter((m: any) => m.stopId === stopId || m.pickupPointId === stopId) || [];
    
    const direction = trip.direction || 'pickup';
    const isHandled = (u: any, dir: 'pickup' | 'dropoff') => {
      const status = dir === 'dropoff' ? u.dropoffStatus : u.pickupStatus;
      return status === 'picked' || status === 'dropped' || status === 'absent';
    };

    const isHandledStop = stopMembers.length > 0 && stopMembers.every((m: any) => isHandled(m, direction));

    if (isHandledStop) {
      return 'completed';
    }

    // Identify if this is the nearest non-completed stop (current)
    if (selectedRoute?.pickupPoints) {
      const busLoc = selectedVehicle?.location || trip.location;
      if (busLoc && isValidCoordinate(busLoc.lat, busLoc.lng)) {
        // Find all non-completed points
        const nonCompletedPoints = (selectedRoute.pickupPoints || []).filter((p: any) => {
          const pMembers = trip.manifest?.filter((m: any) => m.stopId === p.id || m.pickupPointId === p.id) || [];
          return !(pMembers.length > 0 && pMembers.every((m: any) => isHandled(m, direction)));
        });

        // Find the one closest to the bus location
        let nearestId = null;
        let minDistance = Infinity;
        nonCompletedPoints.forEach((p: any) => {
          const lat = parseFloat(p.lat);
          const lng = parseFloat(p.lng);
          if (isValidCoordinate(lat, lng)) {
            const dist = getDistance(busLoc.lat, busLoc.lng, lat, lng);
            if (dist < minDistance) {
              minDistance = dist;
              nearestId = p.id;
            }
          }
        });

        if (nearestId === stopId) {
          return 'current';
        }
      }
    }

    const currentStopId = trip.currentStopId;
    if (currentStopId === stopId) {
      return 'current';
    }

    return 'pending';
  };

  const activeNextStop = useMemo(() => {
    if (!selectedTrip || !selectedRoute) return null;
    const busLoc = selectedVehicle?.location || selectedTrip.location;
    const direction = selectedTrip?.direction || 'pickup';

    const sortedPoints = [...(selectedRoute.pickupPoints || [])]
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    
    // Filter non-completed points
    const pendingPoints = sortedPoints.filter((p: any) => {
      const pMembers = selectedTrip.manifest?.filter((m: any) => m.stopId === p.id || m.pickupPointId === p.id) || [];
      const isHandled = (u: any, dir: 'pickup' | 'dropoff') => {
        const status = dir === 'dropoff' ? u.dropoffStatus : u.pickupStatus;
        return status === 'picked' || status === 'dropped' || status === 'absent';
      };
      const isHandledStop = pMembers.length > 0 && pMembers.every((m: any) => isHandled(m, direction));
      return !isHandledStop;
    });

    if (pendingPoints.length === 0) {
      return { id: 'ORG', name: org?.name || 'Organization', lat: org?.location?.lat, lng: org?.location?.lng };
    }

    // Find the nearest non-completed stop to the bus's current location!
    if (busLoc && isValidCoordinate(busLoc.lat, busLoc.lng)) {
      let nearestStop = pendingPoints[0];
      let minDistance = Infinity;
      pendingPoints.forEach((p: any) => {
        const lat = parseFloat(p.lat);
        const lng = parseFloat(p.lng);
        if (isValidCoordinate(lat, lng)) {
          const dist = getDistance(busLoc.lat, busLoc.lng, lat, lng);
          if (dist < minDistance) {
            minDistance = dist;
            nearestStop = p;
          }
        }
      });
      if (nearestStop) {
        return { id: nearestStop.id, name: nearestStop.name, lat: parseFloat(nearestStop.lat), lng: parseFloat(nearestStop.lng) };
      }
    }

    const firstPending = pendingPoints[0];
    if (firstPending) {
      return { id: firstPending.id, name: firstPending.name, lat: parseFloat(firstPending.lat), lng: parseFloat(firstPending.lng) };
    }
    return { id: 'ORG', name: org?.name || 'Organization', lat: org?.location?.lat, lng: org?.location?.lng };
  }, [selectedTrip, selectedRoute, selectedVehicle?.location, org, members]);

  const [nextStopStats, setNextStopStats] = useState<{ eta: string; distance: string }>({ eta: 'Calculating...', distance: '-- KM' });

  useEffect(() => {
    if (!selectedTrip || !activeNextStop) {
      setNextStopStats({ eta: '--', distance: '--' });
      return;
    }

    const busLoc = selectedVehicle?.location || selectedTrip.location;
    if (!busLoc || !isValidCoordinate(busLoc.lat, busLoc.lng) || !isValidCoordinate(activeNextStop.lat, activeNextStop.lng)) {
      setNextStopStats({ eta: '--', distance: '--' });
      return;
    }

    // 1. Initial / Fallback Estimate
    const dist = getDistance(busLoc.lat, busLoc.lng, activeNextStop.lat, activeNextStop.lng);
    const fallbackStats = {
      distance: `${dist.toFixed(1)} KM`,
      eta: `${Math.max(1, Math.round(dist * 2.5))} MINS`
    };
    setNextStopStats(fallbackStats);

    // 2. Fetch OSRM accurate route stats
    let active = true;
    const fetchStats = async () => {
      try {
        const coords = `${String(busLoc.lng)},${String(busLoc.lat)};${String(activeNextStop.lng)},${String(activeNextStop.lat)}`;
        const urls = [
          `/api/proxy/osrm/route/v1/driving/${coords}?overview=false`,
          `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`,
          `https://osrm.routing.expert/route/v1/driving/${coords}?overview=false`
        ];

        for (const url of urls) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            if (active && data.code === 'Ok' && data.routes?.[0]) {
              const r = data.routes[0];
              setNextStopStats({
                eta: `${Math.max(1, Math.round(r.duration / 60))} MINS`,
                distance: `${(r.distance / 1000).toFixed(1)} KM`
              });
              return;
            }
          } catch (e) {
            console.warn("OSRM error in fetchStats:", e);
          }
        }
      } catch (err) {
        console.warn("Failed fetching next stop OSRM stats:", err);
      }
    };

    fetchStats();
    return () => {
      active = false;
    };
  }, [selectedTripId, activeNextStop, selectedVehicle?.location]);

  const orderedNavigationStops = useMemo(() => {
    if (!selectedTrip || !selectedRoute) return [];

    const busLoc = selectedVehicle?.location || selectedTrip.location;
    if (!busLoc || !isValidCoordinate(busLoc.lat, busLoc.lng)) return [];

    const stops: [number, number][] = [];
    // Always start at Bus Location
    stops.push([busLoc.lat, busLoc.lng]);

    if (activeNextStop && isValidCoordinate(activeNextStop.lat, activeNextStop.lng)) {
      stops.push([activeNextStop.lat, activeNextStop.lng]);
    }

    return stops;
  }, [selectedTrip, selectedRoute, selectedVehicle?.location, activeNextStop]);

  const mapBounds = useMemo(() => {
    if (focusedLocation) return undefined;
    if (orderedNavigationStops.length < 2) return undefined;
    return orderedNavigationStops;
  }, [orderedNavigationStops, focusedLocation]);

  useEffect(() => {
    setFocusedLocation(null);
    setFocusedStopId(null);
    setRoadCoords([]);
    lastFetchedCoordsRef.current = '';
  }, [selectedTripId]);

  useEffect(() => {
    if (orderedNavigationStops.length < 2) {
      setRoadCoords([]);
      return;
    }

    const coordinates = orderedNavigationStops.map(s => `${s[1]},${s[0]}`).join(';');
    if (lastFetchedCoordsRef.current === coordinates) return;
    lastFetchedCoordsRef.current = coordinates;

    const fetchRoadPath = async () => {
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
          console.warn(`Failed fetching OSRM road path from ${url}`, err);
        }
      }

      // If all three API endpoints failed, fall back to straight line stops
      setRoadCoords(orderedNavigationStops);
    };

    fetchRoadPath();
  }, [orderedNavigationStops]);

  useEffect(() => {
    setActiveTrips(liveTrips);
    setLoading(false);
  }, [liveTrips]);

  const tripStats = tripStatsData || {};

  const getTripStats = (tripId: string, lat1: number, lon1: number, lat2: number, lon2: number) => {
    if (tripStats[tripId]) return tripStats[tripId];
    if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) return { distance: '-- KM', eta: '-- MINS' };
    const dist = getDistance(lat1, lon1, lat2, lon2);
    return {
      distance: `${dist.toFixed(1)} KM`,
      eta: `${Math.max(1, Math.round(dist * 2.5))} MINS`
    };
  };

  const isEducation = org?.sector === 'Education';
  const isCollege = org?.eduType === 'College' || (!org?.eduType && (org?.name?.toLowerCase().includes('college') || org?.name?.toLowerCase().includes('university')));
  const orgIconUrl = getLocalIcon(org?.logo || org?.logoUrl || (org?.sector === 'Education' ? (isCollege ? 'graduation-cap' : 'school') : (org?.sector === 'Healthcare' ? 'hospital' : (org?.sector === 'Government' ? 'museum' : 'commercial'))));
  const orgColor = isEducation ? (isCollege ? '#6366f1' : '#4f46e5') : '#0f172a';

  return (
    <div className="md:h-[calc(100vh-12rem)] flex flex-col gap-4 md:gap-6 animate-in fade-in duration-700 min-h-[600px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 gap-4">
        <div>
          <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-none mb-1 uppercase italic">Live Bus Locations</h3>
          <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time status of all running buses</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 md:px-4 md:py-2 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 flex items-center gap-2 shrink-0">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest">{activeTrips.length} Fleet Active</span>
          </div>
          <button 
            onClick={() => setSelectedTripId(null)}
            className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-slate-100 rounded-full text-slate-600 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
          >
            All Buses
          </button>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 bg-white border border-slate-100 rounded-xl text-slate-400"
          >
            {sidebarOpen ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile view segmented toggle button control */}
      <div className="lg:hidden flex bg-slate-100 p-1 rounded-2xl mx-2 border border-slate-200/50">
        <button
          onClick={() => setViewMode('list')}
          className={cn(
            "flex-1 py-2 text-center rounded-xl text-[10px] font-black uppercase tracking-wide transition-all",
            viewMode === 'list' 
              ? "bg-white text-slate-900 shadow-sm" 
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          Fleet List ({activeTrips.length})
        </button>
        <button
          onClick={() => setViewMode('map')}
          className={cn(
            "flex-1 py-2 text-center rounded-xl text-[10px] font-black uppercase tracking-wide transition-all",
            viewMode === 'map' 
              ? "bg-white text-slate-900 shadow-sm" 
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          Live Map
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 min-h-0 overflow-hidden relative">
        {/* Left Sidebar - Active Buses */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className={cn(
                "w-full lg:w-80 bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-xl lg:shadow-sm flex flex-col overflow-hidden shrink-0 relative lg:relative lg:h-full z-10 lg:z-0 order-2 lg:order-1",
                viewMode === 'list' ? "flex h-[450px]" : "hidden lg:flex"
              )}
            >
              <div className="p-4 md:p-6 border-b border-slate-50 bg-slate-50/30">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] italic">Active Fleet</h4>
                  <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400"><X size={16} /></button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search vehicle, route, driver..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-blue-500/30 transition-all placeholder:text-[9px]"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 md:space-y-3 scrollbar-hide">
                {selectedTripId ? (
                  <div className="space-y-4 animate-in slide-in-from-left duration-300">
                    <div className="flex justify-between items-center mb-4">
                      <button 
                        onClick={() => setSelectedTripId(null)}
                        className="flex items-center gap-2 text-blue-600 font-black text-[9px] uppercase tracking-widest hover:translate-x-[-4px] transition-transform"
                      >
                        <ArrowRight className="w-3 h-3 rotate-180" /> Back to Fleet List
                      </button>
                      
                      {focusedLocation && (
                        <button 
                          onClick={() => {
                            setFocusedLocation(null);
                            setFocusedStopId(null);
                          }}
                          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 font-black text-[8px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95 bg-slate-100 hover:bg-slate-200/80 px-2 py-1 rounded-lg"
                        >
                          <Navigation className="w-2 mx-0.5 h-2 rotate-45" /> Reset View
                        </button>
                      )}
                    </div>
                    
                    <div className="bg-slate-900 rounded-2xl p-4 text-white mb-4 shadow-lg shadow-slate-900/20 relative overflow-hidden">
                      <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-3">
                           <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-blue-400">
                              <Bus size={20} />
                           </div>
                           <div>
                              <h5 className="text-xs font-black italic uppercase leading-none mb-1">{selectedVehicle?.plateNumber || 'Unknown'}</h5>
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[120px]">{selectedRoute?.name}</p>
                           </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3 mt-3">
                           <div className="text-center">
                              <p className="text-[7px] font-black text-slate-500 uppercase mb-1 tracking-widest">Expected Arrival</p>
                              <p className="text-xs font-black text-blue-400 uppercase italic">
                                {nextStopStats.eta}
                              </p>
                           </div>
                           <div className="text-center border-l border-white/5">
                              <p className="text-[7px] font-black text-slate-500 uppercase mb-1 tracking-widest">Distance Left</p>
                              <p className="text-xs font-black text-white uppercase italic">
                                {nextStopStats.distance}
                              </p>
                           </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/5">
                           {(() => {
                              const driver = drivers.find((d: any) => d.uid === selectedTrip.driverId);
                              return driver ? (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                     <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center">
                                        <UserCircle size={14} className="text-slate-400" />
                                     </div>
                                     <p className="text-[9px] font-black uppercase text-slate-300">{driver.name}</p>
                                  </div>
                                  {driver.mobile && (
                                    <a href={`tel:${driver.mobile}`} className="bg-blue-600 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg shadow-lg active:scale-95 transition-all">
                                      Call Driver
                                    </a>
                                  )}
                                </div>
                              ) : null;
                           })()}
                        </div>
                      </div>
                      <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-blue-500/10 blur-3xl rounded-full"></div>
                    </div>

                    <div className="space-y-3 relative">
                      <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-100" />
                      {selectedRoute?.pickupPoints?.sort((a: any, b: any) => (a.order || 0) - (b.order || 0)).map((p: any, idx: number) => {
                        const status = getStopStatus(p.id, selectedTrip);
                        const stopMembers = selectedTrip?.manifest?.filter((m: any) => (m.stopId === p.id || m.pickupPointId === p.id)) || [];
                        
                        const direction = selectedTrip?.direction || 'pickup';
                        const isDropoff = direction === 'dropoff';
                        
                        const primaryCount = stopMembers.filter((m: any) => {
                          const sVal = isDropoff ? m.dropoffStatus : m.pickupStatus;
                          return isDropoff ? sVal === 'dropped' : (sVal === 'picked' || sVal === 'dropped');
                        }).length;

                        const absent = stopMembers.filter((m: any) => {
                          const sVal = isDropoff ? m.dropoffStatus : m.pickupStatus;
                          return sVal === 'absent';
                        }).length;

                        const isFocused = focusedStopId === p.id;

                        return (
                          <div 
                            key={p.id} 
                            className="relative pl-10"
                            onClick={() => {
                              if (isValidCoordinate(p.lat, p.lng)) {
                                setFocusedStopId(p.id);
                                setFocusedLocation({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) });
                              }
                            }}
                          >
                            <div className={cn(
                              "absolute left-[13px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm z-10 transition-all duration-300",
                              isFocused ? "bg-amber-500 ring-4 ring-amber-500/20 scale-125" : (status === 'completed' ? "bg-emerald-500 shadow-emerald-500/20" : status === 'current' ? "bg-blue-600 shadow-blue-600/20 animate-pulse" : "bg-slate-200")
                            )} />
                            <div className={cn(
                               "p-3 rounded-2xl border transition-all cursor-pointer hover:border-slate-300",
                               isFocused 
                                 ? "bg-amber-50/70 border-amber-300 shadow-lg" 
                                 : status === 'current' 
                                   ? "bg-blue-50 border-blue-100 shadow-lg shadow-blue-500/5 ring-1 ring-blue-200/50" 
                                   : status === 'completed' 
                                     ? "bg-emerald-50/20 border-slate-100" 
                                     : "bg-white border-transparent"
                            )}>
                                <div className="flex justify-between items-start mb-1.5">
                                  <div className="flex flex-col flex-1 min-w-0 mr-2">
                                    <h6 className={cn("text-[10px] font-black uppercase tracking-tight truncate", isFocused ? "text-amber-700 font-extrabold" : (status === 'current' ? "text-blue-600" : status === 'completed' ? "text-emerald-700" : "text-slate-900"))}>{p.name}</h6>
                                    <span className={cn(
                                      "text-[7px] font-black uppercase tracking-widest mt-0.5",
                                      isFocused ? "text-amber-600" : (status === 'completed' ? "text-emerald-600" : status === 'current' ? "text-blue-500 animate-pulse" : "text-slate-400")
                                    )}>
                                      {isFocused ? 'Viewing stop' : (status === 'completed' ? 'Arrived / Completed' : status === 'current' ? 'Bus Approaching' : 'Waiting / Pending')}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button 
                                      onClick={(e) => toggleStopExpand(e, p.id)}
                                      className={cn(
                                        "p-1 rounded-lg hover:bg-slate-100/80 text-slate-400 hover:text-slate-700 active:scale-95 transition-all",
                                        expandedStops[p.id] && "bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                                      )}
                                      title="View Student Statuses"
                                    >
                                      <Eye size={12} className="shrink-0" />
                                    </button>
                                    <span className="text-[8.5px] font-black text-slate-400 italic tabular-nums">STOP {idx + 1}</span>
                                  </div>
                               </div>
                               <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1">
                                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                     <span className="text-[8px] font-bold text-slate-500">{primaryCount} {isDropoff ? 'Dropped' : 'Picked'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                     <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                     <span className="text-[8px] font-bold text-slate-500">{absent} Absent</span>
                                  </div>
                               </div>

                               {/* Expanded Student List */}
                               {expandedStops[p.id] && (
                                 <div className="mt-2.5 pt-2.5 border-t border-slate-100/70 space-y-2 animate-in slide-in-from-top-1 duration-200">
                                   <p className="text-[7.5px] font-bold uppercase tracking-wider text-slate-400">Student Statuses ({stopMembers.length})</p>
                                   {stopMembers.length === 0 ? (
                                     <p className="text-[8px] font-medium text-slate-400 italic">No students registered at this stop.</p>
                                   ) : (
                                     <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-hide pr-1">
                                       {stopMembers.map((m: any) => {
                                         const dir = selectedTrip?.direction || 'pickup';
                                         const mStatus = dir === 'dropoff' ? m.dropoffStatus : m.pickupStatus;
                                         return (
                                           <div key={m.uid} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                             <span className="text-[9px] font-black text-slate-700 uppercase leading-none truncate max-w-[120px]">{m.name}</span>
                                             <span className={cn(
                                               "text-[7.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                                               mStatus === 'picked' ? "bg-emerald-50 text-emerald-600 border border-emerald-100/50" :
                                               mStatus === 'dropped' ? "bg-blue-50 text-blue-600 border border-blue-100/50" :
                                               mStatus === 'absent' ? "bg-rose-50 text-rose-600 border border-rose-100/50" :
                                               "bg-slate-100 text-slate-500 border border-slate-200/50"
                                             )}>
                                               {mStatus === 'picked' ? 'Picked Up' :
                                                mStatus === 'dropped' ? 'Dropped' :
                                                mStatus === 'absent' ? 'Absent' : 'Waiting'}
                                             </span>
                                           </div>
                                         );
                                       })}
                                     </div>
                                   )}
                                 </div>
                               )}
                            </div>
                          </div>
                        );
                      })}
                      {/* Org Base Node */}
                      <div className="relative pl-10">
                        <div className={cn(
                          "absolute left-[13px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm z-10",
                          selectedTrip?.status === 'completed' ? "bg-emerald-500" : "bg-slate-200"
                        )} />
                        <div className="p-3">
                           <h6 className="text-[9px] font-black text-slate-800 uppercase tracking-widest leading-none">{org?.name}</h6>
                           <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-1">Destination Hub</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : filteredActiveTrips.length === 0 ? (
                  <div className="py-10 md:py-20 text-center opacity-40">
                    <Bus className="w-10 h-10 md:w-12 md:h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      {searchQuery.trim() ? "No matching buses" : "No Active Buses"}
                    </p>
                  </div>
                ) : (
                  filteredActiveTrips.map(trip => {
                    const vehicle = allVehicles.find((v: any) => v.id === trip.vehicleId);
                    const route = allRoutes.find((r: any) => r.id === trip.routeId);
                    const isSelected = selectedTripId === trip.id;
                    const busLoc = vehicle?.location || trip.location;
                    const stats = org?.location && busLoc ? getTripStats(trip.id, busLoc.lat, busLoc.lng, org.location.lat, org.location.lng) : { distance: '-- KM', eta: '-- MINS' };

                    return (
                      <button
                        key={trip.id}
                        onClick={() => {
                          setSelectedTripId(trip.id);
                        }}
                        className={cn(
                          "w-full p-3 md:p-4 rounded-[1.5rem] md:rounded-3xl border transition-all text-left relative overflow-hidden group",
                          isSelected ? "bg-slate-900 border-slate-900 shadow-xl shadow-slate-900/20" : "bg-white border-slate-50 hover:border-blue-100 hover:bg-slate-50"
                        )}
                      >
                            <div className="flex justify-between items-start mb-2 md:mb-3">
                              <div className={cn(
                                "w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center transition-colors",
                                isSelected ? "bg-white/10 text-blue-400" : "bg-blue-50 text-blue-600"
                              )}>
                                <Bus size={18} className="md:w-5 md:h-5" />
                              </div>
                              <div className="text-right">
                                <p className={cn("text-[7px] md:text-[8px] font-black uppercase tracking-widest mb-0.5 md:mb-1", isSelected ? "text-slate-400" : "text-slate-400")}>Dist / Time to Hub</p>
                                <div className="flex flex-col items-end">
                                  <p className={cn("text-[10px] md:text-xs font-black leading-none uppercase", isSelected ? "text-blue-400" : "text-slate-900")}>
                                    {stats.distance}
                                  </p>
                                  <p className={cn("text-[8px] md:text-[9px] font-black mt-1 uppercase", isSelected ? "text-emerald-400" : "text-emerald-600")}>
                                    {stats.eta}
                                  </p>
                                </div>
                              </div>
                            </div>
                        <div className="space-y-3">
                           <div>
                              <h5 className={cn("text-xs md:text-sm font-black uppercase leading-none mb-1", isSelected ? "text-white" : "text-slate-900")}>{vehicle?.plateNumber || 'Unknown Bus'}</h5>
                              <p className={cn("text-[8px] md:text-[9px] font-bold uppercase tracking-widest truncate", isSelected ? "text-slate-400" : "text-slate-400")}>{route?.name || 'Assigned Route'}</p>
                           </div>
                           
                           {(() => {
                               const driver = drivers.find((d: any) => d.uid === trip.driverId);
                               if (!driver) return null;
                               return (
                                 <div className="flex items-center gap-1.5 mt-1">
                                    <div className={cn("px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase", isSelected ? "bg-white/10 text-slate-400" : "bg-slate-100 text-slate-500")}>
                                       Driver: {driver.name}
                                    </div>
                                 </div>
                               );
                           })()}
                        </div>
                        {isSelected && (
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-500" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right - Map View */}
        <div className={cn(
          "flex-1 bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden relative lg:h-full min-h-[300px] order-1 lg:order-2",
          viewMode === 'map' ? "block h-[450px]" : "hidden lg:block h-[450px]"
        )}>
          <MapComponent 
            key={viewMode}
            height="100%" 
            zoom={selectedTrip ? 15 : 13} 
            bounds={mapBounds}
            center={sanitizeCenter((() => {
              const busLoc = selectedTrip ? (allVehicles.find((v: any) => v.id === selectedTrip.vehicleId)?.location || selectedTrip.location) : null;
              if (busLoc && isValidCoordinate(busLoc.lat, busLoc.lng)) {
                return { lat: parseFloat(busLoc.lat), lng: parseFloat(busLoc.lng) };
              }
              return org?.location;
            })())}
          >
            {/* Org Marker */}
            {org?.location && isValidCoordinate(org.location.lat, org.location.lng) && (
              <Marker 
                key="tracking-org-marker"
                position={[org.location.lat, org.location.lng]} 
                icon={createMarkerIcon(orgColor, orgIconUrl, orgColor, org.name)}
              >
                <Popup>
                  <div className="p-2 text-center">
                    <p className="text-[10px] font-black text-slate-800 uppercase italic">{org.name}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Main Headquarters</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Vessel Markers */}
            {filteredActiveTrips.map(trip => {
              const vehicle = allVehicles.find((v: any) => v.id === trip.vehicleId);
              const isSelected = selectedTripId === trip.id;
              const busLoc = vehicle?.location || trip.location;
              if (!busLoc || !isValidCoordinate(busLoc.lat, busLoc.lng)) return null;

              return (
                <Marker 
                  key={trip.id}
                  position={[busLoc.lat, busLoc.lng]}
                  icon={createMarkerIcon(isSelected ? '#3b82f6' : '#94a3b8', 'https://img.icons8.com/fluency/50/bus.png', isSelected ? '#3b82f6' : '#94a3b8', vehicle?.plateNumber || '')}
                  eventHandlers={{ click: () => setSelectedTripId(trip.id) }}
                >
                  <Popup>
                    <div className="p-2 min-w-[150px]">
                      <p className="text-xs font-black text-slate-900 border-b border-slate-100 pb-1 mb-1">{vehicle?.plateNumber}</p>
                      <div className="space-y-1 my-2 text-[8px] font-bold uppercase tracking-widest text-slate-500">
                        <p className="flex justify-between"><span>Status:</span> <span className="text-blue-600">{trip.status}</span></p>
                        {(() => {
                           const driver = drivers.find((d: any) => d.uid === trip.driverId);
                           if (!driver) return null;
                           return (
                             <>
                               <p className="flex justify-between"><span>Driver:</span> <span className="text-slate-900">{driver.name}</span></p>
                               <p className="flex justify-between"><span>Phone:</span> <span className="text-slate-900">{driver.phone || 'N/A'}</span></p>
                             </>
                           );
                        })()}
                      </div>
                      <button onClick={() => setSelectedTripId(trip.id)} className="mt-2 w-full py-1.5 bg-blue-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all">Inspect Bus</button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Full Static Route Polyline (Thin / Gray / Dashed) */}
            {selectedTrip && selectedRoute?.pickupPoints && selectedRoute.pickupPoints.length > 0 && (
              <Polyline 
                positions={selectedRoute.pickupPoints
                  .filter((p: any) => isValidCoordinate(p.lat, p.lng))
                  .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                  .map((p: any) => [parseFloat(p.lat), parseFloat(p.lng)])}
                color="#94a3b8"
                weight={3}
                opacity={0.4}
                dashArray="5, 8"
              />
            )}

            {/* Active Sub-Route Path (Thick / Blue / OSRM remaining road path) */}
            {selectedTrip && roadCoords.length > 1 && (
              <Polyline 
                positions={roadCoords}
                color="#3b82f6"
                weight={5}
                opacity={0.9}
                lineCap="round"
                lineJoin="round"
              />
            )}

            {/* Selected Route Stops */}
            {selectedTrip && selectedRoute?.pickupPoints?.map((p: any) => {
              if (!isValidCoordinate(p.lat, p.lng)) return null;
              const status = getStopStatus(p.id, selectedTrip);
              const stopMembers = selectedTrip.manifest?.filter((m: any) => (m.stopId === p.id || m.pickupPointId === p.id)) || [];
              const mapCheckField = selectedTrip.direction === 'dropoff' ? 'dropoffStatus' : 'pickupStatus';
              const picked = stopMembers.filter((m: any) => m[mapCheckField] === 'picked' || m[mapCheckField] === 'dropped').length;
              const absent = stopMembers.filter((m: any) => m[mapCheckField] === 'absent').length;
              const isFocused = focusedStopId === p.id;

              return (
                <Marker 
                  key={p.id}
                  position={[parseFloat(p.lat), parseFloat(p.lng)]}
                  icon={createMarkerIcon(
                    isFocused ? '#f59e0b' : (status === 'completed' ? '#10b981' : status === 'current' ? '#3b82f6' : '#cbd5e1'),
                    'https://img.icons8.com/fluency/50/bus-stop.png',
                    isFocused ? '#fbbf24' : (status === 'completed' ? '#34d399' : status === 'current' ? '#60a5fa' : '#cbd5e1'),
                    p.name,
                    isFocused ? '#f59e0b' : '#0f172a',
                    '#ffffff'
                  )}
                  eventHandlers={{
                    click: () => {
                      setFocusedStopId(p.id);
                      setFocusedLocation({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) });
                    }
                  }}
                >
                  <Popup>
                    <div className="p-3 w-48">
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{p.name}</h5>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                          status === 'completed' ? "bg-emerald-50 text-emerald-600" : status === 'current' ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-400"
                        )}>{status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-emerald-50 rounded-xl p-2 border border-emerald-100">
                          <p className="text-[8px] font-black text-emerald-600 uppercase">Picked</p>
                          <p className="text-sm font-black text-slate-900">{picked}</p>
                        </div>
                        <div className="bg-rose-50 rounded-xl p-2 border border-rose-100">
                          <p className="text-[8px] font-black text-rose-600 uppercase">Absent</p>
                          <p className="text-sm font-black text-slate-900">{absent}</p>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-50 flex justify-between items-center text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>Total Assigned:</span>
                        <span>{stopMembers.length}</span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapComponent>

          {/* Quick HUD for Selected Bus */}
          <AnimatePresence>
            {selectedTrip && (
              <motion.div 
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                className="absolute bottom-4 left-4 right-4 md:bottom-8 md:left-8 md:right-8 z-[1000] pointer-events-none"
              >
                <div className="bg-white/95 backdrop-blur-xl rounded-2xl md:rounded-3xl border border-slate-200/60 shadow-[0_20px_50px_rgba(15,23,42,0.15)] p-3 md:p-5 pointer-events-auto relative">
                  {/* Close button positioned cleanly at the top-right corner outset */}
                  <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 z-[1010]">
                    <button 
                      onClick={() => setSelectedTripId(null)} 
                      className="p-1.5 md:p-2 bg-white hover:bg-slate-50 border border-slate-200 shadow-md rounded-full transition-all pointer-events-auto flex items-center justify-center cursor-pointer font-bold"
                      title="Close details"
                    >
                      <X size={14} className="text-slate-500" />
                    </button>
                  </div>

                  {/* Dynamic grid to prevent clashing / overlapping */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 items-center">
                    {/* Current Vehicle Plate Number Block */}
                    <div className="flex flex-col min-w-0">
                      <p className="text-[7px] md:text-[7.5px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">Current Bus</p>
                      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2 py-1 md:px-2.5 md:py-1.5 rounded-xl w-fit min-w-0">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                        <span className="text-[9.5px] md:text-sm font-black text-slate-900 italic uppercase truncate leading-none">{selectedVehicle?.plateNumber}</span>
                      </div>
                    </div>

                    {/* Assigned Driver Block */}
                    <div className="flex flex-col min-w-0">
                      <p className="text-[7px] md:text-[7.5px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">Assigned Crew</p>
                      {(() => {
                         const driver = drivers.find((d: any) => d.uid === selectedTrip.driverId);
                         return (
                           <div className="flex items-center gap-2">
                              <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 border border-slate-200 overflow-hidden">
                                 <img src={getUserAvatar(driver?.avatarUrl, driver?.photoURL, driver?.name, driver?.uid)} alt="" className="w-full h-full object-cover" />
                              </div>
                              <div className="min-w-0">
                                 <p className="text-[9px] md:text-xs font-black text-slate-900 uppercase italic leading-none truncate">{driver?.name || 'Assigned Driver'}</p>
                                 <p className="text-[7px] md:text-[8px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5 md:mt-1 leading-none truncate">{driver?.phone || 'Contact N/A'}</p>
                              </div>
                           </div>
                         );
                      })()}
                    </div>

                    {/* Upcoming Bus Stop Block */}
                    <div className="flex flex-col min-w-0">
                      <p className="text-[7px] md:text-[7.5px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">Next Destination</p>
                      <div className="bg-blue-50/50 border border-blue-100/55 px-2 py-1 md:px-2.5 md:py-1.5 rounded-xl w-fit min-w-0">
                        <p className="text-[8.5px] md:text-[10px] font-black text-blue-700 uppercase italic truncate leading-none">
                          {activeNextStop ? `Next: ${activeNextStop.name}` : 'Route Completed'}
                        </p>
                      </div>
                    </div>

                    {/* ETA Block */}
                    <div className="flex flex-col min-w-0 lg:items-end lg:text-right">
                      <p className="text-[7px] md:text-[7.5px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">Expected Arrival</p>
                      <p className="text-[10.5px] md:text-base font-black text-blue-600 tracking-tight uppercase italic truncate leading-none">
                        {nextStopStats.eta} <span className="text-[8px] md:text-xs text-slate-400 font-bold not-italic ml-0.5 md:ml-1">({nextStopStats.distance})</span>
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Reports({ org, vehicles, routes, members, drivers = [], tripsMySQL = [] }: any) {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('today');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [filterDriverId, setFilterDriverId] = useState('');
  const [filterRouteId, setFilterRouteId] = useState('');
  const [filterMemberId, setFilterMemberId] = useState('');
  const [filterStopId, setFilterStopId] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [reportTab, setReportTab] = useState<'trips' | 'users'>('trips');
  const lastOrgId = useRef<string | null>(null);

  const getSectorLabel = () => {
    if (!org?.sector) return 'EMP';
    const sec = org.sector.toLowerCase();
    if (sec === 'education') return 'Student';
    if (sec === 'transport' || sec === 'transportation' || sec === 'logistics' || sec === 'passenger' || sec === 'fleet') return 'Passenger';
    return 'EMP';
  };
  const sectorLabel = getSectorLabel();

  // Filter suggestions based on query
  const memberSuggestions = memberSearchQuery.length >= 1 
    ? members.filter((m: any) => 
        m.name?.toLowerCase().includes(memberSearchQuery.toLowerCase()) || 
        m.studentId?.toLowerCase().includes(memberSearchQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  useEffect(() => {
    if (!org?.id) return;
    
    if (lastOrgId.current !== org.id) {
      setLoading(true);
      lastOrgId.current = org.id;
    }

    const processTripsList = (rawTripsList: any[]) => {
      const isSameDayMatch = (val1: any, val2: any) => {
        if (!val1 || !val2) return false;
        const parseDate = (v: any) => {
          if (typeof v === 'string') return new Date(v);
          if (v && typeof v.toDate === 'function') return v.toDate();
          if (v && v.seconds !== undefined) return new Date(v.seconds * 1000);
          if (v instanceof Date) return v;
          return new Date(v);
        };
        try {
          const d1 = parseDate(val1);
          const d2 = parseDate(val2);
          if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
          return d1.getDate() === d2.getDate() &&
                 d1.getMonth() === d2.getMonth() &&
                 d1.getFullYear() === d2.getFullYear();
        } catch (e) {
          return false;
        }
      };

      let allTrips = rawTripsList.map(item => {
        let parsedManifest = [];
        try {
          if (item.manifest) {
            parsedManifest = typeof item.manifest === 'string' ? JSON.parse(item.manifest) : (Array.isArray(item.manifest) ? item.manifest : []);
            if (typeof parsedManifest === 'string') {
              parsedManifest = JSON.parse(parsedManifest);
            }
          }
        } catch (e) {
          parsedManifest = Array.isArray(item.manifest) ? item.manifest : [];
        }

        // Fallback: If no manifest is saved in trip record, build one dynamically from the route passengers
        if ((!parsedManifest || parsedManifest.length === 0) && item.routeId) {
          const routeMembers = members?.filter((u: any) => u.routeId === item.routeId) || [];
          parsedManifest = routeMembers.map((m: any) => ({
            id: m.id || m.uid,
            uid: m.uid || m.id,
            name: m.name,
            studentId: m.studentId || m.id || "",
            pickupPointId: m.pickupPointId,
            stopId: m.pickupPointId,
            pickupStatus: m.pickupStatus || 'waiting',
            dropoffStatus: m.dropoffStatus || 'waiting',
            pickupUpdatedAt: m.pickupUpdatedAt || null,
            dropoffUpdatedAt: m.dropoffUpdatedAt || null
          }));
        }

        // Enrich manifest statuses with current day live statuses if trip matches the same day
        const tripDate = item.startedAt || item.startTime;
        const mappedManifest = parsedManifest.map((m: any) => {
          const livePass = members?.find((u: any) => u.id === m.id || u.uid === m.id || u.id === m.uid || u.uid === m.uid);
          
          let pickupStatus = m.pickupStatus || 'waiting';
          let dropoffStatus = m.dropoffStatus || 'waiting';
          let pickupUpdatedAt = m.pickupUpdatedAt || null;
          let dropoffUpdatedAt = m.dropoffUpdatedAt || null;

          if (livePass) {
            if (isSameDayMatch(livePass.pickupUpdatedAt, tripDate)) {
              pickupStatus = livePass.pickupStatus || 'waiting';
              pickupUpdatedAt = livePass.pickupUpdatedAt;
            }
            if (isSameDayMatch(livePass.dropoffUpdatedAt, tripDate)) {
              dropoffStatus = livePass.dropoffStatus || 'waiting';
              dropoffUpdatedAt = livePass.dropoffUpdatedAt;
            }
          }

          return {
            ...m,
            id: m.id || m.uid,
            uid: m.uid || m.id,
            name: livePass?.name || m.name,
            studentId: livePass?.studentId || m.studentId,
            pickupPointId: livePass?.pickupPointId || m.pickupPointId,
            stopId: livePass?.pickupPointId || m.stopId || m.pickupPointId,
            pickupStatus,
            dropoffStatus,
            pickupUpdatedAt,
            dropoffUpdatedAt
          };
        });

        return {
          ...item,
          manifest: mappedManifest
        };
      });

      // Apply time filter client-side to avoid missing index errors
      if (timeRange !== 'all') {
        const now = new Date();
        const startTime = new Date();
        let endTime: Date | null = null;
        
        if (timeRange === 'today') {
          startTime.setHours(0, 0, 0, 0);
        } else if (timeRange === 'week') {
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
          startTime.setDate(diff);
          startTime.setHours(0, 0, 0, 0);
        } else if (timeRange === 'month') {
          startTime.setDate(1);
          startTime.setHours(0, 0, 0, 0);
        } else if (timeRange === 'custom' && startDateFilter) {
          startTime.setTime(new Date(startDateFilter).getTime());
          startTime.setHours(0, 0, 0, 0);
          
          if (endDateFilter) {
            endTime = new Date(endDateFilter);
            endTime.setHours(23, 59, 59, 999);
          }
        }

        allTrips = allTrips.filter((t: any) => {
          const rawDate = t.startedAt || t.startTime;
          if (!rawDate) return false;
          const date = rawDate.toDate ? rawDate.toDate() : (rawDate.seconds ? new Date(rawDate.seconds * 1000) : new Date(rawDate));
          if (isNaN(date.getTime())) return false;

          if (timeRange === 'custom') {
            if (startDateFilter && date.getTime() < startTime.getTime()) return false;
            if (endTime && date.getTime() > endTime.getTime()) return false;
            return true;
          } else {
            return date.getTime() >= startTime.getTime();
          }
        });
      }

      // Sort by date desc
      allTrips.sort((a: any, b: any) => {
        const getTripTime = (t: any) => {
          const rawDate = t ? (t.startedAt || t.startTime) : null;
          if (!rawDate) return 0;
          try {
            const date = rawDate.toDate ? rawDate.toDate() : (rawDate.seconds ? new Date(rawDate.seconds * 1000) : new Date(rawDate));
            const time = date.getTime();
            return isNaN(time) ? 0 : time;
          } catch (e) {
            return 0;
          }
        };
        return getTripTime(b) - getTripTime(a);
      });

      return allTrips;
    };

    // If trips are populated from MySQL, prioritize them (offline-safe, high-performance, direct)
    if (Array.isArray(tripsMySQL) && tripsMySQL.length > 0) {
      setTrips(processTripsList(tripsMySQL));
      setLoading(false);
      return;
    }

    // Otherwise fall back to Firestore snapshot subscription if authenticated
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const tripsQuery = query(
      collection(db, 'trips'),
      where('orgId', '==', org.id)
    );

    const unsub = onSnapshot(tripsQuery, (snap) => {
      const firestoreRawTrips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTrips(processTripsList(firestoreRawTrips));
      setLoading(false);
    }, (error) => {
      setLoading(false);
      console.warn("[OrgAdminDashboard] Trips history real-time listener notice:", error?.message || error);
    });

    return () => unsub();
  }, [org?.id, tripsMySQL, timeRange, startDateFilter, endDateFilter]);

  const getTripStatusWord = (trip: any) => {
    const list = Array.isArray(trip.manifest) ? trip.manifest : [];
    const checkField = trip.direction === 'dropoff' ? 'dropoffStatus' : 'pickupStatus';
    const pickedCount = list.filter((m: any) => m[checkField] === 'picked' || m[checkField] === 'dropped').length || 0;
    const absentCount = list.filter((m: any) => m[checkField] === 'absent').length || 0;
    const totalAssigned = list.length || 0;
    const status = trip.status || 'pending';

    if (status === 'live' || status === 'ongoing') return 'On the Way';
    if (status === 'pending') return 'Waiting to Start';
    
    if (status === 'completed') {
      if (totalAssigned === 0) return 'Empty Trip';
      if (pickedCount + absentCount === 0) return 'No Attendance Marked';
      if (pickedCount + absentCount < totalAssigned) return 'Partially Handled';
      return 'Successfully Completed';
    }
    
    return status;
  };

  const filteredTrips = trips
    .filter(t => {
      if (filterMemberId || filterStopId || memberSearchQuery) {
        return Array.isArray(t.manifest) && t.manifest.length > 0;
      }
      return true;
    })
    .filter(t => !filterDriverId || t.driverId === filterDriverId)
    .filter(t => !filterRouteId || t.routeId === filterRouteId)
    .filter(t => !filterMemberId || t.manifest?.some((m: any) => m.id === filterMemberId))
    .filter(t => !filterStopId || t.manifest?.some((m: any) => m.stopId === filterStopId || m.pickupPointId === filterStopId))
    .filter(t => {
      if (!memberSearchQuery) return true;
      return t.manifest?.some((m: any) => 
        m.name?.toLowerCase().includes(memberSearchQuery.toLowerCase()) || 
        m.studentId?.toLowerCase().includes(memberSearchQuery.toLowerCase())
      );
    });

  // Extract all unique stops from routes for the filter - filter by route if selected
  const allStops = routes.reduce((acc: any[], route: any) => {
    if (filterRouteId && route.id !== filterRouteId) return acc;
    if (route.stops) {
      route.stops.forEach((stop: any) => {
        if (!acc.find(s => s.id === stop.id)) {
          acc.push(stop);
        }
      });
    }
    // Also include pickup points as they are often used as stops
    if (route.pickupPoints) {
      route.pickupPoints.forEach((p: any) => {
        if (!acc.find(s => s.id === p.id)) {
          acc.push({ id: p.id, name: p.name });
        }
      });
    }
    return acc;
  }, []);

  const stats = {
    totalTrips: filteredTrips.length,
    completedTrips: filteredTrips.filter(t => t.status === 'completed').length,
    liveTrips: filteredTrips.filter(t => t.status === 'live' || t.status === 'ongoing').length,
    totalBoardings: filteredTrips.reduce((acc, trip) => {
      if (trip.manifest && Array.isArray(trip.manifest)) {
        const checkField = trip.direction === 'dropoff' ? 'dropoffStatus' : 'pickupStatus';
        return acc + trip.manifest.filter((m: any) => m[checkField] === 'picked' || m[checkField] === 'dropped').length;
      }
      return acc;
    }, 0),
    totalAbsences: filteredTrips.reduce((acc, trip) => {
      if (trip.manifest && Array.isArray(trip.manifest)) {
        const checkField = trip.direction === 'dropoff' ? 'dropoffStatus' : 'pickupStatus';
        return acc + trip.manifest.filter((m: any) => m[checkField] === 'absent').length;
      }
      return acc;
    }, 0),
    utilization: vehicles.length > 0 ? (filteredTrips.filter(t => t.status === 'live' || t.status === 'ongoing').length / vehicles.length * 100).toFixed(0) : 0
  };

  const exportToExcel = () => {
    if (filteredTrips.length === 0) {
      toast.error("No reports matching the filters to download");
      return;
    }

    const data = filteredTrips.map(t => {
      const vehicle = vehicles.find((v: any) => v.id === t.vehicleId);
      const driver = drivers.find((d: any) => d.uid === t.driverId);
      const route = routes.find((r: any) => r.id === t.routeId);
      
      const checkField = t.direction === 'dropoff' ? 'dropoffStatus' : 'pickupStatus';
      const pickedCount = t.manifest?.filter((m: any) => m[checkField] === 'picked' || m[checkField] === 'dropped').length || 0;
      const absentCount = t.manifest?.filter((m: any) => m[checkField] === 'absent').length || 0;
      const totalAssigned = t.manifest?.length || 0;
      const statusWord = getTripStatusWord(t);

      return {
        'Date & Time': (() => {
          const rawDate = t.startedAt || t.startTime;
          const d = rawDate?.toDate ? rawDate.toDate() : (rawDate?.seconds ? new Date(rawDate.seconds * 1000) : new Date(rawDate));
          return !isNaN(d.getTime()) ? d.toLocaleString() : 'N/A';
        })(),
        'Vehicle Number': vehicle?.plateNumber || 'N/A',
        'Driver Name': driver?.name || 'N/A',
        'Route Name': route?.name || 'Assigned Route',
        'Trip Type': t.direction || 'N/A',
        'Status': statusWord,
        'Members Present': pickedCount,
        'Members Absent': absentCount,
        'Total Assigned': totalAssigned
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fleet Reports");
    XLSX.writeFile(wb, `Fleet_Status_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Excel report downloaded successfully!");
  };

  const getStopName = (m: any, tripRoute: any) => {
    const stopId = m.pickupPointId || m.stopId;
    if (!stopId) return 'N/A';
    if (tripRoute) {
      const pt = tripRoute.pickupPoints?.find((p: any) => p.id === stopId) || tripRoute.stops?.find((s: any) => s.id === stopId);
      if (pt) return pt.name;
    }
    for (const r of routes) {
      const pt = r.pickupPoints?.find((p: any) => p.id === stopId) || r.stops?.find((s: any) => s.id === stopId);
      if (pt) return pt.name;
    }
    return m.stopName || m.pickupPointName || 'N/A';
  };

  const detailedUserRows = useMemo(() => {
    const rows: any[] = [];
    filteredTrips.forEach((t) => {
      if (!t.manifest || !Array.isArray(t.manifest)) return;
      
      const vehicle = vehicles.find((v: any) => v.id === t.vehicleId);
      const driver = drivers.find((d: any) => d.uid === t.driverId);
      const route = routes.find((r: any) => r.id === t.routeId);
      const rawDate = t.startedAt || t.startTime;
      const tripDate = rawDate?.toDate ? rawDate.toDate() : (rawDate?.seconds ? new Date(rawDate.seconds * 1000) : new Date(rawDate));
      if (isNaN(tripDate.getTime())) return;
      
      t.manifest.forEach((m: any) => {
        if (memberSearchQuery) {
           const q = memberSearchQuery.toLowerCase();
           const match = m.name?.toLowerCase().includes(q) || m.studentId?.toLowerCase().includes(q);
           if (!match) return;
        }
        
        const stopId = m.pickupPointId || m.stopId;
        if (filterStopId && stopId !== filterStopId) {
           return;
        }

        rows.push({
          id: `${t.id}-${m.id || m.uid}`,
          tripId: t.id,
          date: tripDate,
          passengerName: m.name || 'N/A',
          passengerId: m.studentId || '',
          routeName: route?.name || 'Assigned Route',
          direction: t.direction || 'pickup',
          stopName: getStopName(m, route),
          pickupStatus: m.pickupStatus || 'waiting',
          pickupUpdatedAt: m.pickupUpdatedAt || null,
          dropoffStatus: m.dropoffStatus || 'waiting',
          dropoffUpdatedAt: m.dropoffUpdatedAt || null,
          driverName: driver?.name || 'No Driver',
          driverId: t.driverId,
          vehiclePlate: vehicle?.plateNumber || 'N/A',
        });
      });
    });
    return rows;
  }, [filteredTrips, memberSearchQuery, filterStopId, vehicles, drivers, routes]);

  const exportDetailedToExcel = () => {
    if (detailedUserRows.length === 0) {
      toast.error("No detailed reports matching the filters to download");
      return;
    }

    const data = detailedUserRows.map((row, index) => {
      const pTime = row.pickupUpdatedAt 
        ? (typeof row.pickupUpdatedAt === 'string' ? new Date(row.pickupUpdatedAt) : row.pickupUpdatedAt?.toDate?.())
        : null;
      const dTime = row.dropoffUpdatedAt 
        ? (typeof row.dropoffUpdatedAt === 'string' ? new Date(row.dropoffUpdatedAt) : row.dropoffUpdatedAt?.toDate?.())
        : null;

      return {
        'Sl No.': index + 1,
        'Date': row.date.toLocaleDateString(),
        [sectorLabel]: row.passengerName + (row.passengerId ? ` (ID: ${row.passengerId})` : ''),
        'Route': row.routeName,
        'Trip Type': row.direction === 'pickup' ? 'Pickup' : 'Dropoff',
        'Stop': row.stopName,
        'Pick Status': row.pickupStatus === 'picked' ? 'Picked Up' : row.pickupStatus === 'absent' ? 'Absent' : 'Waiting',
        'Pick Time': pTime && !isNaN(pTime.getTime()) ? pTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---',
        'Drop Status': row.dropoffStatus === 'dropped' ? 'Dropped' : row.dropoffStatus === 'absent' ? 'Absent' : 'Pending',
        'Drop Time': dTime && !isNaN(dTime.getTime()) ? dTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---',
        'Driver': row.driverName,
        'Vehicle': row.vehiclePlate
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detailed User Attendance");
    XLSX.writeFile(wb, `Detailed_User_Attendance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Detailed Excel report downloaded successfully!");
  };

  const exportDetailedToPDF = () => {
    if (detailedUserRows.length === 0) {
      toast.error("No detailed reports matching the filters to download");
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text(`DETAILED USER ATTENDANCE REPORT`, 14, 20);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Organization: ${org?.name || 'N/A'}`, 14, 26);
      doc.text(`Generated on: ${new Date().toLocaleString()} | Period: ${timeRange.toUpperCase()}`, 14, 31);

      const headers = [
        ['Sl No.', 'Date', sectorLabel, 'Route', 'Stop', 'Pick Status', 'Pick Time', 'Drop Status', 'Drop Time', 'Driver']
      ];

      const tableRows = detailedUserRows.map((row, index) => {
        const pTimeObj = row.pickupUpdatedAt 
          ? (typeof row.pickupUpdatedAt === 'string' ? new Date(row.pickupUpdatedAt) : row.pickupUpdatedAt?.toDate?.())
          : null;
        const dTimeObj = row.dropoffUpdatedAt 
          ? (typeof row.dropoffUpdatedAt === 'string' ? new Date(row.dropoffUpdatedAt) : row.dropoffUpdatedAt?.toDate?.())
          : null;
        
        const pTimeStr = pTimeObj && !isNaN(pTimeObj.getTime()) ? pTimeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';
        const dTimeStr = dTimeObj && !isNaN(dTimeObj.getTime()) ? dTimeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';

        return [
          (index + 1).toString(),
          row.date.toLocaleDateString(),
          row.passengerName + (row.passengerId ? `\n(ID: ${row.passengerId})` : ''),
          `${row.routeName} (${row.direction === 'pickup' ? 'Pickup' : 'Dropoff'})`,
          row.stopName,
          row.pickupStatus === 'picked' ? 'Picked' : row.pickupStatus === 'absent' ? 'Absent' : 'Waiting',
          pTimeStr,
          row.dropoffStatus === 'dropped' ? 'Dropped' : row.dropoffStatus === 'absent' ? 'Absent' : 'Pending',
          dTimeStr,
          `${row.driverName}\n(${row.vehiclePlate})`
        ];
      });

      (doc as any).autoTable({
        head: headers,
        body: tableRows,
        startY: 38,
        theme: 'striped',
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'left'
        },
        bodyStyles: {
          fontSize: 8.5,
          textColor: [51, 65, 85]
        },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          1: { cellWidth: 22 },
          2: { cellWidth: 40, fontStyle: 'bold' },
          3: { cellWidth: 45 },
          4: { cellWidth: 35 },
          5: { cellWidth: 22 },
          6: { cellWidth: 20 },
          7: { cellWidth: 22 },
          8: { cellWidth: 20 },
          9: { cellWidth: 35 }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { left: 14, right: 14 }
      });

      doc.save(`User_Attendance_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("PDF report downloaded successfully!");
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF report");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="px-2">
        <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1 uppercase italic">Operational History</h3>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Review past trips, driver performance and attendance data</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Trips</p>
            <p className="text-3xl font-black text-slate-900 italic tracking-tight">{stats.totalTrips}</p>
            <div className="mt-4 h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
               <div className="h-full bg-blue-500" style={{ width: '100%' }} />
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Present</p>
            <p className="text-3xl font-black text-slate-900 italic tracking-tight">{stats.totalBoardings}</p>
            <div className="mt-4 h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
               <div className="h-full bg-emerald-500" style={{ width: `${(stats.totalBoardings / (stats.totalBoardings + stats.totalAbsences) * 100) || 0}%` }} />
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Absent</p>
            <p className="text-3xl font-black text-slate-900 italic tracking-tight">{stats.totalAbsences}</p>
            <div className="mt-4 h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
               <div className="h-full bg-rose-500" style={{ width: `${(stats.totalAbsences / (stats.totalBoardings + stats.totalAbsences) * 100) || 0}%` }} />
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Trips</p>
            <p className="text-3xl font-black text-slate-900 italic tracking-tight">{stats.liveTrips}</p>
            <div className="mt-4 h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
               <div className="h-full bg-amber-500" style={{ width: `${(stats.liveTrips / (stats.totalTrips || 1) * 100)}%` }} />
            </div>
         </div>
      </div>

      {/* Report View Tabs Toggle */}
      <div className="flex border-b border-slate-100 mb-2">
        <button 
          onClick={() => setReportTab('trips')} 
          className={cn(
            "px-6 py-3 font-black text-xs uppercase tracking-widest border-b-2 transition-all relative",
            reportTab === 'trips' ? "border-blue-600 text-blue-600 font-black" : "border-transparent text-slate-400 hover:text-slate-600 font-bold"
          )}
        >
          Trip Logs
        </button>
        <button 
          onClick={() => setReportTab('users')} 
          className={cn(
            "px-6 py-3 font-black text-xs uppercase tracking-widest border-b-2 transition-all relative",
            reportTab === 'users' ? "border-blue-600 text-blue-600 font-black" : "border-transparent text-slate-400 hover:text-slate-600 font-bold"
          )}
        >
          Detailed User Report
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 bg-white/50 p-6 rounded-[2.5rem] border border-slate-50/50 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Search Student/Member</p>
            <div className="relative group/search">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/search:text-blue-500 transition-colors" />
               <input 
                 type="text" 
                 placeholder="Name or ID..." 
                 value={memberSearchQuery}
                 onFocus={() => setShowMemberSuggestions(true)}
                 onChange={(e) => {
                   setMemberSearchQuery(e.target.value);
                   setShowMemberSuggestions(true);
                 }}
                 className="w-full bg-white border border-slate-100 rounded-2xl pl-11 pr-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none shadow-sm h-12"
               />
               
               {showMemberSuggestions && memberSuggestions.length > 0 && (
                 <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-60 overflow-y-auto">
                       {memberSuggestions.map((m: any) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setMemberSearchQuery(m.name);
                              setShowMemberSuggestions(false);
                            }}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 text-left"
                          >
                             <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden border border-slate-200">
                                <img src={getUserAvatar(m.avatarUrl, m.photoURL, m.name, m.id || m.uid)} alt="" className="w-full h-full rounded-full object-cover" />
                             </div>
                             <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-slate-900 uppercase truncate">{m.name}</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{m.studentId || 'No ID'}</p>
                             </div>
                          </button>
                       ))}
                    </div>
                 </div>
               )}
               {/* Click overlay to close suggestions */}
               {showMemberSuggestions && (
                 <div 
                   className="fixed inset-0 z-40" 
                   onClick={() => setShowMemberSuggestions(false)}
                 />
               )}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Filter Route</p>
            <select 
              value={filterRouteId} 
              onChange={(e) => {
                setFilterRouteId(e.target.value);
                setFilterStopId(''); // Reset stop when route changes
              }}
              className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none shadow-sm h-12"
            >
              <option value="">All Routes</option>
              {routes.map((r: any) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Filter Stop</p>
            <select 
              value={filterStopId} 
              onChange={(e) => setFilterStopId(e.target.value)}
              className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none shadow-sm h-12"
            >
              <option value="">{filterRouteId ? 'Route Stops' : 'All Stops'}</option>
              {allStops.sort((a: any, b: any) => (a?.name || '').localeCompare(b?.name || '')).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Filter Driver</p>
            <select 
              value={filterDriverId} 
              onChange={(e) => setFilterDriverId(e.target.value)}
              className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none shadow-sm h-12"
            >
              <option value="">All Drivers</option>
              {drivers.map((d: any) => (
                <option key={d.uid} value={d.uid}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mt-2">
          <div className="space-y-1.5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Time Frame</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <select 
                value={timeRange} 
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-full sm:w-48 bg-white border border-slate-100 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none shadow-sm h-12"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
                <option value="custom">📅 Custom Range</option>
              </select>
              
              {timeRange === 'custom' && (
                <div className="flex flex-1 items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex-1 relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                    <input 
                      type="date" 
                      value={startDateFilter}
                      onChange={(e) => setStartDateFilter(e.target.value)}
                      className="w-full bg-white border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-[10px] font-black outline-none shadow-sm h-12"
                    />
                  </div>
                  <span className="text-slate-300 font-black text-[8px] uppercase shrink-0">to</span>
                  <div className="flex-1 relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                    <input 
                      type="date" 
                      value={endDateFilter}
                      onChange={(e) => setEndDateFilter(e.target.value)}
                      className="w-full bg-white border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-[10px] font-black outline-none shadow-sm h-12"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 w-full">
            {reportTab === 'trips' ? (
              <button 
                onClick={exportToExcel}
                className="w-full sm:w-auto px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all active:scale-95 h-12 shrink-0"
              >
                <Download className="w-4 h-4" /> Export Excel
              </button>
            ) : (
              <>
                <button 
                  onClick={exportDetailedToExcel}
                  className="w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all active:scale-95 h-12 shrink-0"
                >
                  <Download className="w-4 h-4" /> Export Excel
                </button>
                <button 
                  onClick={exportDetailedToPDF}
                  className="w-full sm:w-auto px-6 py-3 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center justify-center gap-2 hover:bg-rose-700 transition-all active:scale-95 h-12 shrink-0"
                >
                  <Download className="w-4 h-4" /> Export PDF
                </button>
              </>
            )}
            <button 
              onClick={() => {
                setFilterDriverId('');
                setFilterRouteId('');
                setFilterMemberId('');
                setFilterStopId('');
                setMemberSearchQuery('');
                setTimeRange('today');
                setStartDateFilter('');
                setEndDateFilter('');
              }}
              className="w-full sm:w-auto px-6 py-3 border border-slate-100 bg-white text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-all active:scale-95 h-12"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Route Specific Summary */}
      {filterRouteId && reportTab !== 'users' && (() => {
        const selectedRoute = routes.find((r: any) => r.id === filterRouteId);
        
        // Fix: Apply filterStopId to filter members displayed in Route Attendance Summary
        const displayMembers = members.filter((m: any) => 
          m.routeId === filterRouteId && 
          (!filterStopId || m.pickupPointId === filterStopId || m.stopId === filterStopId)
        );

        let overallPresent = 0;
        let overallAbsent = 0;
        let routeTripsCount = 0;

        const memberDataList = displayMembers.map((m: any) => {
          const memberTrips = filteredTrips.filter(t => t.manifest?.some((tm: any) => tm.id === m.id || tm.uid === m.id || tm.id === m.uid || tm.uid === m.uid));
          const presentCount = memberTrips.filter(t => {
            const me = t.manifest?.find((tm: any) => tm.id === m.id || tm.uid === m.id || tm.id === m.uid || tm.uid === m.uid);
            if (!me) return false;
            const checkField = t.direction === 'dropoff' ? 'dropoffStatus' : 'pickupStatus';
            return me[checkField] === 'picked' || me[checkField] === 'dropped';
          }).length;
          const absentCount = memberTrips.filter(t => {
            const me = t.manifest?.find((tm: any) => tm.id === m.id || tm.uid === m.id || tm.id === m.uid || tm.uid === m.uid);
            if (!me) return false;
            const checkField = t.direction === 'dropoff' ? 'dropoffStatus' : 'pickupStatus';
            return me[checkField] === 'absent';
          }).length;
          
          overallPresent += presentCount;
          overallAbsent += absentCount;
          routeTripsCount = Math.max(routeTripsCount, memberTrips.length);

          const rate = memberTrips.length > 0 ? Math.round((presentCount / memberTrips.length) * 100) : 0;
          return {
            m,
            presentCount,
            absentCount,
            totalTrips: memberTrips.length,
            rate
          };
        });

        // Compute aggregate metrics
        const totalPassCount = displayMembers.length;
        const averageAttendanceRate = (overallPresent + overallAbsent) > 0 
          ? Math.round((overallPresent / (overallPresent + overallAbsent)) * 100) 
          : 0;

        // Get initials for elegant avatar fallback
        const getInitials = (name: string) => {
          if (!name) return '??';
          const parts = name.trim().split(/\s+/);
          if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
          return parts[0]?.slice(0, 2).toUpperCase() || '??';
        };

        const selectedStopObj = allStops.find((s: any) => s.id === filterStopId);

        return (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500 mb-10">
            {/* Top Badge and Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Route Intelligence
                </span>
                <h4 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">
                  Route Attendance Summary
                </h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Consistency report for <span className="text-slate-800 font-black">{selectedRoute?.name || 'Selected Route'}</span>
                  {selectedStopObj && (
                    <span> ➔ Stop: <span className="text-emerald-600 font-black">{selectedStopObj.name}</span></span>
                  )}
                </p>
              </div>

              <div className="bg-slate-50/50 border border-slate-100 rounded-2xl px-4 py-2.5 flex items-center gap-2 self-start md:self-auto">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest leading-none">
                  Live Syncing • {filteredTrips.length} Trips Analyzed
                </span>
              </div>
            </div>

            {/* Smart KPI Presentation Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Card 1: Subset Size */}
              <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-100/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                <div className="absolute right-3 top-3 opacity-10 group-hover:scale-110 transition-all">
                  <Users className="w-12 h-12 text-slate-900" />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Monitored passengers</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-900 tracking-tight italic">{totalPassCount}</span>
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Students</span>
                </div>
                <div className="mt-3 text-[9px] font-bold text-slate-400">
                  {selectedStopObj ? `Assigned strictly to stop: ${selectedStopObj.name}` : 'Assigned across the entire route length'}
                </div>
              </div>

              {/* Card 2: Average Consistency */}
              <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-100/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                <div className="absolute right-3 top-3 opacity-10 group-hover:scale-110 transition-all">
                  <TrendingUp className="w-12 h-12 text-indigo-900" />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Overall cohort rate</p>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-3xl font-black tracking-tight italic ${
                    averageAttendanceRate >= 90 ? 'text-emerald-600' :
                    averageAttendanceRate >= 75 ? 'text-blue-600' :
                    averageAttendanceRate >= 50 ? 'text-amber-500' : 'text-rose-600'
                  }`}>{averageAttendanceRate}%</span>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">AVG Consistency</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        averageAttendanceRate >= 90 ? 'bg-emerald-500' :
                        averageAttendanceRate >= 75 ? 'bg-blue-500' :
                        averageAttendanceRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${averageAttendanceRate}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-black text-slate-400 capitalize">
                    {averageAttendanceRate >= 90 ? 'Excellent stability' : 
                     averageAttendanceRate >= 75 ? 'Reliable cohort' : 
                     averageAttendanceRate >= 50 ? 'Minor instability' : 'Requires review'}
                  </span>
                </div>
              </div>

              {/* Card 3: Boarding Breakdown Ratio */}
              <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-100/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                <div className="absolute right-3 top-3 opacity-15">
                  <div className="w-12 h-12 rounded-full border-4 border-dashed border-emerald-500 animate-spin-slow opacity-10" />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Total Boarding breakdown</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-slate-900 tracking-tight italic">{overallPresent + overallAbsent}</span>
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{overallPresent} Present</span>
                  <span className="text-[10px] font-black text-slate-300">•</span>
                  <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">{overallAbsent} Absent</span>
                </div>
                {/* Horizontal segment progress meter */}
                <div className="mt-4 flex h-2 rounded-lg overflow-hidden border border-slate-100">
                  {overallPresent + overallAbsent > 0 ? (
                    <>
                      <div className="bg-emerald-500" style={{ width: `${(overallPresent / (overallPresent + overallAbsent)) * 100}%` }} />
                      <div className="bg-rose-500" style={{ width: `${(overallAbsent / (overallPresent + overallAbsent)) * 100}%` }} />
                    </>
                  ) : (
                    <div className="bg-slate-200 w-full" />
                  )}
                </div>
              </div>
            </div>

            {/* Attendance Cards Grid Grid */}
            {memberDataList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {memberDataList.map(({ m, presentCount, absentCount, totalTrips, rate }) => {
                  // Determine status styling based on rate
                  const isPerfect = rate === 100;
                  const isHigh = rate >= 80 && rate < 100;
                  const isModerate = rate >= 50 && rate < 80;
                  const isCritical = rate > 0 && rate < 50;
                  const isInactive = rate === 0;

                  return (
                    <div 
                      key={m.id} 
                      className="bg-white rounded-[1.5rem] p-5 border border-slate-100/80 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all group flex flex-col justify-between"
                    >
                      {/* Top profile part */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          {/* Beautiful Initials or Avatar */}
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-black shadow-inner border border-slate-100 shrink-0 overflow-hidden ${
                            isPerfect ? 'bg-emerald-50 text-emerald-600' :
                            isHigh ? 'bg-indigo-50 text-indigo-600' :
                            isModerate ? 'bg-amber-50 text-amber-600' :
                            'bg-rose-50 text-rose-600'
                          }`}>
                            <img src={getUserAvatar(m.avatarUrl, m.photoURL, m.name, m.id || m.uid)} alt="" className="w-full h-full object-cover" />
                          </div>

                          <div>
                            <p className="text-xs font-black text-slate-900 tracking-tight group-hover:text-blue-700 transition-colors">
                              {m.name}
                            </p>
                            <p className="text-[8px] font-mono font-black text-slate-400 uppercase tracking-widest mt-0.5">
                              ID: {m.studentId || m.id?.slice(0, 8) || 'No ID'}
                            </p>
                            <p className="text-[8px] font-semibold text-slate-400 mt-1 truncate max-w-[150px]">
                              {selectedRoute?.pickupPoints?.find((p: any) => p.id === (m.pickupPointId || m.stopId))?.name || 'Assigned Stop'}
                            </p>
                          </div>
                        </div>

                        {/* Radial percentage svg wheel */}
                        <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            {/* Track */}
                            <path
                              className="text-slate-100"
                              strokeWidth="3.5"
                              stroke="currentColor"
                              fill="transparent"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            {/* Path */}
                            <path
                              className={`${
                                isPerfect ? 'text-emerald-500' :
                                isHigh ? 'text-indigo-500' :
                                isModerate ? 'text-amber-500' :
                                'text-rose-500'
                              } transition-all duration-500`}
                              strokeDasharray="100, 100"
                              strokeDashoffset={100 - rate}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              stroke="currentColor"
                              fill="transparent"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                          </svg>
                          <span className="absolute text-[8px] font-black text-slate-800">
                            {rate}%
                          </span>
                        </div>
                      </div>

                      {/* Horizontal attendance summary bars */}
                      <div className="space-y-2 pt-2 border-t border-slate-50">
                        {/* Attendance visual bar info */}
                        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-400">
                          <span>Boarding Logs</span>
                          <span className="text-slate-700">{totalTrips} evaluated</span>
                        </div>

                        {/* Dynamic segment ratio visualization */}
                        <div className="flex h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          {totalTrips > 0 ? (
                            <>
                              <div className="bg-emerald-500 rounded-l" style={{ width: `${(presentCount / totalTrips) * 100}%` }} />
                              <div className="bg-rose-500 rounded-r" style={{ width: `${(absentCount / totalTrips) * 100}%` }} />
                            </>
                          ) : (
                            <div className="bg-slate-100 w-full" />
                          )}
                        </div>

                        {/* Breakdown labels */}
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex gap-2">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                              {presentCount} Present
                            </span>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1" />
                              {absentCount} Absent
                            </span>
                          </div>

                          {/* Status Badge */}
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                            isPerfect ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            isHigh ? 'bg-blue-50 text-blue-600 border-blue-100' :
                            isModerate ? 'bg-amber-50 text-amber-600 border-amber-100' :
                            'bg-rose-50 text-rose-600 border-rose-100'
                          }`}>
                            {isPerfect ? 'Perfect' :
                             isHigh ? 'Consistent' :
                             isModerate ? 'Moderate' :
                             isInactive ? 'No Trips' : 'Irregular'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-20 text-center">
                <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  No monitored passengers match this stop criteria
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Adjust your search inputs or try selecting a different stop in the filter panel.
                </p>
              </div>
            )}
          </div>
        );
      })()}


       {/* History Ledger / Detailed User Table */}
       {reportTab === 'trips' ? (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm animate-in fade-in duration-300">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
             <h4 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Recent Trip Records</h4>
             <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredTrips.length} entries recorded</span>
             </div>
          </div>
          
          <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-white border-b border-slate-100">
                      <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-20">Sl No.</th>
                      <th className="px-4 sm:px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Driver & Vehicle</th>
                      <th className="px-4 sm:px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Route</th>
                      <th className="px-4 sm:px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timing</th>
                      <th className="px-4 sm:px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Attendance</th>
                      <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Trip Status</th>
                   </tr>
                </thead>
                <tbody>
                   {filteredTrips.length === 0 ? (
                      <tr>
                         <td colSpan={6} className="px-8 py-20 text-center">
                            <div className="flex flex-col items-center justify-center">
                               <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200 mb-4">
                                  <Bus size={32} />
                               </div>
                               <p className="text-sm font-black text-slate-900 uppercase italic tracking-tight">No Records Found</p>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Try adjusting your filters or time range</p>
                            </div>
                         </td>
                      </tr>
                   ) : filteredTrips.map((t, index) => {
                      const vehicle = vehicles.find((v: any) => v.id === t.vehicleId);
                      const driver = drivers.find((d: any) => d.uid === t.driverId);
                      const route = routes.find((r: any) => r.id === t.routeId);
                      const rawDate = t.startedAt || t.startTime;
                      const startDate = rawDate?.toDate ? rawDate.toDate() : (rawDate?.seconds ? new Date(rawDate.seconds * 1000) : new Date(rawDate));
                      const isValidDate = !isNaN(startDate.getTime());
                      const checkRowField = t.direction === 'dropoff' ? 'dropoffStatus' : 'pickupStatus';
                      const pickedCount = t.manifest?.filter((m: any) => m[checkRowField] === 'picked' || m[checkRowField] === 'dropped').length || 0;
                      const absentCount = t.manifest?.filter((m: any) => m[checkRowField] === 'absent').length || 0;
                      const totalAssigned = t.manifest?.length || 0;

                      const displayStatus = getTripStatusWord(t);

                      return (
                         <tr 
                           key={t.id} 
                           onClick={() => setSelectedTrip(t)}
                           className="group hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0"
                         >
                            <td className="px-4 sm:px-8 py-6 text-center">
                               <span className="text-[10px] font-black text-slate-400 font-mono italic">{index + 1}</span>
                            </td>
                            <td className="px-4 sm:px-6 py-6">
                               <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                     <Bus size={20} />
                                  </div>
                                  <div>
                                     <p className="text-sm font-black text-slate-900 tracking-tight leading-none mb-1 uppercase italic">{driver?.name || 'No Driver'}</p>
                                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plate: {vehicle?.plateNumber || 'N/A'}</p>
                                  </div>
                               </div>
                            </td>
                            <td className="px-6 py-6">
                               <p className="text-xs font-black text-slate-700 tracking-tight leading-none mb-1 uppercase">{route?.name || 'Active Route'}</p>
                               <div className="flex items-center gap-2">
                                  <span className={cn(
                                     "text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest border font-mono",
                                     t.direction === 'pickup' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-indigo-50 text-indigo-600 border-indigo-100"
                                  )}>{t.direction || 'trip'}</span>
                               </div>
                            </td>
                            <td className="px-6 py-6">
                               <div className="flex items-center gap-2 mb-1">
                                  <Calendar size={12} className="text-slate-400" />
                                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">{isValidDate ? startDate.toLocaleDateString() : 'N/A'}</p>
                               </div>
                               <div className="flex items-center gap-2">
                                  <Clock size={12} className="text-slate-400" />
                                  <p className="text-[10px] font-medium text-slate-400 font-mono">{isValidDate ? startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---'}</p>
                               </div>
                            </td>
                            <td className="px-6 py-6">
                               <div className="flex items-center justify-center gap-1.5">
                                  <div className="text-center px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 min-w-[60px]">
                                     <p className="text-[8px] font-black uppercase opacity-60 leading-none mb-0.5">Present</p>
                                     <p className="text-xs font-black leading-none">{pickedCount}</p>
                                  </div>
                                  <div className="text-center px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 min-w-[60px]">
                                     <p className="text-[8px] font-black uppercase opacity-60 leading-none mb-0.5">Absent</p>
                                     <p className="text-xs font-black leading-none">{absentCount}</p>
                                  </div>
                                  <div className="text-center px-3 py-1.5 bg-slate-50 text-slate-500 rounded-xl border border-slate-100 min-w-[60px]">
                                     <p className="text-[8px] font-black uppercase opacity-60 leading-none mb-0.5">Total</p>
                                     <p className="text-xs font-black leading-none">{totalAssigned}</p>
                                  </div>
                               </div>
                            </td>
                            <td className="px-8 py-6 text-right">
                               <span className={cn(
                                  "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest italic border block text-center ml-auto w-fit",
                                  displayStatus === 'On the Way' ? "bg-green-50 text-green-600 border-green-100 animate-pulse" : 
                                  displayStatus === 'Successfully Completed' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                  displayStatus === 'Partially Handled' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                  displayStatus === 'No Attendance Marked' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                  displayStatus === 'Empty Trip' ? "bg-slate-100 text-slate-400 border-slate-200" :
                                  "bg-slate-50 text-slate-400 border-slate-100"
                               )}>{displayStatus}</span>
                            </td>
                         </tr>
                      );
                   })}
                </tbody>
             </table>
             {trips.length === 0 && (
                <div className="py-20 text-center text-slate-200">
                   <Search size={48} className="mx-auto mb-4 opacity-5" />
                   <p className="text-[10px] font-black uppercase tracking-widest">No operation logs found</p>
                </div>
             )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm animate-in fade-in duration-300">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
             <h4 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Detailed User Attendance Records</h4>
             <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{detailedUserRows.length} user action logs</span>
             </div>
          </div>
          
          <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-white border-b border-slate-100">
                      <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-20">Sl No.</th>
                      <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{sectorLabel}</th>
                      <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Route & Direction</th>
                      <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Stop</th>
                      <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Pick up</th>
                      <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Drop off</th>
                      <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Driver</th>
                   </tr>
                </thead>
                <tbody>
                   {detailedUserRows.length === 0 ? (
                      <tr>
                         <td colSpan={8} className="px-8 py-20 text-center">
                            <div className="flex flex-col items-center justify-center">
                               <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200 mb-4">
                                  <Users size={32} />
                               </div>
                               <p className="text-sm font-black text-slate-900 uppercase italic tracking-tight">No User Logs Found</p>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Try adjusting your filters or search query</p>
                            </div>
                         </td>
                      </tr>
                   ) : detailedUserRows.map((row, index) => {
                      const pTimeObj = row.pickupUpdatedAt 
                         ? (typeof row.pickupUpdatedAt === 'string' ? new Date(row.pickupUpdatedAt) : row.pickupUpdatedAt?.toDate?.())
                         : null;
                      const dTimeObj = row.dropoffUpdatedAt 
                         ? (typeof row.dropoffUpdatedAt === 'string' ? new Date(row.dropoffUpdatedAt) : row.dropoffUpdatedAt?.toDate?.())
                         : null;

                      const pTimeStr = pTimeObj && !isNaN(pTimeObj.getTime()) ? pTimeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';
                      const dTimeStr = dTimeObj && !isNaN(dTimeObj.getTime()) ? dTimeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';

                      return (
                         <tr 
                           key={row.id} 
                           className="group hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                         >
                            <td className="px-4 sm:px-8 py-5 text-center">
                               <span className="text-[10px] font-black text-slate-400 font-mono italic">{index + 1}</span>
                            </td>
                            <td className="px-4 py-5 font-bold text-slate-700 text-xs whitespace-nowrap">
                               {row.date.toLocaleDateString()}
                            </td>
                            <td className="px-4 py-5">
                               <div>
                                  <p className="text-xs font-black text-slate-900 tracking-tight leading-none">{row.passengerName}</p>
                                  {row.passengerId && (
                                     <p className="text-[8px] font-bold text-slate-400 tracking-widest uppercase mt-1 leading-none">
                                        {sectorLabel.toUpperCase()} ID: {row.passengerId}
                                     </p>
                                  )}
                               </div>
                            </td>
                            <td className="px-4 py-5">
                               <p className="text-xs font-black text-slate-700 uppercase leading-none mb-1">{row.routeName}</p>
                               <span className={cn(
                                  "text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest border font-mono inline-block leading-none",
                                  row.direction === 'pickup' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-indigo-50 text-indigo-600 border-indigo-100"
                               )}>{row.direction}</span>
                            </td>
                            <td className="px-4 py-5 font-medium text-slate-600 text-xs">
                               {row.stopName}
                            </td>
                            <td className="px-4 py-5">
                               <div className="flex flex-col items-center justify-center">
                                  <span className={cn(
                                     "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border leading-none",
                                     row.pickupStatus === 'picked' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                     row.pickupStatus === 'absent' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                     "bg-slate-50 text-slate-400 border-slate-200"
                                  )}>
                                     {row.pickupStatus === 'picked' ? 'Picked' : row.pickupStatus === 'absent' ? 'Absent' : 'Waiting'}
                                  </span>
                                  {row.pickupStatus === 'picked' && (
                                     <span className="text-[9px] font-mono font-medium text-slate-400 mt-1 leading-none">{pTimeStr}</span>
                                  )}
                               </div>
                            </td>
                            <td className="px-4 py-5">
                               <div className="flex flex-col items-center justify-center">
                                  <span className={cn(
                                     "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border leading-none",
                                     row.dropoffStatus === 'dropped' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                     row.dropoffStatus === 'absent' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                     "bg-slate-50 text-slate-400 border-slate-200"
                                  )}>
                                     {row.dropoffStatus === 'dropped' ? 'Dropped' : row.dropoffStatus === 'absent' ? 'Absent' : 'Pending'}
                                  </span>
                                  {row.dropoffStatus === 'dropped' && (
                                     <span className="text-[9px] font-mono font-medium text-slate-400 mt-1 leading-none">{dTimeStr}</span>
                                  )}
                                </div>
                            </td>
                            <td className="px-4 sm:px-8 py-5 text-right whitespace-nowrap">
                               <div className="text-right">
                                  <p className="text-xs font-black text-slate-900 uppercase italic leading-none">{row.driverName}</p>
                                  <p className="text-[9px] font-bold text-slate-400 mt-1 leading-none">{row.vehiclePlate}</p>
                               </div>
                            </td>
                         </tr>
                      );
                   })}
                </tbody>
             </table>
          </div>
        </div>
      )}

      {/* Manifest Detail Modal */}
      <AnimatePresence>
        {selectedTrip && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setSelectedTrip(null)}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ scale: 0.95, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.95, opacity: 0, y: 20 }}
               className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
             >
                <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                   <div>
                      <h4 className="text-xl font-black text-slate-900 tracking-tight leading-none mb-1">Trip Manifest Details</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">{routes.find((r: any) => r.id === selectedTrip.routeId)?.name || 'Route Details'}</p>
                   </div>
                   <button onClick={() => setSelectedTrip(null)} className="p-2 text-slate-400 hover:text-slate-900">
                      <X className="w-6 h-6" />
                   </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4">
                   {selectedTrip.manifest?.length > 0 ? (
                      <div className="space-y-2">
                         {selectedTrip.manifest.map((m: any, mIdx: any) => (
                            <div key={m.id || mIdx} className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between border border-slate-100">
                               <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-400 border border-slate-100 overflow-hidden shadow-sm">
                                     <img src={getUserAvatar(m.avatarUrl, m.photoURL, m.name, m.id || m.uid)} alt="" className="w-full h-full object-cover" />
                                  </div>
                                  <div>
                                     <p className="text-xs font-black text-slate-900 tracking-tight">{m.name}</p>
                                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{m.className || 'General'}</p>
                                  </div>
                               </div>
                               <div className={cn(
                                  "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest italic border",
                                  (selectedTrip.direction === 'dropoff' ? m.dropoffStatus : m.pickupStatus) === 'picked' || (selectedTrip.direction === 'dropoff' ? m.dropoffStatus : m.pickupStatus) === 'dropped' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                  (selectedTrip.direction === 'dropoff' ? m.dropoffStatus : m.pickupStatus) === 'absent' ? "bg-rose-50 text-rose-600 border-rose-100" : 
                                  "bg-slate-100 text-slate-400 border-slate-200"
                               )}>
                                  {(selectedTrip.direction === 'dropoff' ? m.dropoffStatus : m.pickupStatus) === 'picked' ? 'Picked Up' : 
                                   (selectedTrip.direction === 'dropoff' ? m.dropoffStatus : m.pickupStatus) === 'dropped' ? 'Arrived/Dropped' :
                                   (selectedTrip.direction === 'dropoff' ? m.dropoffStatus : m.pickupStatus) === 'absent' ? 'Reported Absent' : 'Pending Boarding'}
                               </div>
                            </div>
                         ))}
                      </div>
                   ) : (
                      <div className="py-20 text-center">
                         <Activity className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                         <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No manifest data available for this trip</p>
                      </div>
                   )}
                </div>

                <div className="p-6 sm:p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                   <div className="flex gap-4">
                      <div className="text-center">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Start Time</p>
                         <p className="text-[10px] font-bold text-slate-700">
                           {(() => {
                              const rawStart = selectedTrip.startedAt || selectedTrip.startTime;
                              if (!rawStart) return '---';
                              const d = rawStart.toDate ? rawStart.toDate() : new Date(rawStart);
                              return !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';
                           })()}
                         </p>
                      </div>
                      <div className="text-center">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">End Time</p>
                         <p className="text-[10px] font-bold text-slate-700">
                           {(() => {
                              const rawEnd = selectedTrip.endedAt || selectedTrip.endTime || selectedTrip.completedAt;
                              if (!rawEnd) return '---';
                              const d = rawEnd.toDate ? rawEnd.toDate() : new Date(rawEnd);
                              return !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';
                           })()}
                         </p>
                      </div>
                   </div>
                   <button 
                     onClick={() => setSelectedTrip(null)}
                     className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                   >
                     Close Ledger
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Settings({ org, classes, orgId, isEducation, isCollege, members, onRefresh }: any) {
  const [isAddingClass, setIsAddingClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassSections, setNewClassSections] = useState('');
  const [editingClass, setEditingClass] = useState<any>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [renamingClass, setRenamingClass] = useState<any>(null);
  const [renamedValue, setRenamedValue] = useState('');
  const [renamingSection, setRenamingSection] = useState<{ classId: string, oldName: string } | null>(null);
  const [renamedSectionValue, setRenamedSectionValue] = useState('');
  const [orgLoc, setOrgLoc] = useState({ 
    lat: org?.location?.lat?.toString() || '', 
    lng: org?.location?.lng?.toString() || '' 
  });
  const [isUpdatingLoc, setIsUpdatingLoc] = useState(false);
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [orgSuggestions, setOrgSuggestions] = useState<any[]>([]);
  const [isOrgSearching, setIsOrgSearching] = useState(false);
  const [shouldSearchSuggestions, setShouldSearchSuggestions] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const { userData } = useAuth();

  useEffect(() => {
    console.log('Settings: org prop updated', org?.id, org?.location);
  }, [org]);

  useEffect(() => {
    if (org?.location && isValidCoordinate(org.location.lat, org.location.lng)) {
      const newLat = org.location.lat.toString();
      const newLng = org.location.lng.toString();
      
      // Only update if actually different to prevent loops
      if (orgLoc.lat !== newLat || orgLoc.lng !== newLng) {
        setOrgLoc({
          lat: newLat,
          lng: newLng
        });
      }
    }
  }, [org?.id, org?.location?.lat, org?.location?.lng, isInputFocused]);

  useEffect(() => {
    if (!shouldSearchSuggestions || !isInputFocused || !orgSearchQuery || orgSearchQuery.length < 3) {
      setOrgSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const center = org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
          ? org.location 
          : { lat: 17.4504, lng: 78.3808 };
        const left = center.lng - 1.0;
        const right = center.lng + 1.0;
        const top = center.lat + 1.0;
        const bottom = center.lat - 1.0;
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(orgSearchQuery)}&limit=15&addressdetails=1&countrycodes=in&viewbox=${left},${top},${right},${bottom}`);
        const data = await response.json();
        // Double check input is still focused and we still want suggestions
        if (shouldSearchSuggestions && isInputFocused) {
          setOrgSuggestions(data || []);
        }
      } catch (e) {
        console.warn('Org suggestions fetch failed', e);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [orgSearchQuery, shouldSearchSuggestions, isInputFocused, org]);

  const handleSelectOrgSuggestion = (s: any) => {
    setShouldSearchSuggestions(false);
    setOrgLoc({
      lat: parseFloat(s.lat).toFixed(6),
      lng: parseFloat(s.lon).toFixed(6)
    });
    setOrgSearchQuery(s.display_name.split(',')[0]);
    setOrgSuggestions([]);
  };
  
  const classLabel = isEducation ? (isCollege ? 'Group' : 'Class') : 'Department';
  const sectionLabel = isEducation ? 'Section' : 'Roll';
  const classLabelPlural = isEducation ? (isCollege ? 'Groups' : 'Classes') : 'Departments';
  const sectionLabelPlural = isEducation ? 'Sections' : 'Rolls';
  
  const getOrgIcon = () => {
    return getLocalIcon(org?.logo || org?.logoUrl || (org?.sector === 'Education' ? (org?.eduType === 'College' ? 'graduation-cap' : 'school') : (org?.sector === 'Healthcare' ? 'hospital' : (org?.sector === 'Government' ? 'museum' : 'commercial'))));
  };

  const orgIconUrl = getOrgIcon();
  const orgColor = isEducation ? (isCollege ? '#6366f1' : '#4f46e5') : '#0f172a';

  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Update Location initiated...', { orgId, orgLoc });

    if (!isValidCoordinate(orgLoc.lat, orgLoc.lng)) {
      console.warn('Invalid coordinates check failed:', orgLoc);
      toast.error('Invalid coordinates. Lat: -90 to 90, Lng: -180 to 180.');
      return;
    }

    setIsUpdatingLoc(true);
    try {
      if (!orgId) throw new Error('Organization ID is missing');
      
      const performUpdate = async () => {
        await saveMySQLRecord('update', 'organizations', orgId, {
          latitude: parseFloat(orgLoc.lat),
          longitude: parseFloat(orgLoc.lng)
        });
        if (onRefresh) onRefresh();
      };
      
      await toast.promise(
        performUpdate(),
        {
          loading: 'Propagating global location updates...',
          success: 'Organization base location secured!',
          error: (err) => `Update failed: ${err.message || 'Check connection'}`
        },
        { id: 'org-loc-update' }
      );
      
      console.log('Update successful');
    } catch (e: any) {
      console.error('Update Org Location Wrapper Error:', e);
      if (e.message !== 'Organization ID is missing') {
        toast.error(`Update Error: ${e.message}`);
      }
    } finally {
      setIsUpdatingLoc(false);
    }
  };

  const handleUpdateEduType = async (type: 'School' | 'College') => {
    try {
      await saveMySQLRecord('update', 'organizations', orgId, {
        eduType: type
      });
      toast.success(`Sector mode updated to ${type} successfully`);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    }
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    try {
      const sections = newClassSections.split(',').map(s => s.trim()).filter(s => s !== '');
      const generatedId = 'CLASS-' + Math.random().toString(36).substring(2, 9).toUpperCase();
      await saveMySQLRecord('insert', 'classes', generatedId, {
        name: newClassName.trim(),
        sections: sections,
        orgId
      });
      setNewClassName('');
      setNewClassSections('');
      setIsAddingClass(false);
      toast.success(`${classLabel} added successfully`);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to add');
    }
  };

  const handleUpdateClassName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamedValue.trim() || !renamingClass) return;
    try {
      await saveMySQLRecord('update', 'classes', renamingClass.id, {
        name: renamedValue.trim(),
        orgId
      });
      setRenamingClass(null);
      setRenamedValue('');
      toast.success(`${classLabel} updated successfully`);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Update failed');
    }
  };

  const handleUpdateSectionName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamedSectionValue.trim() || !renamingSection) return;
    
    const { classId, oldName } = renamingSection;
    const newName = renamedSectionValue.trim();
    
    if (oldName === newName) {
      setRenamingSection(null);
      return;
    }

    try {
      const cls = classes.find((c: any) => c.id === classId);
      if (cls.sections?.includes(newName)) {
        toast.error(`${sectionLabel} name already exists`);
        return;
      }

      // 1. Update Class sections array in MySQL
      const newSections = cls.sections.map((s: string) => s === oldName ? newName : s);
      await saveMySQLRecord('update', 'classes', classId, {
        sections: newSections,
        orgId
      });

      // 2. Update Members assigned to this section in MySQL
      const membersToUpdate = members.filter((m: any) => m.classId === classId && m.section === oldName);
      for (const m of membersToUpdate) {
        await saveMySQLRecord('update', 'users', m.uid || m.id, {
          section: newName
        });
      }

      setRenamingSection(null);
      setRenamedSectionValue('');
      toast.success(`${sectionLabel} updated successfully`);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Update failed');
    }
  };

  const handleAddSection = async (classId: string) => {
    if (!newSectionName.trim()) return;
    try {
      const cls = classes.find((c: any) => c.id === classId);
      if (cls.sections?.includes(newSectionName.trim())) {
        toast.error(`${sectionLabel} already exists`);
        return;
      }
      const updatedSections = [...(cls.sections || []), newSectionName.trim()];
      await saveMySQLRecord('update', 'classes', classId, {
        sections: updatedSections,
        orgId
      });
      setNewSectionName('');
      toast.success(`${sectionLabel} added successfully`);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(e.message || `Failed to add ${sectionLabel.toLowerCase()}`);
    }
  };

  const handleRemoveSection = async (classId: string, section: string) => {
    // Check if any member is assigned to this class and section
    const assignedMembers = members.filter((m: any) => m.classId === classId && m.section === section);
    if (assignedMembers.length > 0) {
      toast.error(`Cannot delete: ${assignedMembers.length} ${assignedMembers.length === 1 ? 'member is' : 'members are'} still assigned to this ${sectionLabel.toLowerCase()}.`);
      return;
    }

    toast((t) => (
      <div className="flex flex-col gap-3 p-1">
        <div className="flex items-center gap-2 text-rose-600">
           <Trash2 className="w-5 h-5 shrink-0" />
           <p className="text-sm font-black uppercase italic leading-none">Delete {sectionLabel}?</p>
        </div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
          Are you sure you want to delete {sectionLabel.toLowerCase()} <span className="text-slate-900">"{section}"</span>?
        </p>
        <div className="flex gap-2 justify-end mt-2 font-black">
           <button 
             onClick={() => toast.dismiss(t.id)} 
             className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
           >
             No, Keep
           </button>
           <button 
             onClick={async () => {
               toast.dismiss(t.id);
               try {
                 const cls = classes.find((c: any) => c.id === classId);
                 const updatedSections = (cls.sections || []).filter((s: string) => s !== section);
                 await saveMySQLRecord('update', 'classes', classId, {
                   sections: updatedSections,
                   orgId
                 });
                 toast.success(`${sectionLabel} deleted successfully`);
                 if (onRefresh) onRefresh();
               } catch (e: any) {
                 toast.error(e.message || `Failed to remove ${sectionLabel.toLowerCase()}`);
               }
             }}
             className="px-4 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-90 transition-all"
           >
             Yes, Delete
           </button>
        </div>
      </div>
    ), { duration: 10000 });
  };

  const handleDeleteClass = async (classId: string) => {
    // Check if any member is assigned to this class
    const assignedMembers = members.filter((m: any) => m.classId === classId);
    if (assignedMembers.length > 0) {
      toast.error(`Cannot delete: ${assignedMembers.length} ${assignedMembers.length === 1 ? 'member is' : 'members are'} still assigned to this ${classLabel.toLowerCase()}.`);
      return;
    }

    toast((t) => (
      <div className="flex flex-col gap-3 p-1">
        <div className="flex items-center gap-2 text-rose-600">
           <Trash2 className="w-5 h-5 shrink-0" />
           <p className="text-sm font-black uppercase italic leading-none">Delete {classLabel}?</p>
        </div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
          Are you sure you want to delete this {classLabel.toLowerCase()}?
        </p>
        <div className="flex gap-2 justify-end mt-2 font-black">
           <button 
             onClick={() => toast.dismiss(t.id)} 
             className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
           >
             No, Keep
           </button>
           <button 
             onClick={async () => {
               toast.dismiss(t.id);
               try {
                 await saveMySQLRecord('delete', 'classes', classId);
                 toast.success(`${classLabel} deleted successfully`);
                 if (onRefresh) onRefresh();
               } catch (e: any) {
                 toast.error(e.message || 'Delete failed');
               }
             }}
             className="px-4 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-90 transition-all"
           >
             Yes, Delete
           </button>
        </div>
      </div>
    ), { duration: 10000 });
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1">System Settings</h3>
          <p className="text-xs text-slate-400 font-medium tracking-tight">Configure your profile and organization structure</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100/50">
                  {isEducation ? (isCollege ? <GraduationCap className="w-6 h-6" /> : <School className="w-6 h-6" />) : <Building2 className="w-6 h-6" />}
                </div>
                <div>
                  <h4 className="text-xl font-black text-slate-900 uppercase italic leading-none">Sector Profile</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Current identity: {isEducation ? (isCollege ? 'Higher Education' : 'K-12 Education') : 'Corporate Employee Transport'}</p>
                </div>
              </div>
              {isEducation && (
                <div className="flex gap-2 p-1 bg-slate-50 rounded-2xl border border-slate-100 w-full md:w-auto">
                  <button 
                    onClick={() => handleUpdateEduType('School')}
                    className={cn(
                      "flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                      isEducation && !isCollege ? "bg-white text-blue-600 shadow-md border border-slate-100" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <School className="w-3.5 h-3.5" /> School
                  </button>
                  <button 
                    onClick={() => handleUpdateEduType('College')}
                    className={cn(
                      "flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                      isEducation && isCollege ? "bg-white text-blue-600 shadow-md border border-slate-100" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <GraduationCap className="w-3.5 h-3.5" /> College
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-100/50">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900 uppercase italic leading-none">Organization Base Location</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Set the primary destination for all fleet operations</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="relative group">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-2 block">Search Location</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="text" 
                    value={orgSearchQuery}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => {
                      // Delayed clear of suggestions to allow clicking on results
                      setTimeout(() => {
                        setIsInputFocused(false);
                        setOrgSuggestions([]);
                      }, 200);
                    }}
                    onChange={e => {
                      setOrgSearchQuery(e.target.value);
                      setShouldSearchSuggestions(true);
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (orgSearchQuery.length >= 3) {
                          try {
                            setShouldSearchSuggestions(false);
                            setIsOrgSearching(true);
                            const center = org?.location && isValidCoordinate(org.location.lat, org.location.lng) 
                              ? org.location 
                              : { lat: 17.4504, lng: 78.3808 };
                            const left = center.lng - 1.0;
                            const right = center.lng + 1.0;
                            const top = center.lat + 1.0;
                            const bottom = center.lat - 1.0;
                            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(orgSearchQuery)}&limit=1&addressdetails=1&countrycodes=in&viewbox=${left},${top},${right},${bottom}`);
                            const data = await response.json();
                            if (data && data.length > 0) {
                              handleSelectOrgSuggestion(data[0]);
                              toast.success(`Location set to: ${data[0].display_name.split(',')[0]}`);
                            } else {
                              toast.error('Location not found');
                            }
                          } catch (err) {
                            toast.error('Search failed');
                          } finally {
                            setIsOrgSearching(false);
                          }
                        }
                      }
                    }}
                    placeholder="Search for your organization or campus..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-12 py-3.5 text-sm font-bold focus:ring-8 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all shadow-sm"
                  />
                  {orgSearchQuery && (
                    <button 
                      type="button" 
                      onClick={() => { setOrgSearchQuery(''); setOrgSuggestions([]); }}
                      className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-slate-900 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {isOrgSearching && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {orgSuggestions.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-2xl z-[100] overflow-hidden"
                    >
                      {orgSuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelectOrgSuggestion(s)}
                          className="w-full px-5 py-3 text-left hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 last:border-0"
                        >
                          <MapPin className="w-4 h-4 text-slate-300" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-black text-slate-900 uppercase italic truncate">{s.display_name.split(',')[0]}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate">{s.display_name.split(',').slice(1).join(',').trim()}</p>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <form onSubmit={handleUpdateLocation} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div className="space-y-1.5 focus-within:z-10 relative">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Latitude</label>
                <input 
                  type="text" 
                  value={orgLoc.lat} 
                  onChange={e => setOrgLoc({...orgLoc, lat: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-mono font-bold focus:ring-8 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all" 
                  placeholder="e.g. 17.4448"
                />
              </div>
              <div className="space-y-1.5 focus-within:z-10 relative">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Longitude</label>
                <input 
                  type="text" 
                  value={orgLoc.lng} 
                  onChange={e => setOrgLoc({...orgLoc, lng: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-mono font-bold focus:ring-8 focus:ring-blue-500/5 focus:border-blue-500/40 outline-none transition-all" 
                  placeholder="e.g. 78.3498"
                />
              </div>
              <button 
                type="submit" 
                disabled={isUpdatingLoc}
                className="bg-slate-900 text-white rounded-xl py-4 text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-indigo-600 transition-all active:scale-95 disabled:opacity-50 h-[46px] md:h-12 flex items-center justify-center gap-3 group"
              >
                {isUpdatingLoc ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                {isUpdatingLoc ? 'Propagating...' : 'Update Destination'}
              </button>
            </form>
          </div>

            <div className="h-72 rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-inner group/map relative">
               <MapComponent 
                 height="100%" 
                 zoom={15} 
                 center={sanitizeCenter(isValidCoordinate(orgLoc.lat, orgLoc.lng) ? orgLoc : null)}
                 onClick={async (lat: number, lng: number) => {
                    setShouldSearchSuggestions(false);
                    setOrgLoc({ lat: lat.toString(), lng: lng.toString() });
                    
                    // Reverse geocode to update search query/friendly name
                    try {
                      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                      const data = await response.json();
                      if (data && data.display_name) {
                        setOrgSearchQuery(data.display_name.split(',')[0]);
                        setOrgSuggestions([]);
                      }
                    } catch (err) {
                      console.warn('Reverse geocoding failed', err);
                    }
                 }}
               >
                 {isValidCoordinate(orgLoc.lat, orgLoc.lng) && (
                   <Marker 
                     key="setup-org-marker"
                     position={[parseFloat(orgLoc.lat), parseFloat(orgLoc.lng)]} 
                     icon={createMarkerIcon(orgColor, orgIconUrl, orgColor, org?.name || 'BASE')}
                   >
                    <Popup>
                      <div className="p-3 text-center min-w-[120px]">
                        <p className="text-[9px] font-black uppercase text-indigo-500 italic mb-1 tracking-widest">{org?.sector || 'Headquarters'}</p>
                        <p className="text-xs font-black text-slate-800 uppercase italic truncate">{org?.name || 'Organization Base'}</p>
                      </div>
                    </Popup>
                   </Marker>
                 )}
               </MapComponent>
               <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-4 py-2 rounded-xl text-[9px] font-black text-slate-900 uppercase tracking-widest shadow-lg border border-slate-100 pointer-events-none">
                  Click on map to set coordinates
               </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xl font-black text-slate-900 uppercase italic leading-none">
                    {isEducation ? (isCollege ? 'Groups & Sections' : 'Classes & Sections') : 'Departments & Rolls'}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Define {isEducation ? 'academic' : 'business'} hierarchy</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddingClass(true)}
                className="p-3 bg-slate-900 text-white rounded-xl hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-slate-900/10"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {isAddingClass && (
              <motion.form 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleAddClass} 
                className="flex flex-col gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-100"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{classLabel} Name</label>
                    <input 
                      autoFocus
                      required 
                      type="text" 
                      value={newClassName} 
                      onChange={e => setNewClassName(e.target.value)} 
                      className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3 text-sm font-bold focus:ring-4 focus:ring-blue-500/5 outline-none transition-all" 
                      placeholder={isEducation ? (isCollege ? "e.g. MCA or B.Tech" : "e.g. Class 10") : "e.g. Sales Team"} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{sectionLabelPlural} (optional, comma separated)</label>
                    <input 
                      type="text" 
                      value={newClassSections} 
                      onChange={e => setNewClassSections(e.target.value)} 
                      className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3 text-sm font-bold focus:ring-4 focus:ring-blue-500/5 outline-none transition-all" 
                      placeholder={isEducation ? "e.g. A, B, C" : "e.g. 1, 2, 3"} 
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsAddingClass(false)} className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-all">Cancel</button>
                  <button type="submit" className="px-8 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all">Create {classLabel}</button>
                </div>
              </motion.form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {classes.map((cls: any) => (
                <div key={cls.id} className="group relative bg-slate-50 rounded-[2rem] p-6 border border-slate-100 hover:border-blue-200 hover:bg-white transition-all shadow-sm hover:shadow-xl hover:shadow-blue-500/5">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:scale-110 transition-all border border-slate-100">
                          <Building2 className="w-5 h-5" />
                       </div>
                       {renamingClass?.id === cls.id ? (
                         <form onSubmit={handleUpdateClassName} className="flex gap-2">
                           <input 
                             autoFocus
                             type="text" 
                             value={renamedValue} 
                             onChange={e => setRenamedValue(e.target.value)}
                             className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 w-32"
                           />
                           <button type="submit" className="text-blue-600 hover:text-blue-700">
                             <Check className="w-4 h-4" />
                           </button>
                           <button type="button" onClick={() => setRenamingClass(null)} className="text-slate-400 hover:text-slate-500">
                             <X className="w-4 h-4" />
                           </button>
                         </form>
                       ) : (
                         <div className="flex items-center gap-2 group/title">
                           <h5 className="text-sm font-black text-slate-800 uppercase italic tracking-tight">{cls.name}</h5>
                           <button 
                             onClick={() => {
                               setRenamingClass(cls);
                               setRenamedValue(cls.name);
                             }}
                             className="p-2 text-slate-400 hover:text-blue-600 transition-all bg-white rounded-lg border border-slate-100 shadow-sm"
                           >
                             <Pencil className="w-3.5 h-3.5" />
                           </button>
                         </div>
                       )}
                    </div>
                    <button 
                      onClick={() => handleDeleteClass(cls.id)}
                      className="p-2.5 text-slate-400 hover:text-red-500 transition-colors bg-white rounded-lg border border-slate-100 shadow-sm"
                      title={`Delete ${classLabel}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {cls.sections?.map((s: string) => (
                        <div key={s} className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl group/sec hover:border-blue-500 transition-all min-h-[36px]">
                          {renamingSection?.classId === cls.id && renamingSection?.oldName === s ? (
                            <form onSubmit={handleUpdateSectionName} className="flex items-center gap-1">
                              <input 
                                autoFocus
                                type="text"
                                value={renamedSectionValue}
                                onChange={e => setRenamedSectionValue(e.target.value)}
                                className="w-20 bg-transparent border-none p-0 text-[10px] font-black text-slate-600 uppercase tracking-widest outline-none"
                              />
                              <button type="submit" className="text-blue-600">
                                <Check className="w-3 h-3" />
                              </button>
                              <button type="button" onClick={() => setRenamingSection(null)} className="text-slate-400">
                                <X className="w-3 h-3" />
                              </button>
                            </form>
                          ) : (
                            <>
                              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{s}</span>
                              <div className="flex items-center gap-1">
                                 <button 
                                   onClick={() => {
                                     setRenamingSection({ classId: cls.id, oldName: s });
                                     setRenamedSectionValue(s);
                                   }}
                                   className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors bg-slate-50 rounded-md"
                                 >
                                   <Pencil className="w-3 h-3" />
                                 </button>
                                 <button 
                                   onClick={() => handleRemoveSection(cls.id, s)}
                                   className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors bg-slate-50 rounded-md"
                                 >
                                   <Trash2 className="w-3 h-3" />
                                 </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-2">
                       <input 
                         type="text"
                         placeholder={`Add ${sectionLabel.toLowerCase()}...`}
                         value={editingClass?.id === cls.id ? newSectionName : ''}
                         onChange={e => {
                           setEditingClass(cls);
                           setNewSectionName(e.target.value);
                         }}
                         onKeyDown={e => {
                           if (e.key === 'Enter') {
                             e.preventDefault();
                             handleAddSection(cls.id);
                           }
                         }}
                         className="flex-1 bg-white/50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold focus:bg-white focus:ring-4 focus:ring-blue-500/5 outline-none transition-all"
                       />
                       <button 
                         onClick={() => handleAddSection(cls.id)}
                         className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all active:scale-90"
                       >
                         <Plus className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </div>
                </div>
              ))}

              {classes.length === 0 && !isAddingClass && (
                <div className="md:col-span-2 py-20 text-center bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-100">
                   <Building2 className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No structures defined yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
