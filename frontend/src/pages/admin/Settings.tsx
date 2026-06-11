import { useEffect, useState } from 'react'
import { api, SettingsData } from '../../api/client'

export default function Settings() {
  const [form,    setForm]    = useState<SettingsData>({ school_name: '', active_year: '', region: '' })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    api.settings.get().then(s => { setForm(s); setLoading(false) })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.settings.save(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-10 text-gray-400">…</div>

  return (
    <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5" dir="rtl">
      {error && (
        <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">{error}</div>
      )}

      <div>
        <label className="arabic block text-sm font-medium text-gray-700 mb-1.5">اسم المدرسة</label>
        <input type="text" value={form.school_name}
               onChange={e => setForm(f => ({ ...f, school_name: e.target.value }))}
               placeholder="المدرسة الابتدائية …"
               className="arabic w-full border border-gray-200 rounded-xl px-4 py-2.5 text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <p className="arabic text-xs text-gray-400 mt-1">يظهر في رؤوس الوثائق المطبوعة وملفات Excel.</p>
      </div>

      <div>
        <label className="arabic block text-sm font-medium text-gray-700 mb-1.5">السنة الدراسية النشطة</label>
        <input type="text" value={form.active_year}
               onChange={e => setForm(f => ({ ...f, active_year: e.target.value }))}
               placeholder="2025-2026" dir="ltr"
               className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>

      <div>
        <label className="arabic block text-sm font-medium text-gray-700 mb-1.5">المندوبية الجهوية للتربية</label>
        <input type="text" value={form.region}
               onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
               placeholder="مثال: المندوبية الجهوية للتربية بصفاقس 1"
               className="arabic w-full border border-gray-200 rounded-xl px-4 py-2.5 text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>

      <button type="submit" disabled={saving}
              className="arabic w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition">
        {saving ? 'جاري الحفظ…' : saved ? 'تم الحفظ ✓' : 'حفظ'}
      </button>
    </form>
  )
}
