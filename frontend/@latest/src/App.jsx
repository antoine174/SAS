// src/App.jsx
/**
 * Root router shell.
 *
 * Route hierarchy:
 *   /login            – Public auth page
 *   /quick-upload     – Share Target reception (handles its own auth inline)
 *   /                 – Dashboard (paginated consignment list)
 *   /consignment/:id  – Full-page details workspace (3 tabs)
 *   /users            – Admin user management
 */

import { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Loader2 } from 'lucide-react';

import { useAuth } from './lib/AuthContext';
import AuthPage from './components/AuthPage';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ConsignmentWorkspace from './pages/ConsignmentWorkspace';
import QuickUpload from './pages/QuickUpload';
import UsersManagement from './components/UsersManagement';

// ─── Protected Route wrapper ──────────────────────────────────────────────────
function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// ─── Login route — redirects to / if already authenticated ────────────────────
function LoginRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;
  return <AuthPage />;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-redirect /?quickUpload=1 or /?shared=1 to /quick-upload?shared=1
  // Ensures Vercel's root '/' (which never 404s) seamlessly handoffs to QuickUpload
  useEffect(() => {
    const params = new URLSearchParams(window.location.search || location.search);
    if (params.get('quickUpload') === '1' || params.get('shared') === '1') {
      navigate('/quick-upload?shared=1', { replace: true });
    }
  }, [navigate, location.search]);

  return (
    <>
      <ToastContainer position="bottom-left" rtl pauseOnHover closeOnClick newestOnTop />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginRoute />} />

        {/* Quick upload — handles auth INTERNALLY so IndexedDB file persists across login */}
        <Route path="/quick-upload" element={<QuickUpload />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          {/* Routes that share the common Layout (header + footer) */}
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<UsersManagement />} />
          </Route>

          {/* Full-page workspace — renders its own chrome, no shared Layout */}
          <Route path="/consignment/:id" element={<ConsignmentWorkspace />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
