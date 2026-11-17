// src/components/Layout.jsx
/**
 * Shared page chrome: sticky header with navigation, refund badge,
 * user info, admin tabs, and footer.
 *
 * Child routes render inside <Outlet />.
 * The RefundsDashboard is a full-screen overlay toggled from the header badge.
 */

import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import {
  ShieldCheck,
  FileStack,
  BarChart3,
  LogOut,
  Users,
} from 'lucide-react';

import { useAuth } from '../lib/AuthContext';
import { fetchApi } from '../lib/api';
import RefundsDashboard from './RefundsDashboard';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

  // ── Refund badge count ──────────────────────────────────────────────────────
  const [refundCount, setRefundCount] = useState(0);
  const [showRefundsDashboard, setShowRefundsDashboard] = useState(false);

  const fetchRefundCount = useCallback(async () => {
    try {
      const res = await fetchApi('/api/refunds/count');
      setRefundCount(typeof res?.count === 'number' ? res.count : 0);
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => { fetchRefundCount(); }, [fetchRefundCount]);

  // ── Determine active tab from URL ──────────────────────────────────────────
  const activeTab = location.pathname === '/users' ? 'users' : 'registry';

  return (
    <>
      <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-800 font-[Tajawal,sans-serif]">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <ShieldCheck size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 leading-none">SAS</p>
                  <p className="text-xs text-slate-500 leading-tight">نظام التخليص الجمركي</p>
                </div>
              </Link>
            </div>

            <div className="flex items-center gap-2">
              {/* Refund count badge */}
              <button
                type="button"
                onClick={() => setShowRefundsDashboard(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold transition-all shadow-sm
                  ${refundCount > 0
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/25 animate-pulse hover:animate-none'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
              >
                <BarChart3 size={15} />
                <span className="hidden sm:inline">ملفات الاسترداد النشطة:</span>
                <span className={`font-mono ${refundCount > 0 ? 'text-white' : 'text-slate-700'}`}>
                  {refundCount}
                </span>
              </button>

              <FileStack size={16} className="text-slate-400" />
              <span className="text-sm text-slate-400 hidden sm:inline">سجل الشحنات</span>

              {/* Logged-in user + logout */}
              <div className="flex items-center gap-2 ps-3 ms-1 border-s border-slate-200">
                <div className="text-right leading-tight hidden sm:block">
                  <p className="text-xs font-bold text-slate-700">{user?.username}</p>
                  <span className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border
                    ${isAdmin ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {isAdmin ? 'مدير النظام' : 'مستخدم'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all"
                >
                  <LogOut size={14} />
                  <span className="hidden sm:inline">تسجيل الخروج</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* ── Admin navigation tabs ─────────────────────────────────────────── */}
        {isAdmin && (
          <div className="max-w-6xl mx-auto px-4 pt-6">
            <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm gap-1">
              {[
                { id: 'registry', to: '/',     label: 'سجل الشحنات',     icon: FileStack },
                { id: 'users',    to: '/users', label: 'إدارة المستخدمين', icon: Users     },
              ].map(({ id, to, label, icon: Icon }) => (
                <Link
                  key={id}
                  to={to}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all
                    ${activeTab === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Route content ─────────────────────────────────────────────────── */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          <Outlet />
        </main>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="border-t border-slate-200 mt-16 py-6 text-center text-xs text-slate-500">
          SAS — نظام التخليص الجمركي © {new Date().getFullYear()}
        </footer>
      </div>

      {/* ── Refunds Dashboard overlay ──────────────────────────────────────── */}
      {showRefundsDashboard && (
        <RefundsDashboard
          onClose={() => {
            setShowRefundsDashboard(false);
            fetchRefundCount();
          }}
        />
      )}
    </>
  );
}
