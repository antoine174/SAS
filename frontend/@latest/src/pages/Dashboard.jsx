// src/pages/Dashboard.jsx
/**
 * Dashboard — Paginated, searchable list of all Consignments.
 *
 * API response shape from GET /api/consignments:
 *   { data: Consignment[], totalPages: number, currentPage: number, totalRecords: number }
 *
 * Search modes
 * ───────────
 *   الكل           → ?search=<value>          (OR across acid, companyName, fileNumber, itemName)
 *   اسم الشركة     → ?companyName=<value>
 *   ACID            → ?acid=<value>
 *   رقم البوليصة   → ?consignmentNumber=<value>
 *   رقم الملف      → ?fileNumber=<value>
 *   رقم الشهادة    → ?certificateNumber=<value>
 *   الصنف           → ?itemName=<value>
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Search, Loader2, Trash2, ChevronRight, ChevronLeft,
  AlertCircle, Package, X,
} from 'lucide-react';
import { fetchApi } from '../lib/api';
import { COMPANY_COLOR } from '../lib/constants';
import ConsignmentHeader from '../components/ConsignmentHeader';
import FileUploadsSummary from '../components/FileUploadsSummary';

const PAGE_SIZE = 10;

// ─── Search field definitions ─────────────────────────────────────────────────
// Each entry maps a human-readable Arabic label to the exact query-param name
// accepted by GET /api/consignments.
const SEARCH_FIELDS = [
  { label: 'الكل',          param: 'search' },
  { label: 'اسم الشركة',   param: 'companyName' },
  { label: 'ACID',          param: 'acid' },
  { label: 'رقم البوليصة', param: 'consignmentNumber' },
  { label: 'رقم الملف',    param: 'fileNumber' },
  { label: 'رقم الشهادة',  param: 'certificateNumber' },
  { label: 'الصنف',         param: 'itemName' },
];

// ─── Password Delete Modal ────────────────────────────────────────────────────
function DeleteModal({ acid, onConfirm, onCancel, loading }) {
  const [pwd, setPwd] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3 text-red-600">
          <AlertCircle size={22} />
          <h2 className="font-bold text-lg">تأكيد الحذف النهائي</h2>
        </div>
        <p className="text-sm text-slate-600">
          سيتم حذف الشحنة{' '}
          <span className="font-mono font-bold text-slate-800">{acid}</span>{' '}
          وجميع ملفاتها من Cloudinary/Supabase بشكل نهائي لا يمكن التراجع عنه.
        </p>
        <input
          type="password"
          placeholder="كلمة مرور الحذف"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(pwd); }}
        />
        <div className="flex gap-3">
          <button
            onClick={() => onConfirm(pwd)}
            disabled={loading || !pwd}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            حذف نهائي
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Consignment Card ─────────────────────────────────────────────────────────
function ConsignmentCard({ doc, onDeleteClick }) {
  const navigate = useNavigate();
  const accent = COMPANY_COLOR[doc.companyName] || 'slate';

  return (
    <div
      dir="rtl"
      className={`bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-${accent}-300 transition-all duration-200 overflow-hidden group cursor-pointer`}
      onClick={() => navigate(`/consignment/${doc._id}`)}
    >
      {/* Top colour accent strip */}
      <div className={`h-1 bg-${accent}-400`} />

      <div className="p-4 space-y-3">
        {/* Company + ACID */}
        <div className="flex items-start justify-between gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-${accent}-100 text-${accent}-800 border border-${accent}-200`}>
            {doc.companyName}
          </span>
          <span className="font-mono text-xs text-slate-500 mt-0.5">{doc.acid}</span>
        </div>

        {/* Item + details */}
        <div className="space-y-1">
          {doc.itemName && (
            <p className="text-sm font-semibold text-slate-800 truncate">{doc.itemName}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
            {doc.fileNumber    && <span>ملف: {doc.fileNumber}</span>}
            {doc.supplierName  && <span>{doc.supplierName}</span>}
            {doc.arrivalPort   && <span>{doc.arrivalPort}</span>}
          </div>
        </div>

        {/* File summary */}
        <FileUploadsSummary doc={doc} compact />

        {/* Actions row */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            {new Date(doc.createdAt).toLocaleDateString('ar-EG')}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteClick(doc._id, doc.acid); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="حذف"
            >
              <Trash2 size={14} />
            </button>
            <div className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 group-hover:text-blue-600 transition-colors">
              <ChevronLeft size={16} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();

  // Safeguard: redirect if ?quickUpload=1 or ?shared=1 is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('quickUpload') === '1' || params.get('shared') === '1') {
      navigate('/quick-upload?shared=1', { replace: true });
    }
  }, [navigate]);

  // docs is always kept as an array; never set to a raw API response object
  const [docs, setDocs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Multi-field search state
  const [searchField, setSearchField] = useState(SEARCH_FIELDS[0].param); // 'search'
  const [searchValue, setSearchValue] = useState('');

  const [deleteTarget, setDeleteTarget]   = useState(null); // { id, acid }
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      if (searchValue.trim()) {
        params.set(searchField, searchValue.trim());
      }

      const res = await fetchApi(`/api/consignments?${params}`);

      // Defensive extraction — backend returns { data: [], totalPages, currentPage, totalRecords }
      // but we guard all other possible shapes too.
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.docs)
            ? res.docs
            : Array.isArray(res?.consignments)
              ? res.consignments
              : [];

      setDocs(list);

      const totalCount =
        typeof res?.totalRecords === 'number' ? res.totalRecords :
        typeof res?.total        === 'number' ? res.total        :
        typeof res?.count        === 'number' ? res.count        :
        list.length;

      setTotal(totalCount);

      const pages =
        typeof res?.totalPages === 'number'
          ? res.totalPages
          : Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
      setTotalPages(pages);

    } catch {
      toast.error('تعذّر تحميل البيانات');
      setDocs([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, searchField, searchValue]);

  // Reset to page 1 whenever the search changes
  useEffect(() => { setPage(1); }, [searchField, searchValue]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Clear search ───────────────────────────────────────────────────────────
  const clearSearch = () => {
    setSearchField(SEARCH_FIELDS[0].param);
    setSearchValue('');
    setPage(1);
  };

  const isSearchActive = searchValue.trim().length > 0;

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (password) => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await fetchApi(`/api/consignments/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      });
      toast.success('تم الحذف بنجاح');
      setDeleteTarget(null);
      fetchDocs();
    } catch (err) {
      toast.error(err.data?.message || 'كلمة المرور غير صحيحة أو حدث خطأ');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Create form */}
      <ConsignmentHeader onCreated={fetchDocs} />

      {/* ── Multi-field search bar ───────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
        {/* Field selector pills */}
        <div className="flex flex-wrap gap-2">
          {SEARCH_FIELDS.map((f) => (
            <button
              key={f.param}
              type="button"
              onClick={() => { setSearchField(f.param); setSearchValue(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                searchField === f.param
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Input + clear */}
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              dir="rtl"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={`ابحث بـ ${SEARCH_FIELDS.find((f) => f.param === searchField)?.label ?? ''}…`}
              className="w-full pr-9 pl-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
          {isSearchActive && (
            <button
              type="button"
              onClick={clearSearch}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold border border-slate-200 transition-all whitespace-nowrap"
            >
              <X size={14} />
              مسح البحث
            </button>
          )}
        </div>
      </div>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-blue-600" />
        </div>

      ) : (!Array.isArray(docs) || docs.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Package size={48} strokeWidth={1} />
          <p className="text-sm">
            {isSearchActive ? 'لا توجد نتائج للبحث' : 'لا توجد شحنات بعد'}
          </p>
          {isSearchActive && (
            <button
              type="button"
              onClick={clearSearch}
              className="text-xs text-blue-500 hover:underline"
            >
              مسح البحث والعودة
            </button>
          )}
        </div>

      ) : (
        <>
          <p className="text-xs text-slate-500">
            عرض {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} من أصل {total} شحنة
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Array.isArray(docs) ? docs : []).map((doc) => (
              <ConsignmentCard
                key={doc._id}
                doc={doc}
                onDeleteClick={(id, acid) => setDeleteTarget({ id, acid })}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-300 hover:bg-slate-100 disabled:opacity-40 transition-all"
              >
                <ChevronRight size={18} />
              </button>
              <span className="text-sm text-slate-600 font-medium">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-300 hover:bg-slate-100 disabled:opacity-40 transition-all"
              >
                <ChevronLeft size={18} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteModal
          acid={deleteTarget.acid}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
