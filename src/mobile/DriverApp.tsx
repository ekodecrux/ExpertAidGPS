import React, { useState, useEffect, useRef } from 'react';
import MobileLayout from '../components/MobileLayout';
import DriverDashboard from '../pages/DriverDashboard';
import DriverRoutesView from './DriverRoutesView';
import DriverMapView from './DriverMapView';
import { Home, Map, MessageSquare, User, ListChecks, Play, Square, Navigation, Power, Mail, Phone, Shield, Truck, Key, Camera, ChevronRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db, auth, auth as firebaseAuth } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { isValidCoordinate, cn, getLocalAvatar, getUserAvatar } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { saveMySQLRecord } from '../lib/mysql';
import { watchPosition, clearWatch, requestLocationPermission } from '../lib/geolocationHelper';

export default function DriverApp() {
  const [activeTab, setActiveTab] = useState('home');
  const { userData, logout } = useAuth();
  const [activeTrip, _setActiveTrip] = useState<any>(null);
  const [isSelectingRoute, setIsSelectingRoute] = useState(false);
  const [orgName, setOrgName] = useState<string>('');
  const [assignedVehicleId, setAssignedVehicleId] = useState<string>('DEV-V1');
  const [driverData, _setDriverData] = useState<any>(() => {
    if (!userData) return null;
    try {
      const cached = localStorage.getItem(`expert_gps_user_db_data_${userData.id || userData.uid}`);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  const lastActionTimeRef = useRef<number>(0);

  const setDriverData = (data: any) => {
    lastActionTimeRef.current = Date.now();
    _setDriverData(data);
  };

  const setActiveTrip = (trip: any) => {
    lastActionTimeRef.current = Date.now();
    _setActiveTrip(trip);
  };
  const [driverDataLoading, setDriverDataLoading] = useState<boolean>(!driverData);
  const [driverDataError, setDriverDataError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userData?.orgId) {
      getDoc(doc(db, 'organizations', userData.orgId)).then(snap => {
        if (snap.exists()) setOrgName(snap.data().name);
      }).catch(err => console.warn("Firestore getDoc organization failed, using fallback:", err));
    }
  }, [userData?.orgId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (Firestore has 1MB limit for document, so we limit base64 to 500KB)
    if (file.size > 500 * 1024) {
      toast.error("Photo too large. Please select an image under 500KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const currentDriverId = userData?.id || userData?.uid;
      if (!currentDriverId) return;
      try {
        await saveMySQLRecord('update', 'users', currentDriverId, {
          avatarUrl: base64
        });
        toast.success("Profile photo updated!");
      } catch (err) {
        toast.error("Failed to save photo");
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasswordReset = async () => {
    if (!userData?.email) return;
    try {
      await sendPasswordResetEmail(firebaseAuth, userData.email);
      toast.success("Password reset email sent to " + userData.email);
    } catch (e) {
      toast.error("Failed to send reset email");
    }
  };

  useEffect(() => {
    if (!userData) return;

    const fetchActiveTripFromMySQL = async () => {
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
            // Prevent poll from overwriting optimistic state during transitions
            if (Date.now() - lastActionTimeRef.current < 6000) {
              console.log("[DriverApp] Skipping polling state update due to recent manual action.");
              return;
            }

            _setDriverData(res);
            setDriverDataLoading(false);
            localStorage.setItem(`expert_gps_user_db_data_${userData.id || userData.uid}`, JSON.stringify(res));

            // Set organization name from MySQL
            if (res.org?.name) {
              setOrgName(res.org.name);
            }

            // Set active trip
            if (res.trips) {
              const matchedTrip = res.trips.find(
                (t: any) => t && (t.driverId === userData.id || t.driverId === userData.uid) && (t.status === 'live' || t.status === 'ongoing')
              );
              _setActiveTrip(matchedTrip || null);

              // Set assigned vehicle ID
              const currentDriverId = userData.id || userData.uid;
              const matchedRoute = res.routes?.find((r: any) => 
                r && (r.id === userData.routeId || r.driverId === currentDriverId)
              );
              const trackingVId = matchedTrip?.vehicleId || matchedRoute?.vehicleId || userData.vehicleId || 'DEV-V1';
              setAssignedVehicleId(trackingVId);
            }
          }
        }
      } catch (err: any) {
        if (err.message?.includes("Failed to fetch") || err.name === "TypeError") {
          console.warn("Transient network connection to /api/records/user-data in DriverApp is resolving...");
        } else {
          console.error("Error fetching active trip in DriverApp:", err);
          setDriverDataError(err?.message || 'Failed to load driver data');
        }
      }
    };

    fetchActiveTripFromMySQL();
    // Poll active trip status from MySQL every 3 seconds for immediate reaction
    const interval = setInterval(fetchActiveTripFromMySQL, 3000);

    return () => clearInterval(interval);
  }, [userData]);

  // 3. Track and Update Driver's Live Location (Persistent across tabs)
  useEffect(() => {
    const trackingVehicleId = assignedVehicleId || userData?.vehicleId || activeTrip?.vehicleId || 'DEV-V1';
    if (!trackingVehicleId) return;

    let localWatchId: string | null = null;
    let fallbackMode = false;

    const initializeTracking = async () => {
      // Request location permission first
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        toast.error("Location permission denied. Please enable GPS in settings.", { id: 'gps-driver-error' });
        return;
      }

      const startTracking = (useHighAccuracy: boolean): string | null => {
        return watchPosition(
          (latitude, longitude) => {
            if (isValidCoordinate(latitude, longitude)) {
              // Update the vehicle's location inside Firestore for real-time sync with children / map
              updateDoc(doc(db, 'vehicles', trackingVehicleId), {
                location: { lat: latitude, lng: longitude },
                updatedAt: new Date().toISOString()
              }).catch(e => console.warn('Vehicle tracking Firestore updateDoc error:', e));

              // Update the vehicle's location inside MySQL
              saveMySQLRecord('update', 'vehicles', trackingVehicleId, {
                latitude: latitude,
                longitude: longitude,
                location: { lat: latitude, lng: longitude },
                updatedAt: new Date().toISOString()
              }).catch(e => console.warn('Vehicle tracking saveMySQLRecord error:', e));
            }
          },
          (err) => {
            console.warn(`Geolocation tracking (highAccuracy=${useHighAccuracy}):`, err);
            if (useHighAccuracy && !fallbackMode) {
              fallbackMode = true;
              if (localWatchId !== null) {
                clearWatch(localWatchId);
              }
              localWatchId = startTracking(false);
            } else {
              toast.error("GPS location tracking failed. Please ensure GPS is enabled.", { id: 'gps-driver-error' });
            }
          },
          { enableHighAccuracy: useHighAccuracy }
        );
      };

      localWatchId = startTracking(true);
    };

    initializeTracking();

    return () => {
      if (localWatchId !== null) {
        clearWatch(localWatchId);
      }
    };
  }, [assignedVehicleId, userData?.vehicleId, activeTrip?.vehicleId]);

  const handleStopTrip = async () => {
    if (!activeTrip) return;
    const tripToClose = activeTrip;
    const vehicleId = tripToClose.vehicleId || userData?.vehicleId || 'DEV-V1';
    
    try {
      // 1. Instantly trigger optimistic state updates and success notifications
      setActiveTrip(null);
      
      if (driverData) {
        const updatedTrips = (driverData.trips || []).map((t: any) => {
          if (t && t.id === tripToClose.id) {
            return { ...t, status: 'completed', endTime: new Date().toISOString() };
          }
          return t;
        });
        _setDriverData({
          ...driverData,
          trips: updatedTrips
        });
      }

      toast.success("Trip completed and users notified", { id: 'end-trip' });

      // 2. Perform database writes concurrently in the background
      const runBackgroundWrites = async () => {
        try {
          let finalManifest: any[] = [];
          const routeIdToUse = userData?.routeId || tripToClose?.routeId;
          const assignedUsers = (driverData?.users || []).filter((u: any) => 
            u && u.routeId === routeIdToUse && (u.role === 'user' || u.role === 'member')
          );
          
          const isToday = (dateStr: any) => {
            if (!dateStr) return false;
            const today = new Date().toISOString().split('T')[0];
            return dateStr.startsWith(today);
          };

          finalManifest = assignedUsers.map((u: any) => {
            const pickupStatus = u.pickupStatus && isToday(u.pickupUpdatedAt) ? u.pickupStatus : "waiting";
            const dropoffStatus = u.dropoffStatus && isToday(u.dropoffUpdatedAt) ? u.dropoffStatus : "waiting";

            return {
              uid: u.uid || u.id,
              studentId: u.studentId || u.id || "",
              name: u.name,
              pickupStatus,
              dropoffStatus,
              pickupUpdatedAt: u.pickupUpdatedAt || null,
              dropoffUpdatedAt: u.dropoffUpdatedAt || null,
              pickupPointId: u.pickupPointId,
            };
          });

          // Run Firestore and MySQL writes concurrently
          await Promise.all([
            saveMySQLRecord('update', 'trips', tripToClose.id, {
              status: 'completed',
              endTime: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              manifest: JSON.stringify(finalManifest)
            }),
            updateDoc(doc(db, 'trips', tripToClose.id), {
              status: 'completed',
              endTime: serverTimestamp()
            }).catch(err => console.warn("Failed to complete trip in Firestore:", err)),
            saveMySQLRecord('update', 'vehicles', vehicleId, {
              status: 'active'
            }).catch(err => console.warn("Failed to update vehicle status in MySQL during end trip:", err)),
            updateDoc(doc(db, 'vehicles', vehicleId), {
              status: 'active'
            }).catch(err => console.warn("Failed to update vehicle status in Firestore during end trip:", err))
          ]);

          // Notify users in the background
          const tripSummary = tripToClose.direction === 'pickup' ? 'Pick Up' : 'Drop Off';
          const notificationPromises = assignedUsers.map(async (u: any) => {
            const existingNotifs = Array.isArray(u.notifications) ? u.notifications : [];
            const updatedNotifs = [
              ...existingNotifs,
              {
                message: `🏁 ${tripSummary} has been completed by ${userData.name}.`,
                timestamp: new Date().toISOString(),
                type: 'trip_end',
                dismissed: false
              }
            ];
            await saveMySQLRecord('update', 'users', u.uid || u.id, {
              notifications: JSON.stringify(updatedNotifs)
            }).catch(err => console.warn("Failed to update notification in MySQL for user:", u.uid || u.id, err));
          });
          await Promise.all(notificationPromises);
        } catch (err) {
          console.error("Background end trip writes error:", err);
        }
      };

      // Execute background sync non-blockingly
      runBackgroundWrites();

    } catch (e: any) {
      console.error("Error stopping trip:", e);
      toast.error("Failed to complete trip properly", { id: 'end-trip' });
    }
  };

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'routes', label: 'Routes', icon: ListChecks },
    { id: 'map', label: 'Live Map', icon: Map },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const headerRight = (
    <motion.button 
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => {
        if (activeTrip) {
          handleStopTrip();
        } else {
          setActiveTab('map');
          setIsSelectingRoute(true);
        }
      }}
      className={cn(
        "relative py-2 px-4 rounded-2xl text-white shadow-xl transition-all duration-300 flex items-center justify-center gap-2 group overflow-hidden border border-white/20",
        activeTrip 
          ? "bg-rose-600 shadow-rose-500/30" 
          : "bg-emerald-500 shadow-emerald-500/30"
      )}
    >
      <AnimatePresence mode="wait">
        {activeTrip ? (
          <motion.div
            key="stop"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="flex items-center gap-2"
          >
            <Power size={18} className="drop-shadow-sm" />
            <span className="text-[10px] font-black uppercase tracking-widest italic">End Trip</span>
          </motion.div>
        ) : (
          <motion.div
            key="start"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="flex items-center gap-2"
          >
            <Navigation size={18} className="drop-shadow-sm" />
            <span className="text-[10px] font-black uppercase tracking-widest italic">Start Trip</span>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Pulse effect for active trip */}
      {activeTrip && (
        <span className="absolute inset-0 rounded-2xl bg-white/20 animate-pulse pointer-events-none"></span>
      )}
    </motion.button>
  );

  const renderContent = () => {
    if (driverDataError && !driverData) {
      return (
        <div className="flex items-center justify-center min-h-screen flex-col gap-4 p-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle size={32} className="text-red-600" />
          </div>
          <h2 className="text-lg font-black text-slate-900 text-center">Unable to Load Driver App</h2>
          <p className="text-sm text-slate-600 text-center">{driverDataError}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm">
            Retry
          </button>
        </div>
      );
    }
    
    switch (activeTab) {
      case 'home':
        return (
          <DriverDashboard 
            driverData={driverData} 
            setDriverData={setDriverData}
            driverDataLoading={driverDataLoading}
            activeTrip={activeTrip}
            setActiveTrip={setActiveTrip}
          />
        );
      case 'routes':
        return <DriverRoutesView driverData={driverData} driverDataLoading={driverDataLoading} />;
      case 'map':
        return (
          <DriverMapView 
            activeTrip={activeTrip} 
            setActiveTrip={setActiveTrip}
            isSelectingRoute={isSelectingRoute}
            setIsSelectingRoute={setIsSelectingRoute}
            driverData={driverData}
            setDriverData={setDriverData}
            driverDataLoading={driverDataLoading}
          />
        );
      case 'profile':
        return (
          <div className="space-y-6 pb-20">
            <div className="flex flex-col items-center py-10 relative">
              <div className="relative group">
                <div className="w-32 h-32 rounded-[3rem] bg-slate-100 overflow-hidden mb-6 border-4 border-white shadow-2xl relative transition-transform active:scale-95">
                  <img 
                    src={getUserAvatar(userData?.avatarUrl, (userData as any)?.photoURL, userData?.name, userData?.id || userData?.uid)} 
                    alt="Avatar" 
                    className="w-full h-full object-cover" 
                  />
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleFileUpload}
                  />
                  <label 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                  >
                    <Camera className="text-white" size={28} />
                  </label>
                </div>
              </div>

              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">{userData?.name}</h2>
              <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-[0.2em]">{userData?.role?.replace('_', ' ')} ID: {userData?.uid.slice(0, 8)}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 px-2">
              <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Personal Information</h4>
                
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Mail size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Email</p>
                    <p className="text-sm font-black text-slate-800 truncate tracking-tight">{userData?.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Phone size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Phone</p>
                    <p className="text-sm font-black text-slate-800 truncate tracking-tight">{userData?.phone || 'Not Provided'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Organization</h4>
                
                <div className="flex items-center gap-4 p-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                    <Shield size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Organization</p>
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tighter">{orgName || 'Loading...'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Security</h4>
                
                <button 
                  onClick={handlePasswordReset}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-900 group transition-all active:scale-95"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center text-amber-700">
                      <Key size={18} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Request Password Reset</span>
                  </div>
                  <ChevronRight size={16} className="text-amber-400 group-hover:translate-x-1 transition-transform" />
                </button>

                <button 
                  onClick={() => logout()}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-900 text-white group transition-all active:scale-95 shadow-xl"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                      <Power size={18} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Log Out</span>
                  </div>
                  <ChevronRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return <DriverDashboard driverData={driverData} setDriverData={setDriverData} driverDataLoading={driverDataLoading} activeTrip={activeTrip} setActiveTrip={setActiveTrip} />;
    }
  };

  return (
    <MobileLayout 
      activeTab={activeTab} 
      onTabChange={setActiveTab} 
      tabs={tabs}
      headerRight={headerRight}
    >
      {renderContent()}
    </MobileLayout>
  );
}
