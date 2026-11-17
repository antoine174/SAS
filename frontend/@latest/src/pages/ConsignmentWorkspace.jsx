// src/pages/ConsignmentWorkspace.jsx
/**
 * ConsignmentWorkspace — Full-page details for a single consignment.
 *
 * Replaces ConsignmentDetailModal with a proper page component.
 * Uses useParams() to get :id, fetches from API, renders the same
 * 3-tab structure (documents | receipts | refunds) the modal had.
 *
 * Key differences from modal:
 *  - Uses react-router useNavigate(-1) for back navigation
 *  - Delete navigates to / on success
 *  - PDF compression wired into handleUpload via compressPdfIfNeeded
 *  - Renders its own chrome (header / breadcrumb) — no Layout wrapper
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ArrowRight, Loader2, Save, Trash2, Download, PlusCircle,
  FolderOpen, Receipt, Calculator, Hash, ListChecks,
  SlidersHorizontal, XCircle, CheckCircle2, AlertCircle,
} from 'lucide-react';

import { fetchApi } from '../lib/api';
import { useUploadContext } from '../lib/UploadContext';
import { compressPdfIfNeeded } from '../lib/pdfCompressor';
import { mergeAndDownload, customMergeAndDownload } from '../lib/mergeEngine';
import { getSlotMeta, getSlotUrl } from '../lib/fileSlot';
import { RECEIPTS, DOCUMENTS } from '../lib/fileDefinitions';
import { COMPANIES, COMPANY_COLOR } from '../lib/constants';

import UploadCard from '../components/UploadCard';
import ProgressBar from '../components/ProgressBar';
import RefundTab from '../components/RefundTab';

// ─── Tab config (mirrors ConsignmentDetailModal) ──────────────────────────────
const TAB_CONFIG = {
  documents: { defs: DOCUMENTS, label: 'المستندات', icon: FolderOpen },
  receipts:  { defs: RECEIPTS,  label: 'الايصالات', icon: Receipt },
};

const TABS = [
  { id: 'documents', ...TAB_CONFIG.documents },
  { id: 'receipts',  ...TAB_CONFIG.receipts },
  { id: 'refunds',   label: 'حاسبات', icon: Calculator },
];

const BASE_KEY_LABEL = {};
[...DOCUMENTS, ...RECEIPTS].forEach(({ key, label }) => { BASE_KEY_LABEL[key] = label; });

// ─── Helpers (identical to modal) ────────────────────────────────────────────
function extractDbDynamicFields(tab, tabData) {
  if (!TAB_CONFIG[tab] || !tabData || typeof tabData !== 'object') return [];
  const baseDefs = Array.isArray(TAB_CONFIG[tab]?.defs) ? TAB_CONFIG[tab].defs : [];
  const baseKeys = new Set(baseDefs.map((d) => d.key));
  const dynamic = [];
  for (const storedKey of Object.keys(tabData)) {
    const match = storedKey.match(/^(.+)_(\d+)$/);
    if (!match) continue;
    const baseKey = match[1];
    const index = parseInt(match[2], 10);
    if (!baseKeys.has(baseKey)) continue;
    dynamic.push({ key: storedKey, baseKey, label: `${BASE_KEY_LABEL[baseKey] || baseKey} ${index}` });
  }
  const baseOrder = baseDefs.map((d) => d.key);
  dynamic.sort((a, b) => {
    const orderDiff = baseOrder.indexOf(a.baseKey) - baseOrder.indexOf(b.baseKey);
    if (orderDiff !== 0) return orderDiff;
    return (parseInt(a.key.split('_').pop(), 10) || 0) - (parseInt(b.key.split('_').pop(), 10) || 0);
  });
  return dynamic;
}

function mergeDynamicFields(existing, fromDb) {
  const existingList = Array.isArray(existing) ? existing : [];
  const dbList = Array.isArray(fromDb) ? fromDb : [];
  const existingKeys = new Set(existingList.map((f) => f.key));
  return [...existingList, ...dbList.filter((f) => !existingKeys.has(f.key))];
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
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
          سيتم حذف الشحنة <span className="font-mono font-bold text-slate-800">{acid}</span> وجميع ملفاتها نهائياً.
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
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            حذف نهائي
          </button>
          <button onClick={onCancel} disabled={loading} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ConsignmentWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [localDoc, setLocalDoc]   = useState(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError]     = useState(null);

  const [activeTab, setActiveTab] = useState('documents');
  const [form, setForm]           = useState({});
  const [isSaving, setIsSaving]   = useState(false);

  const [dynamicFields, setDynamicFields] = useState({ documents: [], receipts: [] });
  const [addDropdown, setAddDropdown]     = useState({ documents: '', receipts: '' });
  const [addQty, setAddQty]               = useState({ documents: 1, receipts: 1 });

  const [merging, setMerging]             = useState(false);
  const [mergeMessage, setMergeMessage]   = useState('');

  const [isCustomMergeMode, setIsCustomMergeMode]       = useState(false);
  const [selectedFilesForMerge, setSelectedFilesForMerge] = useState([]);
  const [customMerging, setCustomMerging]               = useState(false);
  const [customMergeMessage, setCustomMergeMessage]     = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading]     = useState(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const { globalUploadingKeys, handleGlobalUpload, handleGlobalDelete } = useUploadContext();

  // ── Fetch consignment ─────────────────────────────────────────────────────
  useEffect(() => {
    setFetchLoading(true);
    setFetchError(null);
    fetchApi(`/api/consignments/${id}`)
      .then((doc) => {
        if (!isMountedRef.current) return;
        setLocalDoc(doc);
        setForm({
          companyName:           doc.companyName || COMPANIES[0],
          acid:                  doc.acid || '',
          invoiceSequenceNumber: doc.invoiceSequenceNumber || '',
          consignmentNumber:     doc.consignmentNumber || '',
          itemName:              doc.itemName || '',
          count:                 doc.count || '',
          supplierName:          doc.supplierName || '',
          certificateNumber:     doc.certificateNumber || '',
          arrivalPort:           doc.arrivalPort || '',
          fileNumber:            doc.fileNumber || '',
        });
        setDynamicFields({
          documents: extractDbDynamicFields('documents', doc.documents),
          receipts:  extractDbDynamicFields('receipts',  doc.receipts),
        });
      })
      .catch(() => { if (isMountedRef.current) setFetchError('تعذّر تحميل الشحنة'); })
      .finally(() => { if (isMountedRef.current) setFetchLoading(false); });
  }, [id]);

  // ── Additive sync of dynamic fields from localDoc ─────────────────────────
  useEffect(() => {
    if (!localDoc) return;
    setDynamicFields((prev) => ({
      documents: mergeDynamicFields(prev.documents, extractDbDynamicFields('documents', localDoc.documents)),
      receipts:  mergeDynamicFields(prev.receipts,  extractDbDynamicFields('receipts',  localDoc.receipts)),
    }));
  }, [localDoc]);

  // ── Save metadata ─────────────────────────────────────────────────────────
  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const res = await fetchApi(`/api/consignments/${localDoc._id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setLocalDoc(res);
      toast.success('تم الحفظ بنجاح');
    } catch {
      toast.error('خطأ في الحفظ');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Upload with compression ───────────────────────────────────────────────
  const handleUpload = useCallback(async (tab, key, file, label) => {
    if (!localDoc) return;
    const compressedFile = await compressPdfIfNeeded(file);
    const metadata = {
      acid:              localDoc.acid,
      label,
      companyName:       localDoc.companyName,
      supplierName:      localDoc.supplierName,
      certificateNumber: localDoc.certificateNumber,
      arrivalPort:       localDoc.arrivalPort,
    };
    return handleGlobalUpload(localDoc._id, tab, key, compressedFile, metadata, (updatedDoc) => {
      if (isMountedRef.current) setLocalDoc(updatedDoc);
    });
  }, [localDoc, handleGlobalUpload]);

  // ── Delete file ───────────────────────────────────────────────────────────
  const handleDeleteFile = useCallback((tab, key) => {
    if (!localDoc) return;
    return handleGlobalDelete(localDoc._id, tab, key, (updatedDoc) => {
      if (isMountedRef.current) setLocalDoc(updatedDoc);
    });
  }, [localDoc, handleGlobalDelete]);

  // ── Add dynamic field ─────────────────────────────────────────────────────
  const handleAddField = (tab) => {
    if (!TAB_CONFIG[tab]) return;
    const baseKey  = addDropdown[tab];
    const quantity = Math.max(1, Math.min(20, parseInt(addQty[tab], 10) || 1));
    if (!baseKey) { toast.warning('الرجاء اختيار نوع المستند أولاً'); return; }

    setDynamicFields((prev) => {
      const existing     = prev[tab];
      const takenIndexes = new Set();
      existing.filter((f) => f.baseKey === baseKey)
        .forEach((f) => { const idx = parseInt(f.key.split('_').pop(), 10); if (!isNaN(idx)) takenIndexes.add(idx); });
      const dbTabData = localDoc?.[tab] || {};
      Object.keys(dbTabData).filter((k) => k.startsWith(`${baseKey}_`))
        .forEach((k) => { const idx = parseInt(k.split('_').pop(), 10); if (!isNaN(idx)) takenIndexes.add(idx); });

      const newEntries = [];
      let cursor = 1;
      while (newEntries.length < quantity) {
        if (!takenIndexes.has(cursor)) {
          takenIndexes.add(cursor);
          newEntries.push({ key: `${baseKey}_${cursor}`, baseKey, label: `${BASE_KEY_LABEL[baseKey] || baseKey} ${cursor}` });
        }
        cursor++;
        if (cursor > 1000) break;
      }
      return { ...prev, [tab]: [...existing, ...newEntries] };
    });
  };

  // ── Remove dynamic card ───────────────────────────────────────────────────
  const handleRemoveDynamicField = useCallback(async (tab, dynField) => {
    const tabData = localDoc?.[tab] || {};
    if (getSlotUrl(tabData[dynField.key])) await handleDeleteFile(tab, dynField.key);
    setDynamicFields((prev) => ({ ...prev, [tab]: prev[tab].filter((f) => f.key !== dynField.key) }));
  }, [localDoc, handleDeleteFile]);

  // ── Standard merge ────────────────────────────────────────────────────────
  const handleMerge = async (deleteAfter) => {
    setMerging(deleteAfter ? 'delete' : 'keep');
    setMergeMessage('جاري سحب الملفات ودمجها...');
    try {
      const success = await mergeAndDownload(
        localDoc, activeTab, false,
        (msg) => setMergeMessage(msg),
        (errMsg) => toast.error(errMsg),
        undefined,
        dynamicFields[activeTab],
      );
      if (success) {
        toast.success(<div className="flex items-center gap-2"><CheckCircle2 size={18} />تم التحميل بنجاح</div>);
        if (deleteAfter) navigate('/');
      }
    } catch (err) {
      toast.error(err.message || 'حدث خطأ أثناء الدمج');
    } finally {
      setMerging(false);
      setMergeMessage('');
    }
  };

  // ── Custom merge ──────────────────────────────────────────────────────────
  const handleToggleFileSelect = useCallback((key, storagePath, label, url) => {
    setSelectedFilesForMerge((prev) => {
      const exists = prev.some((f) => f.key === key);
      return exists ? prev.filter((f) => f.key !== key) : [...prev, { key, storagePath, label, url }];
    });
  }, []);

  const handleCustomMerge = async () => {
    if (selectedFilesForMerge.length === 0) return;
    setCustomMerging(true);
    setCustomMergeMessage('جاري تجهيز الملفات المختارة...');
    try {
      const _fileNum  = localDoc.fileNumber ? String(localDoc.fileNumber).padStart(4, '0') : 'رقم الملف';
      const _year     = localDoc.createdAt ? new Date(localDoc.createdAt).getFullYear() : new Date().getFullYear();
      const _tabName  = activeTab === 'documents' ? 'مستندات' : 'ايصالات';
      const filename  = `${_fileNum}-${_year} ${localDoc.count || ''} ${localDoc.supplierName || ''} ${localDoc.certificateNumber || ''} ${localDoc.arrivalPort || ''} - ${localDoc.itemName || ''} ${_tabName} (مخصص).pdf`;

      const success = await customMergeAndDownload(
        selectedFilesForMerge, filename,
        (msg) => setCustomMergeMessage(msg),
      );
      if (success) {
        toast.success(<div className="flex items-center gap-2"><CheckCircle2 size={18} />تم تحميل الملف المخصص بنجاح</div>);
        setIsCustomMergeMode(false);
        setSelectedFilesForMerge([]);
      }
    } catch (err) {
      toast.error(err.message || 'حدث خطأ أثناء الدمج المخصص');
    } finally {
      setCustomMerging(false);
      setCustomMergeMessage('');
    }
  };

  // ── Delete consignment ────────────────────────────────────────────────────
  const handleDelete = async (password) => {
    setDeleteLoading(true);
    try {
      await fetchApi(`/api/consignments/${localDoc._id}`, {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      });
      toast.success('تم حذف الشحنة');
      navigate('/');
    } catch (err) {
      toast.error(err.data?.message || 'كلمة المرور غير صحيحة');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Render: loading / error ───────────────────────────────────────────────
  if (fetchLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }
  if (fetchError || !localDoc) {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 p-6">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-slate-600">{fetchError || 'الشحنة غير موجودة'}</p>
        <Link to="/" className="text-blue-600 hover:underline text-sm">العودة للرئيسية</Link>
      </div>
    );
  }

  const accent          = COMPANY_COLOR[localDoc.companyName] || 'slate';
  const currentDefs     = TAB_CONFIG[activeTab]?.defs ?? [];
  const tabData         = localDoc[activeTab] || {};
  const activeDynFields = dynamicFields[activeTab] ?? [];

  // ── Render: main ─────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">

      {/* ── Sticky top bar ─────────────────────────────────────────────────── */}
      <div className={`sticky top-0 z-30 bg-${accent}-50 border-b border-slate-200 shadow-sm`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/70 text-slate-600 transition-colors"
            >
              <ArrowRight size={18} />
            </button>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-${accent}-100 text-${accent}-800 border border-${accent}-200 truncate max-w-[140px]`}>
              {localDoc.companyName}
            </span>
            <span className="font-mono text-sm text-slate-500 font-semibold hidden sm:block">{localDoc.acid}</span>
          </div>

          {/* Delete button */}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-xl font-semibold transition-all"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">حذف الشحنة</span>
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ── Metadata edit form ─────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">بيانات الشحنة</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

            {/* Company select */}
            <div>
              <label className="block text-xs text-slate-700 mb-1 font-medium">اسم الشركة</label>
              <select
                value={form.companyName}
                onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {(Array.isArray(COMPANIES) ? COMPANIES : []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Text fields */}
            {[
              { field: 'acid',                  label: 'ACID',               mono: true },
              { field: 'invoiceSequenceNumber', label: 'رقم تسلسل الفاتورة', mono: true },
              { field: 'consignmentNumber',     label: 'رقم البوليصة',        mono: true },
              { field: 'itemName',              label: 'اسم الصنف',           mono: false },
              { field: 'count',                 label: 'العدد',               mono: true },
              { field: 'supplierName',          label: 'اسم المورد',          mono: false },
              { field: 'certificateNumber',     label: 'رقم الشهاده',         mono: false },
              { field: 'arrivalPort',           label: 'ميناء الوصول',        mono: false },
              { field: 'fileNumber',            label: 'رقم الملف',           mono: false },
            ].map(({ field, label, mono }) => (
              <div key={field}>
                <label className="block text-xs text-slate-700 mb-1 font-medium">{label}</label>
                <input
                  type="text"
                  value={form[field] || ''}
                  onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
                  dir={mono ? 'ltr' : 'rtl'}
                  className={`w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all ${mono ? 'font-mono text-left' : ''}`}
                />
              </div>
            ))}

            {/* Save button */}
            <div className="flex items-end">
              <button
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 transition-all min-h-[44px]"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>

        {/* ── Tabs + upload grid ─────────────────────────────────────────── */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">

          {/* Tab switcher */}
          <div className="flex border-b border-slate-200 bg-slate-50/50">
            {(Array.isArray(TABS) ? TABS : []).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold transition-all duration-300 relative min-h-[52px]
                  ${activeTab === tab.id ? 'text-blue-600 bg-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'}`}
              >
                <tab.icon size={18} />
                {tab.label}
                {activeTab === tab.id && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600" />}
              </button>
            ))}
          </div>

          {/* Upload grid */}
          {activeTab !== 'refunds' && (
            <div className="p-4 sm:p-6 bg-slate-50/50 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

                {(Array.isArray(currentDefs) ? currentDefs : []).map((def) => {
                  const isBaseUploading = globalUploadingKeys.has(`${localDoc._id}-${activeTab}-${def.key}`);
                  const copies  = (Array.isArray(activeDynFields) ? activeDynFields : []).filter((f) => f.baseKey === def.key);
                  const baseMeta = getSlotMeta(tabData[def.key]);
                  return (
                    <div key={def.key} className="contents">
                      <UploadCard
                        label={def.label}
                        url={baseMeta?.url || null}
                        uploadedBy={baseMeta?.uploadedBy}
                        uploaderKnown={baseMeta?.known}
                        uploadedAt={baseMeta?.uploadedAt}
                        isUploading={isBaseUploading}
                        onUpload={(file) => handleUpload(activeTab, def.key, file, def.label)}
                        onDelete={() => handleDeleteFile(activeTab, def.key)}
                        isCustomMergeMode={isCustomMergeMode}
                        isSelected={selectedFilesForMerge.some((f) => f.key === def.key)}
                        onToggleSelect={() => handleToggleFileSelect(def.key, `${localDoc._id}/${def.key}.pdf`, def.label, baseMeta?.url)}
                      />
                      {(Array.isArray(copies) ? copies : []).map((dynField) => {
                        const isDynUploading = globalUploadingKeys.has(`${localDoc._id}-${activeTab}-${dynField.key}`);
                        const dynMeta = getSlotMeta(tabData[dynField.key]);
                        return (
                          <UploadCard
                            key={dynField.key}
                            label={dynField.label}
                            url={dynMeta?.url || null}
                            uploadedBy={dynMeta?.uploadedBy}
                            uploaderKnown={dynMeta?.known}
                            uploadedAt={dynMeta?.uploadedAt}
                            isUploading={isDynUploading}
                            onUpload={(file) => handleUpload(activeTab, dynField.key, file, dynField.label)}
                            onDelete={() => handleDeleteFile(activeTab, dynField.key)}
                            onRemove={() => handleRemoveDynamicField(activeTab, dynField)}
                            isCustomMergeMode={isCustomMergeMode}
                            isSelected={selectedFilesForMerge.some((f) => f.key === dynField.key)}
                            onToggleSelect={() => handleToggleFileSelect(dynField.key, `${localDoc._id}/${dynField.key}.pdf`, dynField.label, dynMeta?.url)}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Add More toolbar */}
              <div className="flex flex-wrap items-end gap-3 pt-4 border-t border-slate-200">
                <div className="flex-1 min-w-40">
                  <label className="block text-xs text-slate-700 font-medium mb-1.5">إضافة نسخة من</label>
                  <select
                    value={addDropdown[activeTab]}
                    onChange={(e) => setAddDropdown((p) => ({ ...p, [activeTab]: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="">— اختر النوع —</option>
                    {(Array.isArray(currentDefs) ? currentDefs : []).map((def) => <option key={def.key} value={def.key}>{def.label}</option>)}
                  </select>
                </div>
                <div className="w-24 flex-shrink-0">
                  <label className="block text-xs text-slate-700 font-medium mb-1.5">
                    <span className="flex items-center gap-1"><Hash size={11} />الكمية</span>
                  </label>
                  <input
                    type="number" min={1} max={20}
                    value={addQty[activeTab]}
                    onChange={(e) => setAddQty((p) => ({ ...p, [activeTab]: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 text-center outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddField(activeTab)}
                  className="flex-shrink-0 flex items-center gap-2 self-end px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-all min-h-[44px]"
                >
                  <PlusCircle size={16} />إضافة
                </button>
              </div>
            </div>
          )}

          {/* Refund tab */}
          {activeTab === 'refunds' && (
            <div className="p-4 sm:p-6">
              <RefundTab detailDoc={localDoc} />
            </div>
          )}
        </div>

        {/* ── Merge controls ─────────────────────────────────────────────── */}
        {activeTab !== 'refunds' && (
          <div className="space-y-3">
            {merging    && <ProgressBar message={mergeMessage} />}
            {customMerging && <ProgressBar message={customMergeMessage} />}

            {isCustomMergeMode && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm">
                <ListChecks size={16} className="text-blue-600 flex-shrink-0" />
                <span className="text-blue-800 flex-1 font-medium">
                  {selectedFilesForMerge.length === 0
                    ? 'انقر على الملفات المرفوعة لاختيارها'
                    : `تم اختيار ${selectedFilesForMerge.length} ملف`}
                </span>
                {selectedFilesForMerge.length > 0 && (
                  <button onClick={() => setSelectedFilesForMerge([])} className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline">
                    مسح
                  </button>
                )}
              </div>
            )}

            {!isCustomMergeMode ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleMerge(false)}
                  disabled={merging !== false}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 min-h-[52px]"
                >
                  <Download size={18} />دمج وتحميل فقط
                </button>
                <button
                  onClick={() => handleMerge(true)}
                  disabled={merging !== false}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 min-h-[52px]"
                >
                  <Trash2 size={18} />تحميل + حذف نهائي
                </button>
                <button
                  type="button"
                  onClick={() => { setIsCustomMergeMode(true); setSelectedFilesForMerge([]); }}
                  disabled={merging !== false}
                  className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm bg-white border border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 min-h-[52px]"
                >
                  <SlidersHorizontal size={16} />دمج ملفات معينة
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleCustomMerge}
                  disabled={selectedFilesForMerge.length === 0 || customMerging}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 min-h-[52px]"
                >
                  {customMerging ? <Loader2 size={18} className="animate-spin" /> : <ListChecks size={18} />}
                  دمج الملفات المختارة
                  {selectedFilesForMerge.length > 0 && (
                    <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">{selectedFilesForMerge.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsCustomMergeMode(false); setSelectedFilesForMerge([]); }}
                  disabled={customMerging}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[52px]"
                >
                  <XCircle size={16} />إلغاء
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete modal */}
      {showDeleteModal && (
        <DeleteModal
          acid={localDoc.acid}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
