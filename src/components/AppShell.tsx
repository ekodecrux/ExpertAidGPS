import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Users, Route, Bus, LogOut, Settings, Bell, Map as MapIcon, ShieldCheck, Briefcase, ChevronLeft, ChevronRight, UserCircle, Users2, MapPin, Building2, School, GraduationCap, Navigation, Activity, X, Edit2, Save, Key, Mail, Shield } from 'lucide-react';
import { cn, getLocalAvatar, getUserAvatar, getLocalIcon } from '../lib/utils';
import { Link, useLocation } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, serverTimestamp, collection } from 'firebase/firestore';
import { sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { db, auth as firebaseAuth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';

interface ShellProps {
  children: React.ReactNode;
}

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  role: string[];
  category: string;
  path?: string;
}

export default function AppShell({ children }: ShellProps) {
  const { userData, logout, resetPassword } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [org, setOrg] = React.useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [newName, setNewName] = React.useState(userData?.name || '');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isResettingPassword, setIsResettingPassword] = React.useState(false);
  const location = useLocation();

  const [routes, setRoutes] = React.useState<any[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [trips, setTrips] = React.useState<any[]>([]);
  const [isNotifOpen, setIsNotifOpen] = React.useState(false);
  const [readIds, setReadIds] = React.useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`admin_read_notifs_${userData?.uid || 'default'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const parseDateTime = (val: any): Date | null => {
    if (!val) return null;
    if (val.toDate && typeof val.toDate === 'function') {
      return val.toDate();
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  React.useEffect(() => {
    if (!userData) return;

    // 1. Set up Firestore Real-time subscriptions if available / when authorized.
    let unsubRoutes = () => {};
    let unsubUsers = () => {};
    let unsubTrips = () => {};

    if (userData.role === 'org_admin' || userData.role === 'super_admin') {
      try {
        unsubRoutes = onSnapshot(collection(db, 'routes'), (snapshot) => {
          const rList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          const filtered = userData.role === 'super_admin' ? rList : rList.filter((r: any) => r.orgId === userData.orgId);
          setRoutes(filtered);
        }, (error) => {
          console.warn("Routes snapshot read sidelined:", error);
        });

        unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
          const uList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          const filtered = userData.role === 'super_admin' ? uList : uList.filter((u: any) => u.orgId === userData.orgId);
          setUsers(filtered);
        }, (error) => {
          console.warn("Users snapshot read sidelined:", error);
        });

        unsubTrips = onSnapshot(collection(db, 'trips'), (snapshot) => {
          const tList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          const filtered = userData.role === 'super_admin' ? tList : tList.filter((t: any) => t.orgId === userData.orgId);
          setTrips(filtered);
        }, (error) => {
          console.warn("Trips snapshot read sidelined:", error);
        });
      } catch (fsErr) {
        console.warn("Firestore listener initialization bypassed/failed. Standard MySQL Relational polling active.");
      }
    }

    // 2. High-Performance MySQL Sync Engine Polling Fallback (100% Standalone survival without Firestore)
    const fetchMySQLBackup = async () => {
      try {
        let token = await firebaseAuth.currentUser?.getIdToken(true).catch(() => null);
        if (!token) {
          token = localStorage.getItem("expert_gps_fallback_token") || undefined;
        }
        if (!token) return;

        const isAdmin = userData.role === "org_admin" || userData.role === "super_admin";
        const endpoint = isAdmin ? "/api/records/admin-data" : "/api/records/user-data";

        const res = await fetch(endpoint, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const result = await res.json();
          if (result.success) {
            if (isAdmin) {
              if (result.routes) setRoutes(result.routes);
              if (result.users) setUsers(result.users);
              if (result.trips) setTrips(result.trips);
              if (result.organizations && userData.orgId) {
                const myOrg = result.organizations.find((o: any) => o.id === userData.orgId);
                if (myOrg) setOrg(myOrg);
              }
            } else {
              if (result.routes) setRoutes(result.routes);
              if (result.users) setUsers(result.users);
              if (result.trips) setTrips(result.trips);
              if (result.org) setOrg(result.org);
            }
          }
        }
      } catch (err) {
        console.warn("[AppShell MySQL Sync Polling Bypass]:", err);
      }
    };

    // Load instantly
    fetchMySQLBackup();

    // Poll every 8 seconds for real-time relational map and notifications updates
    const pollInterval = setInterval(fetchMySQLBackup, 8000);

    return () => {
      unsubRoutes();
      unsubUsers();
      unsubTrips();
      clearInterval(pollInterval);
    };
  }, [userData?.orgId, userData?.role, userData?.uid]);

  const generatedNotifications = React.useMemo(() => {
    if (!userData || (userData.role !== 'org_admin' && userData.role !== 'super_admin')) return [];

    const list: any[] = [];

    trips.forEach((t) => {
      // 1. Started Trip Notification
      const startTime = parseDateTime(t.startTime || t.startedAt);
      if (startTime) {
        const route = routes.find((r: any) => r.id === t.routeId);
        const routeName = route?.name || `Route (#${t.routeId?.slice(0, 5)})`;
        const driver = users.find((u: any) => u.id === t.driverId || u.uid === t.driverId);
        const driverName = driver?.name || 'A driver';
        const directionStr = t.direction === 'dropoff' ? 'Drop-off' : 'Pickup';

        list.push({
          id: `${t.id}_start`,
          title: "Trip Started",
          message: `🚌 ${driverName} started the ${directionStr} trip on ${routeName}.`,
          time: startTime,
          type: 'start',
          routeId: t.routeId,
          routeName,
          driverName,
          tripId: t.id
        });
      }

      // 2. Completed Trip Notification
      if (t.status === 'completed') {
        const endTime = parseDateTime(t.endTime || t.endedAt || t.updatedAt);
        if (endTime) {
          const route = routes.find((r: any) => r.id === t.routeId);
          const routeName = route?.name || `Route (#${t.routeId?.slice(0, 5)})`;
          const driver = users.find((u: any) => u.id === t.driverId || u.uid === t.driverId);
          const driverName = driver?.name || 'A driver';
          const directionStr = t.direction === 'dropoff' ? 'Drop-off' : 'Pickup';

          list.push({
            id: `${t.id}_complete`,
            title: "Trip Completed",
            message: `🏁 ${driverName} completed the ${directionStr} trip on ${routeName}.`,
            time: endTime,
            type: 'complete',
            routeId: t.routeId,
            routeName,
            driverName,
            tripId: t.id
          });
        }
      }
    });

    // Sort by time descending
    list.sort((a, b) => b.time.getTime() - a.time.getTime());
    return list;
  }, [trips, routes, users, userData]);

  const unreadCount = React.useMemo(() => {
    return generatedNotifications.filter(n => !readIds.includes(n.id)).length;
  }, [generatedNotifications, readIds]);

  const initialLoadTimeRef = React.useRef<number>(Date.now());
  const shownToastsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    generatedNotifications.forEach((n) => {
      if (n.time.getTime() > initialLoadTimeRef.current - 10000) {
        if (!shownToastsRef.current.has(n.id)) {
          shownToastsRef.current.add(n.id);
          toast.custom((t) => (
            <div className={cn(
              "max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-black/5 p-4 border-l-4 border-l-blue-500 animate-in fade-in slide-in-from-top-4 duration-300",
              n.type === 'start' ? "border-l-blue-500" : "border-l-emerald-500"
            )}>
              <div className="flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                  {n.type === 'start' ? '🚌 Route Engaged' : '🏁 Route Completed'}
                </p>
                <p className="text-xs font-bold text-slate-800 leading-tight">
                  {n.message}
                </p>
                <p className="text-[9px] text-slate-400 mt-1">
                  Just now
                </p>
              </div>
            </div>
          ), { position: 'top-right', duration: 5000 });
        }
      }
    });
  }, [generatedNotifications]);

  const handleMarkAllRead = () => {
    const allIds = generatedNotifications.map(n => n.id);
    setReadIds(allIds);
    localStorage.setItem(`admin_read_notifs_${userData?.uid || 'default'}`, JSON.stringify(allIds));
    toast.success("All notifications marked as read!");
  };

  const handleMarkOneRead = (id: string) => {
    if (!readIds.includes(id)) {
      const updated = [...readIds, id];
      setReadIds(updated);
      localStorage.setItem(`admin_read_notifs_${userData?.uid || 'default'}`, JSON.stringify(updated));
    }
  };

  const formatNotifTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  React.useEffect(() => {
    if (userData?.name) {
      setNewName(userData.name);
    }
  }, [userData?.name]);

  React.useEffect(() => {
    if (userData?.orgId) {
      const unsub = onSnapshot(doc(db, 'organizations', userData.orgId), (snap) => {
        if (snap.exists()) {
          setOrg({ id: snap.id, ...snap.data() });
        }
      });
      return () => unsub();
    }
  }, [userData?.orgId]);

      const getMenuItems = (): MenuItem[] => {
      const isEducation = userData?.orgSector === 'Education';
      const membersLabel = isEducation ? 'Students' : 'Employees';
      const trackLabel = 'Live Tracking';

      const all: MenuItem[] = [
        { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard, role: ['super_admin', 'org_admin', 'driver', 'user'], category: 'Navigation', path: '/' },
        
        // Fleet Management (Org Admin)
        { id: 'map', label: 'Live Bus Tracking', icon: Navigation, role: ['org_admin'], category: 'Fleet', path: '/map' },
        { id: 'vehicles', label: 'Vehicle Management', icon: Bus, role: ['org_admin'], category: 'Fleet', path: '/vehicles' },
        { id: 'drivers', label: 'Driver Management', icon: Users, role: ['org_admin'], category: 'Fleet', path: '/drivers' },
        { id: 'routes', label: 'Route Planning', icon: Route, role: ['org_admin'], category: 'Fleet', path: '/routes' },
        { id: 'members', label: membersLabel, icon: UserCircle, role: ['org_admin'], category: 'People', path: '/members' },
        { id: 'reports', label: 'Historical Reports', icon: Activity, role: ['org_admin'], category: 'Monitoring', path: '/reports' },

        // Super Admin Administration
        { id: 'clients', label: 'Clients', icon: ShieldCheck, role: ['super_admin'], category: 'Administration', path: '/clients' },
        { id: 'super_reports', label: 'Reports', icon: Activity, role: ['super_admin'], category: 'Administration', path: '/reports' },
        { id: 'logs', label: 'System Logs', icon: Briefcase, role: ['super_admin'], category: 'Administration', path: '/logs' },
        { id: 'settings', label: 'Settings', icon: Settings, role: ['super_admin', 'org_admin'], category: 'Administration', path: '/settings' },

        // Driver only
        { id: 'trip', label: 'Current Route', icon: MapIcon, role: ['driver'], category: 'Operations' },
        { id: 'history', label: 'Shift History', icon: LayoutDashboard, role: ['driver'], category: 'Operations' },

        // User only
        { id: 'track', label: 'Live Tracking', icon: MapPin, role: ['user'], category: 'Operations', path: '/map' },
        { id: 'my-route', label: 'Station Info', icon: Route, role: ['user'], category: 'Operations' },
      ];
      return all.filter(item => item.role.includes(userData?.role || ''));
    };

  const menuItems = getMenuItems();
  const categories = Array.from(new Set(menuItems.map(item => item.category)));

  // Close sidebar on mobile by default
  React.useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  return (
    <div className="h-screen bg-[#F8FAFC] flex flex-col md:flex-row overflow-hidden relative">
      {/* Mobile Nav Header */}
      <div className="md:hidden bg-white p-4 flex items-center justify-between z-30 shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center overflow-hidden font-sans shadow-lg shadow-blue-600/20">
              <Navigation className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-slate-900 font-black text-lg tracking-tight leading-none block italic uppercase">Expert GPS</span>
              <span className="text-[9px] text-blue-600 font-black uppercase tracking-widest leading-none">Intelligence Hub</span>
            </div>
          </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
        >
          <LayoutDashboard className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Sidebar Overlay Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[9998] cursor-pointer"
          />
        )}
      </AnimatePresence>

      {/* Navigation Sidebar */}
      <aside className={cn(
        "bg-white border-r border-slate-100 flex-shrink-0 transition-all duration-300 flex flex-col z-[9999] md:z-50 absolute md:relative h-full shadow-2xl md:shadow-none",
        isSidebarOpen ? "w-64 translate-x-0" : "w-16 md:w-16 -translate-x-full md:translate-x-0"
      )}>
        <div className={cn(
          "flex items-center transition-all h-24 shrink-0 relative",
          isSidebarOpen ? "p-4 md:p-6 justify-between" : "p-2 justify-center"
        )}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/20 overflow-hidden font-sans border-2 border-white/20">
              <Navigation className="w-5 h-5 text-white" />
            </div>
            {isSidebarOpen && (
              <div className="flex flex-col">
                <span className="text-slate-900 font-black text-xl tracking-tighter leading-none italic uppercase">Expert GPS</span>
                <span className="text-[9px] text-blue-600 font-black uppercase tracking-[0.2em] mt-0.5">Fleet Management</span>
              </div>
            )}
          </div>
          
          {isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-50 rounded-lg transition-colors shrink-0"
              title="Close Menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={cn(
              "hidden md:flex p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors shrink-0",
              !isSidebarOpen && "absolute -right-3 top-1/2 -translate-y-1/2 bg-white text-blue-600 rounded-full border border-slate-200 p-0.5 shadow-md z-50 hover:bg-blue-50"
            )}
            title={isSidebarOpen ? "Collapse Menu" : "Expand Menu"}
          >
            {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        <div className="px-6 pb-4">
          {/* User profile removed from sidebar as per request */}
        </div>

        <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto custom-scrollbar">
          {menuItems.map(item => (
            <Link
              key={item.id}
              to={item.path || '#'}
              onClick={() => {
                if (window.innerWidth < 768) {
                  setIsSidebarOpen(false);
                }
              }}
              className={cn(
                "w-full flex items-center transition-all group relative rounded-xl",
                isSidebarOpen ? "px-4 py-3 gap-3" : "px-0 py-3 justify-center",
                location.pathname === item.path
                  ? "bg-blue-50 text-blue-600 font-bold" 
                  : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
              )}
              title={!isSidebarOpen ? item.label : ''}
            >
              <item.icon className={cn(
                "w-5 h-5 shrink-0 transition-transform",
                location.pathname === item.path ? "text-blue-600" : "group-hover:scale-110"
              )} />
              {isSidebarOpen && <span className="text-[13px] font-medium tracking-tight">{item.label}</span>}
              {location.pathname === item.path && (
                <div className={cn(
                  "absolute bg-blue-600 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]",
                  isSidebarOpen ? "right-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-l-full" : "bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5"
                )}></div>
              )}
            </Link>
          ))}
        </nav>

        <div className="mt-auto px-4 py-6 space-y-4 shrink-0 border-t border-slate-100">
          <button
            onClick={logout}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all group",
              !isSidebarOpen && "justify-center px-0"
            )}
            title={!isSidebarOpen ? "Sign Out" : ""}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="text-xs font-black uppercase tracking-widest">Sign Out</span>}
          </button>
        </div>
      </aside>


      {/* Main Body */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header Bar */}
        <header className="h-20 md:h-24 bg-white border-b border-slate-100 flex items-center justify-between px-6 shrink-0 relative z-40 transition-all">
          <div className="flex items-center gap-4 flex-1 overflow-hidden">
            {userData?.orgId && org ? (
              <div className="flex items-center gap-4 md:gap-6 overflow-hidden">
                <div className="hidden md:flex w-10 h-10 md:w-12 md:h-12 rounded-xl bg-slate-50 border border-slate-100 p-1.5 items-center justify-center shrink-0 shadow-sm transition-all group-hover:scale-105 font-sans overflow-hidden">
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
                      <img src={logoSrc} alt={org?.name} className="w-full h-full object-contain mix-blend-multiply" referrerPolicy="no-referrer" />
                    );
                  })()}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="items-center gap-2 mb-0.5 hidden md:flex">
                    <h2 className="text-sm md:text-lg font-black text-slate-900 tracking-tight leading-none uppercase truncate">{org?.name}</h2>
                    <span className="hidden md:inline-block px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[8px] md:text-[9px] font-black uppercase tracking-widest border border-blue-100 shrink-0">
                      {org?.sector || 'Logistics'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[10px] md:text-[10px] font-bold text-slate-400 truncate uppercase tracking-widest">
                   <span className="hidden md:flex text-slate-900 items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-white border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center p-0.5 shrink-0">
                        <img 
                          src={getUserAvatar(userData?.avatarUrl, (userData as any)?.photoURL, userData?.name, userData?.uid)} 
                          className="w-full h-full object-contain rounded-full" 
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate leading-none mb-1 font-black text-slate-900">
                          {(!userData?.name || userData.name.toUpperCase() === 'ANONYMOUS') 
                            ? (userData?.role === 'super_admin' ? 'Super Admin' : 'Admin') 
                            : userData.name}
                        </span>
                        <span className="text-[8px] md:text-[9px] font-black text-blue-600 uppercase tracking-[0.1em] leading-none bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-1 w-max">
                          <Shield className="w-2 h-2" />
                          {userData?.role?.replace('_', ' ')}
                        </span>
                      </div>
                   </span>
                    <span className="hidden md:inline text-slate-300">|</span>
                    <span className="text-blue-600 font-black text-base md:text-xs tracking-tight uppercase leading-none italic shrink-0">
                      {menuItems.find(item => item.path === location.pathname)?.label || (userData?.role === 'org_admin' ? 'Management' : 'Overview')}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-slate-400 overflow-hidden uppercase tracking-widest">
                   <span className="hidden md:flex text-slate-900 items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-white border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center p-0.5 shrink-0">
                        <img 
                          src={getUserAvatar(userData?.avatarUrl, (userData as any)?.photoURL, userData?.name, userData?.uid)} 
                          className="w-full h-full object-contain rounded-full" 
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                      <span className="truncate leading-none mb-1 font-black text-slate-900">
                        {(!userData?.name || userData.name.toUpperCase() === 'ANONYMOUS') 
                          ? (userData?.role === 'super_admin' ? 'Super Admin' : 'Administrator') 
                          : userData.name}
                      </span>
                      <span className="text-[8px] md:text-[9px] font-black text-blue-600 uppercase tracking-[0.1em] leading-none bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-1 w-max">
                        <Shield className="w-2 h-2" />
                        {userData?.role?.replace('_', ' ')}
                      </span>
                    </div>
                   </span>
                <span className="hidden md:inline text-slate-300">/</span>
                <span className="text-blue-600 font-black italic">
                   {menuItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 md:gap-6 ml-4 shrink-0">
            {userData?.role === 'org_admin' && org && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-blue-50/50 border border-blue-100 rounded-lg text-blue-600 font-black text-[9px] uppercase tracking-widest">
                <ShieldCheck className="w-3 h-3" />
                {org?.subscriptionPlan || 'Pro'}
              </div>
            )}
            {/* Notification Bell Dropdown */}
            {(userData?.role === 'org_admin' || userData?.role === 'super_admin') ? (
              <div className="relative">
                <button 
                  onClick={() => setIsNotifOpen(!isNotifOpen)}
                  className={cn(
                    "p-2 rounded-xl transition-all relative outline-none",
                    isNotifOpen 
                      ? "bg-blue-50 text-blue-600 ring-2 ring-blue-500/10" 
                      : "text-slate-400 hover:text-blue-500 hover:bg-slate-50"
                  )}
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white rounded-full min-w-4 h-4 text-[9px] font-black flex items-center justify-center border-2 border-white shadow-sm px-1 leading-none">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {isNotifOpen && (
                    <>
                      {/* Invisible click-away overlay */}
                      <div 
                        className="fixed inset-0 z-[99]" 
                        onClick={() => setIsNotifOpen(false)} 
                      />
                      
                      <motion.div
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 15, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-3xl border border-slate-100 shadow-2xl p-4 z-[100] origin-top-right overflow-hidden focus:outline-none"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-slate-900 uppercase tracking-tight text-xs italic">
                              Notifications
                            </span>
                            {unreadCount > 0 && (
                              <span className="bg-red-50 text-red-500 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                                {unreadCount} new
                              </span>
                            )}
                          </div>
                          {unreadCount > 0 && (
                            <button 
                              onClick={handleMarkAllRead}
                              className="text-[10px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-700 transition-colors"
                            >
                              Mark all read
                            </button>
                          )}
                        </div>

                        {/* Notifications List */}
                        <div className="max-h-80 overflow-y-auto space-y-1.5 pr-0.5 divide-y divide-slate-50">
                          {generatedNotifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                              <Bell className="w-8 h-8 text-slate-200 mb-2 stroke-[1.5]" />
                              <p className="text-xs font-bold text-slate-400">No route logs yet</p>
                              <p className="text-[10px] text-slate-300 mt-1">Real-time driver shifts will list here</p>
                            </div>
                          ) : (
                            generatedNotifications.slice(0, 15).map((n) => {
                              const isRead = readIds.includes(n.id);
                              return (
                                <div 
                                  key={n.id}
                                  onClick={() => {
                                    handleMarkOneRead(n.id);
                                  }}
                                  className={cn(
                                    "flex gap-3 p-2.5 rounded-2xl transition-all cursor-pointer select-none items-start text-left group mt-1.5 first:mt-0",
                                    isRead ? "hover:bg-slate-50" : "bg-blue-50/35 hover:bg-blue-50/50"
                                  )}
                                >
                                  <div className={cn(
                                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border mt-0.5",
                                    n.type === 'start' 
                                      ? "bg-blue-50 border-blue-100 text-blue-600" 
                                      : "bg-emerald-50 border-emerald-100 text-emerald-600"
                                  )}>
                                    {n.type === 'start' ? (
                                      <Bus className="w-4 h-4" />
                                    ) : (
                                      <Activity className="w-4 h-4" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={cn(
                                        "text-xs font-black uppercase tracking-wider",
                                        n.type === 'start' ? "text-blue-600" : "text-emerald-600"
                                      )}>
                                        {n.type === 'start' ? 'Active Route' : 'Route Completed'}
                                      </span>
                                      <span className="text-[9px] font-mono text-slate-400 shrink-0">
                                        {formatNotifTime(n.time)}
                                      </span>
                                    </div>
                                    <p className={cn(
                                      "text-xs leading-relaxed mt-0.5",
                                      isRead ? "text-slate-500 font-medium" : "text-slate-800 font-bold"
                                    )}>
                                      {n.message}
                                    </p>
                                  </div>
                                  {!isRead && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-2 self-center animate-pulse" />
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button className="p-2 text-slate-400 hover:text-blue-500 transition-colors relative outline-none">
                <Bell className="w-5 h-5" />
              </button>
            )}
            
            <button 
              onClick={() => {
                setIsProfileOpen(true);
                setNewName(userData?.name || '');
              }}
              className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-white border border-slate-200/80 overflow-hidden shrink-0 hover:ring-4 hover:ring-blue-500/10 transition-all active:scale-90 flex items-center justify-center p-0.5 shadow-sm"
            >
              <img 
                src={getUserAvatar(userData?.avatarUrl, (userData as any)?.photoURL, userData?.name, userData?.uid)} 
                alt="Avatar" 
                className="w-full h-full object-contain rounded-full"
              />
            </button>
          </div>
        </header>

        <AnimatePresence>
          {isProfileOpen && (
            <div className="fixed inset-0 z-[10100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsProfileOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
              >
                {/* Header */}
                <div className="p-8 bg-slate-900 text-white relative">
                  <button 
                    onClick={() => setIsProfileOpen(false)}
                    className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                  >
                    <X size={20} />
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="relative group p-0.5 bg-white rounded-2xl border border-white/25 shadow-xl">
                      <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center bg-white">
                        <img 
                          src={getUserAvatar(userData?.avatarUrl, (userData as any)?.photoURL, userData?.name, userData?.uid)} 
                          alt="Avatar" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-all rounded-[14px] cursor-pointer">
                        <Edit2 size={16} className="text-white" />
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            // Check file size (limit to 500KB to stay safe in Firestore)
                            if (file.size > 512 * 1024) {
                              toast.error('Image is too large. Please use an image under 500KB.');
                              return;
                            }

                            const reader = new FileReader();
                              reader.onload = async (event) => {
                                const base64 = event.target?.result as string;
                                setIsSaving(true);
                                try {
                                  // Update Firestore
                                  await updateDoc(doc(db, 'users', userData!.uid), {
                                    avatarUrl: base64,
                                    updatedAt: serverTimestamp()
                                  });

                                  toast.success('Profile photo updated successfully');
                                } catch (e) {
                                  console.error("Photo update error:", e);
                                  toast.error('Failed to update photo');
                                } finally {
                                  setIsSaving(false);
                                }
                              };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      {isSaving && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px] rounded-xl">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase italic tracking-tight">
                        {(!userData?.name || userData.name.toUpperCase() === 'ANONYMOUS') 
                          ? (userData?.role === 'super_admin' ? 'Super Admin' : 'Administrator') 
                          : userData.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-blue-500 rounded text-[9px] font-black uppercase tracking-widest text-white shadow-sm shadow-blue-500/50">
                          {userData?.role?.replace('_', ' ')}
                        </span>
                        {org && userData?.name?.toLowerCase() !== org.name?.toLowerCase() && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{org.name}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="p-8 space-y-6">
                  {/* Name field */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <UserCircle size={12} className="text-blue-500" />
                        Full Identity
                      </label>
                    </div>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        disabled={!isEditingProfile || isSaving}
                        className={cn(
                          "w-full px-5 py-3 rounded-2xl text-sm font-bold transition-all outline-none border",
                          isEditingProfile 
                            ? "bg-white border-blue-200 ring-8 ring-blue-500/5 focus:border-blue-500 pr-24" 
                            : "bg-slate-50 border-transparent text-slate-500 cursor-not-allowed pr-12"
                        )}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        {isEditingProfile ? (
                          <>
                            <button
                              onClick={() => {
                                setNewName(userData?.name || '');
                                setIsEditingProfile(false);
                              }}
                              disabled={isSaving}
                              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all active:scale-95 disabled:opacity-50"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                            <button
                              onClick={async () => {
                                if (isSaving) return;
                                
                                if (!newName.trim() || newName === userData?.name) {
                                  setIsEditingProfile(false);
                                  return;
                                }
                                
                                setIsSaving(true);
                                try {
                                  const userRef = doc(db, 'users', userData!.uid);
                                  await updateDoc(userRef, {
                                    name: newName.trim(),
                                    updatedAt: serverTimestamp()
                                  });
                                  
                                  // Sync with Firebase Auth Profile
                                  if (firebaseAuth.currentUser) {
                                    await updateProfile(firebaseAuth.currentUser, { displayName: newName.trim() });
                                  }

                                  toast.success(`Identity recognized: ${newName.trim()}`);
                                  setIsEditingProfile(false);
                                } catch (e: any) {
                                  console.error("Update error:", e);
                                  toast.error(`Auth Update Failed: ${e.message}`);
                                } finally {
                                  setIsSaving(false);
                                }
                              }}
                              disabled={isSaving}
                              className="p-1.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                              title="Save"
                            >
                              {isSaving ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setIsEditingProfile(true)}
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all active:scale-95 hover:text-blue-600"
                            title="Edit Name"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Email display */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                      <Mail size={12} className="text-slate-400" />
                      Contact Email
                    </label>
                    <div className="px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-400 italic">
                      {userData?.email}
                    </div>
                  </div>

                  {/* Security section */}
                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] px-1 italic">Security Measures</p>
                    <button 
                      onClick={async () => {
                        if (!userData?.email || isResettingPassword) return;
                        setIsResettingPassword(true);
                        try {
                          await sendPasswordResetEmail(firebaseAuth, userData.email);
                          toast.success(`Instructions dispatched to ${userData.email}`);
                        } catch (e: any) {
                          console.error("Reset error:", e);
                          if (e.code === 'auth/too-many-requests') {
                            toast.error('Firebase Rate Limit: Too many requests. Please try again in a few minutes.');
                          } else if (e.code === 'auth/operation-not-allowed') {
                            toast.error('Security Policy: Reset restricted by Identity Provider.');
                          } else {
                            toast.error(e.message || 'Security protocol failure');
                          }
                        } finally {
                          setIsResettingPassword(false);
                        }
                      }}
                      disabled={isResettingPassword}
                      className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-3xl group transition-all disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-slate-400 group-hover:text-blue-600 shadow-sm transition-all">
                          {isResettingPassword ? <div className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" /> : <Key size={18} />}
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-black text-slate-900 uppercase italic leading-none">Reset Access Code</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Change your password via email</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-900" />
                    </button>
                  </div>
                </div>

                <div className="px-8 pb-8">
                  <button 
                    onClick={() => setIsProfileOpen(false)}
                    className="w-full py-4 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all active:scale-95"
                  >
                    Close Settings
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="p-4 md:p-8">
            {children}
          </div>
        </div>
      </main>
      
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}
