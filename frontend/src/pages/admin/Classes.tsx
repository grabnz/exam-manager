import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, YearGroup } from '../../api/client'

const LEVELS = [
  'السنة الأولى', 'السنة الثانية', 'السنة الثالثة',
  'السنة الرابعة', 'السنة الخامسة', 'السنة السادسة',
]

function currentSchoolYear(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

export default function Classes() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: years = [], isLoading } = useQuery<YearGroup[]>({
    queryKey: ['classes'],
    queryFn:  api.classes.list,
  })

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['classes'] })
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const res = await api.classes.upload(file)
      await qc.invalidateQueries({ queryKey: ['classes'] })
      navigate(`/classes/${res.id}`)
    } catch (err: any) {
      setError(err.message || 'فشل الاستيراد')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-right" dir="rtl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setCreateOpen(v => !v)}
                className="arabic py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition">
          + قسم جديد
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="arabic py-3 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 rounded-xl font-medium transition">
          {uploading ? 'جاري الاستيراد…' : '⬆ استيراد PDF'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />

      {createOpen && (
        <CreateClassForm
          onCreate={async (name, year, level) => {
            await run(() => api.classes.create(name, year, level))
            setCreateOpen(false)
          }}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {isLoading ? (
        <div className="text-center py-10 text-gray-400">…</div>
      ) : years.length === 0 ? (
        <p className="arabic text-center text-gray-400 py-10" dir="rtl">لا توجد أقسام بعد.</p>
      ) : (
        years.map(year => (
          <section key={year.label}>
            <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 text-right" dir="rtl">
              السنة الدراسية {year.label}
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {year.classes.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3" dir="rtl">
                  <button onClick={() => navigate(`/classes/${c.id}`)} className="text-right min-w-0 flex-1 group">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="arabic text-sm font-medium text-gray-800 group-hover:text-blue-700">{c.name}</span>
                      {c.level && <span className="arabic text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{c.level}</span>}
                    </div>
                    <span className="arabic text-xs text-gray-400">
                      {c.student_count} تلميذ · {c.subjects.length > 0
                        ? c.subjects.map(s => s.name).join('، ')
                        : 'لا مواد مسندة'}
                    </span>
                  </button>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => {
                        const name = window.prompt('اسم القسم الجديد :', c.name)
                        if (name?.trim() && name.trim() !== c.name) run(() => api.classes.rename(c.id, name.trim()))
                      }}
                      className="text-xs text-gray-400 hover:text-blue-500 border border-gray-200 px-2 py-1 rounded-lg">
                      ✎
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`حذف القسم "${c.name}" وكل بياناته نهائياً؟`)) run(() => api.classes.delete(c.id))
                      }}
                      className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 px-2 py-1 rounded-lg">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function CreateClassForm({ onCreate, onCancel }: {
  onCreate: (name: string, year: string, level?: string) => Promise<void>
  onCancel: () => void
}) {
  const [name,  setName]  = useState('')
  const [year,  setYear]  = useState(currentSchoolYear())
  const [level, setLevel] = useState('')

  return (
    <form
      onSubmit={async e => { e.preventDefault(); await onCreate(name, year, level || undefined) }}
      className="bg-white border border-blue-200 rounded-xl p-5 space-y-4" dir="rtl"
    >
      <h3 className="arabic font-semibold text-gray-800">قسم جديد</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">اسم القسم</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
                 placeholder="مثال: الخامسة أ"
                 className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">المستوى</label>
          <select value={level} onChange={e => setLevel(e.target.value)}
                  className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">—</option>
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">السنة الدراسية</label>
          <input type="text" value={year} onChange={e => setYear(e.target.value)} dir="ltr"
                 className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={!name.trim() || !year.trim()}
                className="arabic px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium">
          إنشاء
        </button>
        <button type="button" onClick={onCancel}
                className="arabic px-5 py-2 text-sm text-gray-500 hover:text-gray-700">
          إلغاء
        </button>
      </div>
    </form>
  )
}
