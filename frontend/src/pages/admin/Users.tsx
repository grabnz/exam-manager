import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, BulkCreatedUser, UserRow } from '../../api/client'
import { useAuth } from '../../auth'
import { useUI } from '../../components/ui'
import { ListSkeleton } from '../../components/Skeleton'
import {
  UserPlusIcon, UsersIcon, DicesIcon, KeyIcon, EditIcon, TrashIcon,
  CheckCircleIcon, CopyIcon, PrinterIcon, XIcon, ClockIcon, ShieldIcon,
} from '../../components/icons'

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
        <div className="arabic bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-sm text-right" dir="rtl">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <CreateUserForm onCreate={(data) => run(() => api.users.create(data))} />
        <button
          type="button"
          onClick={() => setBulkOpen(v => !v)}
          className="arabic w-full py-2.5 bg-surface border border-line hover:border-brand/50 text-brand hover:bg-brand-light/40 rounded-2xl text-sm font-semibold shadow-card transition inline-flex items-center justify-center gap-2"
        >
          <UsersIcon className="w-4 h-4" />
          <span>{bulkOpen ? 'إغلاق الإضافة الجماعية' : 'إضافة عدة معلمين دفعة واحدة (مع بطاقة الدخول)'}</span>
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
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 space-y-3 shadow-card" dir="rtl">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="arabic text-sm font-bold text-emerald-900 inline-flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
              تم إنشاء {credentialsSlip.length} حساب — انسخوا أو اطبعوا بيانات الدخول
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = credentialsSlip.map(u => `${u.full_name} | ${u.username} | ${u.password}`).join('\n')
                  void navigator.clipboard.writeText(text)
                  ui.toast('تم نسخ بيانات الدخول', 'success')
                }}
                className="arabic inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-surface border border-emerald-300 text-emerald-800 rounded-xl hover:bg-emerald-100 transition"
              >
                <CopyIcon className="w-3.5 h-3.5" /> نسخ الكل
              </button>
              <button type="button" onClick={() => window.print()}
                      className="arabic inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition">
                <PrinterIcon className="w-3.5 h-3.5" /> طباعة
              </button>
              <button type="button" onClick={() => setCredentialsSlip(null)}
                      className="text-emerald-700 hover:bg-emerald-100 p-1.5 rounded-lg transition">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="bg-surface rounded-2xl border border-emerald-200 divide-y divide-line text-xs overflow-hidden">
            {credentialsSlip.map(u => (
              <div key={u.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="arabic font-semibold text-ink">{u.full_name || u.username}</span>
                <span className="font-mono text-ink-muted" dir="ltr">{u.username} / <strong className="text-ink">{u.password}</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <section>
        <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide mb-3 text-right" dir="rtl">
          الحسابات ({users.length})
        </h2>
        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : (
          <div className="bg-surface border border-line rounded-3xl divide-y divide-line shadow-card overflow-hidden">
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
    <form onSubmit={submit} className="bg-surface border border-brand-mid rounded-3xl p-5 space-y-3 shadow-card" dir="rtl">
      <label className="arabic block text-xs font-medium text-ink-muted">
        معلم في كل سطر: <span className="font-mono text-ink" dir="ltr">الاسم الكامل, username</span> (اسم المستخدم اختياري ويُنشأ تلقائياً مع كلمة مرور مؤقتة)
      </label>
      <textarea
        rows={5}
        value={raw}
        onChange={e => setRaw(e.target.value)}
        placeholder={"سلمى بن علي, salma.b\nكريم الطرابلسي, karim.t"}
        className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition"
      />
      <div className="flex items-center justify-between">
        <span className="arabic text-xs text-ink-subtle num">{parsed.length} حساب جاهز</span>
        <button type="submit" disabled={saving || parsed.length === 0}
                className="arabic px-5 py-2 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-xs font-semibold shadow-sm transition">
          {saving ? 'جاري الإنشاء…' : 'إنشاء الحسابات'}
        </button>
      </div>
    </form>
  )
}

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
              className="arabic w-full py-3 bg-brand hover:bg-brand-hover text-white rounded-2xl text-sm font-semibold shadow-sm transition inline-flex items-center justify-center gap-2">
        <UserPlusIcon className="w-4 h-4" /> إنشاء حساب معلم جديد
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-brand-mid rounded-3xl p-5 space-y-4 shadow-card" dir="rtl">
      <h3 className="arabic font-bold text-ink">حساب جديد</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">الاسم الكامل</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                 className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition" />
        </div>
        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">اسم المستخدم (لاتيني)</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
                 dir="ltr" placeholder="ex: salma.maiz"
                 className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition" />
        </div>
        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">كلمة المرور المؤقتة</label>
          <div className="flex gap-2" dir="ltr">
            <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                   className="flex-1 border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition" />
            <button type="button" onClick={generatePassword} title="توليد كلمة مرور"
                    className="px-3 border border-line rounded-xl text-ink-muted hover:text-brand hover:bg-canvas transition">
              <DicesIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">الدور</label>
          <select value={role} onChange={e => setRole(e.target.value)}
                  className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40">
            <option value="teacher">معلم</option>
            <option value="admin">مدير (إدارة الحسابات)</option>
          </select>
        </div>
        {role === 'teacher' && (
          <div className="sm:col-span-2">
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">النصاب الأسبوعي (ساعات)</label>
            <div className="flex gap-1.5 items-center flex-wrap">
              <input type="number" min={1} max={40} step={0.5} value={maxHours} onChange={e => setMaxHours(e.target.value)} dir="ltr"
                     className="w-20 border border-line bg-canvas/40 rounded-xl px-2.5 py-2 text-sm text-center num" />
              {[18, 20, 22, 25].map(h => (
                <button key={h} type="button" onClick={() => setMaxHours(String(h))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border num transition ${
                          Number(maxHours) === h ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-muted border-line hover:border-brand/40'
                        }`}>
                  {h}h
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="arabic text-xs text-ink-subtle">
        سيُطلب من المستخدم تغيير كلمة المرور عند أول دخول. انقلوا له اسم المستخدم وكلمة المرور المؤقتة.
      </p>

      <div className="flex gap-2">
        <button type="submit" disabled={!username.trim() || password.length < 6}
                className="arabic px-5 py-2 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition">
          إنشاء
        </button>
        <button type="button" onClick={() => setOpen(false)}
                className="arabic px-5 py-2 text-sm text-ink-muted hover:text-ink transition">
          إلغاء
        </button>
      </div>
    </form>
  )
}

function UserItem({ user, isMe, onEditHours, onToggleActive, onResetPassword, onDelete }: {
  user: UserRow
  isMe: boolean
  onEditHours: () => void
  onToggleActive: () => void
  onResetPassword: () => void
  onDelete: () => void
}) {
  const initial = (user.full_name || user.username || '؟').trim().charAt(0)
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-canvas/50 transition" dir="rtl">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
          user.role === 'admin' ? 'bg-violet-50 text-violet-700' : 'bg-brand-light text-brand'
        }`}>
          {user.role === 'admin' ? <ShieldIcon className="w-4 h-4" /> : initial}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="arabic text-sm font-semibold text-ink">
              {user.full_name || user.username}
            </span>
            <span className="text-xs text-ink-subtle font-mono" dir="ltr">{user.username}</span>
            {user.role === 'teacher' && (
              <button onClick={onEditHours} title="تعديل النصاب الأسبوعي"
                      className="arabic inline-flex items-center gap-1 text-[11px] bg-brand-light text-brand hover:bg-brand-mid/60 px-2.5 py-0.5 rounded-full font-semibold num transition">
                <ClockIcon className="w-3 h-3" />
                {user.max_weekly_hours ?? 25} ساعة/أسبوع
                <EditIcon className="w-2.5 h-2.5 opacity-70" />
              </button>
            )}
            {user.role === 'admin' && (
              <span className="arabic text-[11px] bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-medium">مدير</span>
            )}
            {!user.is_active && (
              <span className="arabic text-[11px] bg-canvas text-ink-subtle px-2 py-0.5 rounded-full">معطَّل</span>
            )}
            {user.must_change_password && user.is_active && (
              <span className="arabic text-[11px] bg-accent-soft text-amber-800 px-2 py-0.5 rounded-full">كلمة مرور مؤقتة</span>
            )}
          </div>
          <span className="arabic text-xs text-ink-subtle num">{user.class_count} قسم مسند</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={onResetPassword} title="إعادة تعيين كلمة المرور"
                className="p-2 text-ink-muted hover:text-brand border border-line hover:border-brand/40 rounded-xl transition">
          <KeyIcon className="w-3.5 h-3.5" />
        </button>
        {!isMe && (
          <>
            <button onClick={onToggleActive}
                    className="arabic text-xs text-ink-muted hover:text-amber-700 border border-line hover:border-amber-300 px-2.5 py-1.5 rounded-xl transition">
              {user.is_active ? 'تعطيل' : 'تفعيل'}
            </button>
            <button onClick={onDelete} title="حذف الحساب"
                    className="p-2 text-ink-subtle hover:text-rose-600 border border-line hover:border-rose-300 rounded-xl transition">
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
