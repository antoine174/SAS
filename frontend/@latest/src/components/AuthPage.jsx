// src/components/AuthPage.jsx
import { useState } from 'react';
import { toast } from 'react-toastify';
import { ShieldCheck, Eye, EyeOff, Loader2, LogIn, UserPlus, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { isValidArabicFullName } from '../lib/validators';

const inputCls = `
  w-full bg-white border border-slate-300 text-slate-800 placeholder-slate-400
  rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500
  focus:ring-2 focus:ring-blue-500/20 transition-all text-right
`;

/** Password input with an Eye / EyeOff visibility toggle. */
function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-slate-600 mb-1 font-medium">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          dir="ltr"
          className={`${inputCls} text-left pl-10`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          className="absolute inset-y-0 left-2 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function AuthPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [submitting, setSubmitting] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const isSignup = mode === 'signup';
  const nameTouched = username.trim().length > 0;
  const nameValid = isValidArabicFullName(username);
  const confirmTouched = confirm.length > 0;
  const passwordsMatch = password === confirm;

  const canSubmit = isSignup
    ? nameValid && email.trim() && password.length >= 6 && passwordsMatch && !submitting
    : email.trim() && password && !submitting;

  const switchMode = (next) => {
    setMode(next);
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (isSignup) {
        await signup(username.trim(), email.trim(), password);
        toast.success('تم إنشاء الحساب بنجاح ✅');
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      toast.error(err?.data?.message || 'تعذّر الاتصال بالخادم');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 font-[Tajawal,sans-serif] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-3">
            <ShieldCheck size={28} className="text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">SAS</h1>
          <p className="text-sm text-slate-500">نظام التخليص الجمركي</p>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          {/* Mode toggle */}
          <div className="flex border-b border-slate-200 bg-slate-50/50">
            {[
              { id: 'login', label: 'تسجيل الدخول', icon: LogIn },
              { id: 'signup', label: 'إنشاء حساب', icon: UserPlus },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => switchMode(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-all relative
                  ${mode === id ? 'text-blue-600 bg-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'}`}
              >
                <Icon size={16} />
                {label}
                {mode === id && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600" />}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
            {isSignup && (
              <div>
                <label htmlFor="auth-username" className="block text-xs text-slate-600 mb-1 font-medium">
                  الاسم الثلاثي بالعربية
                </label>
                <input
                  id="auth-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="انطوان صبحي سليمان"
                  autoComplete="name"
                  className={`${inputCls} ${nameTouched ? (nameValid ? 'border-emerald-400' : 'border-red-400') : ''}`}
                />
                {nameTouched && (
                  <p className={`mt-1 text-xs flex items-center gap-1 ${nameValid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {nameValid ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {nameValid ? 'الاسم صحيح' : 'الاسم يجب أن يكون ثلاثي باللغة العربية (مثال: انطوان صبحي سليمان)'}
                  </p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs text-slate-600 mb-1 font-medium">البريد الإلكتروني</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                dir="ltr"
                className={`${inputCls} text-left`}
              />
            </div>

            <PasswordField
              id="auth-password"
              label="كلمة المرور"
              value={password}
              onChange={setPassword}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
            {isSignup && password.length > 0 && password.length < 6 && (
              <p className="-mt-2 text-xs text-red-600 flex items-center gap-1">
                <XCircle size={12} /> كلمة المرور يجب ألا تقل عن 6 أحرف
              </p>
            )}

            {isSignup && (
              <>
                <PasswordField
                  id="auth-confirm"
                  label="تأكيد كلمة المرور"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                />
                {confirmTouched && (
                  <p className={`-mt-2 text-xs flex items-center gap-1 ${passwordsMatch ? 'text-emerald-600' : 'text-red-600'}`}>
                    {passwordsMatch ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {passwordsMatch ? 'كلمتا المرور متطابقتان' : 'كلمتا المرور غير متطابقتين'}
                  </p>
                )}
              </>
            )}

            <button
              type="submit"
              id="btn-auth-submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-3 text-sm font-bold transition-all shadow-md shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? <Loader2 size={16} className="animate-spin" />
                : isSignup ? <UserPlus size={16} /> : <LogIn size={16} />}
              {isSignup ? 'إنشاء حساب' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
