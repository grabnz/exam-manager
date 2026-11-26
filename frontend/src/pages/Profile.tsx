import { useState, useEffect } from 'react'
import { api, TeacherProfile } from '../api/client'
import { useAuth } from '../auth'
import AppShell from '../components/AppShell'
import { ListSkeleton } from '../components/Skeleton'
import { CheckIcon, UserIcon } from '../components/icons'

const GRADES = [
  'معلم',
  'معلم أول',
  'معلم رئيسي',
  'أستاذ مساعد',
  'متفقد تربية',
]

export default function Profile() {
  const { user, updateUser } = useAuth()
  const [form,    setForm]    = useState<TeacherProfile>({ name: '', grade: '', subject: '' })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    api.profile.get().then(p => { setForm(p); setLoading(false) })
  }, [])

  async function handleSave() {
    setSaving(true)
    const p = await api.profile.save(form)
    if (user) updateUser({ ...user, full_name: p.name, grade: p.grade, subject: p.subject })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const initial = (form.name || user?.full_name || user?.username || '؟').trim().charAt(0)

  return (
    <AppShell title="الملف الشخصي" subtitle="بيانات المعلم والرتبة">
      <div className="max-w-lg">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="bg-surface border border-line rounded-3xl p-6 space-y-5 shadow-card">
            {/* Avatar badge */}
            <div className="flex flex-col items-center gap-2 pb-2 border-b border-line">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand to-brand-hover text-white flex items-center justify-center text-2xl font-bold shadow-float">
                {initial !== '؟' ? initial : <UserIcon className="w-8 h-8" />}
              </div>
              <div className="text-center">
                <p className="arabic text-base font-bold text-ink">{form.name || user?.username}</p>
                <p className="arabic text-xs text-ink-subtle">{form.grade || (user?.role === 'admin' ? 'مدير المدرسة' : 'معلم')}</p>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5">
                الاسم الكامل
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: سلمى معيز"
                className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-4 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition"
                dir="rtl"
              />
            </div>

            {/* Grade / رتبة */}
            <div>
              <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5">
                الرتبة
              </label>
              <div className="space-y-2">
                {GRADES.map(g => (
                  <label key={g}
                         className={`arabic flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition ${
                           form.grade === g
                             ? 'border-brand bg-brand-light/60 text-brand font-semibold'
                             : 'border-line hover:bg-canvas text-ink'
                         }`}>
                    <input
                      type="radio"
                      name="grade"
                      value={g}
                      checked={form.grade === g}
                      onChange={() => setForm(f => ({ ...f, grade: g }))}
                      className="accent-brand"
                    />
                    <span className="text-sm">{g}</span>
                  </label>
                ))}
                {/* Custom grade */}
                <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition ${
                  form.grade && !GRADES.includes(form.grade)
                    ? 'border-brand bg-brand-light/60' : 'border-line'
                }`}>
                  <input
                    type="radio"
                    name="grade"
                    checked={!GRADES.includes(form.grade) && form.grade !== ''}
                    onChange={() => {}}
                    className="accent-brand flex-shrink-0"
                  />
                  <input
                    type="text"
                    placeholder="رتبة أخرى…"
                    value={!GRADES.includes(form.grade) ? form.grade : ''}
                    onFocus={() => { if (GRADES.includes(form.grade)) setForm(f => ({ ...f, grade: '' })) }}
                    onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                    className="arabic flex-1 bg-transparent text-sm focus:outline-none text-right"
                    dir="rtl"
                  />
                </div>
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="arabic w-full py-3 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition inline-flex items-center justify-center gap-2"
            >
              {saved && <CheckIcon className="w-4 h-4" />}
              <span>{saving ? 'جاري الحفظ…' : saved ? 'تم الحفظ بنجاح' : 'حفظ التغييرات'}</span>
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
