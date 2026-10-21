// src/components/FileUploadsSummary.jsx
/**
 * Expandable "who uploaded what" breakdown for a consignment card.
 * Click handling is isolated (stopPropagation) so it never opens the detail modal.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, FileCheck2, UserRound } from 'lucide-react';
import { listUploadedFiles, formatUploadDate } from '../lib/fileSlot';

export default function FileUploadsSummary({ doc }) {
  const [open, setOpen] = useState(false);
  const files = useMemo(() => listUploadedFiles(doc), [doc]);

  if (files.length === 0) return null;

  const groups = files.reduce((acc, f) => {
    (acc[f.tab] ||= { label: f.tabLabel, items: [] }).items.push(f);
    return acc;
  }, {});

  return (
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
                   bg-slate-50 border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-200
                   hover:text-blue-700 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <FileCheck2 size={13} />
          الملفات المرفوعة ({files.length})
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {Object.entries(groups).map(([tab, group]) => (
            <div key={tab}>
              <p className="px-3 py-1.5 text-[11px] font-bold text-slate-500 bg-slate-50">{group.label}</p>
              {group.items.map((f) => (
                <div key={`${tab}-${f.key}`} className="px-3 py-1.5 text-xs">
                  <p className="font-semibold text-slate-800 truncate">{f.label}</p>
                  <p className={`flex items-center gap-1 mt-0.5 ${f.known ? 'text-slate-600' : 'text-slate-400 italic'}`}>
                    <UserRound size={11} className="flex-shrink-0" />
                    <span className="truncate">{f.uploadedBy}</span>
                    {f.uploadedAt && (
                      <span className="text-slate-400 ms-auto flex-shrink-0 not-italic">{formatUploadDate(f.uploadedAt)}</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
