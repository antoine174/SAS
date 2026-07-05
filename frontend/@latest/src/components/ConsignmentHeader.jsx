// src/components/ConsignmentHeader.jsx
/**
 * ConsignmentForm
 *
 * Collapsible card for creating a new consignment record.
 * Fields: companyName (dropdown, required), acid (required),
 *         invoiceSequenceNumber, consignmentNumber, itemName, count, supplierName,
 *         certificateNumber, arrivalPort, fileNumber.
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
  companyName:           COMPANIES[0],
  acid:                  '',
  invoiceSequenceNumber: '',
  consignmentNumber:     '',
  itemName:              '',
  count:                 '',
  supplierName:          '',
  certificateNumber:     '',
  arrivalPort:           '',
  fileNumber:            '',
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
    w-full bg-white border border-slate-300 text-slate-800 placeholder-slate-400
    rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500
    focus:ring-2 focus:ring-blue-500/20 transition-all text-right
  `;

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">

      {/* ── Toggle header ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <PlusCircle size={16} className="text-blue-600" />
          إضافة شحنة جديدة
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-slate-400" />
          : <ChevronDown size={16} className="text-slate-400" />
        }
      </button>

      {/* ── Collapsible form body ─────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-slate-200 px-5 pb-5 pt-4 space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* اسم الشركة – required enum */}
            <div>
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">
                اسم الشركة <span className="text-red-500">*</span>
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
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">
                رقم البوليصة <span className="text-red-500">*</span>
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
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">
                ACID <span className="text-red-500">*</span>
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
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">رقم تسلسل الفاتورة</label>
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
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">اسم الصنف</label>
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
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">
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
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">اسم المورد</label>
              <input
                id="form-supplierName"
                type="text"
                placeholder="اسم المورد"
                value={form.supplierName}
                onChange={setField('supplierName')}
                className={inputCls}
              />
            </div>

            {/* رقم الشهاده */}
            <div>
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">رقم الشهاده</label>
              <input
                id="form-certificateNumber"
                type="text"
                placeholder="رقم الشهادة"
                value={form.certificateNumber}
                onChange={setField('certificateNumber')}
                className={inputCls}
              />
            </div>

            {/* ميناء الوصول */}
            <div>
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">ميناء الوصول</label>
              <input
                id="form-arrivalPort"
                type="text"
                placeholder="اسم الميناء"
                value={form.arrivalPort}
                onChange={setField('arrivalPort')}
                className={inputCls}
              />
            </div>

            {/* رقم الملف */}
            <div>
              <label className="block text-xs text-slate-700 mb-1.5 font-medium">رقم الملف</label>
              <input
                id="form-fileNumber"
                type="text"
                placeholder="رقم الملف"
                value={form.fileNumber}
                onChange={setField('fileNumber')}
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
                         bg-blue-600 hover:bg-blue-700 text-white
                         transition-all disabled:opacity-50
                         shadow-md shadow-blue-600/20 hover:scale-105 active:scale-100"
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
