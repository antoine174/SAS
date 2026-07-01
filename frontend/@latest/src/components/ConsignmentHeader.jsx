// src/components/ConsignmentHeader.jsx
/**
 * ConsignmentForm
 *
 * Collapsible card for creating a new consignment record.
 * Fields: companyName (dropdown, required), acid (required),
 *         invoiceSequenceNumber, consignmentNumber, itemName, count, supplierName.
 *
 * Props:
 *   onCreated {function} – called with no args after a successful POST
 */

import { useState } from 'react';
import { PlusCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-toastify';
import { fetchApi } from '../lib/api';

const COMPANIES = ['مصانع الترياق', 'شركة الزامل'];

const EMPTY_FORM = {
  companyName: COMPANIES[0],
  acid: '',
  invoiceSequenceNumber: '',
  consignmentNumber: '',
  itemName: '',
  count: '',
  supplierName: '',
};

export default function ConsignmentHeader({ onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const setField = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleCreate = async () => {
    if (!form.acid.trim()) {
      toast.warn('رقم ACID مطلوب');
      return;
    }
    setLoading(true);
    try {
      const data = await fetchApi('/api/consignments', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      // fetchApi returns parsed JSON; treat any response with a `message` but no `_id` as an error
      if (!data._id) {
        toast.error(data.message || 'حدث خطأ أثناء الإنشاء');
        return;
      }
      toast.success('تم إنشاء الشحنة بنجاح ✅');
      setForm(EMPTY_FORM);
      onCreated?.();
    } catch {
      toast.error('تعذّر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `
    w-full bg-slate-800/60 border border-slate-600 text-slate-100 placeholder-slate-500
    rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500
    focus:ring-1 focus:ring-emerald-500/40 transition-all text-right
  `;

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">

      {/* ── Toggle header ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-200 hover:bg-slate-800/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <PlusCircle size={16} className="text-emerald-400" />
          إضافة شحنة جديدة
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-slate-400" />
          : <ChevronDown size={16} className="text-slate-400" />
        }
      </button>

      {/* ── Collapsible form body ─────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-slate-700 px-5 pb-5 pt-4 space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* اسم الشركة – required enum */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                اسم الشركة <span className="text-rose-400">*</span>
              </label>
              <select
                id="form-companyName"
                value={form.companyName}
                onChange={setField('companyName')}
                className={inputCls}
              >
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* رقم الشحنة – required */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                رقم البوليصة <span className="text-rose-400">*</span>
              </label>
              <input
                id="form-consignmentNumber"
                type="text"
                placeholder="مثال: SHP-2024-001"
                value={form.consignmentNumber}
                onChange={setField('consignmentNumber')}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className={inputCls}
              />
            </div>

            {/* ACID – required */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                ACID <span className="text-rose-400">*</span>
              </label>
              <input
                id="form-acid"
                type="text"
                placeholder="رقم ACID"
                value={form.acid}
                onChange={setField('acid')}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className={inputCls}
              />
            </div>

            {/* رقم تسلسل الفاتورة */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">رقم تسلسل الفاتورة</label>
              <input
                id="form-invoiceSequenceNumber"
                type="text"
                placeholder="مثال: INV-001"
                value={form.invoiceSequenceNumber}
                onChange={setField('invoiceSequenceNumber')}
                className={inputCls}
              />
            </div>

            {/* اسم الصنف */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">اسم الصنف</label>
              <input
                id="form-itemName"
                type="text"
                placeholder="اسم البضاعة"
                value={form.itemName}
                onChange={setField('itemName')}
                className={inputCls}
              />
            </div>

            {/* العدد – LTR input because it contains numbers/operators */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                العدد
                <span className="ms-1 text-slate-500 font-normal">(مثال: 3X20+7*10)</span>
              </label>
              <input
                id="form-count"
                type="text"
                placeholder="3X20+7*10"
                value={form.count}
                onChange={setField('count')}
                className={`${inputCls} font-mono`}
                dir="ltr"
              />
            </div>

            {/* اسم المورد */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">اسم المورد</label>
              <input
                id="form-supplierName"
                type="text"
                placeholder="اسم المورد"
                value={form.supplierName}
                onChange={setField('supplierName')}
                className={inputCls}
              />
            </div>

          </div>

          {/* Submit */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              id="btn-create-consignment"
              onClick={handleCreate}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold
                         bg-emerald-600 hover:bg-emerald-500 text-white
                         transition-all disabled:opacity-50
                         shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-100"
            >
              <PlusCircle size={15} />
              {loading ? 'جارٍ الإنشاء…' : 'إضافة الشحنة'}
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
