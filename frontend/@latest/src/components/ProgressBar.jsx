// src/components/ProgressBar.jsx
/**
 * Animated progress bar shown during merge operation.
 * Props:
 *   visible  {boolean}
 *   message  {string}
 */
export default function ProgressBar({ visible, message }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 backdrop-blur border-t border-slate-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="max-w-xl mx-auto space-y-2">
        <p className="text-sm text-slate-700 text-center font-medium">{message}</p>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-600 to-sky-400 rounded-full animate-[progress_1.5s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}
