import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth'

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔑</div>
          <h1 className="arabic text-2xl font-bold text-gray-900">تغيير كلمة المرور</h1>
          {forced && (
            <p className="arabic text-sm text-amber-600 mt-2" dir="rtl">
              يجب تغيير كلمة المرور المؤقتة قبل المواصلة.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm text-right" dir="rtl">
              {error}
            </div>
          )}

          <div>
            <label className="arabic block text-sm font-medium text-gray-700 mb-1.5 text-right" dir="rtl">
              كلمة المرور الحالية
            </label>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
                   autoComplete="current-password" autoFocus
                   className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div>
            <label className="arabic block text-sm font-medium text-gray-700 mb-1.5 text-right" dir="rtl">
              كلمة المرور الجديدة
            </label>
            <input type="password" value={pw1} onChange={e => setPw1(e.target.value)}
                   autoComplete="new-password"
                   className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div>
            <label className="arabic block text-sm font-medium text-gray-700 mb-1.5 text-right" dir="rtl">
              تأكيد كلمة المرور الجديدة
            </label>
            <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                   autoComplete="new-password"
                   className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <button
            type="submit"
            disabled={loading || !current || !pw1 || !pw2}
            className="arabic w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition"
          >
            {loading ? 'جاري الحفظ…' : 'تغيير كلمة المرور'}
          </button>

          {!forced && (
            <button type="button" onClick={() => navigate(-1)}
                    className="arabic w-full py-2 text-sm text-gray-500 hover:text-gray-700">
              إلغاء
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
