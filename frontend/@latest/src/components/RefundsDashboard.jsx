// src/components/RefundsDashboard.jsx
/**
 * RefundsDashboard — Full-screen overlay showing all active refund records.
 *
 * Features per card:
 *   - Header: file number, company, badges for active refund marks
 *   - Body: refund amounts, VAT to-do checklist with PATCH /todo
 *   - Footer: recovery inputs + PATCH /recovery, Delete + password guard
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  X,
  Loader2,
  Save,
  Trash2,
  Plus,
  KeyRound,
  AlertTriangle,
  CheckSquare,
  Square,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { fetchApi } from '../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMPANY_COLOR = {
  'مصانع الترياق': 'blue',
  'شركة الزامل':   'sky',
};

const fmtNum = (n, currency = '') =>
  `${Number(n || 0).toLocaleString('ar-EG')}${currency ? ' ' + currency : ''}`;

// ─── Delete sub-component ─────────────────────────────────────────────────────
function DeleteSection({ recordId, onDeleted }) {
  const [pw,         setPw]         = useState('');
  const [open,       setOpen]       = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!pw.trim()) { toast.error('يرجى إدخال رمز التأكيد'); return; }
    setIsDeleting(true);
    try {
      await fetchApi(`/api/refunds/${recordId}`, {
        method: 'DELETE',
        body:   JSON.stringify({ password: pw }),
      });
      toast.success('تم حذف ملف الاسترداد ✅');
      onDeleted(recordId);
    } catch (err) {
      toast.error(err.message?.includes('401') ? 'رمز التأكيد غير صحيح ❌' : 'خطأ في الحذف');
    } finally {
      setIsDeleting(false);
      setPw('');
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold
                   bg-red-50 border border-red-200 text-red-600
                   hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
      >
        <Trash2 size={14} />
        تم الانتهاء من هذا الملف — احذفه
      </button>
    );
  }

  return (
    <div className="space-y-2 bg-red-50 border border-red-200 rounded-xl p-3">
      <p className="text-xs text-red-700 font-semibold flex items-center gap-1">
        <AlertTriangle size={13} /> أدخل رمز التأكيد لحذف هذا الملف نهائياً:
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleDelete()}
          placeholder="رمز الحذف…"
          className="flex-1 bg-white border border-red-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-red-400/20 text-right"
        />
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50"
        >
          {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          حذف
        </button>
        <button
          onClick={() => { setOpen(false); setPw(''); }}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs hover:bg-slate-50"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}

// ─── Single record card ───────────────────────────────────────────────────────
function RefundCard({ record, onDeleted }) {
  const [vatInput,       setVatInput]       = useState('');
  const [vatDocs,        setVatDocs]        = useState(record.vatDocs || []);
  const [recoveredEgp,   setRecoveredEgp]   = useState(record.recoveredEgp ?? 0);
  const [recoveredUsd,   setRecoveredUsd]   = useState(record.recoveredUsd ?? 0);
  const [isSavingRec,    setIsSavingRec]    = useState(false);
  const [isAddingTodo,   setIsAddingTodo]   = useState(false);

  const accent = COMPANY_COLOR[record.companyName] ?? 'slate';

  // ── VAT to-do: add item ────────────────────────────────────────────────────
  const handleAddTodo = async () => {
    if (!vatInput.trim()) return;
    setIsAddingTodo(true);
    try {
      const updated = await fetchApi(`/api/refunds/${record._id}/todo`, {
        method: 'PATCH',
        body:   JSON.stringify({ action: 'push', name: vatInput.trim() }),
      });
      setVatDocs(updated.vatDocs || []);
      setVatInput('');
    } catch {
      toast.error('خطأ في إضافة العنصر');
    } finally {
      setIsAddingTodo(false);
    }
  };

  // ── VAT to-do: toggle ─────────────────────────────────────────────────────
  const handleToggle = async (itemId) => {
    // Optimistic UI
    setVatDocs((prev) =>
      prev.map((v) => v.id === itemId ? { ...v, isChecked: !v.isChecked } : v),
    );
    try {
      const updated = await fetchApi(`/api/refunds/${record._id}/todo`, {
        method: 'PATCH',
        body:   JSON.stringify({ action: 'toggle', itemId }),
      });
      setVatDocs(updated.vatDocs || []);
    } catch {
      // Revert optimistic update on error
      setVatDocs((prev) =>
        prev.map((v) => v.id === itemId ? { ...v, isChecked: !v.isChecked } : v),
      );
      toast.error('خطأ في التحديث');
    }
  };

  // ── Recovery save ──────────────────────────────────────────────────────────
  const handleSaveRecovery = async () => {
    setIsSavingRec(true);
    try {
      await fetchApi(`/api/refunds/${record._id}/recovery`, {
        method: 'PATCH',
        body:   JSON.stringify({ recoveredEgp, recoveredUsd }),
      });
      toast.success('تم حفظ مبالغ الاسترداد ✅');
    } catch {
      toast.error('خطأ في الحفظ');
    } finally {
      setIsSavingRec(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">

      {/* ── Card header ──────────────────────────────────────────────────────── */}
      <div className={`bg-${accent}-50 border-b border-slate-200 px-4 py-3 space-y-2`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-${accent}-100 text-${accent}-800 border border-${accent}-200`}>
              {record.companyName || '—'}
            </span>
            {record.fileNumber && (
              <span className="text-xs font-mono text-slate-600 font-semibold">
                ملف #{record.fileNumber}
              </span>
            )}
          </div>
          {/* Active refund mark badges */}
          <div className="flex flex-wrap gap-1">
            {record.hasFineRefund  && <Badge color="amber">يوجد استرداد غرامة</Badge>}
            {record.hasGuardRefund && <Badge color="blue">يوجد استرداد حراسة</Badge>}
            {record.hasVatRefund   && <Badge color="violet">يوجد استرداد ق.م.</Badge>}
          </div>
        </div>

        {/* Secondary info */}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
          {record.supplierName      && <span>المورد: <strong className="text-slate-700">{record.supplierName}</strong></span>}
          {record.certificateNumber && <span>ش: <strong className="text-slate-700 font-mono">{record.certificateNumber}</strong></span>}
          {record.arrivalPort       && <span>ميناء: <strong className="text-slate-700">{record.arrivalPort}</strong></span>}
        </div>
      </div>

      {/* ── Card body ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 space-y-3 flex-1">

        {/* Fine refund amount */}
        {record.hasFineRefund && (
          <AmountRow
            label="استرداد غرامة"
            amount={record.fineRefundAmount}
            currency={record.fineCurrency}
            color="amber"
          />
        )}

        {/* Guard refund amount */}
        {record.hasGuardRefund && (
          <AmountRow
            label="استرداد حراسة"
            amount={record.guardRefundAmount}
            currency={record.guardCurrency}
            color="blue"
          />
        )}

        {/* VAT to-do checklist */}
        {record.hasVatRefund && (
          <div className="space-y-2 border border-violet-100 bg-violet-50 rounded-xl p-3">
            <p className="text-xs font-bold text-violet-700">مستندات القيمة المضافة</p>

            {/* Add item */}
            <div className="flex gap-2">
              <input
                type="text"
                value={vatInput}
                onChange={(e) => setVatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                placeholder="أضف عنصراً (مثال: ك13)…"
                className="flex-1 bg-white border border-violet-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/20 text-right"
              />
              <button
                type="button"
                onClick={handleAddTodo}
                disabled={isAddingTodo || !vatInput.trim()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {isAddingTodo ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              </button>
            </div>

            {/* Checklist items */}
            {vatDocs.length === 0 && (
              <p className="text-xs text-violet-400 text-center py-1">لا توجد عناصر بعد</p>
            )}
            <ul className="space-y-1">
              {vatDocs.map((item) => (
                <li
                  key={item.id}
                  onClick={() => handleToggle(item.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm select-none
                    ${item.isChecked
                      ? 'bg-emerald-50 text-emerald-800 line-through'
                      : 'bg-white text-slate-700 hover:bg-violet-100'
                    }`}
                >
                  {item.isChecked
                    ? <CheckSquare size={15} className="text-emerald-500 flex-shrink-0" />
                    : <Square      size={15} className="text-slate-400 flex-shrink-0" />
                  }
                  {item.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* No active refunds fallback */}
        {!record.hasFineRefund && !record.hasGuardRefund && !record.hasVatRefund && (
          <p className="text-xs text-slate-400 text-center py-2">لا توجد استردادات نشطة</p>
        )}
      </div>

      {/* ── Card footer ──────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 px-4 py-3 space-y-3">

        {/* Recovery inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">تم استرداده (ج.م.)</label>
            <input
              type="number" min={0} step={0.01}
              value={recoveredEgp}
              onChange={(e) => setRecoveredEgp(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">تم استرداده ($)</label>
            <input
              type="number" min={0} step={0.01}
              value={recoveredUsd}
              onChange={(e) => setRecoveredUsd(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-500"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveRecovery}
          disabled={isSavingRec}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold
                     bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-all
                     shadow-sm shadow-blue-600/20"
        >
          {isSavingRec ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          حفظ مبالغ الاسترداد
        </button>

        <DeleteSection recordId={record._id} onDeleted={onDeleted} />
      </div>
    </div>
  );
}

// ─── Tiny sub-components ──────────────────────────────────────────────────────
function Badge({ children, color }) {
  const cls = {
    amber:  'bg-amber-100 text-amber-800 border-amber-200',
    blue:   'bg-blue-100 text-blue-800 border-blue-200',
    violet: 'bg-violet-100 text-violet-800 border-violet-200',
    emerald:'bg-emerald-100 text-emerald-800 border-emerald-200',
  }[color] || 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}

function AmountRow({ label, amount, currency, color }) {
  const cls = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue:  'bg-blue-50 border-blue-200 text-blue-800',
  }[color] || 'bg-slate-50 border-slate-200 text-slate-700';
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${cls}`}>
      <span className="font-medium">{label}</span>
      <span className="font-bold font-mono">{fmtNum(amount, currency)}</span>
    </div>
  );
}

// ─── Main Dashboard Component ─────────────────────────────────────────────────
export default function RefundsDashboard({ onClose }) {
  const [records,     setRecords]     = useState([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadRecords = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const data = await fetchApi('/api/refunds');
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      toast.error('تعذّر تحميل ملفات الاسترداد');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleDeleted = useCallback((id) => {
    setRecords((prev) => prev.filter((r) => r._id !== id));
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto" dir="rtl">

      {/* ── Dashboard header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
              <BarChart3 size={18} className="text-red-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 leading-none">لوحة الاستردادات</p>
              <p className="text-xs text-slate-500 leading-tight">
                {isLoading ? 'جارٍ التحميل…' : `${records.length} ملف نشط`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadRecords(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                         border border-slate-300 bg-white text-slate-600
                         hover:bg-slate-50 hover:text-slate-800 transition-all
                         disabled:opacity-40"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              تحديث
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold
                         bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
            >
              <X size={15} />
              إغلاق
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <BarChart3 size={28} className="text-slate-400" />
            </div>
            <div>
              <p className="text-slate-700 font-semibold">لا توجد ملفات استرداد نشطة</p>
              <p className="text-slate-500 text-sm mt-1">
                افتح سجل الشحنة واضغط على تبويب "حاسبات" لإضافة ملف استرداد
              </p>
            </div>
          </div>
        )}

        {/* Record cards grid */}
        {!isLoading && records.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {records.map((rec) => (
              <RefundCard key={rec._id} record={rec} onDeleted={handleDeleted} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
