import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, UserRow, YearGroup } from '../api/client'
import { useAuth } from '../auth'

export default function Admin() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const { user: me } = useAuth()

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ['users'],
    queryFn:  api.users.list,
  })
  const { data: years = [] } = useQuery<YearGroup[]>({
    queryKey: ['classes'],
    queryFn:  api.classes.list,
  })

  const [error, setError] = useState('')

  const allClasses = years.flatMap(y => y.classes.map(c => ({ ...c, year: y.label })))
  const teachers = users.filter(u => u.is_active)

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['users'] })
      await qc.invalidateQueries({ queryKey: ['classes'] })
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <button onClick={() => navigate('/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3">
          ← الرئيسية
        </button>
        <h1 className="arabic text-xl font-bold text-gray-900">إدارة الحسابات</h1>
        <p className="arabic text-sm text-gray-500 mt-1">إنشاء حسابات المعلمين وإدارتها — خاص بالإدارة</p>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {error && (
          <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-right" dir="rtl">
            {error}
          </div>
        )}

        <CreateUserForm onCreate={(data) => run(() => api.users.create(data))} />

        {/* Users list */}
        <section>
          <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 text-right" dir="rtl">
            الحسابات ({users.length})
          </h2>
          {isLoading ? (
            <div className="text-center py-10 text-gray-400">…</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {users.map(u => (
                <UserItem
                  key={u.id}
                  user={u}
                  isMe={u.id === me?.id}
                  onToggleActive={() => run(() => api.users.update(u.id, { is_active: !u.is_active }))}
                  onResetPassword={() => {
                    const pw = window.prompt('كلمة المرور المؤقتة الجديدة (6 أحرف على الأقل):')
                    if (pw) run(() => api.users.resetPassword(u.id, pw))
                  }}
                  onDelete={() => {
                    if (window.confirm(`حذف حساب "${u.username}" نهائياً؟`))
                      run(() => api.users.delete(u.id))
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Class ownership */}
        {allClasses.length > 0 && (
          <section>
            <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 text-right" dir="rtl">
              إسناد الأقسام ({allClasses.length})
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {allClasses.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3" dir="rtl">
                  <div className="min-w-0">
                    <span className="arabic text-sm font-medium text-gray-800">{c.name}</span>
                    <span className="arabic text-xs text-gray-400 mr-2">{c.year}</span>
                    {!c.owner_id && (
                      <span className="arabic text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full mr-2">بدون معلم</span>
                    )}
                  </div>
                  <select
                    value={c.owner_id ?? ''}
                    onChange={e => run(() => api.classes.assignOwner(c.id, e.target.value || null))}
                    className="arabic text-sm border border-gray-200 rounded-lg px-2 py-1.5 flex-shrink-0"
                  >
                    <option value="">— بدون معلم —</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.full_name || t.username}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

// ── Create user form ───────────────────────────────────────────────────────────
function CreateUserForm({ onCreate }: {
  onCreate: (data: { username: string; password: string; full_name: string; role: string }) => Promise<void> | void
}) {
  const [open,     setOpen]     = useState(false)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState('teacher')

  function generatePassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
    setPassword(Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await onCreate({ username, password, full_name: fullName, role })
    setUsername(''); setFullName(''); setPassword(''); setRole('teacher')
    setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); generatePassword() }}
              className="arabic w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition">
        + إنشاء حساب معلم جديد
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white border border-blue-200 rounded-xl p-5 space-y-4" dir="rtl">
      <h3 className="arabic font-semibold text-gray-800">حساب جديد</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">الاسم الكامل</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                 className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">اسم المستخدم (لاتيني)</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
                 dir="ltr" placeholder="ex: salma.maiz"
                 className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">كلمة المرور المؤقتة</label>
          <div className="flex gap-2" dir="ltr">
            <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                   className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <button type="button" onClick={generatePassword} title="توليد"
                    className="px-3 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">🎲</button>
          </div>
        </div>
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">الدور</label>
          <select value={role} onChange={e => setRole(e.target.value)}
                  className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="teacher">معلم</option>
            <option value="admin">مدير (إدارة الحسابات)</option>
          </select>
        </div>
      </div>

      <p className="arabic text-xs text-gray-400">
        سيُطلب من المستخدم تغيير كلمة المرور عند أول دخول. انقلوا له اسم المستخدم وكلمة المرور المؤقتة.
      </p>

      <div className="flex gap-2">
        <button type="submit" disabled={!username.trim() || password.length < 6}
                className="arabic px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium">
          إنشاء
        </button>
        <button type="button" onClick={() => setOpen(false)}
                className="arabic px-5 py-2 text-sm text-gray-500 hover:text-gray-700">
          إلغاء
        </button>
      </div>
    </form>
  )
}

// ── User row ───────────────────────────────────────────────────────────────────
function UserItem({ user, isMe, onToggleActive, onResetPassword, onDelete }: {
  user: UserRow
  isMe: boolean
  onToggleActive: () => void
  onResetPassword: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3" dir="rtl">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="arabic text-sm font-medium text-gray-800">
            {user.full_name || user.username}
          </span>
          <span className="text-xs text-gray-400 font-mono" dir="ltr">{user.username}</span>
          {user.role === 'admin' && (
            <span className="arabic text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">مدير</span>
          )}
          {!user.is_active && (
            <span className="arabic text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">معطَّل</span>
          )}
          {user.must_change_password && user.is_active && (
            <span className="arabic text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">كلمة مرور مؤقتة</span>
          )}
        </div>
        <span className="arabic text-xs text-gray-400">{user.class_count} قسم</span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={onResetPassword} title="إعادة تعيين كلمة المرور"
                className="text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-2 py-1 rounded-lg arabic">
          🔑
        </button>
        {!isMe && (
          <>
            <button onClick={onToggleActive}
                    className="arabic text-xs text-gray-500 hover:text-amber-600 border border-gray-200 hover:border-amber-300 px-2 py-1 rounded-lg">
              {user.is_active ? 'تعطيل' : 'تفعيل'}
            </button>
            {user.class_count === 0 && (
              <button onClick={onDelete}
                      className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-2 py-1 rounded-lg">
                ✕
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
