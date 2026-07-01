// src/App.jsx
/**
 * SAS – Consignment Registry
 *
 * Provides three core features:
 *   1. Create a new consignment (via ConsignmentHeader form)
 *   2. Search consignments with multi-field $regex filters
 *   3. Delete a consignment with password authentication
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  ShieldCheck,
  Search,
  X,
  Trash2,
  Loader2,
  KeyRound,
  FileStack,
  Building2,
  Hash,
  Package,
  Layers,
  Truck,
  FlaskConical,
  Receipt,
  Eye,
  Calendar,
} from 'lucide-react';

import ConsignmentHeader from './components/ConsignmentHeader';
import ConsignmentDetailModal from './components/ConsignmentDetailModal';
import { fetchApi } from './lib/api';

// ─── Field meta (used in search filters AND result cards) ─────────────────────
const FIELDS = [
  { key: 'companyName',           labelAr: 'اسم الشركة',          icon: Building2,    mono: false },
  { key: 'acid',                  labelAr: 'ACID',                 icon: FlaskConical, mono: true  },
  { key: 'invoiceSequenceNumber', labelAr: 'رقم تسلسل الفاتورة', icon: Receipt,      mono: true  },
  { key: 'consignmentNumber',     labelAr: 'رقم البوليصة',        icon: Hash,         mono: true  },
  { key: 'itemName',              labelAr: 'اسم الصنف',           icon: Package,      mono: false },
  { key: 'count',                 labelAr: 'العدد',               icon: Layers,       mono: true  },
  { key: 'supplierName',          labelAr: 'اسم المورد',          icon: Truck,        mono: false },
];

const EMPTY_FILTERS = {
  companyName: '', acid: '', invoiceSequenceNumber: '',
  consignmentNumber: '', itemName: '', count: '', supplierName: '',
};

// Colour accent per company (used for badge)
const COMPANY_COLOR = {
  'مصانع الترياق': 'emerald',
  'شركة الزامل': 'sky',
};

export default function App() {
  // ── Search state ────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalShown, setTotalShown] = useState(0);

  // ── Detail modal state ──────────────────────────────────────────────────────
  const [detailDoc, setDetailDoc] = useState(null);

  const openDetail  = (doc) => setDetailDoc(doc);
  const closeDetail = ()    => setDetailDoc(null);

  // ── Delete modal state ──────────────────────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState({ show: false, id: null, label: '' });
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const pwInputRef = useRef(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const setFilter = (key) => (e) =>
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const hasActiveFilters = Object.values(filters).some((v) => v.trim() !== '');

  // ── Fetch / search ──────────────────────────────────────────────────────────
  const runSearch = useCallback(async (overrideFilters) => {
    setIsSearching(true);
    try {
      const active = overrideFilters ?? filters;
      const params = new URLSearchParams();
      Object.entries(active).forEach(([k, v]) => {
        if (v.trim()) params.append(k, v.trim());
      });

      const data = await fetchApi(`/api/consignments?${params.toString()}`);
      const list = Array.isArray(data) ? data : [];
      setResults(list);
      setTotalShown(list.length);
      setHasSearched(true);
    } catch {
      toast.error('تعذّر تحميل البيانات من الخادم');
    } finally {
      setIsSearching(false);
    }
  }, [filters]);

  // Load all records on mount
  useEffect(() => { runSearch(EMPTY_FILTERS); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Delete flow ─────────────────────────────────────────────────────────────
  const openDeleteModal = (id, label) => {
    setDeleteModal({ show: true, id, label });
    setDeletePassword('');
    // Auto-focus the password input once the modal renders
    setTimeout(() => pwInputRef.current?.focus(), 50);
  };

  const closeDeleteModal = () => {
    setDeleteModal({ show: false, id: null, label: '' });
    setDeletePassword('');
  };

  const confirmDelete = async () => {
    const pw = deletePassword.trim();
    if (!pw) { toast.error('يرجى إدخال رمز التأكيد'); return; }

    setIsDeleting(true);
    try {
      const data = await fetchApi(`/api/consignments/${deleteModal.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ password: pw }),
      });

      if (data.message === 'رمز التأكيد غير صحيح') {
        toast.error('رمز التأكيد غير صحيح ❌');
        return;
      }

      toast.success('تم حذف الشحنة بنجاح 🗑️');
      closeDeleteModal();
      // Remove card from local state immediately (no round-trip needed)
      setResults((prev) => prev.filter((r) => r._id !== deleteModal.id));
      setTotalShown((n) => n - 1);
    } catch {
      toast.error('تعذّر الاتصال بالخادم');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Shared input class ──────────────────────────────────────────────────────
  const inputCls = `
    w-full bg-slate-800/60 border border-slate-600 text-slate-100 placeholder-slate-500
    rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500
    focus:ring-1 focus:ring-emerald-500/40 transition-all text-right
  `;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 font-[Tajawal,sans-serif]">

      <ToastContainer position="bottom-left" rtl theme="dark" pauseOnHover closeOnClick newestOnTop />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-100 leading-none">SAS</p>
              <p className="text-xs text-slate-500 leading-tight">نظام التخليص الجمركي</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FileStack size={16} className="text-slate-400" />
            <span className="text-sm text-slate-400 hidden sm:inline">سجل الشحنات</span>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-slate-100">سجل الشحنات</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            إضافة شحنة جديدة أو البحث في السجلات الموجودة
          </p>
        </div>

        {/* ── Create form (collapsible) ───────────────────────────────────── */}
        <ConsignmentHeader onCreated={() => runSearch(EMPTY_FILTERS)} />

        {/* ── Search / filter panel ───────────────────────────────────────── */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-4">

          <div className="flex items-center gap-2">
            <Search size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-300">البحث والتصفية</h2>
            {hasActiveFilters && (
              <span className="text-xs text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                فلاتر نشطة
              </span>
            )}
          </div>

          {/* Filter inputs – 2 per row on mobile, 3 on sm, 6 on lg */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {FIELDS.map(({ key, labelAr, mono }) => (
              <div key={key}>
                <label className="block text-xs text-slate-400 mb-1">{labelAr}</label>
                <div className="relative">
                  <input
                    id={`filter-${key}`}
                    type="text"
                    placeholder="..."
                    value={filters[key]}
                    onChange={setFilter(key)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    className={`${inputCls} ${mono ? 'font-mono' : ''} pe-7`}
                    dir={mono ? 'ltr' : 'rtl'}
                  />
                  {filters[key] && (
                    <button
                      type="button"
                      onClick={() => setFilters((p) => ({ ...p, [key]: '' }))}
                      className="absolute inset-y-0 left-2 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Action row */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              id="btn-search"
              onClick={() => runSearch()}
              disabled={isSearching}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                         bg-emerald-600 hover:bg-emerald-500 text-white
                         transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20
                         hover:scale-105 active:scale-100"
            >
              {isSearching
                ? <Loader2 size={15} className="animate-spin" />
                : <Search size={15} />
              }
              بحث
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                id="btn-clear-filters"
                onClick={() => { clearFilters(); runSearch(EMPTY_FILTERS); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                           border border-slate-600 text-slate-400 hover:text-slate-200
                           hover:border-slate-500 transition-all"
              >
                <X size={14} />
                مسح الفلاتر
              </button>
            )}

            {hasSearched && (
              <span className="text-xs text-slate-500 me-auto">
                {isSearching ? 'جارٍ البحث…' : `${totalShown} نتيجة`}
              </span>
            )}
          </div>
        </div>

        {/* ── Results ────────────────────────────────────────────────────────── */}

        {/* Loading skeletons */}
        {isSearching && !hasSearched && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-slate-800/60 border border-slate-700 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {hasSearched && !isSearching && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
              <FileStack size={28} className="text-slate-600" />
            </div>
            <div>
              <p className="text-slate-400 font-semibold">لا توجد نتائج</p>
              <p className="text-slate-600 text-sm mt-1">
                {hasActiveFilters ? 'جرّب تعديل الفلاتر أو مسحها' : 'لا توجد شحنات مسجّلة بعد'}
              </p>
            </div>
          </div>
        )}

        {/* Result cards */}
        {hasSearched && results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((doc) => {
              const accentColor = COMPANY_COLOR[doc.companyName] ?? 'slate';
              const timeLabel = (() => {
                const diffMs = Date.now() - new Date(doc.createdAt).getTime();
                const diffMins = Math.floor(diffMs / 60000);
                const diffHrs = Math.floor(diffMins / 60);
                const diffDays = Math.floor(diffHrs / 24);
                if (diffMins < 1) return 'الآن';
                if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
                if (diffHrs < 24) return `منذ ${diffHrs} ساعة`;
                if (diffDays < 7) return `منذ ${diffDays} يوم`;
                return new Date(doc.createdAt).toLocaleDateString('ar-EG', {
                  day: 'numeric', month: 'short', year: 'numeric',
                });
              })();

              return (
                <div
                  key={doc._id}
                  onClick={() => openDetail(doc)}
                  className="group relative bg-slate-800/50 hover:bg-slate-800 border border-slate-700
                             hover:border-emerald-700/50 rounded-2xl p-5 transition-all duration-200
                             hover:shadow-lg hover:shadow-emerald-900/20 cursor-pointer"
                >
                  {/* Company badge + timestamp */}
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <span className={`
                      text-xs font-semibold px-2.5 py-1 rounded-full
                      bg-${accentColor}-500/15 text-${accentColor}-300
                      border border-${accentColor}-500/30
                    `}>
                      {doc.companyName}
                    </span>
                    <span className="text-xs text-slate-500 flex-shrink-0">{timeLabel}</span>
                  </div>

                  {/* Field grid */}
                  <div className="space-y-2">
                    {[
                      { key: 'acid',                  labelAr: 'ACID',             Icon: FlaskConical, mono: true  },
                      { key: 'invoiceSequenceNumber', labelAr: 'رقم تسلسل الفاتورة', Icon: Receipt,   mono: true  },
                      { key: 'consignmentNumber',     labelAr: 'رقم البوليصة',    Icon: Hash,         mono: true  },
                      { key: 'itemName',              labelAr: 'الصنف',            Icon: Package,      mono: false },
                      { key: 'count',                 labelAr: 'العدد',            Icon: Layers,       mono: true  },
                      { key: 'supplierName',          labelAr: 'المورد',           Icon: Truck,        mono: false },
                    ].map(({ key, labelAr, Icon, mono }) =>
                      doc[key] ? (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          <Icon size={13} className="text-slate-500 flex-shrink-0" />
                          <span className="text-slate-500 text-xs w-20 flex-shrink-0">{labelAr}</span>
                          <span className={`text-slate-200 truncate ${mono ? 'font-mono text-emerald-300' : ''}`}>
                            {doc[key]}
                          </span>
                        </div>
                      ) : null
                    )}
                  </div>

                  {/* Bottom row: view hint + delete button */}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-slate-600 group-hover:text-emerald-500 transition-colors">
                      <Eye size={12} />
                      عرض التفاصيل
                    </span>
                    <button
                      type="button"
                      id={`btn-delete-${doc._id}`}
                      onClick={(e) => { e.stopPropagation(); openDeleteModal(doc._id, doc.acid || doc._id); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                 text-rose-400 border border-rose-500/30 bg-rose-500/10
                                 hover:bg-rose-500/20 hover:border-rose-500/50 hover:text-rose-300
                                 transition-all duration-200"
                    >
                      <Trash2 size={13} />
                      حذف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {detailDoc && (
        <ConsignmentDetailModal
          detailDoc={detailDoc}
          closeDetail={closeDetail}
          openDeleteModal={openDeleteModal}
          onUpdate={() => runSearch()}
        />
      )}

      {/* ── Delete Password Modal ─────────────────────────────────────────────── */}
      {deleteModal.show && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeDeleteModal(); }}
        >
          <div
            dir="rtl"
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5"
          >
            {/* Modal header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center flex-shrink-0">
                <KeyRound size={18} className="text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">تأكيد الحذف</h3>
                <p className="text-xs text-slate-400 leading-snug">
                  حذف الشحنة:{' '}
                  <span className="font-mono text-rose-300">{deleteModal.label}</span>
                </p>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3">
              <p className="text-xs text-rose-300 leading-relaxed">
                ⚠️ سيتم <strong>حذف هذا السجل نهائياً</strong> من قاعدة البيانات.
                لا يمكن التراجع عن هذا الإجراء.
              </p>
            </div>

            {/* Password input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                رمز تأكيد الحذف
              </label>
              <input
                ref={pwInputRef}
                id="delete-password-input"
                type="password"
                autoFocus
                placeholder="أدخل الرمز…"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmDelete()}
                className="w-full bg-slate-800 border border-slate-600 focus:border-rose-500
                           focus:ring-1 focus:ring-rose-500/40 rounded-xl px-4 py-3
                           text-sm text-slate-100 placeholder-slate-500 outline-none
                           transition-all text-right"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300
                           text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                id="btn-confirm-delete"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-rose-600 hover:bg-rose-500 disabled:opacity-60
                           text-white text-sm font-bold transition-colors
                           shadow-lg shadow-rose-900/30"
              >
                {isDeleting
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Trash2 size={15} />
                }
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 mt-16 py-6 text-center text-xs text-slate-600">
        SAS — نظام التخليص الجمركي © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
