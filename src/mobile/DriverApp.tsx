import React, { useState, useEffect, useRef } from 'react';
import MobileLayout from '../components/MobileLayout';
import DriverDashboard from '../pages/DriverDashboard';
import DriverRoutesView from './DriverRoutesView';
import DriverMapView from './DriverMapView';
import { Home, Map, MessageSquare, User, ListChecks, Play, Square, Navigation, Power, Mail, Phone, Shield, Truck, Key, Camera, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db, auth, auth as firebaseAuth } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { isValidCoordinate, cn, getLocalAvatar, getUserAvatar } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { saveMySQLRecord } from '../lib/mysql';

export default function DriverApp() {
  const [activeTab, setActiveTab] = useState('home');
  const { userData, logout } = useAuth();
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [isSelectingRoute, setIsSelectingRoute] = useState(false);
  const [orgName, setOrgName] = useState<string>('');
  const [assignedVehicleId, setAssignedVehicleId] = useState<string>('DEV-V1');
  const [isChangingAvatar, setIsChangingAvatar] = useState(false);
  const [driverData, setDriverData] = useState<any>(null);
  const [driverDataLoading, setDriverDataLoading] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarSeeds = ['Felix', 'Aneka', 'Caleb', 'Milo', 'Kiki', 'Jasper', 'Pumpkin', 'Luna', 'Oliver', 'Toby'];

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
        setIsChangingAvatar(false);
      } catch (err) {
        toast.error("Failed to save photo");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateAvatar = async (seed: string) => {
    const currentDriverId = userData?.id || userData?.uid;
    if (!currentDriverId) return;
    try {
      await saveMySQLRecord('update', 'users', currentDriverId, {
        avatarUrl: getLocalAvatar(seed)
      });
      setIsChangingAvatar(false);
      toast.success("Profile icon updated!");
    } catch (e) {
      toast.error("Failed to update icon");
    }
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
            setDriverData(res);
            setDriverDataLoading(false);

            // Set organization name from MySQL
            if (res.org?.name) {
              setOrgName(res.org.name);
            }

            // Set active trip
            if (res.trips) {
              const matchedTrip = res.trips.find(
                (t: any) => t && (t.driverId === userData.id || t.driverId === userData.uid) && (t.status === 'live' || t.status === 'ongoing')
              );
              setActiveTrip(matchedTrip || null);

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

    let localWatchId: any;
    let fallbackMode = false;

    const startTracking = (useHighAccuracy: boolean): any => {
      return navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
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
          console.warn(`Geolocation tracking (highAccuracy=${useHighAccuracy}):`, err.message);
          if (useHighAccuracy && !fallbackMode) {
            fallbackMode = true;
            if (localWatchId !== undefined) {
              navigator.geolocation.clearWatch(localWatchId);
            }
            localWatchId = startTracking(false);
          } else {
            // Only alert/toast on persistent solid failures, skipping temporary timeouts
            if (err.code !== 3) {
              toast.error("GPS location tracking failed. Please ensure GPS is enabled.", { id: 'gps-driver-error' });
            }
          }
        },
        { 
          enableHighAccuracy: useHighAccuracy, 
          maximumAge: useHighAccuracy ? 10000 : 30000, 
          timeout: 30000 
        }
      );
    };

    localWatchId = startTracking(true);

    return () => {
      if (localWatchId !== undefined) {
        navigator.geolocation.clearWatch(localWatchId);
      }
    };
  }, [assignedVehicleId, userData?.vehicleId, activeTrip?.vehicleId]);

  const handleStopTrip = async () => {
    if (!activeTrip) return;
    try {
      toast.loading("Completing trip...", { id: 'end-trip' });

      let finalManifest: any[] = [];
      const routeIdToUse = userData?.routeId || activeTrip?.routeId;
      const token = await auth.currentUser?.getIdToken();
      
      if (token) {
        const resObj = await fetch('/api/records/user-data', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (resObj.ok) {
          const res = await resObj.json();
          if (res.success && res.users) {
            const assignedUsers = res.users.filter((u: any) => u.routeId === routeIdToUse && (u.role === 'user' || u.role === 'member'));
            
            // Snapshot current student states for today
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

            const tripSummary = activeTrip.direction === 'pickup' ? 'Pick to ORG trip' : 'Drop to Home trip';
            const manifestPromises = assignedUsers.map(async (u: any) => {
              const existingNotifs = Array.isArray(u.notifications) ? u.notifications : [];
              const updatedNotifs = [
                ...existingNotifs,
                {
                  message: `🏁 ${tripSummary} has been completed.`,
                  timestamp: new Date().toISOString(),
                  type: 'trip_end',
                  dismissed: false
                }
              ];
              await saveMySQLRecord('update', 'users', u.uid || u.id, {
                notifications: JSON.stringify(updatedNotifs)
              }).catch(err => console.warn("Failed to update notification in MySQL for user:", u.uid || u.id, err));
            });
            await Promise.all(manifestPromises);
          }
        }
      }

      // 1. Update Trip in MySQL with complete manifest snapshot
      await saveMySQLRecord('update', 'trips', activeTrip.id, {
        status: 'completed',
        endTime: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        manifest: JSON.stringify(finalManifest)
      });

      // 2. Release Vehicle in MySQL
      const vId = userData?.vehicleId || activeTrip?.vehicleId;
      if (vId) {
        await saveMySQLRecord('update', 'vehicles', vId, {
          status: 'active'
        }).catch(err => console.warn("Failed to update vehicle status in MySQL during end trip:", err));
      }
      
      // Update local state instantly
      setActiveTrip(null);
      toast.success("Trip completed and users notified", { id: 'end-trip' });
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
    switch (activeTab) {
      case 'home':
        return <DriverDashboard driverData={driverData} driverDataLoading={driverDataLoading} />;
      case 'routes':
        return <DriverRoutesView driverData={driverData} driverDataLoading={driverDataLoading} />;
      case 'map':
        return (
          <DriverMapView 
            activeTrip={activeTrip} 
            isSelectingRoute={isSelectingRoute}
            setIsSelectingRoute={setIsSelectingRoute}
            driverData={driverData}
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
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileUpload} 
                  />
                  <button 
                    onClick={() => setIsChangingAvatar(!isChangingAvatar)}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Camera className="text-white w-8 h-8" />
                  </button>
                </div>
                {isChangingAvatar && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-4 bg-white rounded-3xl shadow-2xl p-6 border border-slate-100 z-50 w-[85vw]"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Profile Icon</span>
                      <button onClick={() => setIsChangingAvatar(false)} className="text-slate-400">✕</button>
                    </div>

                    <div className="space-y-6">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl text-blue-700 active:scale-95 transition-all"
                      >
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                          <Camera size={18} />
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Upload Photo</p>
                          <p className="text-[8px] font-bold opacity-60">From your device</p>
                        </div>
                        <ChevronRight size={16} className="ml-auto" />
                      </button>

                      <div className="space-y-3">
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Or choose an avatar</p>
                        <div className="grid grid-cols-5 gap-3">
                          {avatarSeeds.map(seed => (
                            <button 
                              key={seed} 
                              onClick={() => handleUpdateAvatar(seed)}
                              className="w-10 h-10 rounded-xl bg-slate-50 overflow-hidden border border-slate-100 active:scale-90 transition-all"
                            >
                              <img src={getLocalAvatar(seed)} className="w-full h-full" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
              <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight leading-none">{userData?.name}</h2>
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-2 px-6 py-1.5 bg-blue-50 rounded-full border border-blue-100">Professional Driver</p>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border border-slate-50 space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 mb-4">Personal Details</h3>
                
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Email Address</p>
                    <p className="text-xs font-bold text-slate-900">{userData?.email || '---'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400">
                    <Phone size={18} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Phone Number</p>
                    <p className="text-xs font-bold text-slate-900">{userData?.phone || 'Not provided'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400">
                    <Shield size={18} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Working For</p>
                    <p className="text-xs font-bold text-slate-900 uppercase">{orgName || 'Loading...'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400">
                    <Truck size={18} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Vehicle Plate</p>
                    <p className="text-xs font-bold text-slate-900 uppercase italic tracking-wider">{userData?.vehicleId || 'Not Assigned'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border border-slate-50 space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 mb-4">Account Security</h3>
                
                <button 
                  onClick={handlePasswordReset}
                  className="w-full flex items-center justify-between p-5 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-700 active:scale-95 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Key size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Change Password</span>
                  </div>
                  <ChevronRight size={16} />
                </button>

                <button 
                  onClick={() => logout()}
                  className="w-full py-5 rounded-2xl bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-[0.2em] border border-rose-100 hover:bg-rose-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Power size={14} />
                  Logout Session
                </button>
              </div>
            </div>
            
            <p className="text-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.3em] pb-10">
              App Version 2.8.5 • Expert GPS Solutions
            </p>
          </div>
        );
      default:
        return <DriverDashboard />;
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
