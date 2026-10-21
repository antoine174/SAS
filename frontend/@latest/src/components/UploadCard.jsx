// src/components/UploadCard.jsx
/**
 * UploadCard
 *
 * Displays a single document slot in the upload grid.
 * Visual states:
 *   - uploaded   → green border + checkmark + "عرض" link
 *   - optional   → slate border + "اختياري" badge
 *   - uploading  → sky border + spinner
 *
 * Props:
 *   label       {string}        – Arabic display name
 *   url         {string|null}   – uploaded file's public URL
 *   isUploading {boolean}       – show spinner while uploading
 *   onUpload    {function}      – called with a File object
 *   onDelete    {function}      – called to delete the uploaded file from storage
 *   onRemove    {function|null} – if provided, shows a remove button (dynamic cards only)
 */

import { useRef } from 'react';
import {
  CheckCircle2,
  UploadCloud,
  Loader2,
  ExternalLink,
  FileText,
  X,
  Trash2,
} from 'lucide-react';

export default function UploadCard({ label, url, isUploading, onUpload, onDelete, onRemove, isCustomMergeMode, isSelected, onToggleSelect, uploadedBy, uploaderKnown = true, uploadedAt }) {
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    // Reset so the same file can be re-uploaded if needed
    e.target.value = '';
  };

  // Handle both string URLs and slot objects { url, uploadedBy, uploadedAt }
  const fileUrl = typeof url === 'object' && url !== null ? url.url : url;
  const fileUploadedBy = uploadedBy ?? (typeof url === 'object' && url !== null ? url.uploadedBy : null);
  const fileUploadedAt = uploadedAt ?? (typeof url === 'object' && url !== null ? url.uploadedAt : null);
  const fileUploaderKnown = uploaderKnown && fileUploadedBy !== 'مستخدم غير معروف';

  const uploaded = !!fileUrl;

  let borderClass = '';
  let bgClass     = '';
  let iconEl      = null;
  let statusBadge = null;

  if (isUploading) {
    borderClass = 'border-sky-400 shadow-sm shadow-sky-100';
    bgClass     = 'bg-sky-50';
    iconEl      = <Loader2 size={28} className="text-sky-500 animate-spin" />;
    statusBadge = (
      <span className="text-xs font-medium text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
        جارٍ الرفع…
      </span>
    );
  } else if (uploaded) {
    borderClass = 'border-blue-500 shadow-sm shadow-blue-100';
    bgClass     = 'bg-white';
    iconEl      = <CheckCircle2 size={28} className="text-blue-500" />;
    statusBadge = (
      <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
        تم الرفع ✓
      </span>
    );
  } else {
    borderClass = 'border-slate-200 shadow-sm';
    bgClass     = 'bg-white';
    iconEl      = <FileText size={28} className="text-slate-400" />;
    statusBadge = (
      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
        اختياري
      </span>
    );
  }

  // In custom merge mode: uploaded cards get a selection ring, empty cards dim out
  let modeOverride = {};
  if (isCustomMergeMode) {
    if (fileUrl && !isUploading) {
      // Selectable: blue ring when selected, dashed slate when not
      modeOverride = {
        borderClass: isSelected
          ? 'border-blue-500 shadow-md shadow-blue-500/20'
          : 'border-slate-300 border-dashed shadow-sm',
        bgClass: isSelected ? 'bg-blue-50/50' : 'bg-slate-50',
      };
    } else {
      // Empty in custom mode: fully dimmed
      modeOverride = {
        borderClass: 'border-slate-200',
        bgClass: 'bg-slate-50',
        dimmed: true,
      };
    }
    borderClass = modeOverride.borderClass ?? borderClass;
    bgClass     = modeOverride.bgClass     ?? bgClass;
  }

  // Click handler: in custom merge mode on an uploaded card → toggle selection
  const handleCardClick = () => {
    if (isCustomMergeMode) {
      if (fileUrl && !isUploading && onToggleSelect) onToggleSelect();
      return;
    }
    if (!isUploading) inputRef.current?.click();
  };


  return (
    <div
      className={`
        relative flex flex-col gap-3 p-4 rounded-2xl border-2 transition-all duration-300
        shadow-lg ${borderClass} ${bgClass}
        ${isCustomMergeMode
          ? (fileUrl && !isUploading ? 'cursor-pointer hover:scale-[1.02] hover:shadow-xl' : '')
          : (!isUploading ? 'hover:scale-[1.02] hover:shadow-xl cursor-pointer' : '')
        }
        ${modeOverride.dimmed ? 'opacity-30 pointer-events-none' : ''}
      `}
      onClick={handleCardClick}
    >
      {/* Hidden file input — inactive during custom merge mode */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
        aria-label={`رفع ملف ${label}`}
      />

      {/* ── Custom merge mode: checkbox overlay ─────────────────────────── */}
      {isCustomMergeMode && fileUrl && !isUploading && (
        <div
          className={`
            absolute top-2 right-2 z-10
            w-6 h-6 rounded-md border-2 flex items-center justify-center
            transition-all duration-200
            ${isSelected
              ? 'bg-blue-600 border-blue-600 shadow-md shadow-blue-600/30'
              : 'bg-white border-slate-300 hover:border-blue-400'
            }
          `}
        >
          {isSelected && (
            <svg viewBox="0 0 12 10" className="w-3.5 h-3 fill-none stroke-white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 5 4.5 8.5 11 1" />
            </svg>
          )}
        </div>
      )}

      {/* Remove button — only on dynamic cards (when onRemove is provided), hidden in custom merge mode */}
      {onRemove && !isCustomMergeMode && (
        <button
          type="button"
          title="حذف هذه البطاقة"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="
            absolute top-2 left-2 z-10
            w-6 h-6 flex items-center justify-center rounded-full
            bg-red-50 border border-red-200 text-red-500
            hover:bg-red-100 hover:text-red-600
            transition-all duration-200
          "
        >
          <X size={12} />
        </button>
      )}

      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-slate-800 leading-snug line-clamp-2">
            {label}
          </p>
          <div className="mt-1.5">{statusBadge}</div>
          {uploaded && !isUploading && fileUploadedBy && (
            <p
              className={`mt-1.5 text-[11px] leading-snug ${fileUploaderKnown ? 'text-slate-600' : 'text-slate-400 italic'}`}
              title={fileUploadedAt ? new Date(fileUploadedAt).toLocaleString('ar-EG') : undefined}
            >
              رفع بواسطة: <span className="font-semibold">{fileUploadedBy}</span>
            </p>
          )}
        </div>
        <div className="flex-shrink-0 mt-0.5">{iconEl}</div>
      </div>

      {/* Action area — hidden during custom merge mode to prevent accidental uploads */}
      {!isCustomMergeMode && (
        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-slate-100">
          {uploaded ? (
            <>
              {/* View link */}
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                <ExternalLink size={12} />
                عرض الملف
              </a>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  className="text-xs text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1"
                >
                  <UploadCloud size={12} />
                  استبدال
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="text-xs text-red-500 hover:text-red-600 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    حذف
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <UploadCloud size={14} />
              <span>انقر لرفع PDF</span>
            </div>
          )}
        </div>
      )}

      {/* In custom merge mode: show a minimal "tap to select" hint on uploaded cards */}
      {isCustomMergeMode && fileUrl && !isUploading && (
        <div className="mt-auto pt-2 border-t border-slate-200 text-xs text-center font-medium transition-colors duration-200">
          {isSelected
            ? <span className="text-blue-600">✓ تم الاختيار</span>
            : <span className="text-slate-400">انقر للاختيار</span>
          }
        </div>
      )}
    </div>
  );
}

