// src/App.jsx
/**
 * SAS – Consignment PDF Merging Page
 *
 * Full Arabic RTL interface for uploading and merging clearance documents.
 * Architecture:
 *   - ConsignmentHeader  → create/search/lock the shipment record
 *   - Tabbed grid        → UploadCard instances for receipts & documents
 *   - Two merge buttons  → "Download only" and "Download + Delete files"
 */

import { useState, useCallback, useEffect } from 'react';
import { toast, ToastContainer }  from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  FileStack,
  Receipt,
  FolderOpen,
  Download,
  Trash2,
  Loader2,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';

import ConsignmentHeader from './components/ConsignmentHeader';
import UploadCard        from './components/UploadCard';
import ProgressBar       from './components/ProgressBar';
import { RECEIPTS, DOCUMENTS } from './lib/fileDefinitions';
import { supabase, BUCKET }    from './lib/supabase';
import { mergeAndDownload }    from './lib/mergeEngine';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'receipts',  label: 'ايصالات', icon: Receipt   },
  { id: 'documents', label: 'مستندات', icon: FolderOpen },
];

export default function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [consignment,        setConsignment]        = useState(null);
  const [locked,              setLocked]              = useState(false);
  const [activeTab,           setActiveTab]           = useState('receipts');
  const [uploadingKeys,       setUploadingKeys]       = useState(new Set());
  const [merging,             setMerging]             = useState(false);   // false | 'keep' | 'delete'
  const [mergeMessage,        setMergeMessage]        = useState('');
  const [recentConsignments,  setRecentConsignments]  = useState([]);
  const [isLoadingRecents,    setIsLoadingRecents]    = useState(true);
  const [loadingCardId,       setLoadingCardId]       = useState(null); // _id of card being fetched
  const [showPasswordModal,   setShowPasswordModal]   = useState(false);
  const [pendingDeletePassword, setPendingDeletePassword] = useState('');
  const [clearStatus,         setClearStatus]         = useState(false); // shows success badge

  // ── Refresh recent consignments list ───────────────────────────────────────────
  const refreshRecentConsignments = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/api/consignments`);
      const data = await res.json();
      if (res.ok) setRecentConsignments(data);
    } catch {
      // Network error – silently ignore
    }
  }, []);

  // ── Fetch recent consignments once on mount ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshRecentConsignments();
      if (!cancelled) setIsLoadingRecents(false);
    })();
    return () => { cancelled = true; };
  }, [refreshRecentConsignments]);

  // ── Consignment lock/unlock ────────────────────────────────────────────────
  const handleLock   = useCallback((doc) => { setConsignment(doc); setLocked(true); setClearStatus(false); }, []);
  const handleUnlock = useCallback(()    => { setLocked(false); setConsignment(null); setClearStatus(false); }, []);

  // ── File upload ────────────────────────────────────────────────────────────
  /**
   * Upload a PDF to Supabase, then PATCH the backend URL field.
   * @param {string} tab  – 'receipts' | 'documents'
   * @param {string} key  – Mongoose camelCase field key
   * @param {File}   file – File object from the input
   */
  const handleUpload = useCallback(async (tab, key, file) => {
    if (!consignment) return;

    if (file.type !== 'application/pdf') {
      toast.error('يُقبل فقط ملفات PDF');
      return;
    }

    const uploadKey = `${tab}.${key}`;
    setUploadingKeys((prev) => new Set(prev).add(uploadKey));

    try {
      const { billId, _id: id } = consignment;
      const storagePath         = `${billId}/${key}.pdf`;

      // 1. Upload to Supabase (upsert = overwrite on re-upload)
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: true });

      if (uploadError) throw uploadError;

      // 2. Build public URL
      const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

      // 3. Persist in MongoDB
      const res  = await fetch(`${API_URL}/api/consignments/${id}/file`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tab, key, url: publicUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // 4. Update local React state
      setConsignment(data);
      toast.success(`تم رفع "${file.name}" بنجاح ✅`);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(`فشل رفع الملف: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setUploadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(uploadKey);
        return next;
      });
    }
  }, [consignment]);

  // ── Merge handler ──────────────────────────────────────────────────────────
  /**
   * @param {boolean} withCleanup
   *   false → download only, leave Supabase & MongoDB untouched
   *   true  → download then delete this tab's files from storage & DB
   * @param {string} [password] – required when withCleanup is true
   */
  const handleMerge = useCallback(async (withCleanup, password) => {
    if (!consignment) return;

    setMerging(withCleanup ? 'delete' : 'keep');
    setMergeMessage('جارٍ التحقق من الملفات…');

    try {
      const result = await mergeAndDownload(
        consignment,
        activeTab,
        withCleanup,
        (msg) => setMergeMessage(msg),
        (msg) => toast.error(msg, { autoClose: 8000 }),
        password,
      );

      if (result !== false) {
        if (withCleanup && result?.clearedTab) {
          if (result.fullyDeleted) {
            // ── Hard delete: both tabs were empty → record removed from MongoDB ────
            handleUnlock();                         // reset to search / recents screen
            await refreshRecentConsignments();      // remove this card from the list
            toast.success('تم مسح الشحنة نهائياً 🗑️', { autoClose: 6000 });
          } else {
            // ── Partial clear: other tab still has files → stay on locked view ───
            setConsignment((prev) => ({
              ...prev,
              [result.clearedTab]: result.clearedState,
            }));
            setClearStatus(true);
            await refreshRecentConsignments();      // keep list fresh
            toast.success('تم دمج الملف وحذف ملفات التبويب بنجاح! 🗑️', { autoClose: 6000 });
          }
        } else {
          toast.success('تم دمج وتحميل الملف بنجاح (الملفات محفوظة) ✅', { autoClose: 5000 });
        }
      }
    } catch (err) {
      if (err.isUnauthorized) {
        toast.error('رمز التأكيد غير صحيح ❌', { autoClose: 5000 });
      } else {
        toast.error(`حدث خطأ: ${err.message || 'خطأ غير معروف'}`, { autoClose: 6000 });
      }
    } finally {
      setMerging(false);
      setMergeMessage('');
    }
  }, [consignment, activeTab, handleUnlock, refreshRecentConsignments]);

  // ── Derived: counts scoped to the active tab only ─────────────────────────
  const currentDefs = activeTab === 'receipts' ? RECEIPTS : DOCUMENTS;
  const currentUrls = consignment?.[activeTab] ?? {};

  // Missing counts per tab (for badge in tab headers)
  const missingReceiptsCount  = locked
    ? RECEIPTS.filter((d)  => d.mandatory && !consignment?.receipts?.[d.key]).length  : 0;
  const missingDocumentsCount = locked
    ? DOCUMENTS.filter((d) => d.mandatory && !consignment?.documents?.[d.key]).length : 0;

  // Missing count for the CURRENTLY active tab → controls button disabled state
  const missingCurrentTab = activeTab === 'receipts' ? missingReceiptsCount : missingDocumentsCount;

  // Uploaded count for stats cards
  const uploadedReceiptsCount  = locked
    ? RECEIPTS.filter((d)  => consignment?.receipts?.[d.key]).length  : 0;
  const uploadedDocumentsCount = locked
    ? DOCUMENTS.filter((d) => consignment?.documents?.[d.key]).length : 0;

  const isMerging = merging !== false;

  // ── Password modal confirm ─────────────────────────────────────────────────
  const handlePasswordConfirm = useCallback(() => {
    const pw = pendingDeletePassword.trim();
    if (!pw) { toast.error('يرجى إدخال رمز التأكيد'); return; }
    setShowPasswordModal(false);
    setPendingDeletePassword('');
    handleMerge(true, pw);
  }, [pendingDeletePassword, handleMerge]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 font-[Tajawal,sans-serif]">

      {/* Toast container – RTL */}
      <ToastContainer position="bottom-left" rtl theme="dark" pauseOnHover closeOnClick newestOnTop />

      {/* Progress bar (during merge) */}
      <ProgressBar visible={isMerging} message={mergeMessage} />

      {/* ── Top Navigation Bar ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
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
            <span className="text-sm text-slate-400 hidden sm:inline">دمج مستندات الشحنة</span>
          </div>
        </div>
      </header>

      {/* ── Page Content ────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Page Title */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">دمج مستندات الشحنة</h1>
          <p className="text-sm text-slate-400">
            قم برفع مستندات التخليص الجمركي ثم اضغط أحد أزرار الدمج لإنشاء ملف PDF موحد
          </p>
        </div>

        {/* ── Consignment Header Form ──────────────────────────────────────── */}
        <ConsignmentHeader
          consignment={consignment}
          locked={locked}
          onLock={handleLock}
          onUnlock={handleUnlock}
        />

        {/* ── Upload Section (only when a consignment is locked) ───────────── */}
        {locked && consignment && (
          <>
            {/* Stats bar – 4 cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'ايصالات مرفوعة',
                  value: uploadedReceiptsCount,
                  total: RECEIPTS.length,
                  color: 'emerald',
                },
                {
                  label: 'مستندات مرفوعة',
                  value: uploadedDocumentsCount,
                  total: DOCUMENTS.length,
                  color: 'sky',
                },
                {
                  // Third card: missing mandatory for the ACTIVE tab
                  label: `إلزامية مفقودة (${activeTab === 'receipts' ? 'ايصالات' : 'مستندات'})`,
                  value: missingCurrentTab,
                  total: null,
                  color: missingCurrentTab > 0 ? 'rose' : 'emerald',
                },
                {
                  label: 'الكونتينر',
                  value: consignment.containerName,
                  total: null,
                  color: 'amber',
                },
              ].map((stat) => (
                <div key={stat.label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1">{stat.label}</p>
                  <p className={`text-xl font-bold text-${stat.color}-400 truncate`}>
                    {stat.total !== null ? `${stat.value}/${stat.total}` : stat.value}
                  </p>
                </div>
              ))}
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            <div className="bg-slate-800/30 border border-slate-700 rounded-2xl overflow-hidden">

              {/* Tab headers */}
              <div className="flex border-b border-slate-700">
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const Icon     = tab.icon;
                  const missing  = tab.id === 'receipts' ? missingReceiptsCount : missingDocumentsCount;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        flex-1 flex items-center justify-center gap-2 py-4 px-6
                        text-sm font-semibold transition-all duration-200 relative
                        ${isActive
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                        }
                      `}
                    >
                      <Icon size={16} />
                      {tab.label}
                      {missing > 0 && (
                        <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold leading-none">
                          {missing}
                        </span>
                      )}
                      {isActive && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-500 rounded-t-full" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Upload grid */}
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {currentDefs.map((def) => {
                    const uploadKey = `${activeTab}.${def.key}`;
                    return (
                      <UploadCard
                        key={def.key}
                        label={def.label}
                        mandatory={def.mandatory}
                        url={currentUrls[def.key] ?? null}
                        isUploading={uploadingKeys.has(uploadKey)}
                        onUpload={(file) => handleUpload(activeTab, def.key, file)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Action Buttons Bar ─────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">

              {/* Warning message when mandatory files are missing */}
              {missingCurrentTab > 0 ? (
                <p className="text-sm text-rose-400 flex items-center gap-2 me-auto">
                  <span className="w-2 h-2 rounded-full bg-rose-400 inline-block flex-shrink-0" />
                  يوجد {missingCurrentTab} مستند إلزامي مفقود في هذا التبويب – لا يمكن الدمج
                </p>
              ) : (
                <p className="text-sm text-emerald-400 flex items-center gap-2 me-auto">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block flex-shrink-0" />
                  جميع الملفات الإلزامية جاهزة ✓
                </p>
              )}

              {/* Button group */}
              <div className="flex items-center gap-3 flex-shrink-0">

                {/* Button 1: Download only (no deletion) */}
                <button
                  type="button"
                  id="btn-merge-keep"
                  onClick={() => handleMerge(false)}
                  disabled={isMerging || missingCurrentTab > 0}
                  className={`
                    flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold
                    border transition-all duration-200 shadow-lg
                    ${isMerging || missingCurrentTab > 0
                      ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-slate-500 hover:scale-105 active:scale-100'
                    }
                  `}
                >
                  {merging === 'keep' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  تحميل PDF (بدون مسح)
                </button>

                {/* Button 2: Download + delete files → opens password modal */}
                <button
                  type="button"
                  id="btn-merge-delete"
                  onClick={() => {
                    setClearStatus(false);
                    setShowPasswordModal(true);
                  }}
                  disabled={isMerging || missingCurrentTab > 0}
                  className={`
                    flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold
                    transition-all duration-200 shadow-xl
                    ${isMerging || missingCurrentTab > 0
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-l from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-500/30 hover:scale-105 active:scale-100'
                    }
                  `}
                >
                  {merging === 'delete' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  تحميل PDF + مسح الملفات
                </button>
              </div>

              {/* Clear-status success badge */}
              {clearStatus && (
                <div className="w-full flex justify-center mt-3">
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-semibold animate-pulse">
                    <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                    تم التحميل ومسح الملفات بنجاح ✓
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Empty state / Recent Consignments panel ──────────────────────── */}
        {!locked && (
          <div className="space-y-6">

            {/* Hint text */}
            <p className="text-center text-slate-500 text-sm pt-4">
              ابحث عن شحنة موجودة أو أنشئ شحنة جديدة لبدء رفع المستندات
            </p>

            {/* Recent consignments section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-300 flex items-center gap-2">
                  <FileStack size={16} className="text-emerald-400" />
                  الشحنات الأخيرة
                </h2>
                {!isLoadingRecents && recentConsignments.length > 0 && (
                  <span className="text-xs text-slate-500">
                    آخر {recentConsignments.length} شحنات
                  </span>
                )}
              </div>

              {/* Loading skeleton */}
              {isLoadingRecents && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="h-24 rounded-xl bg-slate-800/60 border border-slate-700 animate-pulse"
                    />
                  ))}
                </div>
              )}

              {/* Empty list */}
              {!isLoadingRecents && recentConsignments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <FileStack size={24} className="text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-sm">لا توجد شحنات مسجّلة بعد</p>
                </div>
              )}

              {/* Consignment cards */}
              {!isLoadingRecents && recentConsignments.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recentConsignments.map((c) => {
                    // Format updatedAt as a relative Arabic label
                    const diffMs   = Date.now() - new Date(c.updatedAt).getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHrs  = Math.floor(diffMins / 60);
                    const diffDays = Math.floor(diffHrs / 24);
                    const timeLabel =
                      diffMins  < 1  ? 'الآن' :
                      diffMins  < 60 ? `منذ ${diffMins} دقيقة` :
                      diffHrs   < 24 ? `منذ ${diffHrs} ساعة` :
                      diffDays  < 7  ? `منذ ${diffDays} يوم` :
                      new Date(c.updatedAt).toLocaleDateString('ar-EG', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      });

                    return (
                      <button
                        key={c._id}
                        type="button"
                        disabled={loadingCardId === c._id}
                        onClick={async () => {
                          setLoadingCardId(c._id);
                          try {
                            const res  = await fetch(`${API_URL}/api/consignments/${c._id}`);
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.message);
                            handleLock(data);
                          } catch (err) {
                            console.error('Failed to load full consignment:', err);
                            toast.error('تعذّر تحميل بيانات الشحنة');
                          } finally {
                            setLoadingCardId(null);
                          }
                        }}
                        className={`
                          group w-full text-right
                          border rounded-xl p-4 transition-all duration-200
                          ${loadingCardId === c._id
                            ? 'bg-slate-800 border-emerald-600/40 cursor-wait'
                            : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700 hover:border-emerald-600/60 hover:shadow-lg hover:shadow-emerald-900/20 hover:scale-[1.01] active:scale-100'
                          }
                        `}
                      >
                        {/* Top row: container name + timestamp / spinner */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="font-bold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors leading-tight">
                            {c.containerName}
                          </span>
                          {loadingCardId === c._id ? (
                            <Loader2 size={14} className="text-emerald-400 animate-spin flex-shrink-0 mt-0.5" />
                          ) : (
                            <span className="text-xs text-slate-500 flex-shrink-0 mt-0.5">
                              {timeLabel}
                            </span>
                          )}
                        </div>

                        {/* Bill ID */}
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs text-slate-500">بوليصة:</span>
                          <span className="text-xs font-semibold text-emerald-400 font-mono">
                            {c.billId}
                          </span>
                        </div>

                        {/* Company name */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">الشركة:</span>
                          <span className="text-xs text-slate-300 truncate">{c.companyName}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Password Modal ───────────────────────────────────────────────────── */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowPasswordModal(false); setPendingDeletePassword(''); } }}
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
                <h3 className="text-base font-bold text-slate-100">تأكيد المسح</h3>
                <p className="text-xs text-slate-400 leading-snug">أدخل رمز التأكيد لحذف ملفات هذا التبويب</p>
              </div>
            </div>

            {/* Warning banner */}
            <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3">
              <p className="text-xs text-rose-300 leading-relaxed">
                ⚠️ سيتم تحميل ملف PDF ثم <strong>حذف جميع ملفات</strong> التبويب الحالي من التخزين. لا يمكن التراجع عن هذا الإجراء.
              </p>
            </div>

            {/* Password input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                رمز تأكيد المسح
              </label>
              <input
                id="delete-password-input"
                type="password"
                autoFocus
                placeholder="أدخل الرمز…"
                value={pendingDeletePassword}
                onChange={(e) => setPendingDeletePassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordConfirm()}
                className="w-full bg-slate-800 border border-slate-600 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all text-right"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowPasswordModal(false); setPendingDeletePassword(''); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                id="btn-confirm-delete"
                onClick={handlePasswordConfirm}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-colors shadow-lg shadow-rose-900/30"
              >
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
