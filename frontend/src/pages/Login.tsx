import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📝</div>
          <h1 className="arabic text-2xl font-bold text-gray-900">إدارة النقاط</h1>
          <p className="arabic text-sm text-gray-500 mt-1">اللغة الفرنسية — المرحلة الابتدائية</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm text-right" dir="rtl">
              {error}
            </div>
          )}

          <div>
            <label className="arabic block text-sm font-medium text-gray-700 mb-1.5 text-right" dir="rtl">
              اسم المستخدم
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="arabic block text-sm font-medium text-gray-700 mb-1.5 text-right" dir="rtl">
              كلمة المرور
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="arabic w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition"
          >
            {loading ? 'جاري الدخول…' : 'تسجيل الدخول'}
          </button>

          <p className="arabic text-xs text-gray-400 text-center" dir="rtl">
            الحسابات تُمنح من طرف إدارة المدرسة. لا يمكن إنشاء حساب ذاتياً.
          </p>
        </form>
      </div>
    </div>
  )
}
