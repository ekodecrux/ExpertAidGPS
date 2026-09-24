import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppShell from './components/AppShell';
import ForcePasswordChange from './components/ForcePasswordChange';
import Login from './pages/Login';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import OrgAdminDashboard from './pages/OrgAdminDashboard';
import DriverDashboard from './pages/DriverDashboard';
import UserDashboard from './pages/UserDashboard';
import PrivacyPolicy from './pages/PrivacyPolicy';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import DriverApp from './mobile/DriverApp';
import UserApp from './mobile/UserApp';

function AppContent() {
  const { userData, loading } = useAuth();
  const location = useLocation();
  
  const isMobileRole = userData?.role === 'driver' || userData?.role === 'user';

  if (location.pathname === '/privacy-policy') {
    return <PrivacyPolicy />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-900 font-bold tracking-tight text-xs uppercase">Expert GPS Loading...</p>
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

  // Use specialized Mobile App containers for Driver and User
  if (userData.role === 'driver') return <DriverApp />;
  if (userData.role === 'user') return <UserApp />;

  return (
    <AppShell>
      <Routes>
        {/* Core Dashboards based on role */}
        <Route path="/" element={
          <>
            {userData.role === 'super_admin' && <SuperAdminDashboard view="overview" />}
            {userData.role === 'org_admin' && <OrgAdminDashboard view="overview" />}
          </>
        } />

        {/* Fleet Management Routes (Org Admin) */}
        {userData.role === 'org_admin' && (
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
        {(userData.role === 'org_admin' || userData.role === 'super_admin') && (
          <Route path="/map" element={<OrgAdminDashboard view="map" />} />
        )}

        {/* Super Admin Specific Routes */}
        {userData.role === 'super_admin' && (
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
