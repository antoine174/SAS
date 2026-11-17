// src/pages/QuickUpload.jsx
/**
 * QuickUpload — Share Target Reception Page.
 *
 * This page opens automatically when a file is shared from CamScanner
 * (or any app) via the PWA Web Share Target.
 *
 * Flow:
 *   1. Mount → read PDF from IndexedDB (written by Service Worker).
 *   2. If not authenticated → show inline AuthPage (PDF stays safe in IndexedDB).
 *   3. User searches for a consignment (debounced GET /api/consignments/search-lite).
 *   4. User picks document type tab (receipts / documents) + slot.
 *   5. Upload button: compressPdfIfNeeded → uploadDirectToCloudinary → PATCH /file → clearSharedFile → navigate.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Upload, Search, FileText, Loader2, CheckCircle2,
  AlertCircle, X, FolderOpen, Receipt, ChevronDown,
} from 'lucide-react';

import { useAuth } from '../lib/AuthContext';
import { fetchApi, uploadDirectToCloudinary } from '../lib/api';
import { getSharedFile, clearSharedFile } from '../lib/idb';
import { compressPdfIfNeeded } from '../lib/pdfCompressor';
import { RECEIPTS, DOCUMENTS } from '../lib/fileDefinitions';
import AuthPage from '../components/AuthPage';

// All uploadable slot definitions grouped by tab
const SLOT_DEFS = { receipts: RECEIPTS, documents: DOCUMENTS };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── File Card ────────────────────────────────────────────────────────────────
function FileCard({ file, compressed, onClear }) {
  const isLarge = file.size > 9.5 * 1024 * 1024;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-4" dir="rtl">
      <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-blue-100 flex-shrink-0">
        <FileText size={24} className="text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 truncate text-sm">{file.name}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          <span className="text-xs text-slate-500">{formatBytes(file.size)}</span>
          {isLarge && !compressed && (
            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
              يتطلب ضغط
            </span>
          )}
          {compressed && (
            <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
              ✓ تم الضغط
            </span>
          )}
        </div>
      </div>
      {onClear && (
        <button
          onClick={onClear}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors flex-shrink-0"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// ─── Consignment Search Combobox ──────────────────────────────────────────────
function ConsignmentSearch({ onSelect }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const debouncedQ              = useDebounce(query, 300);
  const containerRef            = useRef(null);

  useEffect(() => {
    if (!debouncedQ.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    fetchApi(`/api/consignments/search-lite?q=${encodeURIComponent(debouncedQ)}`)
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.docs)
            ? data.docs
            : Array.isArray(data?.consignments)
              ? data.consignments
              : Array.isArray(data?.data)
                ? data.data
                : [];
        setResults(list);
        setOpen(list.length > 0);
      })
      .catch(() => {
        setResults([]);
        setOpen(false);
      })
      .finally(() => setLoading(false));
  }, [debouncedQ]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (doc) => {
    onSelect(doc);
    setQuery(`${doc.acid} — ${doc.companyName}`);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative" dir="rtl">
      <label className="block text-sm font-semibold text-slate-700 mb-2">
        اختر الشحنة <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="ابحث بـ ACID أو اسم الشركة أو رقم الملف…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          className="w-full pr-10 pl-4 py-3 border border-slate-300 rounded-xl text-sm bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[48px]"
        />
        {loading && (
          <Loader2 size={14} className="absolute top-1/2 -translate-y-1/2 left-4 text-blue-400 animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {(Array.isArray(results) ? results : []).map((doc) => (
            <button
              key={doc._id}
              type="button"
              onClick={() => handleSelect(doc)}
              className="w-full text-right px-4 py-3 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-500">{doc.acid}</span>
                {doc.fileNumber && <span className="text-xs text-slate-400">ملف: {doc.fileNumber}</span>}
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">{doc.companyName}</p>
              {doc.itemName && <p className="text-xs text-slate-500 truncate">{doc.itemName}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function QuickUpload() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [file, setFile]               = useState(null);
  const [fileFromInput, setFileFromInput] = useState(false);
  const [compressed, setCompressed]   = useState(false);
  const [idbLoading, setIdbLoading]   = useState(true);

  const [selectedDoc, setSelectedDoc] = useState(null);  // { _id, acid, companyName, … }
  const [tabType, setTabType]         = useState('receipts'); // 'receipts' | 'documents'
  const [selectedSlot, setSelectedSlot] = useState(null);  // { key, label }

  const [uploading, setUploading]     = useState(false);
  const fileInputRef                  = useRef(null);

  // ── Load PDF from IndexedDB on mount ─────────────────────────────────────
  useEffect(() => {
    getSharedFile()
      .then((result) => {
        if (result?.file) setFile(result.file);
      })
      .catch(() => {})
      .finally(() => setIdbLoading(false));
  }, []);

  // ── File picker fallback ──────────────────────────────────────────────────
  const handleFilePick = (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (picked.type !== 'application/pdf') {
      toast.error('يُقبل فقط ملفات PDF');
      return;
    }
    setFile(picked);
    setFileFromInput(true);
    setCompressed(false);
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file || !selectedDoc || !selectedSlot) {
      toast.warning('يرجى اختيار الشحنة ونوع المستند والخانة أولاً');
      return;
    }

    setUploading(true);
    try {
      // 1. Compress if needed
      const fileToUpload = await compressPdfIfNeeded(file);
      if (fileToUpload !== file) setCompressed(true);

      // 2. Upload to Cloudinary
      const metadata = {
        acid:        selectedDoc.acid,
        label:       selectedSlot.label,
        companyName: selectedDoc.companyName,
      };
      const publicUrl = await uploadDirectToCloudinary(fileToUpload, metadata);

      // 3. Persist URL to MongoDB
      await fetchApi(`/api/consignments/${selectedDoc._id}/file`, {
        method: 'PATCH',
        body: JSON.stringify({ tab: tabType, key: selectedSlot.key, url: publicUrl }),
      });

      // 4. Clear IndexedDB entry (only if it came from share target)
      if (!fileFromInput) await clearSharedFile();

      toast.success('تم الرفع بنجاح ✅');
      navigate(`/consignment/${selectedDoc._id}`);
    } catch (err) {
      toast.error(err.message || 'فشل الرفع');
    } finally {
      setUploading(false);
    }
  };

  // ── Auth loading ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  // ── Show inline AuthPage if not logged in ─────────────────────────────────
  // PDF is safe in IndexedDB — login doesn't lose it.
  if (!user) {
    return <AuthPage />;
  }

  // ── Loading IDB ───────────────────────────────────────────────────────────
  if (idbLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-blue-500" />
      </div>
    );
  }

  const slotDefs = SLOT_DEFS[tabType];
  const canUpload = !!file && !!selectedDoc && !!selectedSlot;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 flex flex-col items-center p-4 py-8">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-slate-800">رفع مستند سريع</h1>
          <p className="text-sm text-slate-500">
            {file ? 'تم استقبال الملف — اختر الشحنة والخانة المناسبة' : 'اختر ملف PDF للرفع'}
          </p>
        </div>

        {/* File area */}
        {file ? (
          <FileCard
            file={file}
            compressed={compressed}
            onClear={() => { setFile(null); setCompressed(false); clearSharedFile().catch(() => {}); }}
          />
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
          >
            <Upload size={36} className="mx-auto text-slate-400 mb-3" />
            <p className="text-sm font-semibold text-slate-600">اضغط لاختيار ملف PDF</p>
            <p className="text-xs text-slate-400 mt-1">أو شارك الملف من CamScanner</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFilePick}
            />
          </div>
        )}

        {/* Consignment search */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
          <ConsignmentSearch onSelect={(doc) => { setSelectedDoc(doc); setSelectedSlot(null); }} />

          {selectedDoc && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-green-800 truncate">{selectedDoc.companyName}</p>
                <p className="text-xs text-green-600 font-mono">{selectedDoc.acid}</p>
              </div>
            </div>
          )}
        </div>

        {/* Tab type toggle (receipts / documents) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <p className="text-sm font-semibold text-slate-700">نوع المستند</p>
          <div className="flex gap-3">
            {[
              { id: 'receipts',  label: 'ايصالات',  icon: Receipt },
              { id: 'documents', label: 'مستندات',  icon: FolderOpen },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => { setTabType(id); setSelectedSlot(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border transition-all min-h-[48px]
                  ${tabType === id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-blue-300 hover:text-blue-600'}`}
              >
                <Icon size={16} />{label}
              </button>
            ))}
          </div>

          {/* Slot selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              الخانة <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <ChevronDown size={16} className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400 pointer-events-none" />
              <select
                value={selectedSlot?.key || ''}
                onChange={(e) => {
                  const def = slotDefs.find((d) => d.key === e.target.value);
                  setSelectedSlot(def || null);
                }}
                className="w-full appearance-none pr-4 pl-8 py-3 border border-slate-300 rounded-xl text-sm bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 min-h-[48px]"
              >
                <option value="">— اختر الخانة —</option>
                {(Array.isArray(slotDefs) ? slotDefs : []).map((def) => (
                  <option key={def.key} value={def.key}>{def.label}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedSlot && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200">
              <CheckCircle2 size={14} className="text-blue-600 flex-shrink-0" />
              <span className="text-xs font-medium text-blue-800">{selectedSlot.label}</span>
            </div>
          )}
        </div>

        {/* Upload button */}
        <button
          type="button"
          onClick={handleUpload}
          disabled={!canUpload || uploading}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-base bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-lg shadow-blue-600/25 disabled:opacity-40 disabled:cursor-not-allowed min-h-[56px]"
        >
          {uploading
            ? <><Loader2 size={20} className="animate-spin" />جاري الرفع…</>
            : <><Upload size={20} />رفع المستند</>
          }
        </button>

        {!canUpload && file && (
          <p className="text-center text-xs text-slate-400">
            {!selectedDoc ? 'ابحث عن الشحنة أولاً' : 'اختر الخانة المناسبة'}
          </p>
        )}
      </div>
    </div>
  );
}
