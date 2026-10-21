// src/components/UsersManagement.jsx
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Users, KeyRound, ShieldCheck, ShieldOff, Eye, EyeOff, Loader2, Save, X } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

const SEED_ADMIN_EMAIL = 'sobhyantoine@gmail.com';

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

export default function UsersManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // Inline password editor state
  const [editingId, setEditingId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await fetchApi('/api/users'));
    } catch (err) {
      toast.error(err?.data?.message || 'تعذّر تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openPasswordEditor = (id) => {
    setEditingId(id);
    setNewPassword('');
    setShowPw(false);
  };

  const savePassword = async (id) => {
    if (!newPassword.trim()) {
      toast.warning('أدخل كلمة المرور الجديدة');
      return;
    }
    setBusyId(id);
    try {
      const res = await fetchApi(`/api/users/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ newPassword }),
      });
      toast.success(res?.message || 'تم تغيير كلمة المرور بنجاح');
      setEditingId(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err?.data?.message || 'فشل تغيير كلمة المرور');
    } finally {
      setBusyId(null);
    }
  };

  const toggleRole = async (u) => {
    const nextRole = u.role === 'admin' ? 'user' : 'admin';
    setBusyId(u._id);
    try {
      const updated = await fetchApi(`/api/users/${u._id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...x, role: updated.role } : x)));
      toast.success(nextRole === 'admin' ? 'تمت الترقية إلى مدير' : 'تم إلغاء صلاحية المدير');
    } catch (err) {
      toast.error(err?.data?.message || 'فشل تعديل الصلاحية');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users size={22} className="text-blue-600" /> إدارة المستخدمين
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">عرض المستخدمين وإدارة كلمات المرور والصلاحيات</p>
        </div>
        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
          {users.length} مستخدم
        </span>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-16">لا يوجد مستخدمون</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs">
                <tr>
                  <th className="text-right font-semibold px-4 py-3">الاسم</th>
                  <th className="text-right font-semibold px-4 py-3">البريد الإلكتروني</th>
                  <th className="text-right font-semibold px-4 py-3">الصلاحية</th>
                  <th className="text-right font-semibold px-4 py-3">تاريخ التسجيل</th>
                  <th className="text-right font-semibold px-4 py-3">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isAdmin = u.role === 'admin';
                  const isSeed = u.email === SEED_ADMIN_EMAIL;
                  const busy = busyId === u._id;
                  const editing = editingId === u._id;
                  return (
                    <tr key={u._id} className="align-top hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {u.username}
                        {me?._id === u._id && <span className="ms-2 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">أنت</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs" dir="ltr">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border
                          ${isAdmin ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {isAdmin ? 'مدير النظام' : 'مستخدم'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        {editing ? (
                          <div className="flex items-center gap-2 min-w-72">
                            <div className="relative flex-1">
                              <input
                                type={showPw ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="كلمة المرور الجديدة"
                                dir="ltr"
                                autoFocus
                                className="w-full bg-white border border-slate-300 rounded-lg ps-3 pe-9 py-1.5 text-xs text-left focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setShowPw((v) => !v)}
                                aria-label={showPw ? 'إخفاء' : 'إظهار'}
                                className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600"
                              >
                                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => savePassword(u._id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                            >
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} حفظ
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              aria-label="إلغاء"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openPasswordEditor(u._id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <KeyRound size={12} /> تغيير كلمة المرور
                            </button>
                            <button
                              type="button"
                              disabled={busy || (isSeed && isAdmin)}
                              onClick={() => toggleRole(u)}
                              title={isSeed && isAdmin ? 'لا يمكن إلغاء صلاحية المدير الأساسي' : undefined}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                                ${isAdmin
                                  ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                                  : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'}`}
                            >
                              {busy
                                ? <Loader2 size={12} className="animate-spin" />
                                : isAdmin ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                              {isAdmin ? 'إلغاء صلاحية المدير' : 'ترقية لمدير'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
