import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, BulkCreatedUser, UserRow } from '../../api/client'
import { useAuth } from '../../auth'
import { useUI } from '../../components/ui'

export default function Users() {
  const qc = useQueryClient()
  const ui = useUI()
  const { user: me } = useAuth()
  const [error, setError] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [credentialsSlip, setCredentialsSlip] = useState<BulkCreatedUser[] | null>(null)

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ['users'],
    queryFn:  api.users.list,
  })

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['users'] })
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-right" dir="rtl">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <CreateUserForm onCreate={(data) => run(() => api.users.create(data))} />
        <button
          type="button"
          onClick={() => setBulkOpen(v => !v)}
          className="arabic w-full py-2.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-xl text-sm font-medium transition"
        >
          {bulkOpen ? 'إغلاق الإضافة الجماعية' : '+ إضافة عدة معلمين دفعة واحدة (مع بطاقة الدخول)'}
        </button>
        {bulkOpen && (
          <BulkUsersForm
            onCreated={async (created) => {
              await qc.invalidateQueries({ queryKey: ['users'] })
              setBulkOpen(false)
              setCredentialsSlip(created)
            }}
            onError={setError}
          />
        )}
      </div>

      {credentialsSlip && credentialsSlip.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3" dir="rtl">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="arabic text-sm font-bold text-emerald-900">
              ✓ تم إنشاء {credentialsSlip.length} حساب — انسخوا أو اطبعوا بيانات الدخول
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = credentialsSlip.map(u => `${u.full_name} | ${u.username} | ${u.password}`).join('\n')
                  void navigator.clipboard.writeText(text)
                  ui.toast('تم نسخ بيانات الدخول', 'success')
                }}
                className="arabic text-xs px-3 py-1 bg-white border border-emerald-300 text-emerald-800 rounded-lg hover:bg-emerald-100"
              >
                نسخ الكل
              </button>
              <button type="button" onClick={() => window.print()}
                      className="arabic text-xs px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                طباعة
              </button>
              <button type="button" onClick={() => setCredentialsSlip(null)}
                      className="text-xs text-emerald-700 px-2">✕</button>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-emerald-200 divide-y divide-gray-100 text-xs">
            {credentialsSlip.map(u => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2">
                <span className="arabic font-medium text-gray-800">{u.full_name || u.username}</span>
                <span className="font-mono text-gray-600" dir="ltr">{u.username} / <strong>{u.password}</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}

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
                onEditHours={async () => {
                  const val = await ui.prompt({
                    title: 'النصاب الأسبوعي (ساعات)',
                    label: `عدد ساعات العمل الأسبوعية للمعلم ${u.full_name || u.username} (مثال: 18، 20، 22، 25)`,
                    defaultValue: String(u.max_weekly_hours ?? 25),
                    dir: 'ltr',
                  })
                  const num = val ? parseFloat(val) : NaN
                  if (!isNaN(num) && num > 0 && num <= 40) {
                    run(() => api.users.update(u.id, { max_weekly_hours: num }))
                  }
                }}
                onToggleActive={() => run(() => api.users.update(u.id, { is_active: !u.is_active }))}
                onResetPassword={async () => {
                  const pw = await ui.prompt({
                    title: 'إعادة تعيين كلمة المرور',
                    label: 'كلمة المرور المؤقتة الجديدة (6 أحرف على الأقل)',
                    dir: 'ltr',
                  })
                  if (pw) run(() => api.users.resetPassword(u.id, pw))
                }}
                onDelete={async () => {
                  const ok = await ui.confirm({
                    title: 'حذف الحساب',
                    message: `حذف حساب "${u.username}" نهائياً؟ (تبقى الأعداد والأقسام محفوظة)`,
                    confirmLabel: 'حذف',
                    danger: true,
                  })
                  if (ok) run(() => api.users.delete(u.id))
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Bulk user creation (#17) ──────────────────────────────────────────────────
function BulkUsersForm({ onCreated, onError }: {
  onCreated: (users: BulkCreatedUser[]) => Promise<void>
  onError: (msg: string) => void
}) {
  const [raw, setRaw] = useState('')
  const [saving, setSaving] = useState(false)

  const parsed = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [fullName, username] = line.split(/[,;\t|]/).map(s => s?.trim() ?? '')
      return { full_name: fullName, username: username || undefined }
    })
    .filter(u => u.full_name)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!parsed.length) return
    setSaving(true)
    onError('')
    try {
      const created = await api.users.bulkCreate(parsed)
      await onCreated(created)
    } catch (err: any) {
      onError(err.message || 'فشل الإنشاء الجماعي')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-white border border-blue-200 rounded-xl p-4 space-y-3" dir="rtl">
      <label className="arabic block text-xs font-medium text-gray-600">
        معلم في كل سطر: <span className="font-mono" dir="ltr">الاسم الكامل, username</span> (اسم المستخدم اختياري ويُنشأ تلقائياً مع كلمة مرور مؤقتة)
      </label>
      <textarea
        rows={5}
        value={raw}
        onChange={e => setRaw(e.target.value)}
        placeholder={"سلمى بن علي, salma.b\nكريم الطرابلسي, karim.t"}
        className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right"
      />
      <div className="flex items-center justify-between">
        <span className="arabic text-xs text-gray-400">{parsed.length} حساب جاهز</span>
        <button type="submit" disabled={saving || parsed.length === 0}
                className="arabic px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-medium">
          {saving ? 'جاري الإنشاء…' : 'إنشاء الحسابات'}
        </button>
      </div>
    </form>
  )
}

// ── Create user form ───────────────────────────────────────────────────────────
function CreateUserForm({ onCreate }: {
  onCreate: (data: { username: string; password: string; full_name: string; role: string; max_weekly_hours?: number }) => Promise<void> | void
}) {
  const [open,     setOpen]     = useState(false)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState('teacher')
  const [maxHours, setMaxHours] = useState('18')

  function generatePassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
    setPassword(Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await onCreate({ username, password, full_name: fullName, role, max_weekly_hours: parseFloat(maxHours) || 25 })
    setUsername(''); setFullName(''); setPassword(''); setRole('teacher'); setMaxHours('18')
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
        {role === 'teacher' && (
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">النصاب الأسبوعي (ساعات)</label>
            <div className="flex gap-1.5 items-center">
              <input type="number" min={1} max={40} step={0.5} value={maxHours} onChange={e => setMaxHours(e.target.value)} dir="ltr"
                     className="w-20 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-center num" />
              {[18, 20, 22, 25].map(h => (
                <button key={h} type="button" onClick={() => setMaxHours(String(h))}
                        className={`px-2 py-1.5 rounded-lg text-xs border num ${
                          Number(maxHours) === h ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200'
                        }`}>
                  {h}h
                </button>
              ))}
            </div>
          </div>
        )}
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
function UserItem({ user, isMe, onEditHours, onToggleActive, onResetPassword, onDelete }: {
  user: UserRow
  isMe: boolean
  onEditHours: () => void
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
          {user.role === 'teacher' && (
            <button onClick={onEditHours} title="تعديل النصاب الأسبوعي"
                    className="arabic text-[11px] bg-brand-light text-brand hover:bg-brand-mid/50 px-2 py-0.5 rounded-full font-semibold num transition">
              {user.max_weekly_hours ?? 25} ساعة/أسبوع ✎
            </button>
          )}
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
        <span className="arabic text-xs text-gray-400">{user.class_count} قسم مسند</span>
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
            <button onClick={onDelete}
                    className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-2 py-1 rounded-lg">
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}
