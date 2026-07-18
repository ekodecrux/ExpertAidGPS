import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Initialize safely without apiPatch
try {
  // Import App after DOM is ready
  const App = React.lazy(() => import('./App.tsx'));

  createRoot(document.getElementById('root')!).render(
    <React.Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f3f4f6' }}><div style={{ textAlign: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #e5e7eb', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto', marginBottom: '16px' }}></div><p style={{ color: '#666', fontFamily: 'sans-serif' }}>Loading...</p></div></div>}>
      <App />
    </React.Suspense>,
  );
} catch (error) {
  console.error('Failed to initialize app:', error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="padding: 20px; color: red; font-family: sans-serif; text-align: center;"><h1>Application Error</h1><p>Failed to start the application. Please try again.</p></div>';
  }
}
