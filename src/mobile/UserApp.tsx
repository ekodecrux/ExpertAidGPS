import React, { useState, useEffect } from 'react';
import MobileLayout from '../components/MobileLayout';
import UserDashboard from '../pages/UserDashboard';
import UserMapView from './UserMapView';
import UserRoutesView from './UserRoutesView';
import { Home, Compass, Bell, User, MapPin, Bus, Clock, Mail, Phone, Shield, Key, Camera, CheckCircle, ChevronRight, LogOut, Navigation, X, XCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { cn, getLocalAvatar, getUserAvatar, cleanMessage, getNotifications } from '../lib/utils';
import LocationDisclosureModal from '../components/LocationDisclosureModal';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import { setLocationDisclosureAccepted } from '../lib/locationService';

import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { saveMySQLRecord } from '../lib/mysql';

export default function UserApp() {
  const [activeTab, setActiveTab] = useState('home');
  const { userData, logout, resetPassword } = useAuth();
  const [orgName, setOrgName] = useState<string>('');
  const [routeName, setRouteName] = useState<string>('');
  const [stopName, setStopName] = useState<string>('');
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [userDbData, setUserDbData] = useState<any>(() => {
    if (!userData?.uid) return null;
    try {
      const cached = localStorage.getItem(`expert_gps_user_db_data_${userData.uid}`);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [userDbDataLoading, setUserDbDataLoading] = useState<boolean>(!userDbData);

  useEffect(() => {
    if (!userData) return;

    let isMounted = true;

    // Fast-track details from cache
    if (userDbData) {
      if (userDbData.org?.name) {
        setOrgName(userDbData.org.name);
      }
      if (userData.routeId && userDbData.routes) {
        const matchedRoute = userDbData.routes.find((r: any) => String(r.id) === String(userData.routeId));
        if (matchedRoute) {
          setRouteName(matchedRoute.name || matchedRoute.routeNumber || '');
          if (userData.pickupPointId && matchedRoute.pickupPoints) {
            const stop = matchedRoute.pickupPoints.find((p: any) => String(p.id) === String(userData.pickupPointId));
            if (stop) setStopName(stop.name);
          }
        }
      }
    }

    async function fetchDetails() {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const resObj = await fetch('/api/records/user-data', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (resObj.ok && isMounted) {
          const res = await resObj.json();
          if (res.success) {
            setUserDbData(res);
            setUserDbDataLoading(false);
            localStorage.setItem(`expert_gps_user_db_data_${userData.uid}`, JSON.stringify(res));

            if (res.org?.name) {
              setOrgName(res.org.name);
            }
            if (userData.routeId && res.routes) {
              const matchedRoute = res.routes.find((r: any) => String(r.id) === String(userData.routeId));
              if (matchedRoute) {
                setRouteName(matchedRoute.name || matchedRoute.routeNumber || '');
                if (userData.pickupPointId && matchedRoute.pickupPoints) {
                  const stop = matchedRoute.pickupPoints.find((p: any) => String(p.id) === String(userData.pickupPointId));
                  if (stop) setStopName(stop.name);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("UserApp MySQL poll failed, falling back to cache/Firestore:", err);
        try {
          if (userData.orgId) {
            const orgDoc = await getDoc(doc(db, 'organizations', userData.orgId));
            if (orgDoc.exists() && isMounted) setOrgName(orgDoc.data().name);
          }
          if (userData.routeId) {
            const routeDoc = await getDoc(doc(db, 'routes', userData.routeId));
            if (routeDoc.exists() && isMounted) {
              setRouteName(routeDoc.data().name);
              if (userData.pickupPointId) {
                const stop = routeDoc.data().pickupPoints?.find((p: any) => String(p.id) === String(userData.pickupPointId));
                if (stop && isMounted) setStopName(stop.name);
              }
            }
          }
        } catch (fErr) {
          console.error("Firestore fallback failed too:", fErr);
        }
      } finally {
        if (isMounted) {
          setUserDbDataLoading(false);
        }
      }
    }

    fetchDetails();
    const interval = setInterval(fetchDetails, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [userData]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userData) return;

    if (file.size > 500 * 1024) {
      toast.error("Image too large. Max 500KB");
      return;
    }

    setUpdatingPhoto(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        await saveMySQLRecord('update', 'users', userData.id || userData.uid, {
          avatarUrl: base64String
        });
        toast.success("Profile photo updated");
      } catch (err) {
        console.error("Photo update error", err);
        toast.error("Failed to update photo");
      } finally {
        setUpdatingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasswordReset = async () => {
    if (!userData?.email) return;
    try {
      await resetPassword(userData.email);
      toast.success("Password reset email sent!");
    } catch (err) {
      toast.error("Failed to send reset email");
    }
  };

  const dismissNotification = async (timestamp: string) => {
    if (!userData) return;
    const notifs = getNotifications(userData);
    const updatedNotifs = notifs.map((n: any) => 
      n.timestamp === timestamp ? { ...n, dismissed: true } : n
    );
    try {
      await saveMySQLRecord('update', 'users', userData.id || userData.uid, {
        notifications: updatedNotifs
      });
    } catch (e) {
      console.error("Error dismissing notification", e);
    }
  };

  const markAllAsRead = async () => {
    if (!userData) return;
    const notifs = getNotifications(userData);
    const updatedNotifs = notifs.map((n: any) => ({ ...n, dismissed: true }));
    try {
      await saveMySQLRecord('update', 'users', userData.id || userData.uid, {
        notifications: updatedNotifs
      });
      toast.success('All marked as read');
    } catch (e) {
      console.error("Error marking all as read", e);
    }
  };

  useEffect(() => {
    if (userData) {
      console.log("Logged in user UID:", userData.id || userData.uid);
    }
  }, [userData]);

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
      
      const isNew = notifTime > mountTime.current - 10000; // 10s buffer
      const isVeryRecent = (Date.now() - notifTime) < 120000; // Received in last 2 mins

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

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'track', label: 'Live Map', icon: Navigation },
    { id: 'routes', label: 'Schedule', icon: Compass },
    { 
      id: 'alerts', 
      label: 'Security', 
      icon: Bell,
      badge: getNotifications(userData).some((n: any) => !n.dismissed)
    },
    { id: 'profile', label: 'Account', icon: User },
  ];

  const userNotifs = getNotifications(userData);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <UserDashboard userDbData={userDbData} userDbDataLoading={userDbDataLoading} />;
      case 'track':
        return <UserMapView userDbData={userDbData} userDbDataLoading={userDbDataLoading} />;
      case 'routes':
        return <UserRoutesView userDbData={userDbData} userDbDataLoading={userDbDataLoading} />;
      case 'alerts':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-end">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">Strategic Alerts</h2>
              {userNotifs.some((n: any) => !n.dismissed) && (
                <button 
                  onClick={markAllAsRead}
                  className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                >
                  Mark All Read
                </button>
              )}
            </div>
            <div className="space-y-4 pb-20">
              {userNotifs.length > 0 ? (
                userNotifs.slice().reverse().map((notif: any, i: number) => {
                  const messageCleaned = cleanMessage(notif.message);
                  const isStart = notif.type === 'trip_start' || notif.type === 'start' || notif.message?.toLowerCase().includes('started');
                  const isEnd = notif.type === 'trip_end' || notif.type === 'end' || notif.message?.toLowerCase().includes('completed');
                  const isPicked = notif.type === 'status_picked' || notif.type === 'picked';
                  const isDropped = notif.type === 'status_dropped' || notif.type === 'dropped';
                  const isAbsent = notif.type === 'status_absent' || notif.type === 'absent';

                  let bgClass = "bg-white border-slate-100 ring-1 ring-slate-50";
                  let iconBg = "bg-blue-50 text-blue-600";
                  let IconComponent = Bus;
                  let title = "Transit Update";
                  let titleColor = "text-blue-600";
                  let newBadgeBg = "bg-blue-600";

                  if (isStart) {
                    bgClass = "bg-blue-50/40 border-blue-100/50 ring-1 ring-blue-50/20";
                    iconBg = "bg-blue-100/80 text-blue-600";
                    IconComponent = Navigation;
                    title = "Trip Started";
                    titleColor = "text-blue-600";
                    newBadgeBg = "bg-blue-600";
                  } else if (isEnd) {
                    bgClass = "bg-emerald-50/40 border-emerald-100/50 ring-1 ring-emerald-50/20";
                    iconBg = "bg-emerald-100/80 text-emerald-600";
                    IconComponent = CheckCircle;
                    title = "Trip Completed";
                    titleColor = "text-emerald-600";
                    newBadgeBg = "bg-emerald-600";
                  } else if (isPicked) {
                    bgClass = "bg-emerald-50/40 border-emerald-100/50 ring-1 ring-emerald-50/20";
                    iconBg = "bg-emerald-100/80 text-emerald-600";
                    IconComponent = CheckCircle;
                    title = "Pickup Confirmation";
                    titleColor = "text-emerald-600";
                    newBadgeBg = "bg-emerald-600";
                  } else if (isDropped) {
                    bgClass = "bg-blue-50/40 border-blue-100/50 ring-1 ring-blue-50/20";
                    iconBg = "bg-blue-100/80 text-blue-600";
                    IconComponent = Home;
                    title = "Safe Drop-off";
                    titleColor = "text-blue-600";
                    newBadgeBg = "bg-blue-600";
                  } else if (isAbsent) {
                    bgClass = "bg-rose-50/40 border-rose-100/50 ring-1 ring-rose-50/20";
                    iconBg = "bg-rose-100/80 text-rose-600";
                    IconComponent = XCircle;
                    title = "Attendance Alert";
                    titleColor = "text-rose-600";
                    newBadgeBg = "bg-rose-600";
                  }

                  if (notif.dismissed) {
                    bgClass = "bg-slate-50 border-slate-100 opacity-60";
                    iconBg = "bg-slate-100 text-slate-400";
                  }

                  return (
                    <div 
                      key={i} 
                      onClick={() => !notif.dismissed && dismissNotification(notif.timestamp)}
                      className={cn(
                        "p-6 rounded-[2rem] shadow-xl border flex gap-4 transition-all active:scale-[0.98]",
                        bgClass
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm",
                        iconBg
                      )}>
                        <IconComponent size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              "text-[10px] font-black uppercase tracking-widest",
                              titleColor
                            )}>
                              {title}
                            </p>
                            {!notif.dismissed && (
                              <span className={cn(
                                "px-1.5 py-0.5 text-[7px] text-white font-black rounded-md animate-pulse",
                                newBadgeBg
                              )}>NEW</span>
                            )}
                          </div>
                          <span className="text-[9px] font-bold text-slate-400">
                            {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm font-black text-slate-800 leading-tight uppercase tracking-tighter mb-2 break-words">{messageCleaned}</p>
                        <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                          <Clock size={8} />
                          <span>{new Date(notif.timestamp).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-white p-10 rounded-[2.5rem] shadow-xl text-center py-20 text-slate-300 border border-dashed border-slate-200">
                   <Bell size={48} className="mx-auto mb-4 opacity-10" />
                   <p className="text-[10px] font-black uppercase tracking-[0.2em]">No operational alerts</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'profile':
        return (
          <div className="space-y-8 pb-24">
            {/* Header Section */}
            <div className="flex flex-col items-center pt-8">
              <div className="relative">
                <div className="w-32 h-32 rounded-[2.5rem] bg-slate-100 overflow-hidden border-[4px] border-white shadow-2xl relative group">
                  <img 
                    src={getUserAvatar(userData?.avatarUrl, (userData as any)?.photoURL, userData?.name, userData?.uid)} 
                    alt="Profile" 
                    className={cn("w-full h-full object-cover transition-opacity", updatingPhoto && "opacity-50")}
                  />
                  <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="text-white" size={24} />
                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={updatingPhoto} />
                  </label>
                  {updatingPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-blue-600 p-2 rounded-xl border-2 border-white shadow-lg">
                   <CheckCircle className="text-white" size={14} />
                </div>
              </div>
              <h2 className="mt-6 text-2xl font-black text-slate-900 uppercase tracking-tighter italic">{userData?.name}</h2>
              <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-[0.2em]">{userData?.role?.replace('_', ' ')} ID: {userData?.uid.slice(0, 8)}</p>
            </div>

            {/* Information Grid */}
            <div className="grid grid-cols-1 gap-4 px-2">
              <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Personal Credentials</h4>
                
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Mail size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                    <p className="text-sm font-black text-slate-800 truncate tracking-tight">{userData?.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Phone size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Contact Number</p>
                    <p className="text-sm font-black text-slate-800 truncate tracking-tight">{userData?.phone || 'Not Provided'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Deployment Status</h4>
                
                <div className="flex items-center gap-4 p-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                    <Shield size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Institution</p>
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tighter">{orgName || 'Loading institution...'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                    <MapPin size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Designated Route</p>
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tighter">{routeName || 'Route Pending'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                    <Bus size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Operational Stop</p>
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tighter">{stopName || 'Stop Pending'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Location &amp; Privacy</h4>
                
                <button 
                  onClick={() => setShowLocationDisclosure(true)}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-blue-50/70 border border-blue-100 text-blue-900 group transition-all active:scale-95 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                      <MapPin size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest block">Location Disclosure</span>
                      <span className="text-[9px] text-blue-600 font-bold">Google Play tracking &amp; consent</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-blue-400 group-hover:translate-x-1 transition-transform" />
                </button>

                <button 
                  onClick={() => setShowPrivacyModal(true)}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 text-slate-800 group transition-all active:scale-95 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest block">Privacy Policy</span>
                      <span className="text-[9px] text-slate-400 font-bold">Data handling and security</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Security &amp; Access</h4>
                
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
                      <LogOut size={18} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Log out</span>
                  </div>
                  <ChevronRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return <UserDashboard />;
    }
  };

  return (
    <>
      <MobileLayout 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        tabs={tabs}
      >
        {renderContent()}
      </MobileLayout>

      <LocationDisclosureModal
        isOpen={showLocationDisclosure}
        onAccept={() => {
          setLocationDisclosureAccepted(true);
          setShowLocationDisclosure(false);
          toast.success('Location permission accepted');
        }}
        onDeny={() => setShowLocationDisclosure(false)}
        requiredForRole="user"
      />

      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </>
  );
}
