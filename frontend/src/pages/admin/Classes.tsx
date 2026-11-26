import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Subject, UserRow, YearGroup } from '../../api/client'

const LEVELS = [
  'السنة الأولى', 'السنة الثانية', 'السنة الثالثة',
  'السنة الرابعة', 'السنة الخامسة', 'السنة السادسة',
]
const ARABIC_PACK = new Set(['arabe', 'islamique', 'civique', 'histoire', 'geographie'])
const SCI_FR_PACK = new Set(['math', 'eveil', 'francais', 'anglais'])

function parseNames(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map(line => line.split(/[,\t;]/)[0]?.trim() ?? '')
    .map(s => s.replace(/^\d+[\s.\-)]+/, '').trim())
    .filter(Boolean)
}

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
        <CreateClassWizard
          onDone={async (classId) => {
            await qc.invalidateQueries({ queryKey: ['classes'] })
            await qc.invalidateQueries({ queryKey: ['assignments'] })
            setCreateOpen(false)
            navigate(`/classes/${classId}`)
          }}
          onError={setError}
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

function CreateClassWizard({ onDone, onError, onCancel }: {
  onDone: (classId: string) => Promise<void>
  onError: (msg: string) => void
  onCancel: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState('')
  const [year, setYear] = useState(currentSchoolYear())
  const [level, setLevel] = useState('')
  const [studentsText, setStudentsText] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const { data: users = [] } = useQuery<UserRow[]>({ queryKey: ['users'], queryFn: api.users.list })
  const { data: subjects = [] } = useQuery<Subject[]>({ queryKey: ['subjects'], queryFn: api.subjects.list })
  const teachers = users.filter(u => u.role === 'teacher' && u.is_active)

  const parsedStudents = parseNames(studentsText)
  const canStep1 = !!name.trim() && !!year.trim()

  function toggleSubject(id: string) {
    setSubjectIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function finish() {
    if (!canStep1 || submitting) return
    onError('')
    setSubmitting(true)
    try {
      const cls = await api.classes.create(name.trim(), year.trim(), level || undefined)
      if (parsedStudents.length > 0) {
        await api.students.bulkAdd(cls.id, parsedStudents)
      }
      if (teacherId && subjectIds.size > 0) {
        await api.assignments.create(teacherId, cls.id, [...subjectIds])
      }
      await onDone(cls.id)
    } catch (err: any) {
      onError(err.message || 'حدث خطأ أثناء إنشاء القسم')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-5 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="arabic font-semibold text-gray-800">إنشاء قسم جديد</h3>
        <div className="flex items-center gap-1.5 text-xs">
          {[
            { n: 1 as const, label: '1. المعلومات' },
            { n: 2 as const, label: `2. التلاميذ${parsedStudents.length ? ` (${parsedStudents.length})` : ''}` },
            { n: 3 as const, label: `3. الإسناد${subjectIds.size ? ` (${subjectIds.size})` : ''}` },
          ].map(s => (
            <button
              key={s.n}
              type="button"
              disabled={s.n > 1 && !canStep1}
              onClick={() => setStep(s.n)}
              className={`arabic px-2.5 py-1 rounded-full transition ${
                step === s.n
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {step === 1 && (
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
      )}

      {step === 2 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="arabic text-xs font-medium text-gray-600">
              لصق قائمة التلاميذ — اسم في كل سطر (اختياري)
            </label>
            <label className="arabic text-xs text-blue-600 hover:underline cursor-pointer">
              ⬆ استيراد CSV/TXT
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={async e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const txt = await f.text()
                  setStudentsText(prev => (prev ? prev + '\n' + txt : txt))
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <textarea
            rows={6}
            value={studentsText}
            onChange={e => setStudentsText(e.target.value)}
            placeholder={"أحمد بن علي\nمريم الطرابلسي\nيوسف المنصوري"}
            className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <p className="arabic text-xs text-gray-400">
            {parsedStudents.length > 0 ? `${parsedStudents.length} تلميذ جاهز للإضافة` : 'يمكنكم تخطي هذه الخطوة وإضافة التلاميذ لاحقاً.'}
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">المعلم (اختياري)</label>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
                    className="arabic w-full sm:w-64 border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">بدون إسناد الآن</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name || t.username}</option>)}
            </select>
          </div>
          {teacherId && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <label className="arabic text-xs font-medium text-gray-600">المواد المسندة</label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setSubjectIds(new Set(subjects.map(s => s.id)))}
                          className="arabic text-[11px] px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                    كل المواد (معلم فصل)
                  </button>
                  <button type="button" onClick={() => setSubjectIds(new Set(subjects.filter(s => ARABIC_PACK.has(s.code)).map(s => s.id)))}
                          className="arabic text-[11px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">
                    مواد العربية
                  </button>
                  <button type="button" onClick={() => setSubjectIds(new Set(subjects.filter(s => SCI_FR_PACK.has(s.code)).map(s => s.id)))}
                          className="arabic text-[11px] px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 font-medium">
                    العلمية والفرنسية
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {subjects.map(s => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => toggleSubject(s.id)}
                    className={`arabic text-xs px-3 py-1.5 rounded-full border transition ${
                      subjectIds.has(s.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {s.name_ar}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        {step < 3 && (
          <button
            type="button"
            disabled={!canStep1}
            onClick={() => setStep((step + 1) as 2 | 3)}
            className="arabic px-4 py-2 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-blue-700 rounded-lg text-sm font-medium"
          >
            التالي: {step === 1 ? 'التلاميذ' : 'الإسناد'} ←
          </button>
        )}
        <button
          type="button"
          disabled={!canStep1 || submitting}
          onClick={() => void finish()}
          className="arabic px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium"
        >
          {submitting ? 'جاري الإنشاء…' : 'إنشاء القسم'}
        </button>
        <button type="button" onClick={onCancel}
                className="arabic mr-auto px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
          إلغاء
        </button>
      </div>
    </div>
  )
}
