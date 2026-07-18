import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Lazy load components
const AuthProvider = React.lazy(() => import('./contexts/AuthContext').then(m => ({ default: m.AuthProvider })));
const useAuth = React.lazy(() => import('./contexts/AuthContext').then(m => ({ default: m.useAuth })));
const Login = React.lazy(() => import('./pages/Login'));
const AppShell = React.lazy(() => import('./components/AppShell'));
const SuperAdminDashboard = React.lazy(() => import('./pages/SuperAdminDashboard'));
const OrgAdminDashboard = React.lazy(() => import('./pages/OrgAdminDashboard'));
const DriverDashboard = React.lazy(() => import('./pages/DriverDashboard'));
const UserDashboard = React.lazy(() => import('./pages/UserDashboard'));
const ForcePasswordChange = React.lazy(() => import('./components/ForcePasswordChange'));
const DriverApp = React.lazy(() => import('./mobile/DriverApp'));
const UserApp = React.lazy(() => import('./mobile/UserApp'));

// Loading component
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-900 font-bold tracking-tight text-xs uppercase">Expert GPS Loading...</p>
      </div>
    </div>
  );
}

// Error fallback
function ErrorFallback() {
  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Application Error</h1>
        <p className="text-gray-600 mb-4">Failed to load application</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

// App content component
function AppContent() {
  try {
    // Use dynamic import to avoid circular dependencies
    const { useAuth } = require('./contexts/AuthContext');
    const { userData, loading } = useAuth();

    if (loading) {
      return <LoadingScreen />;
    }

    if (!userData) {
      return <Login />;
    }

    if (userData.forcePasswordChange) {
      return <ForcePasswordChange />;
    }

    // Route based on role
    if (userData.role === 'driver') return <DriverApp />;
    if (userData.role === 'user') return <UserApp />;

    return (
      <AppShell>
        <Routes>
          <Route path="/" element={
            <>
              {userData.role === 'super_admin' && <SuperAdminDashboard view="overview" />}
              {userData.role === 'org_admin' && <OrgAdminDashboard view="overview" />}
            </>
          } />
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
          {(userData.role === 'org_admin' || userData.role === 'super_admin') && (
            <Route path="/map" element={<OrgAdminDashboard view="map" />} />
          )}
          {userData.role === 'super_admin' && (
            <>
              <Route path="/clients" element={<SuperAdminDashboard view="clients" />} />
              <Route path="/logs" element={<SuperAdminDashboard view="logs" />} />
              <Route path="/reports" element={<SuperAdminDashboard view="reports" />} />
              <Route path="/settings" element={<SuperAdminDashboard view="settings" />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    );
  } catch (error) {
    console.error('Error in AppContent:', error);
    return <ErrorFallback />;
  }
}

// Main App component
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <AuthProvider>
          <AppContent />
          <Toaster position="top-right" />
        </AuthProvider>
      </Suspense>
    </BrowserRouter>
  );
}
