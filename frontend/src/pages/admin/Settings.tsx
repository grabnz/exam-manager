import { useEffect, useState } from 'react'
import { api, SettingsData } from '../../api/client'
import { ListSkeleton } from '../../components/Skeleton'
import { CheckIcon, SchoolIcon } from '../../components/icons'

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

  if (loading) return <ListSkeleton rows={3} />

  return (
    <form onSubmit={handleSave} className="bg-surface border border-line rounded-3xl p-6 space-y-5 shadow-card max-w-2xl" dir="rtl">
      <div className="flex items-center gap-3 pb-3 border-b border-line">
        <span className="w-10 h-10 rounded-2xl bg-brand-light text-brand flex items-center justify-center flex-shrink-0">
          <SchoolIcon className="w-5 h-5" />
        </span>
        <div>
          <h2 className="arabic text-base font-bold text-ink">هوية المدرسة والسنة الدراسية</h2>
          <p className="arabic text-xs text-ink-muted">تظهر هذه البيانات في رؤوس الوثائق المطبوعة وملفات Excel.</p>
        </div>
      </div>

      {error && (
        <div className="arabic bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-xl text-sm">{error}</div>
      )}

      <div>
        <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5">اسم المدرسة</label>
        <input type="text" value={form.school_name}
               onChange={e => setForm(f => ({ ...f, school_name: e.target.value }))}
               placeholder="المدرسة الابتدائية …"
               className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-4 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition" />
      </div>

      <div>
        <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5">السنة الدراسية النشطة</label>
        <input type="text" value={form.active_year}
               onChange={e => setForm(f => ({ ...f, active_year: e.target.value }))}
               placeholder="2025-2026" dir="ltr"
               className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-4 py-2.5 text-sm num focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition" />
      </div>

      <div>
        <label className="arabic block text-xs font-semibold text-ink-muted mb-1.5">المندوبية الجهوية للتربية</label>
        <input type="text" value={form.region}
               onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
               placeholder="مثال: المندوبية الجهوية للتربية بصفاقس 1"
               className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-4 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition" />
      </div>

      <button type="submit" disabled={saving}
              className="arabic w-full py-3 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition inline-flex items-center justify-center gap-2">
        {saved && <CheckIcon className="w-4 h-4" />}
        <span>{saving ? 'جاري الحفظ…' : saved ? 'تم الحفظ بنجاح' : 'حفظ الإعدادات'}</span>
      </button>
    </form>
  )
}
