import { useState, useCallback } from 'react';
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
} from 'lucide-react';
import UploadCard from './UploadCard';
import ProgressBar from './ProgressBar';
import { RECEIPTS, DOCUMENTS } from '../lib/fileDefinitions';
import { supabase, BUCKET } from '../lib/supabase';
import { mergeAndDownload } from '../lib/mergeEngine';
import { fetchApi } from '../lib/api';

const TABS = [
  { id: 'receipts', label: 'ايصالات', icon: Receipt },
  { id: 'documents', label: 'مستندات', icon: FolderOpen },
];

const COMPANIES = ['مصانع الترياق', 'شركة الزامل'];
const COMPANY_COLOR = {
  'مصانع الترياق': 'emerald',
  'شركة الزامل': 'sky',
};

export default function ConsignmentDetailModal({ detailDoc, closeDetail, openDeleteModal, onUpdate }) {
  const [activeTab, setActiveTab] = useState('receipts');
  const [form, setForm] = useState({
    companyName: detailDoc.companyName || COMPANIES[0],
    acid: detailDoc.acid || '',
    invoiceSequenceNumber: detailDoc.invoiceSequenceNumber || '',
    consignmentNumber: detailDoc.consignmentNumber || '',
    itemName: detailDoc.itemName || '',
    count: detailDoc.count || '',
    supplierName: detailDoc.supplierName || '',
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingKeys, setUploadingKeys] = useState(new Set());
  const [merging, setMerging] = useState(false); // false | 'keep' | 'delete'
  const [mergeMessage, setMergeMessage] = useState('');
  
  // Keep local document state so file uploads reflect immediately
  const [localDoc, setLocalDoc] = useState(detailDoc);

  const handleFieldChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      // In a real app we'd have a PUT endpoint, but we can just use the generic update or fallback to just closing if we don't have one.
      // Wait, let's check if the backend has PUT. The backend only has POST, GET, PATCH /file, PATCH /cleanup, DELETE.
      // We don't have a generic PUT /:id yet. Let's add it to the backend or use a workaround.
      // For now, I will use fetchApi to PUT or PATCH, assuming I'll add the route to backend next.
      const res = await fetchApi(`/api/consignments/${localDoc._id}`, {
        method: 'PUT',
        body: JSON.stringify(form)
      });
      setLocalDoc(res);
      toast.success('تم الحفظ بنجاح');
      onUpdate();
    } catch (err) {
      toast.error('خطأ في الحفظ');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpload = useCallback(async (tab, key, file) => {
    if (!localDoc) return;
    if (file.type !== 'application/pdf') {
      toast.error('يُقبل فقط ملفات PDF');
      return;
    }
    const uploadKey = `${tab}.${key}`;
    setUploadingKeys((prev) => new Set(prev).add(uploadKey));

    try {
      const storagePath = `${localDoc._id}/${key}.pdf`; // Supabase folder keyed by unique _id
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: true });

      if (uploadError) throw uploadError;

      const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/consignments/${localDoc._id}/file`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, key, url: publicUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

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

  const handleDeleteFile = useCallback(async (tab, key) => {
    if (!localDoc) return;
    const uploadKey = `${tab}.${key}`;
    setUploadingKeys((prev) => new Set(prev).add(uploadKey));

    try {
      const storagePath = `${localDoc._id}/${key}.pdf`;
      const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
      if (error) throw error;

      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/consignments/${localDoc._id}/file`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, key, url: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

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

  const handleMerge = async (deleteAfter) => {
    setMerging(deleteAfter ? 'delete' : 'keep');
    setMergeMessage('جاري سحب الملفات ودمجها...');
    try {
      // Correct signature: (consignment, activeTab, withCleanup, onProgress, onError, password)
      // We pass withCleanup=false because the parent DeleteModal handles the actual cleanup
      const success = await mergeAndDownload(
        localDoc,
        activeTab,
        false,
        (msg) => setMergeMessage(msg),
        (errMsg) => toast.error(errMsg)
      );
      
      if (success) {
        toast.success(
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            تم التحميل بنجاح
          </div>
        );
        if (deleteAfter) {
          // Ask parent to open delete modal so the user provides the password.
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

  const currentFields = activeTab === 'receipts' ? RECEIPTS : DOCUMENTS;
  const tabData = localDoc[activeTab] || {};
  const accent = COMPANY_COLOR[localDoc.companyName] || 'slate';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
    >
      <div
        dir="rtl"
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl mx-auto flex flex-col max-h-[90vh]"
      >
        {/* Header */}
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

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Section 1: Edit Fields */}
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
                  {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">ACID</label>
                <input
                  type="text"
                  value={form.acid}
                  onChange={(e) => handleFieldChange('acid', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 font-mono text-left transition-colors"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">رقم تسلسل الفاتورة</label>
                <input
                  type="text"
                  value={form.invoiceSequenceNumber}
                  onChange={(e) => handleFieldChange('invoiceSequenceNumber', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 font-mono text-left transition-colors"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">رقم البوليصة</label>
                <input
                  type="text"
                  value={form.consignmentNumber}
                  onChange={(e) => handleFieldChange('consignmentNumber', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 font-mono text-left transition-colors"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">اسم الصنف</label>
                <input
                  type="text"
                  value={form.itemName}
                  onChange={(e) => handleFieldChange('itemName', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">العدد</label>
                <input
                  type="text"
                  value={form.count}
                  onChange={(e) => handleFieldChange('count', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 font-mono text-left transition-colors"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">اسم المورد</label>
                <input
                  type="text"
                  value={form.supplierName}
                  onChange={(e) => handleFieldChange('supplierName', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
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

          {/* Section 2: Tabbed Uploads */}
          <div className="border border-slate-700 rounded-2xl overflow-hidden bg-slate-900 shadow-xl">
            {/* Tabs */}
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

            {/* Grid */}
            <div className="p-4 sm:p-6 bg-slate-950/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentFields.map(({ key, label, mandatory }) => {
                  const url = tabData[key];
                  const uploadKey = `${activeTab}.${key}`;
                  const isUploading = uploadingKeys.has(uploadKey);

                  return (
                    <UploadCard
                      key={key}
                      label={label}
                      url={url}
                      mandatory={mandatory}
                      isUploading={isUploading}
                      onUpload={(file) => handleUpload(activeTab, key, file)}
                      onDelete={() => handleDeleteFile(activeTab, key)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Merge Controls */}
          {merging && <ProgressBar message={mergeMessage} />}
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
          </div>

        </div>
      </div>
    </div>
  );
}
