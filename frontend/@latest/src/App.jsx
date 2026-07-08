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
  ChevronLeft,
  ChevronRight,
  BarChart3,
} from 'lucide-react';

import ConsignmentHeader from './components/ConsignmentHeader';
import ConsignmentDetailModal from './components/ConsignmentDetailModal';
import RefundsDashboard from './components/RefundsDashboard';
import { fetchApi } from './lib/api';
import { COMPANIES, COMPANY_COLOR } from './lib/constants';

// ─── Search type options ──────────────────────────────────────────────────────
const SEARCH_TYPES = [
  { key: 'companyName',           labelAr: 'اسم الشركة'           },
  { key: 'acid',                  labelAr: 'ACID'                  },
  { key: 'consignmentNumber',     labelAr: 'رقم البوليصة'         },
  { key: 'invoiceSequenceNumber', labelAr: 'رقم الفاتورة'         },
  { key: 'itemName',              labelAr: 'اسم الصنف'            },
  { key: 'count',                 labelAr: 'العدد'                },
  { key: 'supplierName',          labelAr: 'اسم المورد'           },
  { key: 'certificateNumber',     labelAr: 'رقم الشهاده'          },
  { key: 'arrivalPort',           labelAr: 'ميناء الوصول'         },
  { key: 'fileNumber',            labelAr: 'رقم الملف'            },
];

const PAGE_LIMIT = 10;

export default function App() {
  // ── Search state ────────────────────────────────────────────────────────────
  const [searchType,  setSearchType]  = useState(SEARCH_TYPES[0].key);
  const [searchValue, setSearchValue] = useState('');
  const [results,     setResults]     = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // ── Pagination state ────────────────────────────────────────────────────────
  const [currentPage,  setCurrentPage]  = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // ── Refund dashboard state ───────────────────────────────────────────────
  const [refundCount,          setRefundCount]          = useState(0);
  const [showRefundsDashboard, setShowRefundsDashboard] = useState(false);

  const fetchRefundCount = useCallback(async () => {
    try {
      const res = await fetchApi('/api/refunds/count');
      setRefundCount(typeof res?.count === 'number' ? res.count : 0);
    } catch {
      // Non-fatal — badge just shows 0
    }
  }, []);

  useEffect(() => { fetchRefundCount(); }, [fetchRefundCount]);

  // ── Detail modal state ──────────────────────────────────────────────────────
  const [detailDoc, setDetailDoc] = useState(null);

  const openDetail  = (doc) => setDetailDoc(doc);
  const closeDetail = ()    => setDetailDoc(null);

  // ── Delete modal state ──────────────────────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState({ show: false, id: null, label: '' });
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const pwInputRef = useRef(null);

  // ── Fetch / search ──────────────────────────────────────────────────────────
  const runSearch = useCallback(async (page = 1, overrideType, overrideValue) => {
    setIsSearching(true);
    try {
      const type  = overrideType  ?? searchType;
      const value = overrideValue ?? searchValue;
      const params = new URLSearchParams();
      if (value.trim()) params.append(type, value.trim());
      params.append('page',  String(page));
      params.append('limit', String(PAGE_LIMIT));

      const data = await fetchApi(`/api/consignments?${params.toString()}`);
      // ── Defensive defaults: always arrays/numbers, never undefined ────────
      const list       = Array.isArray(data?.data) ? data.data : [];
      const total      = typeof data?.totalRecords === 'number' ? data.totalRecords : list.length;
      const pages      = typeof data?.totalPages   === 'number' ? data.totalPages  : (total > 0 ? 1 : 0);
      const activePage = typeof data?.currentPage  === 'number' ? data.currentPage : page;
      setResults(list);
      setTotalRecords(total);
      setTotalPages(pages);
      setCurrentPage(activePage);
      setHasSearched(true);
    } catch {
      toast.error('تعذّر تحميل البيانات من الخادم');
    } finally {
      setIsSearching(false);
    }
  }, [searchType, searchValue]);

  // Load all records on mount
  useEffect(() => { runSearch(1, SEARCH_TYPES[0].key, ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When user changes search type, clear value and keep companyName dropdown in sync
  const handleTypeChange = (e) => {
    setSearchType(e.target.value);
    setSearchValue('');
  };

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    runSearch(1);
  };

  const handleClear = () => {
    setSearchValue('');
    runSearch(1, searchType, '');
  };

  const hasActiveSearch = searchValue.trim() !== '';
  const isCompanyType   = searchType === 'companyName';

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
    w-full bg-white border border-slate-300 text-slate-800 placeholder-slate-400
    rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500
    focus:ring-2 focus:ring-blue-500/20 transition-all text-right
  `;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-800 font-[Tajawal,sans-serif]">

      <ToastContainer position="bottom-left" rtl pauseOnHover closeOnClick newestOnTop />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <ShieldCheck size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 leading-none">SAS</p>
              <p className="text-xs text-slate-500 leading-tight">نظام التخليص الجمركي</p>

            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Refund count badge */}
            <button
              type="button"
              id="btn-refunds-dashboard"
              onClick={() => setShowRefundsDashboard(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold transition-all shadow-sm
                ${
                  refundCount > 0
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/25 animate-pulse hover:animate-none'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
            >
              <BarChart3 size={15} />
              <span className="hidden sm:inline">ملفات الاسترداد النشطة:</span>
              <span className={`font-mono ${ refundCount > 0 ? 'text-white' : 'text-slate-700' }`}>
                {refundCount}
              </span>
            </button>
            <FileStack size={16} className="text-slate-400" />
            <span className="text-sm text-slate-400 hidden sm:inline">سجل الشحنات</span>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">سجل الشحنات</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            إضافة شحنة جديدة أو البحث في السجلات الموجودة
          </p>
        </div>

        {/* ── Create form (collapsible) ───────────────────────────────────── */}
        <ConsignmentHeader onCreated={() => runSearch(1, searchType, '')} />

        {/* ── Search panel (two-field system) ─────────────────────────────── */}
        <form
          onSubmit={handleSearchSubmit}
          className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Search size={16} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-700">البحث في السجلات</h2>
            {hasActiveSearch && (
              <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                بحث نشط
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Field 1 – Search Type dropdown */}
            <div className="sm:w-52 flex-shrink-0">
              <label className="block text-xs text-slate-400 mb-1">نوع البحث</label>
              <select
                id="search-type"
                value={searchType}
                onChange={handleTypeChange}
                className={`${inputCls} cursor-pointer`}
              >
                {SEARCH_TYPES.map(({ key, labelAr }) => (
                  <option key={key} value={key}>{labelAr}</option>
                ))}
              </select>
            </div>

            {/* Field 2 – Dynamic Search Value */}
            <div className="flex-1">
              <label className="block text-xs text-slate-400 mb-1">قيمة البحث</label>
              <div className="relative">
                {isCompanyType ? (
                  <select
                    id="search-value-select"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">— اختر الشركة —</option>
                    {COMPANIES.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="search-value-input"
                    type="text"
                    placeholder="أدخل قيمة البحث…"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className={`${inputCls} pe-8`}
                  />
                )}
                {hasActiveSearch && !isCompanyType && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute inset-y-0 left-2 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="submit"
              id="btn-search"
              disabled={isSearching}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold
                         bg-blue-600 hover:bg-blue-700 text-white
                         transition-all disabled:opacity-50 shadow-md shadow-blue-600/20
                         hover:scale-105 active:scale-100"
            >
              {isSearching
                ? <Loader2 size={15} className="animate-spin" />
                : <Search size={15} />
              }
              بحث
            </button>

            {hasActiveSearch && (
              <button
                type="button"
                id="btn-clear-search"
                onClick={handleClear}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                           bg-white border border-slate-300 text-slate-600 hover:text-slate-800
                           hover:bg-slate-50 transition-all"
              >
                <X size={14} />
                مسح البحث
              </button>
            )}

            {hasSearched && (
              <span className="text-xs text-slate-500 me-auto">
                {isSearching ? 'جارٍ البحث…' : `${totalRecords} نتيجة إجمالية`}
              </span>
            )}
          </div>
        </form>

        {/* ── Results ────────────────────────────────────────────────────────── */}

        {/* Loading skeletons */}
        {isSearching && !hasSearched && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-white border border-slate-200 shadow-sm animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {hasSearched && !isSearching && (!Array.isArray(results) || results.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <FileStack size={28} className="text-slate-400" />
            </div>
            <div>
              <p className="text-slate-700 font-semibold">لا توجد نتائج مطابقة للبحث</p>
              <p className="text-slate-500 text-sm mt-1">
                {hasActiveSearch ? 'جرّب تعديل قيمة البحث أو مسحها' : 'لا توجد شحنات مسجّلة بعد'}
              </p>
            </div>
          </div>
        )}

        {/* Result cards – Array.isArray guard prevents crash if state is ever undefined */}
        {hasSearched && Array.isArray(results) && results.length > 0 && (
          <>
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
                  className="group relative bg-white hover:bg-slate-50 border border-slate-200
                             hover:border-blue-300 rounded-2xl p-5 transition-all duration-200
                             shadow-sm hover:shadow-md cursor-pointer"
                >
                  {/* Company badge + timestamp */}
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <span className={`
                      text-xs font-semibold px-2.5 py-1 rounded-full
                      bg-${accentColor}-100 text-${accentColor}-800
                      border border-${accentColor}-200
                    `}>
                      {doc.companyName}
                    </span>
                    <span className="text-xs text-slate-500 flex-shrink-0">{timeLabel}</span>
                  </div>

                  {/* Field grid */}
                  <div className="space-y-2">
                    {[
                      { key: 'acid',                  labelAr: 'ACID',              Icon: FlaskConical, mono: true  },
                      { key: 'invoiceSequenceNumber', labelAr: 'رقم تسلسل الفاتورة', Icon: Receipt,   mono: true  },
                      { key: 'consignmentNumber',     labelAr: 'رقم البوليصة',    Icon: Hash,         mono: true  },
                      { key: 'itemName',              labelAr: 'الصنف',            Icon: Package,      mono: false },
                      { key: 'count',                 labelAr: 'العدد',            Icon: Layers,       mono: true  },
                      { key: 'supplierName',          labelAr: 'المورد',           Icon: Truck,        mono: false },
                      { key: 'certificateNumber',     labelAr: 'رقم الشهاده',      Icon: Hash,         mono: false },
                      { key: 'arrivalPort',           labelAr: 'ميناء الوصول',      Icon: Package,      mono: false },
                      { key: 'fileNumber',            labelAr: 'رقم الملف',          Icon: Layers,       mono: false },
                    ].map(({ key, labelAr, Icon, mono }) =>
                      doc[key] ? (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          <Icon size={13} className="text-slate-400 flex-shrink-0" />
                          <span className="text-slate-500 text-xs w-20 flex-shrink-0">{labelAr}</span>
                          <span className={`text-slate-800 truncate ${mono ? 'font-mono text-blue-700' : ''}`}>
                            {doc[key]}
                          </span>
                        </div>
                      ) : null
                    )}
                  </div>

                  {/* Bottom row: view hint + delete button */}
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="flex items-center gap-1 text-xs text-slate-500 group-hover:text-blue-600 transition-colors">
                      <Eye size={12} />
                      عرض التفاصيل
                    </span>
                    <button
                      type="button"
                      id={`btn-delete-${doc._id}`}
                      onClick={(e) => { e.stopPropagation(); openDeleteModal(doc._id, doc.acid || doc._id); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                 text-red-600 border border-red-200 bg-white
                                 hover:bg-red-50 hover:border-red-300
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

          {/* ── Pagination UI – hidden when 0 results or single page ──────── */}
          {Array.isArray(results) && results.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
              {/* Previous */}
              <button
                id="btn-page-prev"
                type="button"
                onClick={() => runSearch(currentPage - 1)}
                disabled={currentPage <= 1 || isSearching}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                           border border-slate-300 bg-white text-slate-600
                           hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600
                           disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={15} />
                السابق
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 text-sm select-none">…</span>
                  ) : (
                    <button
                      key={item}
                      id={`btn-page-${item}`}
                      type="button"
                      onClick={() => runSearch(item)}
                      disabled={isSearching}
                      className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all
                        ${
                          item === currentPage
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 scale-105'
                            : 'border border-slate-300 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600'
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {item}
                    </button>
                  )
                )
              }

              {/* Next */}
              <button
                id="btn-page-next"
                type="button"
                onClick={() => runSearch(currentPage + 1)}
                disabled={currentPage >= totalPages || isSearching}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                           border border-slate-300 bg-white text-slate-600
                           hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600
                           disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                التالي
                <ChevronLeft size={15} />
              </button>

              <span className="w-full text-center text-xs text-slate-400 mt-1">
                صفحة {currentPage} من {totalPages}
              </span>
            </div>
          )}
          </>
        )}
      </main>

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {detailDoc && (
        <ConsignmentDetailModal
          detailDoc={detailDoc}
          closeDetail={closeDetail}
          openDeleteModal={openDeleteModal}
          onUpdate={() => runSearch(currentPage)}
        />
      )}

      {/* ── Delete Password Modal ─────────────────────────────────────────────── */}
      {deleteModal.show && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeDeleteModal(); }}
        >
          <div
            dir="rtl"
            className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-5"
          >
            {/* Modal header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                <KeyRound size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">تأكيد الحذف</h3>
                <p className="text-xs text-slate-500 leading-snug">
                  حذف الشحنة:{' '}
                  <span className="font-mono text-red-600 font-semibold">{deleteModal.label}</span>
                </p>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs text-red-800 leading-relaxed">
                ⚠️ سيتم <strong>حذف هذا السجل نهائياً</strong> من قاعدة البيانات.
                لا يمكن التراجع عن هذا الإجراء.
              </p>
            </div>

            {/* Password input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
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
                className="w-full bg-white border border-slate-300 focus:border-red-500
                           focus:ring-2 focus:ring-red-500/20 rounded-xl px-4 py-3
                           text-sm text-slate-800 placeholder-slate-400 outline-none
                           transition-all text-right"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700
                           text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                id="btn-confirm-delete"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-red-600 hover:bg-red-700 disabled:opacity-60
                           text-white text-sm font-bold transition-colors
                           shadow-md shadow-red-600/20"
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
      <footer className="border-t border-slate-200 mt-16 py-6 text-center text-xs text-slate-500">
        SAS — نظام التخليص الجمركي © {new Date().getFullYear()}
      </footer>
    </div>

    {/* ── Refunds Dashboard overlay ────────────────────────────────────────── */}
    {showRefundsDashboard && (
      <RefundsDashboard
        onClose={() => {
          setShowRefundsDashboard(false);
          fetchRefundCount(); // refresh badge count after dashboard closes
        }}
      />
    )}
    </>
  );
}
