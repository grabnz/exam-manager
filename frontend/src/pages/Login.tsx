import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth'
import {
  BookOpenIcon, SparklesIcon, ClockIcon, AwardIcon,
  EyeIcon, EyeOffIcon, CheckCircleIcon,
} from '../components/icons'

const FEATURES = [
  {
    Icon: SparklesIcon,
    title: 'إدخال سريع للأعداد',
    desc: 'حفظ تلقائي مع دعم العمل دون انترنت (PWA) على الحاسوب والهاتف',
  },
  {
    Icon: ClockIcon,
    title: 'جدول أوقات ذكي وعادل',
    desc: 'توزيع آلي يحترم النصاب القانوني لكل معلم دون تضارب في القاعات',
  },
  {
    Icon: AwardIcon,
    title: 'بطاقات أعداد وتقارير رسمية',
    desc: 'جدول جامع ثلاثي وتصدير فوري بصيغة PDF و Excel',
  },
]

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.auth.login(username.trim(), password)
      login(res.token, res.user)
      navigate(res.user.must_change_password ? '/change-password' : '/', { replace: true })
    } catch (err: any) {
      setError(err.message || 'تعذَّر تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex" dir="rtl">
      {/* ── Editorial Academic Brand Panel (Desktop right side in RTL) ── */}
      <aside className="hidden lg:flex lg:w-[48%] xl:w-[50%] bg-gradient-to-br from-brand via-brand to-brand-hover text-white p-12 xl:p-16 flex-col justify-between relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-white/[0.04] pointer-events-none" />
        <div className="absolute -left-28 -bottom-28 w-96 h-96 rounded-full bg-white/[0.04] pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur border border-white/15 flex items-center justify-center shadow-lg">
            <BookOpenIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="arabic text-4xl font-extrabold tracking-tight leading-tight">
              دفتر الأعداد الرقمي
            </h1>
            <p className="arabic text-base text-brand-mid mt-3 leading-relaxed max-w-md">
              منصة متكاملة لإدارة الأقسام، الأعداد، وجدول الأوقات للمدارس الابتدائية التونسية.
            </p>
          </div>

          <div className="space-y-3 pt-4 max-w-lg">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="flex items-center gap-4 bg-white/[0.08] border border-white/[0.14] rounded-2xl p-4 backdrop-blur-sm"
              >
                <span className="w-11 h-11 rounded-xl bg-white/15 text-accent-light flex items-center justify-center flex-shrink-0">
                  <f.Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="arabic text-sm font-bold text-white">{f.title}</p>
                  <p className="arabic text-xs text-brand-mid mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 arabic text-xs text-brand-mid/80">
          الجمهورية التونسية · وزارة التربية
        </p>
      </aside>

      {/* ── Login Form Column ── */}
      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          {/* Mobile brand mark */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-7">
            <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-brand-hover text-white flex items-center justify-center shadow-float">
              <BookOpenIcon className="w-6 h-6" />
            </span>
            <div>
              <h1 className="arabic text-xl font-extrabold text-ink leading-tight">دفتر الأعداد</h1>
              <p className="arabic text-xs text-ink-muted">المدرسة الابتدائية التونسية</p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-surface border border-line rounded-3xl p-8 md:p-9 shadow-float space-y-5"
          >
            <div>
              <h2 className="arabic text-2xl font-bold text-ink">تسجيل الدخول</h2>
              <p className="arabic text-xs text-ink-muted mt-1">أدخلوا اسم المستخدم وكلمة المرور للمتابعة</p>
            </div>

            {error && (
              <div className="arabic bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5">
                اسم المستخدم
              </label>
              <input
                type="text"
                dir="ltr"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="ex: salma.maiz"
                className="w-full bg-canvas/70 border border-line rounded-xl px-4 py-3 text-sm text-left focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition"
              />
            </div>

            <div>
              <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  dir="ltr"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full bg-canvas/70 border border-line rounded-xl pl-11 pr-4 py-3 text-sm text-left focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink transition p-1"
                >
                  {showPw ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="arabic w-full py-3 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-bold shadow-sm transition"
            >
              {loading ? 'جاري الدخول…' : 'دخول إلى المنصة'}
            </button>

            <div className="flex justify-center pt-1">
              <span className="arabic inline-flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full">
                <CheckCircleIcon className="w-3.5 h-3.5" />
                يعمل دون انترنت بعد الدخول
              </span>
            </div>

            <p className="arabic text-[11px] text-ink-subtle text-center leading-relaxed">
              الحسابات تُمنح من طرف إدارة المدرسة. في حال نسيان كلمة المرور، يُرجى الاتصال بالمدير.
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
