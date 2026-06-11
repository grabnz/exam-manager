import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, TeacherProfile } from '../api/client'
import { useAuth } from '../auth'

const GRADES = [
  'معلم',
  'معلم أول',
  'معلم رئيسي',
  'أستاذ مساعد',
  'متفقد تربية',
]

const SUBJECTS = [
  'اللغة الفرنسية',
  'اللغة العربية',
  'الرياضيات',
  'الإيقاظ العلمي',
  'اللغة الإنجليزية',
]

export default function Profile() {
  const navigate = useNavigate()
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <button onClick={() => navigate('/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3">
          ← Accueil
        </button>
        <h1 className="text-xl font-bold text-gray-900">Profil de l'enseignant</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 md:px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">

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

            {/* Subject / المادة */}
            <div>
              <label className="arabic block text-sm font-medium text-gray-700 mb-1.5">
                المادة
              </label>
              <div className="grid grid-cols-2 gap-2" dir="rtl">
                {SUBJECTS.map(s => (
                  <label key={s}
                         className={`arabic flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition text-sm ${
                           form.subject === s
                             ? 'border-blue-400 bg-blue-50 text-blue-700'
                             : 'border-gray-200 hover:bg-gray-50'
                         }`}>
                    <input
                      type="radio"
                      name="subject"
                      value={s}
                      checked={form.subject === s}
                      onChange={() => setForm(f => ({ ...f, subject: s }))}
                      className="accent-blue-600"
                    />
                    <span>{s}</span>
                  </label>
                ))}
                {/* Custom subject */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition ${
                  form.subject && !SUBJECTS.includes(form.subject)
                    ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                }`}>
                  <input
                    type="radio"
                    name="subject"
                    checked={!SUBJECTS.includes(form.subject) && form.subject !== ''}
                    onChange={() => {}}
                    className="accent-blue-600 flex-shrink-0"
                  />
                  <input
                    type="text"
                    placeholder="أخرى…"
                    value={!SUBJECTS.includes(form.subject) ? form.subject : ''}
                    onFocus={() => { if (SUBJECTS.includes(form.subject)) setForm(f => ({ ...f, subject: '' })) }}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    className="arabic flex-1 bg-transparent text-sm focus:outline-none text-right min-w-0"
                    dir="rtl"
                  />
                </div>
              </div>
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
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition"
            >
              {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
