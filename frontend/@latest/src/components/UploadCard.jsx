// src/components/UploadCard.jsx
/**
 * UploadCard
 *
 * Displays a single document slot in the upload grid.
 * Visual states:
 *   - uploaded   → green border + checkmark + "عرض" link
 *   - mandatory  → red/amber border + warning icon
 *   - optional   → slate border + "اختياري" badge
 *
 * Props:
 *   label       {string}   – Arabic display name
 *   mandatory   {boolean}
 *   url         {string|null} – uploaded file's public URL
 *   isUploading {boolean}  – show spinner while uploading
 *   onUpload    {function} – called with a File object
 */

import { useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  Loader2,
  ExternalLink,
  FileText,
} from 'lucide-react';

export default function UploadCard({ label, mandatory, url, isUploading, onUpload }) {
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    // Reset so the same file can be re-uploaded if needed
    e.target.value = '';
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const uploaded = !!url;

  let borderClass   = '';
  let bgClass       = '';
  let iconEl        = null;
  let statusBadge   = null;

  if (isUploading) {
    borderClass = 'border-sky-400 shadow-sky-400/20';
    bgClass     = 'bg-sky-950/30';
    iconEl      = <Loader2 size={28} className="text-sky-400 animate-spin" />;
    statusBadge = (
      <span className="text-xs font-medium text-sky-400 bg-sky-900/50 px-2 py-0.5 rounded-full">
        جارٍ الرفع…
      </span>
    );
  } else if (uploaded) {
    borderClass = 'border-emerald-500 shadow-emerald-500/20';
    bgClass     = 'bg-emerald-950/30';
    iconEl      = <CheckCircle2 size={28} className="text-emerald-400" />;
    statusBadge = (
      <span className="text-xs font-medium text-emerald-400 bg-emerald-900/50 px-2 py-0.5 rounded-full">
        تم الرفع ✓
      </span>
    );
  } else if (mandatory) {
    borderClass = 'border-rose-500/70 shadow-rose-500/10';
    bgClass     = 'bg-rose-950/20';
    iconEl      = <AlertCircle size={28} className="text-rose-400" />;
    statusBadge = (
      <span className="text-xs font-medium text-rose-400 bg-rose-900/50 px-2 py-0.5 rounded-full">
        إلزامي
      </span>
    );
  } else {
    borderClass = 'border-slate-600/60';
    bgClass     = 'bg-slate-800/40';
    iconEl      = <FileText size={28} className="text-slate-400" />;
    statusBadge = (
      <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full">
        اختياري
      </span>
    );
  }

  return (
    <div
      className={`
        relative flex flex-col gap-3 p-4 rounded-2xl border-2 transition-all duration-300
        shadow-lg ${borderClass} ${bgClass}
        ${!isUploading ? 'hover:scale-[1.02] hover:shadow-xl cursor-pointer' : ''}
      `}
      onClick={() => !isUploading && inputRef.current?.click()}
    >
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
        aria-label={`رفع ملف ${label}`}
      />

      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-slate-100 leading-snug line-clamp-2">
            {label}
          </p>
          <div className="mt-1.5">{statusBadge}</div>
        </div>
        <div className="flex-shrink-0 mt-0.5">{iconEl}</div>
      </div>

      {/* Action area */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-white/5">
        {uploaded ? (
          <>
            {/* View link – stops click from bubbling to re-upload */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="
                flex items-center gap-1.5 text-xs font-medium text-emerald-400
                hover:text-emerald-300 transition-colors
              "
            >
              <ExternalLink size={12} />
              عرض الملف
            </a>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="
                text-xs text-slate-400 hover:text-slate-200 transition-colors
                flex items-center gap-1
              "
            >
              <UploadCloud size={12} />
              استبدال
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <UploadCloud size={14} />
            <span>انقر لرفع PDF</span>
          </div>
        )}
      </div>
    </div>
  );
}
