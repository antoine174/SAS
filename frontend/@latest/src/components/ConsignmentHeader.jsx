// src/components/ConsignmentHeader.jsx
/**
 * ConsignmentHeader
 *
 * Allows users to:
 *   1. Fill in Container Name, Bill ID, Company Name.
 *   2. Click "بحث" to look up an existing record.
 *   3. Click "إنشاء" to create a new record.
 *   4. When locked, shows read-only metadata and a "تغيير" button to unlock.
 *
 * Props:
 *   consignment  {object|null}  – current MongoDB document
 *   locked       {boolean}      – whether the form is locked
 *   onLock       {function}     – called with the consignment document
 *   onUnlock     {function}
 */

import { useState } from 'react';
import { Search, PlusCircle, Lock, Unlock, Container } from 'lucide-react';
import { toast } from 'react-toastify';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function ConsignmentHeader({ consignment, locked, onLock, onUnlock }) {
  const [containerName, setContainerName] = useState('');
  const [billId,        setBillId]        = useState('');
  const [companyName,   setCompanyName]   = useState('');
  const [loading,       setLoading]       = useState(false);

  // ── Search existing ────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!billId.trim() || !companyName.trim()) {
      toast.warn('يرجى إدخال رقم البوليصة واسم الشركة للبحث');
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch(
        `${API_URL}/api/consignments/search?billId=${encodeURIComponent(billId)}&companyName=${encodeURIComponent(companyName)}`
      );
      const data = await res.json();
      if (!res.ok) { toast.error(data.message); return; }
      toast.success('تم العثور على الشحنة بنجاح');
      onLock(data);
    } catch {
      toast.error('تعذّر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  // ── Create new ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!containerName.trim() || !billId.trim() || !companyName.trim()) {
      toast.warn('يرجى ملء جميع الحقول لإنشاء شحنة جديدة');
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/consignments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ containerName, billId, companyName }),
      });
      const data = await res.json();
      if (res.status === 409) {
        // Already exists → just lock onto it
        toast.info('تم العثور على شحنة موجودة بنفس البيانات');
        onLock(data.data);
        return;
      }
      if (!res.ok) { toast.error(data.message); return; }
      toast.success('تم إنشاء الشحنة بنجاح ✅');
      onLock(data);
    } catch {
      toast.error('تعذّر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  // ── Locked view ────────────────────────────────────────────────────────────
  if (locked && consignment) {
    return (
      <div className="bg-gradient-to-l from-slate-800 to-slate-800/60 border border-slate-700 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Container size={20} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">الكونتينر</p>
            <p className="font-bold text-slate-100 text-sm">{consignment.containerName}</p>
          </div>
        </div>

        <div className="h-px w-full sm:h-8 sm:w-px bg-slate-700" />

        <div className="flex-1 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">رقم البوليصة</p>
            <p className="font-bold text-emerald-300 text-sm">{consignment.billId}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">الشركة</p>
            <p className="font-bold text-slate-100 text-sm">{consignment.companyName}</p>
          </div>
        </div>

        {consignment.status === 'completed' && (
          <span className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full">
            مُسوَّى ✓
          </span>
        )}

        <button
          type="button"
          onClick={onUnlock}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors ms-auto"
        >
          <Unlock size={14} />
          تغيير
        </button>
      </div>
    );
  }

  // ── Unlocked form ──────────────────────────────────────────────────────────
  const inputClass = `
    w-full bg-slate-800/60 border border-slate-600 text-slate-100 placeholder-slate-500
    rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500
    focus:ring-1 focus:ring-emerald-500/40 transition-all text-right
  `;

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Lock size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300">بيانات الشحنة</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">اسم الكونتينر</label>
          <input
            type="text"
            placeholder="مثال: TCNU1234567"
            value={containerName}
            onChange={(e) => setContainerName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">رقم البوليصة</label>
          <input
            type="text"
            placeholder="مثال: BL-2024-00123"
            value={billId}
            onChange={(e) => setBillId(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">اسم الشركة</label>
          <input
            type="text"
            placeholder="مثال: شركة النيل للتجارة"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="
            flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
            bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600
            transition-all disabled:opacity-50
          "
        >
          <Search size={15} />
          بحث عن شحنة
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className="
            flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
            bg-emerald-600 hover:bg-emerald-500 text-white
            transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20
          "
        >
          <PlusCircle size={15} />
          إنشاء شحنة جديدة
        </button>
      </div>
    </div>
  );
}
