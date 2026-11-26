import { useState, useEffect } from 'react'
import { api, TeacherProfile } from '../api/client'
import { useAuth } from '../auth'
import AppShell from '../components/AppShell'

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

  return (
    <AppShell title="الملف الشخصي" subtitle="بيانات المعلم والرتبة">
      <div className="max-w-lg">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-brand border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-3xl p-6 space-y-5 shadow-card">

            {/* Avatar placeholder */}
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-3xl">
                👩‍🏫
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="arabic block text-sm font-medium text-gray-700 mb-1.5">
                الاسم الكامل
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: سلمى معيز"
                className="arabic w-full border border-gray-200 rounded-xl px-4 py-2.5 text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                dir="rtl"
              />
            </div>

            {/* Grade / رتبة */}
            <div>
              <label className="arabic block text-sm font-medium text-gray-700 mb-1.5">
                الرتبة
              </label>
              <div className="space-y-2">
                {GRADES.map(g => (
                  <label key={g}
                         className={`arabic flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition ${
                           form.grade === g
                             ? 'border-blue-400 bg-blue-50 text-blue-700'
                             : 'border-gray-200 hover:bg-gray-50'
                         }`}>
                    <input
                      type="radio"
                      name="grade"
                      value={g}
                      checked={form.grade === g}
                      onChange={() => setForm(f => ({ ...f, grade: g }))}
                      className="accent-blue-600"
                    />
                    <span className="text-sm">{g}</span>
                  </label>
                ))}
                {/* Custom grade */}
                <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition ${
                  form.grade && !GRADES.includes(form.grade)
                    ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                }`}>
                  <input
                    type="radio"
                    name="grade"
                    checked={!GRADES.includes(form.grade) && form.grade !== ''}
                    onChange={() => {}}
                    className="accent-blue-600 flex-shrink-0"
                  />
                  <input
                    type="text"
                    placeholder="Autre…"
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
              className="arabic w-full py-3 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl font-semibold shadow-sm transition"
            >
              {saving ? 'جاري الحفظ…' : saved ? 'تم الحفظ ✓' : 'حفظ التغييرات'}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
