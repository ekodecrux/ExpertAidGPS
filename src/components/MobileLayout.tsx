import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Home, Map, Bell, User, Settings as SettingsIcon, Menu, X, LogOut, Shield, Truck, Users, MessageSquare, Clock, Navigation, Compass, CheckCircle, XCircle } from 'lucide-react';
import { cn, getLocalAvatar, getUserAvatar, getLocalIcon, cleanMessage } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { saveMySQLRecord } from '../lib/mysql';
import { OrganizationIcon } from './OrganizationLogo';

interface MobileLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string; icon: React.ElementType; badge?: boolean }[];
  headerRight?: React.ReactNode;
}

export default function MobileLayout({ children, activeTab, onTabChange, tabs, headerRight }: MobileLayoutProps) {
  const { userData, logout, refreshUserData } = useAuth();
  const [org, setOrg] = useState<any>(() => {
    if (!userData?.uid && !userData?.id) return null;
    try {
      const cached = localStorage.getItem(`expert_gps_user_db_data_${userData.uid || userData.id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.org) {
          return {
            ...parsed.org,
            location: parsed.org.location || (parsed.org.latitude && parsed.org.longitude ? { lat: parseFloat(parsed.org.latitude), lng: parseFloat(parsed.org.longitude) } : null)
          };
        }
      }
    } catch (e) {
      console.warn("Error parsing cached org in MobileLayout:", e);
    }
    return null;
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Parse notifications if it's a string (from MySQL serialization)
  let notifications: any[] = [];
  if (userData?.notifications) {
    if (typeof userData.notifications === 'string') {
      try {
        notifications = JSON.parse(userData.notifications);
      } catch (e) {
        console.warn('Failed to parse notifications string:', e);
        notifications = [];
      }
    } else if (Array.isArray(userData.notifications)) {
      notifications = userData.notifications;
    }
  }
  const activeNotifications = notifications.filter((n: any) => !n.dismissed);
  const hasUnread = activeNotifications.length > 0; 

  useEffect(() => {
    if (!userData?.orgId) return;
    const unsub = onSnapshot(doc(db, 'organizations', userData.orgId), (docSnap) => {
      if (docSnap.exists()) {
        setOrg({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return () => unsub();
  }, [userData?.orgId]);

  useEffect(() => {
    if (!userData) return;

    const fetchOrgFromMySQL = async () => {
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
          if (res.success && res.org) {
            setOrg({
              ...res.org,
              location: res.org.location || (res.org.latitude && res.org.longitude ? { lat: parseFloat(res.org.latitude), lng: parseFloat(res.org.longitude) } : null)
            });
            localStorage.setItem(`expert_gps_user_db_data_${userData.uid || userData.id}`, JSON.stringify(res));
          }
        }
      } catch (err) {
        console.warn("MobileLayout MySQL fetch organization failed, relying on Firestore/Cache:", err);
      }
    };

    fetchOrgFromMySQL();
  }, [userData]);

  const handleDismissAll = async () => {
    if (!userData || !userData.notifications) return;
    try {
      // Parse notifications if it's a string
      let notifArray: any[] = [];
      if (typeof userData.notifications === 'string') {
        try {
          notifArray = JSON.parse(userData.notifications);
        } catch (e) {
          console.warn('Failed to parse notifications string:', e);
          return;
        }
      } else if (Array.isArray(userData.notifications)) {
        notifArray = userData.notifications;
      } else {
        return;
      }
      const updatedNotifs = notifArray.map(n => ({ ...n, dismissed: true }));
      
      // Update both MySQL and Firestore to ensure perfect sync
      await Promise.all([
        saveMySQLRecord('update', 'users', userData.id || userData.uid, {
          notifications: updatedNotifs
        }),
        updateDoc(doc(db, 'users', userData.id || userData.uid), {
          notifications: updatedNotifs
        }).catch(err => console.warn("Failed to update Firestore notifications:", err))
      ]);

      // Instantly refresh local user data so unread states / counts are cleared immediately
      await refreshUserData();
      setShowNotifications(false);
    } catch (e) {
      console.error("Error dismissing notifications:", e);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50 overflow-hidden font-sans">
      {/* Dynamic Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3 flex items-center justify-between z-[6000] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 overflow-hidden flex items-center justify-center border-2 border-white shadow-md cursor-pointer" onClick={() => onTabChange('profile')}>
            {(() => {
              const isCollege = org?.eduType === 'College' || (!org?.eduType && (org?.name?.toLowerCase().includes('college') || org?.name?.toLowerCase().includes('university')));
              const defaultIcon = org?.sector === 'Education'
                ? (isCollege ? 'graduation-cap' : 'school')
                : (org?.sector === 'Healthcare'
                  ? 'hospital'
                  : (org?.sector === 'Government'
                    ? 'museum'
                    : 'commercial'));
              const logoSrc = org?.logo || org?.logoUrl || getLocalIcon(defaultIcon);
              return (
                <img src={logoSrc} alt="Org Logo" className="w-full h-full object-contain p-0.5 bg-slate-50" referrerPolicy="no-referrer" />
              );
            })()}
          </div>
          <div>
            <h1 className="text-xs font-black text-slate-900 uppercase tracking-tighter italic leading-none truncate max-w-[150px]">
              {org?.name || 'Expert GPS'}
            </h1>
            <div className="flex items-center gap-2 mt-1.5 px-0.5 group">
              <div className="w-5 h-5 rounded-full bg-slate-100 border-2 border-white shadow-sm overflow-hidden flex-shrink-0">
                <img 
                  src={getUserAvatar(userData?.avatarUrl, (userData as any)?.photoURL, userData?.name, userData?.uid)} 
                  alt="driver" 
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[120px] transition-colors group-hover:text-blue-600">
                {userData?.name || 'Commander'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            className="p-2.5 rounded-xl bg-slate-50 text-slate-400 relative hover:text-blue-600 transition-colors"
            onClick={() => setShowNotifications(true)}
          >
            <Bell size={18} />
            {hasUnread && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-blue-600 rounded-full border-2 border-white animate-bounce"></span>
            )}
          </button>
          
          {headerRight ? headerRight : (
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="p-2.5 rounded-xl bg-slate-900 text-white shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
            >
              <Menu size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Notification Center */}
      <AnimatePresence>
        {showNotifications && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[8000]"
            />
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="fixed top-[calc(env(safe-area-inset-top,0px)+5rem)] left-4 right-4 bg-white rounded-[2.5rem] shadow-2xl z-[8001] p-6 border border-slate-100 flex flex-col max-h-[70vh]"
            >
               <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <Bell size={20} />
                     </div>
                     <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Notifications</h2>
                  </div>
                  <button 
                    onClick={() => setShowNotifications(false)}
                    className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center"
                  >
                    <X size={20} />
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {activeNotifications.length === 0 ? (
                    <div className="py-20 text-center text-slate-300">
                       <p className="text-[10px] font-black uppercase tracking-widest">No active alerts</p>
                    </div>
                  ) : (
                    [...activeNotifications].reverse().map((n: any, idx: number) => {
                      const messageCleaned = cleanMessage(n.message);
                      const isStart = n.type === 'trip_start' || n.type === 'start' || n.message?.toLowerCase().includes('started');
                      const isEnd = n.type === 'trip_end' || n.type === 'end' || n.message?.toLowerCase().includes('completed');
                      const isPicked = n.type === 'status_picked' || n.type === 'picked';
                      const isDropped = n.type === 'status_dropped' || n.type === 'dropped';
                      const isAbsent = n.type === 'status_absent' || n.type === 'absent';
                      
                      let bgClass = "bg-slate-50/80 border-slate-100/50";
                      let iconBg = "bg-slate-100 text-slate-600";
                      let IconComponent = Bell;
                      
                      if (isStart) {
                        bgClass = "bg-blue-50/60 border-blue-100/50";
                        iconBg = "bg-blue-100/80 text-blue-600";
                        IconComponent = Navigation;
                      } else if (isEnd) {
                        bgClass = "bg-emerald-50/60 border-emerald-100/50";
                        iconBg = "bg-emerald-100/80 text-emerald-600";
                        IconComponent = CheckCircle;
                      } else if (isPicked) {
                        bgClass = "bg-emerald-50/60 border-emerald-100/50";
                        iconBg = "bg-emerald-100/80 text-emerald-600";
                        IconComponent = CheckCircle;
                      } else if (isDropped) {
                        bgClass = "bg-blue-50/60 border-blue-100/50";
                        iconBg = "bg-blue-100/80 text-blue-600";
                        IconComponent = Home;
                      } else if (isAbsent) {
                        bgClass = "bg-rose-50/60 border-rose-100/50";
                        iconBg = "bg-rose-100/80 text-rose-600";
                        IconComponent = XCircle;
                      }

                      return (
                        <div key={idx} className={cn("p-4 rounded-[1.8rem] border flex items-start gap-3.5 transition-all", bgClass)}>
                          <div className={cn("w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm", iconBg)}>
                            <IconComponent size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 leading-snug mb-1.5">{messageCleaned}</p>
                            <div className="flex items-center gap-1.5">
                               <Clock size={10} className="text-slate-400" />
                               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                          <div className="flex-shrink-0 pt-1">
                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                          </div>
                        </div>
                      );
                    })
                  )}
               </div>

               <button 
                onClick={handleDismissAll}
                className="w-full mt-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-slate-900/10"
               >
                 Dismiss All
               </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className={cn(
        "flex-1 relative",
        (activeTab === 'map' || activeTab === 'track') ? "overflow-hidden flex flex-col" : "overflow-y-auto"
      )}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn(
            "p-4 transition-all duration-300",
            (activeTab === 'map' || activeTab === 'track') ? "h-full relative" : "min-h-full pb-24"
          )}
        >
          {children}
        </motion.div>
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-3 pb-8 flex justify-between items-center z-[5000] shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-col items-center gap-1"
            >
              <div className={cn(
                "p-2 rounded-2xl transition-all duration-300 relative",
                isActive ? "bg-blue-600 text-white shadow shadow-blue-600/20 scale-105" : "text-slate-400"
              )}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                {tab.badge && (
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white shadow-sm animate-pulse"></span>
                )}
              </div>
              <span className={cn(
                "text-[9px] font-black uppercase tracking-tighter transition-all",
                isActive ? "text-blue-600 opacity-100" : "text-slate-400 opacity-60"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Side Menu Oversight */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[7000]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[80%] max-w-sm bg-white z-[7001] shadow-[-20px_0_50px_rgba(0,0,0,0.1)] flex flex-col"
            >
              <div className="pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-6 px-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Command Center</h2>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-900"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest px-2 mb-2 italic">Mission Operations</p>
                  {[
                    { id: 'home', label: 'Dashboard', icon: Home, color: 'text-blue-600' },
                    { id: 'track', label: 'Live Map', icon: Navigation, color: 'text-blue-600' },
                    { id: 'routes', label: 'Schedule', icon: Compass, color: 'text-emerald-500' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        onTabChange(item.id);
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 text-slate-600 font-bold text-sm transition-all active:scale-95 group"
                    >
                      <item.icon size={18} className={cn("transition-transform group-hover:scale-110", item.color)} />
                      <span className="uppercase tracking-tight text-slate-900">{item.label}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest px-2 mb-2 italic">Support & Security</p>
                  {[
                    { id: 'alerts', label: 'Alerts', icon: Bell, color: 'text-rose-500' },
                    { id: 'profile', label: 'Account', icon: User, color: 'text-slate-400' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        onTabChange(item.id);
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 text-slate-600 font-bold text-sm transition-all active:scale-95 group"
                    >
                      <item.icon size={18} className={cn("transition-transform group-hover:scale-110", item.color)} />
                      <span className="uppercase tracking-tight text-slate-900">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                <button 
                  onClick={() => logout()}
                  className="w-full flex items-center justify-center gap-3 p-5 rounded-2xl bg-rose-50 text-rose-600 font-black text-xs uppercase tracking-[0.2em] border border-rose-100 hover:bg-rose-100 transition-all shadow-sm"
                >
                  <LogOut size={16} />
                  <span>Log out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
