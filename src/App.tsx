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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-blue-500/40 mb-4 animate-pulse">
            <span className="text-white font-black text-2xl tracking-tighter italic">GPS</span>
          </div>
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-white font-black tracking-widest text-[11px] uppercase">Expert GPS Tracking</p>
          <p className="text-slate-400 text-[10px] mt-1 font-medium">Initializing secure workspace...</p>
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
