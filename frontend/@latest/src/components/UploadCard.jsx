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

export default function UploadCard({ label, url, isUploading, onUpload, onDelete, onRemove, isCustomMergeMode, isSelected, onToggleSelect }) {
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    // Reset so the same file can be re-uploaded if needed
    e.target.value = '';
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const uploaded = !!url;

  let borderClass = '';
  let bgClass     = '';
  let iconEl      = null;
  let statusBadge = null;

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

  // In custom merge mode: uploaded cards get a selection ring, empty cards dim out
  let modeOverride = {};
  if (isCustomMergeMode) {
    if (url && !isUploading) {
      // Selectable: teal ring when selected, dashed amber when not
      modeOverride = {
        borderClass: isSelected
          ? 'border-teal-400 shadow-teal-400/30'
          : 'border-amber-500/50 shadow-amber-500/10',
        bgClass: isSelected ? 'bg-teal-950/40' : 'bg-amber-950/10',
      };
    } else {
      // Empty in custom mode: fully dimmed
      modeOverride = {
        borderClass: 'border-slate-700/30',
        bgClass: 'bg-slate-900/20',
        dimmed: true,
      };
    }
    borderClass = modeOverride.borderClass ?? borderClass;
    bgClass     = modeOverride.bgClass     ?? bgClass;
  }

  // Click handler: in custom merge mode on an uploaded card → toggle selection
  const handleCardClick = () => {
    if (isCustomMergeMode) {
      if (url && !isUploading && onToggleSelect) onToggleSelect();
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
          ? (url && !isUploading ? 'cursor-pointer hover:scale-[1.02] hover:shadow-xl' : '')
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
      {isCustomMergeMode && url && !isUploading && (
        <div
          className={`
            absolute top-2 right-2 z-10
            w-6 h-6 rounded-md border-2 flex items-center justify-center
            transition-all duration-200
            ${isSelected
              ? 'bg-teal-500 border-teal-400 shadow-lg shadow-teal-500/40'
              : 'bg-slate-800 border-slate-500 hover:border-teal-400'
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
            bg-rose-500/20 border border-rose-500/40 text-rose-400
            hover:bg-rose-500/40 hover:text-rose-300
            transition-all duration-200
          "
        >
          <X size={12} />
        </button>
      )}

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

      {/* Action area — hidden during custom merge mode to prevent accidental uploads */}
      {!isCustomMergeMode && (
        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-white/5">
          {uploaded ? (
            <>
              {/* View link */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <ExternalLink size={12} />
                عرض الملف
              </a>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
                >
                  <UploadCloud size={12} />
                  استبدال
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="text-xs text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    حذف
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <UploadCloud size={14} />
              <span>انقر لرفع PDF</span>
            </div>
          )}
        </div>
      )}

      {/* In custom merge mode: show a minimal "tap to select" hint on uploaded cards */}
      {isCustomMergeMode && url && !isUploading && (
        <div className="mt-auto pt-2 border-t border-white/5 text-xs text-center font-medium transition-colors duration-200">
          {isSelected
            ? <span className="text-teal-400">✓ تم الاختيار</span>
            : <span className="text-amber-400/70">انقر للاختيار</span>
          }
        </div>
      )}
    </div>
  );
}

