// src/components/RefundTab.jsx
/**
 * RefundTab — "حاسبات الاسترداد" tab inside the ConsignmentDetailModal.
 *
 * DATA FLOW:
 *   1. On mount, tries GET /api/refunds?originalConsignmentId=<id> to pre-fill.
 *   2. User fills the form → real-time date-math computations update derived state.
 *   3. On save, POSTs the full payload (form + copied survival fields + computed values).
 *
 * DATE MATH — TRAP PREVENTION:
 *   All date comparisons are performed on midnight-normalised timestamps to
 *   eliminate timezone / DST off-by-one errors.
 */

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import {
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Calculator,
  DollarSign,
  CalendarDays,
  Container,
  BadgeCheck,
} from 'lucide-react';
import { fetchApi } from '../lib/api';

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Strip time component — sets to local midnight to eliminate TZ offset bugs. */
const toMidnight = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Returns positive whole-day difference OR null if either date is missing. */
const daysBetween = (fromStr, toStr) => {
  const from = toMidnight(fromStr);
  const to   = toMidnight(toStr);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
};

/**
 * Safe date formatter for <input type="date">.
 * Handles both ISO strings ("2024-01-15T00:00:00Z") and already-formatted
 * "YYYY-MM-DD" strings without TZ drift.
 * Returns '' for any falsy / invalid input — never throws.
 */
const formatDateForInput = (val) => {
  if (!val) return '';
  // If already in YYYY-MM-DD format, return it directly (no Date conversion)
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    // Use UTC parts to avoid local-timezone day-shift
    const y  = d.getUTCFullYear();
    const m  = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dy}`;
  } catch {
    return '';
  }
};

// Keep toInputDate as an alias for backward compat with date-math helpers
const toInputDate = formatDateForInput;

// ─── Shared input/label styles ────────────────────────────────────────────────
const inputCls =
  'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 ' +
  'outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

// ─── Safe defaults (used for initial state AND pre-fill fallbacks) ────────────
const SAFE_DEFAULTS = {
  releaseDate:    '',
  containerCount: '',
  finePaidUntil:  '',
  guardPaidUntil: '',
  fineDailyRate:  '',
  fineCurrency:   'USD',
  guardDailyRate: '',
  guardCurrency:  'EGP',
  isFreeZone:     false,
  vatPaid:        false,
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function RefundTab({ detailDoc }) {
  const consignmentId = detailDoc?._id;

  // ── Form state — always initialised to safe string/boolean defaults ──────────
  const [form, setForm] = useState({ ...SAFE_DEFAULTS });

  const [isSaving,  setIsSaving]  = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ── Pre-fill from backend on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!consignmentId) { setIsLoading(false); return; }
    (async () => {
      try {
        const all = await fetchApi('/api/refunds');
        const existing = Array.isArray(all)
          ? all.find((r) => r.originalConsignmentId === consignmentId)
          : null;
        if (existing) {
          setForm({
            // formatDateForInput safely handles ISO dates, YYYY-MM-DD, or null
            releaseDate:    formatDateForInput(existing.releaseDate),
            containerCount: existing.containerCount != null ? String(existing.containerCount) : '',
            finePaidUntil:  formatDateForInput(existing.finePaidUntil),
            guardPaidUntil: formatDateForInput(existing.guardPaidUntil),
            // Use || instead of ?? so that null (not just undefined) gets the default
            fineDailyRate:  existing.fineDailyRate  != null ? String(existing.fineDailyRate)  : '',
            fineCurrency:   existing.fineCurrency   || SAFE_DEFAULTS.fineCurrency,
            guardDailyRate: existing.guardDailyRate != null ? String(existing.guardDailyRate) : '',
            guardCurrency:  existing.guardCurrency  || SAFE_DEFAULTS.guardCurrency,
            isFreeZone:     !!existing.isFreeZone,
            vatPaid:        !!existing.vatPaid,
          });
        }
      } catch {
        // Non-fatal — user can still fill form fresh
      } finally {
        setIsLoading(false);
      }
    })();
  }, [consignmentId]);

  // ── Field update helper ──────────────────────────────────────────────────────
  const set = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      // If isFreeZone is turned off, reset vatPaid
      if (key === 'isFreeZone' && !val) next.vatPaid = false;
      return next;
    });
  };

  // ── Date math (derived, memoised) ────────────────────────────────────────────
  const fineDays  = useMemo(() => daysBetween(form.releaseDate, form.finePaidUntil),  [form.releaseDate, form.finePaidUntil]);
  const guardDays = useMemo(() => daysBetween(form.releaseDate, form.guardPaidUntil), [form.releaseDate, form.guardPaidUntil]);

  const fineError  = fineDays  !== null && fineDays  < 0;
  const guardError = guardDays !== null && guardDays < 0;
  const hasDateError = fineError || guardError;

  const hasFineRefund  = fineDays  !== null && fineDays  > 0;
  const hasGuardRefund = guardDays !== null && guardDays > 0;
  const hasVatRefund   = form.isFreeZone && form.vatPaid;

  const fineRefundAmount  = hasFineRefund  ? fineDays  * Number(form.fineDailyRate)  * Number(form.containerCount) : 0;
  const guardRefundAmount = hasGuardRefund ? guardDays * Number(form.guardDailyRate) * Number(form.containerCount) : 0;

  const anyRefund = hasFineRefund || hasGuardRefund || hasVatRefund;
  const canSave   = !hasDateError && anyRefund && !isSaving;

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await fetchApi('/api/refunds', {
        method: 'POST',
        body: JSON.stringify({
          // Survival fields — physically copied
          originalConsignmentId: consignmentId,
          fileNumber:        detailDoc.fileNumber        || '',
          companyName:       detailDoc.companyName       || '',
          certificateNumber: detailDoc.certificateNumber || '',
          arrivalPort:       detailDoc.arrivalPort       || '',
          supplierName:      detailDoc.supplierName      || '',
          // Form inputs
          ...form,
          containerCount: Number(form.containerCount),
          fineDailyRate:  Number(form.fineDailyRate),
          guardDailyRate: Number(form.guardDailyRate),
          // Computed
          hasFineRefund,
          hasGuardRefund,
          hasVatRefund,
          fineRefundAmount,
          guardRefundAmount,
        }),
      });
      toast.success('✅ تم حفظ حاسبة الاسترداد بنجاح');
    } catch {
      toast.error('خطأ في حفظ بيانات الاسترداد');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-blue-500" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Date Error Banner ────────────────────────────────────────────────── */}
      {hasDateError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800 leading-relaxed">
            <strong>خطأ في التاريخ:</strong> تاريخ الصرف لا يمكن أن يكون بعد تاريخ الدفع.
            {fineError  && <div>· <span className="font-mono">غرامة:</span> تاريخ الصرف &gt; آخر يوم مدفوع</div>}
            {guardError && <div>· <span className="font-mono">حراسة:</span> تاريخ الصرف &gt; آخر يوم مدفوع</div>}
          </div>
        </div>
      )}

      {/* ── Section 1: Basic Setup ───────────────────────────────────────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <CalendarDays size={13} /> بيانات الصرف
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">

          {/* Release date */}
          <div>
            <label className={labelCls}>تاريخ الصرف</label>
            <input
              type="date"
              value={formatDateForInput(form.releaseDate)}
              onChange={set('releaseDate')}
              className={inputCls}
            />
          </div>

          {/* Container count */}
          <div>
            <label className={labelCls}>
              <span className="flex items-center gap-1"><Container size={11} /> عدد الحاويات</span>
            </label>
            <input
              type="number" min={1}
              value={form.containerCount || ''}
              onChange={set('containerCount')}
              className={inputCls}
            />
          </div>

          {/* Free zone toggle */}
          <div className="flex items-center gap-3 pt-5">
            <input
              id="isFreeZone"
              type="checkbox"
              checked={!!form.isFreeZone}
              onChange={set('isFreeZone')}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <label htmlFor="isFreeZone" className="text-sm font-medium text-slate-700 cursor-pointer">
              مناطق حرة
            </label>
          </div>

          {/* VAT paid — only visible when isFreeZone is true */}
          {!!form.isFreeZone && (
            <div className="flex items-center gap-3 pt-1">
              <input
                id="vatPaid"
                type="checkbox"
                checked={!!form.vatPaid}
                onChange={set('vatPaid')}
                className="w-4 h-4 rounded accent-emerald-600"
              />
              <label htmlFor="vatPaid" className="text-sm font-medium text-slate-700 cursor-pointer">
                تم دفع قيمة مضافة
              </label>
            </div>
          )}

        </div>
      </div>

      {/* ── Section 2: Fine (غرامة) ──────────────────────────────────────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <DollarSign size={13} /> غرامة التأخير
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">

          <div>
            <label className={labelCls}>آخر يوم مدفوع (غرامة)</label>
            <input
              type="date"
              value={formatDateForInput(form.finePaidUntil)}
              onChange={set('finePaidUntil')}
              className={`${inputCls} ${fineError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            />
          </div>

          <div>
            <label className={labelCls}>سعر اليوم / حاوية</label>
            <input
              type="number" min={0} step={0.01}
              value={form.fineDailyRate || ''}
              onChange={set('fineDailyRate')}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>عملة الغرامة</label>
            <select
              value={form.fineCurrency || 'USD'}
              onChange={set('fineCurrency')}
              className={inputCls}
            >
              <option value="USD">USD 🇺🇸</option>
              <option value="EGP">EGP 🇪🇬</option>
            </select>
          </div>

        </div>

        {/* Fine result chip */}
        {fineDays !== null && !fineError && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border ${
            hasFineRefund
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-slate-100 border-slate-200 text-slate-600'
          }`}>
            {hasFineRefund ? <CheckCircle2 size={14} /> : <Calculator size={14} />}
            {hasFineRefund
              ? `استرداد غرامة: ${Number(fineRefundAmount || 0).toLocaleString('ar-EG')} ${form.fineCurrency || 'USD'} (${fineDays} يوم × ${form.fineDailyRate || 0} × ${form.containerCount || 0} حاوية)`
              : 'لا يوجد استرداد غرامة (الأيام = 0)'
            }
          </div>
        )}
      </div>

      {/* ── Section 3: Guard (حراسة) ─────────────────────────────────────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <DollarSign size={13} /> رسوم الحراسة
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">

          <div>
            <label className={labelCls}>آخر يوم مدفوع (حراسة)</label>
            <input
              type="date"
              value={formatDateForInput(form.guardPaidUntil)}
              onChange={set('guardPaidUntil')}
              className={`${inputCls} ${guardError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            />
          </div>

          <div>
            <label className={labelCls}>سعر اليوم / حاوية</label>
            <input
              type="number" min={0} step={0.01}
              value={form.guardDailyRate || ''}
              onChange={set('guardDailyRate')}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>عملة الحراسة</label>
            <select
              value={form.guardCurrency || 'EGP'}
              onChange={set('guardCurrency')}
              className={inputCls}
            >
              <option value="EGP">EGP 🇪🇬</option>
              <option value="USD">USD 🇺🇸</option>
            </select>
          </div>

        </div>

        {/* Guard result chip */}
        {guardDays !== null && !guardError && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border ${
            hasGuardRefund
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-slate-100 border-slate-200 text-slate-600'
          }`}>
            {hasGuardRefund ? <CheckCircle2 size={14} /> : <Calculator size={14} />}
            {hasGuardRefund
              ? `استرداد حراسة: ${Number(guardRefundAmount || 0).toLocaleString('ar-EG')} ${form.guardCurrency || 'EGP'} (${guardDays} يوم × ${form.guardDailyRate || 0} × ${form.containerCount || 0} حاوية)`
              : 'لا يوجد استرداد حراسة (الأيام = 0)'
            }
          </div>
        )}
      </div>

      {/* ── VAT refund indicator ─────────────────────────────────────────────── */}
      {hasVatRefund && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 text-sm font-semibold">
          <BadgeCheck size={16} />
          يوجد استرداد قيمة مضافة — راجع قائمة المستندات في لوحة الاستردادات
        </div>
      )}

      {/* ── No refund notice ─────────────────────────────────────────────────── */}
      {!anyRefund && !hasDateError && form.releaseDate && (
        <div className="text-center py-4 text-slate-400 text-sm">
          لا يوجد استرداد بناءً على البيانات المدخلة حتى الآن.
        </div>
      )}

      {/* ── Save button ──────────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          title={hasDateError ? 'يوجد خطأ في التاريخ' : !anyRefund ? 'لا يوجد استرداد لحفظه' : ''}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold
                     bg-blue-600 hover:bg-blue-700 text-white
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all shadow-md shadow-blue-600/20"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          حفظ في لوحة الاستردادات
        </button>
      </div>

    </div>
  );
}
