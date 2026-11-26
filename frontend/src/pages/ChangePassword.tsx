import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { KeyIcon } from '../components/icons'

export default function ChangePassword() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  const forced = !!user?.must_change_password

  const [current, setCurrent] = useState('')
  const [pw1,     setPw1]     = useState('')
  const [pw2,     setPw2]     = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pw1.length < 6) { setError('كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل'); return }
    if (pw1 !== pw2)    { setError('كلمتا المرور غير متطابقتين'); return }
    setLoading(true)
    try {
      const res = await api.auth.changePassword(current, pw1)
      updateUser(res.user)
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err.message || 'تعذَّر تغيير كلمة المرور')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-brand to-brand-hover text-white flex items-center justify-center shadow-float">
            <KeyIcon className="w-6 h-6" />
          </div>
          <h1 className="arabic text-2xl font-bold text-ink">تغيير كلمة المرور</h1>
          {forced && (
            <p className="arabic text-sm text-amber-700 mt-2">
              يجب تغيير كلمة المرور المؤقتة قبل المواصلة.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-3xl p-6 space-y-4 shadow-card">
          {error && (
            <div className="arabic bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-xl text-sm text-right">
              {error}
            </div>
          )}

          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5 text-right">
              كلمة المرور الحالية
            </label>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
                   autoComplete="current-password" autoFocus dir="ltr"
                   className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition" />
          </div>

          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5 text-right">
              كلمة المرور الجديدة
            </label>
            <input type="password" value={pw1} onChange={e => setPw1(e.target.value)}
                   autoComplete="new-password" dir="ltr"
                   className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition" />
          </div>

          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5 text-right">
              تأكيد كلمة المرور الجديدة
            </label>
            <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                   autoComplete="new-password" dir="ltr"
                   className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition" />
          </div>

          <button
            type="submit"
            disabled={loading || !current || !pw1 || !pw2}
            className="arabic w-full py-3 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition"
          >
            {loading ? 'جاري الحفظ…' : 'تغيير كلمة المرور'}
          </button>

          {!forced && (
            <button type="button" onClick={() => navigate(-1)}
                    className="arabic w-full py-2 text-sm text-ink-muted hover:text-ink transition">
              إلغاء
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
