import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppShell from './components/AppShell';
import ForcePasswordChange from './components/ForcePasswordChange';
import Login from './pages/Login';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import OrgAdminDashboard from './pages/OrgAdminDashboard';
import DriverDashboard from './pages/DriverDashboard';
import UserDashboard from './pages/UserDashboard';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import DriverApp from './mobile/DriverApp';
import UserApp from './mobile/UserApp';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import LocationDisclosureModal from './components/LocationDisclosureModal';
import {
  hasAcceptedLocationDisclosure,
  setLocationDisclosureAccepted,
  requestLocationPermissions,
  onShowLocationDisclosure
} from './lib/locationService';

function AppContent() {
  const { userData, loading } = useAuth();
  const [showGlobalDisclosure, setShowGlobalDisclosure] = useState(false);

  useEffect(() => {
    const unsubscribe = onShowLocationDisclosure((show) => {
      setShowGlobalDisclosure(show);
    });
    return unsubscribe;
  }, []);

  const handleAcceptGlobalDisclosure = async () => {
    setLocationDisclosureAccepted(true);
    setShowGlobalDisclosure(false);
    await requestLocationPermissions().catch(() => {});
  };

  const handleDenyGlobalDisclosure = () => {
    setShowGlobalDisclosure(false);
  };
  
  // Public route for Google Play Policy compliance: allow reviewing privacy policy without login
  const path = window.location.pathname.toLowerCase();
  if (path === '/privacy' || path === '/privacy-policy' || path === '/location-disclosure') {
    return <PrivacyPolicyPage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/5 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-md w-full bg-white rounded-[2.25rem] shadow-xl overflow-hidden border border-slate-100/85 z-10 relative p-8 flex flex-col items-center text-center">
          <div className="mx-auto mb-4 transition-all duration-300">
            <img 
              src="/instantexpert-logo.png" 
              alt="ExpertAid" 
              className="h-20 mx-auto object-contain animate-pulse" 
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 uppercase">Expert GPS Tracking</h2>
          <p className="text-slate-400 font-bold text-[9px] uppercase tracking-[0.2em] mt-1">Initializing secure session...</p>
        </div>
      </div>
    );
  }

  if (!userData) {
    return <Login />;
  }

  if (userData.forcePasswordChange) {
    return <ForcePasswordChange />;
  }

  const renderMainContent = () => {
    const role = (userData.role || '').toLowerCase().trim();

    // 1. Driver App
    if (role === 'driver') {
      return <DriverApp />;
    }

    // 2. Admin Dashboards
    if (role === 'super_admin' || role === 'org_admin') {
      return (
        <AppShell>
          <Routes>
            {/* Core Dashboards based on role */}
            <Route path="/" element={
              <>
                {role === 'super_admin' && <SuperAdminDashboard view="overview" />}
                {role === 'org_admin' && <OrgAdminDashboard view="overview" />}
              </>
            } />

            {/* Fleet Management Routes (Org Admin) */}
            {role === 'org_admin' && (
              <>
                <Route path="/vehicles" element={<OrgAdminDashboard view="vehicles" />} />
                <Route path="/drivers" element={<OrgAdminDashboard view="drivers" />} />
                <Route path="/routes" element={<OrgAdminDashboard view="routes" />} />
                <Route path="/members" element={<OrgAdminDashboard view="members" />} />
                <Route path="/reports" element={<OrgAdminDashboard view="reports" />} />
                <Route path="/settings" element={<OrgAdminDashboard view="settings" />} />
              </>
            )}

            {/* Live Map Tracking (Both Super Admin and Org Admin) */}
            {(role === 'org_admin' || role === 'super_admin') && (
              <Route path="/map" element={<OrgAdminDashboard view="map" />} />
            )}

            {/* Super Admin Specific Routes */}
            {role === 'super_admin' && (
              <>
                <Route path="/clients" element={<SuperAdminDashboard view="clients" />} />
                <Route path="/logs" element={<SuperAdminDashboard view="logs" />} />
                <Route path="/reports" element={<SuperAdminDashboard view="reports" />} />
                <Route path="/settings" element={<SuperAdminDashboard view="settings" />} />
              </>
            )}

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      );
    }

    // 3. Fallback for all user/member/student/parent roles
    return <UserApp />;
  };

  return (
    <>
      {renderMainContent()}
      <LocationDisclosureModal
        isOpen={showGlobalDisclosure}
        onAccept={handleAcceptGlobalDisclosure}
        onDeny={handleDenyGlobalDisclosure}
        requiredForRole={userData?.role || 'user'}
      />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
        <Toaster position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}
