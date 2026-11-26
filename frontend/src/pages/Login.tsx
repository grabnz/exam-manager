import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { BookOpenIcon } from '../components/icons'

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
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-10" dir="rtl">
      <div className="w-full max-w-4xl bg-surface border border-line rounded-3xl shadow-float overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Branded Academic Panel */}
        <div className="bg-brand text-white p-8 md:p-10 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-accent/20 pointer-events-none" />

          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-6">
              <BookOpenIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="arabic text-3xl font-bold tracking-tight">دفتر الأعداد</h1>
            <p className="arabic text-sm text-white/80 mt-2 leading-relaxed">
              منظومة عصرية لإدارة التقييم بالمعايير، جداول الأوقات، وبطاقات الأعداد للمدارس الابتدائية التونسية.
            </p>
          </div>

          <div className="relative mt-10 space-y-2.5 text-xs text-white/80">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span className="arabic">إدخال سريع للأعداد مع حفظ تلقائي والعمل دون اتصال</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
              <span className="arabic">تصدير فوري إلى Excel وطباعة بطاقات الأعداد</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-300" />
              <span className="arabic">متابعة شاملة للأقسام والمواد للمدير والمعلمين</span>
            </div>
          </div>
        </div>

        {/* Form Panel */}
        <form onSubmit={handleSubmit} className="p-8 md:p-10 flex flex-col justify-center space-y-5">
          <div>
            <h2 className="arabic text-xl font-bold text-ink">تسجيل الدخول</h2>
            <p className="arabic text-xs text-ink-muted mt-1">أدخلوا بيانات حسابكم المدرسي للمتابعة</p>
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
              placeholder="ex: salma.m"
              className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-left focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition"
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
                className="w-full bg-canvas border border-line rounded-xl pl-12 pr-4 py-2.5 text-sm text-left focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="arabic absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle hover:text-ink"
              >
                {showPw ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="arabic w-full py-3 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition"
          >
            {loading ? 'جاري الدخول…' : 'دخول إلى الدفتر'}
          </button>

          <p className="arabic text-[11px] text-ink-subtle text-center leading-relaxed">
            الحسابات تُمنح من طرف إدارة المدرسة. في حال نسيان كلمة المرور، يُرجى الاتصال بالمدير.
          </p>
        </form>
      </div>
    </div>
  )
}
