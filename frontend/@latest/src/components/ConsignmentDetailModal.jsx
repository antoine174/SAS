// src/components/ConsignmentDetailModal.jsx
/**
 * ConsignmentDetailModal
 *
 * Full detail view for a single consignment record.
 * Features:
 *  - Edit flat metadata fields (companyName, acid, etc.)
 *  - Two upload tabs: "مستندات" (documents) and "ايصالات" (receipts)
 *  - Dynamic "Add More" UI: dropdown + quantity input + button
 *  - Dynamic cards have a delete (×) button; base cards do not
 *  - PDF merge respects sequence: base → dynamic copies interleaved after each base
 *  - All files are optional — merge skips empty slots without errors
 *  - Re-opening a saved consignment restores dynamic cards from DB state
 *
 * Bug fix (dynamic card state):
 *  - dynamicFields is NEVER overwritten by a DB response.
 *  - On localDoc updates, we MERGE new DB-discovered keys into existing state
 *    so empty local-only cards survive any upload response.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  X,
  Trash2,
  FolderOpen,
  Receipt,
  Download,
  CheckCircle2,
  Save,
  Loader2,
  PlusCircle,
  Hash,
  ListChecks,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import UploadCard from './UploadCard';
import ProgressBar from './ProgressBar';
import { RECEIPTS, DOCUMENTS } from '../lib/fileDefinitions';
import { supabase, BUCKET } from '../lib/supabase';
import { mergeAndDownload, customMergeAndDownload } from '../lib/mergeEngine';
import { fetchApi } from '../lib/api';

// ─── Tab configuration ────────────────────────────────────────────────────────

const TAB_CONFIG = {
  documents: { defs: DOCUMENTS, label: 'المستندات', icon: FolderOpen },
  receipts:  { defs: RECEIPTS,  label: 'الايصالات', icon: Receipt    },
};

const TABS = [
  { id: 'documents', ...TAB_CONFIG.documents },
  { id: 'receipts',  ...TAB_CONFIG.receipts  },
];

// Build a lookup map: baseKey → label  (used to label dynamic copies)
const BASE_KEY_LABEL = {};
[...DOCUMENTS, ...RECEIPTS].forEach(({ key, label }) => { BASE_KEY_LABEL[key] = label; });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMPANIES     = ['مصانع الترياق', 'شركة الزامل'];
const COMPANY_COLOR = { 'مصانع الترياق': 'emerald', 'شركة الزامل': 'sky' };

/**
 * Given the raw tabData from the DB, extract dynamic fields
 * (keys matching pattern `{baseKey}_{N}`) as an array.
 *
 * @param {'documents'|'receipts'} tab
 * @param {object} tabData  – e.g. consignment.documents
 * @returns {Array<{ key, baseKey, label }>}
 */
function extractDbDynamicFields(tab, tabData) {
  if (!tabData || typeof tabData !== 'object') return [];
  const baseDefs = TAB_CONFIG[tab].defs;
  const baseKeys = new Set(baseDefs.map((d) => d.key));
  const dynamic  = [];

  for (const storedKey of Object.keys(tabData)) {
    const match = storedKey.match(/^(.+)_(\d+)$/);
    if (!match) continue;
    const baseKey = match[1];
    const index   = parseInt(match[2], 10);
    if (!baseKeys.has(baseKey)) continue;
    dynamic.push({
      key:     storedKey,
      baseKey,
      label:   `${BASE_KEY_LABEL[baseKey] || baseKey} ${index}`,
    });
  }

  // Sort by base key sequence order, then by numeric index
  const baseOrder = baseDefs.map((d) => d.key);
  dynamic.sort((a, b) => {
    const orderDiff = baseOrder.indexOf(a.baseKey) - baseOrder.indexOf(b.baseKey);
    if (orderDiff !== 0) return orderDiff;
    return (parseInt(a.key.split('_').pop(), 10) || 0)
         - (parseInt(b.key.split('_').pop(), 10) || 0);
  });

  return dynamic;
}

/**
 * mergeDynamicFields
 *
 * NON-DESTRUCTIVE merge: takes the current local dynamicFields array and
 * DB-sourced dynamic fields, then returns a combined array that:
 *   - Keeps ALL existing local entries (including empty/unsaved ones)
 *   - Appends any DB entries whose key isn't already tracked locally
 *
 * This ensures that an upload response updating localDoc NEVER wipes
 * empty local-only dynamic cards from the UI.
 *
 * @param {Array} existing  – current dynamicFields[tab]
 * @param {Array} fromDb    – result of extractDbDynamicFields(tab, tabData)
 * @returns {Array}
 */
function mergeDynamicFields(existing, fromDb) {
  const existingKeys = new Set(existing.map((f) => f.key));
  const toAdd = fromDb.filter((f) => !existingKeys.has(f.key));
  return [...existing, ...toAdd];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConsignmentDetailModal({ detailDoc, closeDetail, openDeleteModal, onUpdate }) {
  const [activeTab, setActiveTab] = useState('documents');

  // Flat metadata form state
  const [form, setForm] = useState({
    companyName:           detailDoc.companyName           || COMPANIES[0],
    acid:                  detailDoc.acid                  || '',
    invoiceSequenceNumber: detailDoc.invoiceSequenceNumber || '',
    consignmentNumber:     detailDoc.consignmentNumber     || '',
    itemName:              detailDoc.itemName              || '',
    count:                 detailDoc.count                 || '',
    supplierName:          detailDoc.supplierName          || '',
    certificateNumber:     detailDoc.certificateNumber     || '',
    arrivalPort:           detailDoc.arrivalPort           || '',
    fileNumber:            detailDoc.fileNumber            || '',
  });

  const [isSaving,      setIsSaving]      = useState(false);
  const [uploadingKeys, setUploadingKeys] = useState(new Set());
  const [merging,       setMerging]       = useState(false); // false | 'keep' | 'delete'
  const [mergeMessage,  setMergeMessage]  = useState('');

  // Local copy of the full consignment document (updated on every upload/delete)
  const [localDoc, setLocalDoc] = useState(detailDoc);

  /**
   * Dynamic fields state — shape per tab:
   *   { documents: [{ key, baseKey, label }, …], receipts: […] }
   *
   * Initialised once on mount from detailDoc so re-opening a saved consignment
   * restores previously-uploaded dynamic cards.
   *
   * IMPORTANT: this state is NEVER replaced wholesale on localDoc updates.
   * DB responses are merged into it (additive-only) via the useEffect below,
   * so empty local-only cards survive any upload/delete server round-trip.
   */
  const [dynamicFields, setDynamicFields] = useState(() => ({
    documents: extractDbDynamicFields('documents', detailDoc.documents),
    receipts:  extractDbDynamicFields('receipts',  detailDoc.receipts),
  }));

  // Dropdown + quantity for the "Add More" toolbar (one set per tab)
  const [addDropdown, setAddDropdown] = useState({ documents: '', receipts: '' });
  const [addQty,      setAddQty]      = useState({ documents: 1,  receipts: 1  });

  // ── Custom Merge Mode ─────────────────────────────────────────────────────────
  // Completely isolated from the standard merge logic.
  // selectedFilesForMerge: [{ key, storagePath, label }, …] — order = click order
  const [isCustomMergeMode,      setIsCustomMergeMode]      = useState(false);
  const [selectedFilesForMerge,  setSelectedFilesForMerge]  = useState([]);
  const [customMerging,          setCustomMerging]          = useState(false);
  const [customMergeMessage,     setCustomMergeMessage]     = useState('');

  // ── ADDITIVE sync: merge DB-discovered keys into local state on every update ──
  // We NEVER call setDynamicFields with a fresh array — only append new entries.
  useEffect(() => {
    setDynamicFields((prev) => ({
      documents: mergeDynamicFields(
        prev.documents,
        extractDbDynamicFields('documents', localDoc.documents),
      ),
      receipts: mergeDynamicFields(
        prev.receipts,
        extractDbDynamicFields('receipts', localDoc.receipts),
      ),
    }));
  }, [localDoc]);

  // ── Form change handler ───────────────────────────────────────────────────────
  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ── Save metadata ─────────────────────────────────────────────────────────────
  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const res = await fetchApi(`/api/consignments/${localDoc._id}`, {
        method: 'PUT',
        body:   JSON.stringify(form),
      });
      setLocalDoc(res);
      toast.success('تم الحفظ بنجاح');
      onUpdate();
    } catch {
      toast.error('خطأ في الحفظ');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Upload a PDF file ─────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (tab, key, file) => {
    if (!localDoc) return;
    if (file.type !== 'application/pdf') {
      toast.error('يُقبل فقط ملفات PDF');
      return;
    }
    const uploadKey = `${tab}.${key}`;
    setUploadingKeys((prev) => new Set(prev).add(uploadKey));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tab',  tab);
      formData.append('key',  key);

      const data = await fetchApi(`/api/consignments/${localDoc._id}/upload`, {
        method: 'POST',
        body:   formData,
      });

      setLocalDoc(data);
      toast.success(`تم رفع "${file.name}" بنجاح ✅`);
    } catch (err) {
      toast.error(`فشل الرفع: ${err.message}`);
    } finally {
      setUploadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(uploadKey);
        return next;
      });
    }
  }, [localDoc]);

  // ── Delete a file from storage + DB ──────────────────────────────────────────
  const handleDeleteFile = useCallback(async (tab, key) => {
    if (!localDoc) return;
    const uploadKey = `${tab}.${key}`;
    setUploadingKeys((prev) => new Set(prev).add(uploadKey));

    try {
      const storagePath = `${localDoc._id}/${key}.pdf`;
      const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
      if (error) throw error;

      const data = await fetchApi(`/api/consignments/${localDoc._id}/file`, {
        method: 'PATCH',
        body:   JSON.stringify({ tab, key, url: null }),
      });

      setLocalDoc(data);
      toast.info('تم حذف الملف');
    } catch (err) {
      toast.error(`فشل الحذف: ${err.message}`);
    } finally {
      setUploadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(uploadKey);
        return next;
      });
    }
  }, [localDoc]);

  // ── Add one or more dynamic copies of a document type ───────────────────────
  const handleAddField = (tab) => {
    const baseKey  = addDropdown[tab];
    const quantity = Math.max(1, Math.min(20, parseInt(addQty[tab], 10) || 1));

    if (!baseKey) {
      toast.warning('الرجاء اختيار نوع المستند أولاً');
      return;
    }

    setDynamicFields((prev) => {
      const existing = prev[tab];

      // Collect ALL taken indexes for this baseKey:
      //   - from local dynamicFields state (includes empty cards)
      //   - from DB keys already in localDoc (uploaded copies)
      const takenIndexes = new Set();

      existing
        .filter((f) => f.baseKey === baseKey)
        .forEach((f) => {
          const idx = parseInt(f.key.split('_').pop(), 10);
          if (!isNaN(idx)) takenIndexes.add(idx);
        });

      const dbTabData = localDoc[tab] || {};
      Object.keys(dbTabData)
        .filter((k) => k.startsWith(`${baseKey}_`))
        .forEach((k) => {
          const idx = parseInt(k.split('_').pop(), 10);
          if (!isNaN(idx)) takenIndexes.add(idx);
        });

      // Generate `quantity` new entries using the next available indexes
      const newEntries = [];
      let cursor = 1;
      while (newEntries.length < quantity) {
        if (!takenIndexes.has(cursor)) {
          takenIndexes.add(cursor); // reserve immediately to avoid self-collision
          newEntries.push({
            key:     `${baseKey}_${cursor}`,
            baseKey,
            label:   `${BASE_KEY_LABEL[baseKey] || baseKey} ${cursor}`,
          });
        }
        cursor++;
        if (cursor > 1000) break; // safety valve
      }

      return { ...prev, [tab]: [...existing, ...newEntries] };
    });
  };

  // ── Remove a dynamic card (delete file if uploaded, remove from state) ────────
  const handleRemoveDynamicField = useCallback(async (tab, dynField) => {
    // If a file was uploaded for this dynamic slot, delete it first
    const tabData = localDoc[tab] || {};
    if (tabData[dynField.key]) {
      await handleDeleteFile(tab, dynField.key);
    }

    // Remove from local dynamic state
    setDynamicFields((prev) => ({
      ...prev,
      [tab]: prev[tab].filter((f) => f.key !== dynField.key),
    }));
  }, [localDoc, handleDeleteFile]);

  // ── Merge & download ──────────────────────────────────────────────────────────
  const handleMerge = async (deleteAfter) => {
    setMerging(deleteAfter ? 'delete' : 'keep');
    setMergeMessage('جاري سحب الملفات ودمجها...');
    try {
      const success = await mergeAndDownload(
        localDoc,
        activeTab,
        false,
        (msg) => setMergeMessage(msg),
        (errMsg) => toast.error(errMsg),
        undefined,
        dynamicFields[activeTab], // pass dynamic fields for correct sequencing
      );

      if (success) {
        toast.success(
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            تم التحميل بنجاح
          </div>
        );
        if (deleteAfter) {
          closeDetail();
          openDeleteModal(localDoc._id, localDoc.acid);
        }
      }
    } catch (err) {
      toast.error(err.message || 'حدث خطأ أثناء الدمج');
    } finally {
      setMerging(false);
      setMergeMessage('');
    }
  };

  // ── Toggle a file in/out of the custom merge selection ───────────────────────
  const handleToggleFileSelect = useCallback((key, storagePath, label) => {
    setSelectedFilesForMerge((prev) => {
      const exists = prev.some((f) => f.key === key);
      if (exists) return prev.filter((f) => f.key !== key);
      return [...prev, { key, storagePath, label }];
    });
  }, []);

  // ── Custom merge: merge exactly the selected files in click order ─────────────
  const handleCustomMerge = async () => {
    if (selectedFilesForMerge.length === 0) return;
    setCustomMerging(true);
    setCustomMergeMessage('جاري تجهيز الملفات المختارة...');
    try {
      // Build filename using the same convention as the standard merge
      const _fileNum  = localDoc.fileNumber
        ? String(localDoc.fileNumber).padStart(4, '0')
        : 'رقم الملف';
      const _year     = localDoc.createdAt
        ? new Date(localDoc.createdAt).getFullYear()
        : new Date().getFullYear();
      const _count    = localDoc.count             || 'العدد';
      const _supplier = localDoc.supplierName      || 'اسم المورد';
      const _certNum  = localDoc.certificateNumber || 'رقم الشهاده';
      const _item     = localDoc.itemName          || 'اسم الصنف';
      const _port     = localDoc.arrivalPort       || 'ميناء الوصول';
      const _tabName  = activeTab === 'documents'  ? 'مستندات' : 'ايصالات';
      const filename  = `${_fileNum}-${_year} ${_count} ${_supplier} ${_certNum} ${_port} - ${_item} ${_tabName} (مخصص).pdf`;

      const success = await customMergeAndDownload(
        selectedFilesForMerge,
        filename,
        (msg) => setCustomMergeMessage(msg),
      );

      if (success) {
        toast.success(
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            تم تحميل الملف المخصص بنجاح
          </div>
        );
        // Exit custom merge mode and clear selection
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

  // ── Derived values ────────────────────────────────────────────────────────────
  const currentDefs       = TAB_CONFIG[activeTab].defs;
  const tabData           = localDoc[activeTab] || {};
  const accent            = COMPANY_COLOR[localDoc.companyName] || 'slate';
  const activeDynFields   = dynamicFields[activeTab] || [];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
    >
      <div
        dir="rtl"
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl mx-auto flex flex-col max-h-[92vh]"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className={`px-6 py-4 bg-${accent}-500/10 border-b border-slate-700 flex items-center justify-between flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-${accent}-500/20 text-${accent}-300 border border-${accent}-500/30`}>
              {localDoc.companyName}
            </span>
            <span className="text-slate-300 font-mono text-sm">{localDoc.acid}</span>
          </div>
          <button
            type="button"
            onClick={closeDetail}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* Section 1: Edit metadata fields */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">بيانات الشحنة</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

              <div>
                <label className="block text-xs text-slate-400 mb-1">اسم الشركة</label>
                <select
                  value={form.companyName}
                  onChange={(e) => handleFieldChange('companyName', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 transition-colors"
                >
                  {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {[
                { field: 'acid',                  label: 'ACID',                 mono: true  },
                { field: 'invoiceSequenceNumber', label: 'رقم تسلسل الفاتورة',  mono: true  },
                { field: 'consignmentNumber',     label: 'رقم البوليصة',         mono: true  },
                { field: 'itemName',          label: 'اسم الصنف',        mono: false },
                { field: 'count',             label: 'العدد',             mono: true  },
                { field: 'supplierName',      label: 'اسم المورد',       mono: false },
                { field: 'certificateNumber', label: 'رقم الشهاده',      mono: false },
                { field: 'arrivalPort',       label: 'ميناء الوصول',     mono: false },
                { field: 'fileNumber',        label: 'رقم الملف',         mono: false },
              ].map(({ field, label, mono }) => (
                <div key={field}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <input
                    type="text"
                    value={form[field]}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    dir={mono ? 'ltr' : 'rtl'}
                    className={`w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 transition-colors ${mono ? 'font-mono text-left' : ''}`}
                  />
                </div>
              ))}

              <div className="flex items-end">
                <button
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  حفظ التعديلات
                </button>
              </div>

            </div>
          </div>

          {/* Section 2: Tabbed upload grid */}
          <div className="border border-slate-700 rounded-2xl overflow-hidden bg-slate-900 shadow-xl">

            {/* Tab switcher */}
            <div className="flex border-b border-slate-800">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold transition-all duration-300 relative
                    ${activeTab === tab.id ? 'text-emerald-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}
                  `}
                >
                  <tab.icon size={18} />
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 inset-x-0 h-0.5 bg-emerald-500 shadow-[0_-2px_10px_rgba(16,185,129,0.5)]" />
                  )}
                </button>
              ))}
            </div>

            {/* Upload grid */}
            <div className="p-4 sm:p-6 bg-slate-950/30 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

                {currentDefs.map((def) => {
                  const baseUploadKey  = `${activeTab}.${def.key}`;
                  const isBaseUploading = uploadingKeys.has(baseUploadKey);
                  const copies = activeDynFields.filter((f) => f.baseKey === def.key);

                  return (
                    <div key={def.key} className="contents">
                      {/* Base card */}
                      <UploadCard
                        label={def.label}
                        url={tabData[def.key]}
                        isUploading={isBaseUploading}
                        onUpload={(file) => handleUpload(activeTab, def.key, file)}
                        onDelete={() => handleDeleteFile(activeTab, def.key)}
                        isCustomMergeMode={isCustomMergeMode}
                        isSelected={selectedFilesForMerge.some((f) => f.key === def.key)}
                        onToggleSelect={() => handleToggleFileSelect(
                          def.key,
                          `${localDoc._id}/${def.key}.pdf`,
                          def.label,
                        )}
                      />

                      {/* Dynamic copy cards */}
                      {copies.map((dynField) => {
                        const dynUploadKey   = `${activeTab}.${dynField.key}`;
                        const isDynUploading = uploadingKeys.has(dynUploadKey);
                        return (
                          <UploadCard
                            key={dynField.key}
                            label={dynField.label}
                            url={tabData[dynField.key]}
                            isUploading={isDynUploading}
                            onUpload={(file) => handleUpload(activeTab, dynField.key, file)}
                            onDelete={() => handleDeleteFile(activeTab, dynField.key)}
                            onRemove={() => handleRemoveDynamicField(activeTab, dynField)}
                            isCustomMergeMode={isCustomMergeMode}
                            isSelected={selectedFilesForMerge.some((f) => f.key === dynField.key)}
                            onToggleSelect={() => handleToggleFileSelect(
                              dynField.key,
                              `${localDoc._id}/${dynField.key}.pdf`,
                              dynField.label,
                            )}
                          />
                        );
                      })}
                    </div>
                  );
                })}

              </div>

              {/* ── "Add More" toolbar ───────────────────────────────────── */}
              <div className="flex flex-wrap items-end gap-3 pt-4 border-t border-slate-800/70">

                {/* Document type dropdown */}
                <div className="flex-1 min-w-40">
                  <label className="block text-xs text-slate-500 mb-1.5">إضافة نسخة من</label>
                  <select
                    value={addDropdown[activeTab]}
                    onChange={(e) =>
                      setAddDropdown((prev) => ({ ...prev, [activeTab]: e.target.value }))
                    }
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="">— اختر النوع —</option>
                    {currentDefs.map((def) => (
                      <option key={def.key} value={def.key}>{def.label}</option>
                    ))}
                  </select>
                </div>

                {/* Quantity input */}
                <div className="w-24 flex-shrink-0">
                  <label className="block text-xs text-slate-500 mb-1.5">
                    <span className="flex items-center gap-1"><Hash size={11} /> الكمية</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={addQty[activeTab]}
                    onChange={(e) =>
                      setAddQty((prev) => ({ ...prev, [activeTab]: e.target.value }))
                    }
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-200 text-center outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Add button */}
                <button
                  type="button"
                  onClick={() => handleAddField(activeTab)}
                  className="
                    flex-shrink-0 flex items-center gap-2 self-end
                    px-4 py-2.5 rounded-xl text-sm font-semibold
                    bg-emerald-600/20 border border-emerald-500/40 text-emerald-400
                    hover:bg-emerald-600/40 hover:border-emerald-500/70 hover:text-emerald-300
                    transition-all duration-200
                  "
                >
                  <PlusCircle size={16} />
                  إضافة
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Merge controls */}

          {/* Standard merge progress bar */}
          {merging && <ProgressBar message={mergeMessage} />}

          {/* Custom merge progress bar */}
          {customMerging && <ProgressBar message={customMergeMessage} />}

          {/* ── Custom merge mode: selection info bar ──────────────────── */}
          {isCustomMergeMode && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-teal-950/50 border border-teal-700/50 text-sm">
              <ListChecks size={16} className="text-teal-400 flex-shrink-0" />
              <span className="text-teal-300 flex-1">
                {selectedFilesForMerge.length === 0
                  ? 'انقر على الملفات المرفوعة لاختيارها'
                  : `تم اختيار ${selectedFilesForMerge.length} ملف — سيتم دمجها بهذا الترتيب`
                }
              </span>
              {selectedFilesForMerge.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFilesForMerge([])}
                  className="text-xs text-teal-500 hover:text-teal-300 transition-colors underline"
                >
                  مسح الاختيار
                </button>
              )}
            </div>
          )}

          {/* ── Buttons row ────────────────────────────────────────────── */}
          {!isCustomMergeMode ? (
            /* Standard mode buttons */
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleMerge(false)}
                disabled={merging !== false}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-50"
              >
                <Download size={18} />
                دمج وتحميل فقط
              </button>
              <button
                onClick={() => handleMerge(true)}
                disabled={merging !== false}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-rose-600 hover:bg-rose-500 text-white transition-all disabled:opacity-50"
              >
                <Trash2 size={18} />
                تحميل + حذف نهائي
              </button>
              <button
                type="button"
                onClick={() => { setIsCustomMergeMode(true); setSelectedFilesForMerge([]); }}
                disabled={merging !== false}
                className="
                  flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm
                  bg-slate-700/80 border border-slate-600 text-slate-300
                  hover:bg-teal-900/50 hover:border-teal-600/60 hover:text-teal-300
                  transition-all disabled:opacity-50
                "
              >
                <SlidersHorizontal size={16} />
                دمج ملفات معينة
              </button>
            </div>
          ) : (
            /* Custom merge mode buttons */
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleCustomMerge}
                disabled={selectedFilesForMerge.length === 0 || customMerging}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-teal-600 hover:bg-teal-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {customMerging
                  ? <Loader2 size={18} className="animate-spin" />
                  : <ListChecks size={18} />
                }
                دمج الملفات المختارة
                {selectedFilesForMerge.length > 0 && (
                  <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">
                    {selectedFilesForMerge.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setIsCustomMergeMode(false); setSelectedFilesForMerge([]); }}
                disabled={customMerging}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm border border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all disabled:opacity-50"
              >
                <XCircle size={16} />
                إلغاء
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
