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
    <div className="fixed inset-x-0 bottom-0 z-50 bg-slate-900/95 backdrop-blur border-t border-slate-700 p-4">
      <div className="max-w-xl mx-auto space-y-2">
        <p className="text-sm text-slate-300 text-center">{message}</p>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full animate-[progress_1.5s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}
