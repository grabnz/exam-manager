import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, PDFPreviewResult, Subject, UserRow, YearGroup } from '../../api/client'
import { useUI } from '../../components/ui'
import { EmptyState, ListSkeleton } from '../../components/Skeleton'
import {
  PlusIcon, UploadIcon, CopyIcon, EditIcon, TrashIcon,
  SchoolIcon, ChevronLeftIcon, FileIcon,
} from '../../components/icons'

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
  const ui = useUI()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<PDFPreviewResult | null>(null)
  const [cloneTarget, setCloneTarget] = useState<{ id: string; name: string; level?: string | null; year: string } | null>(null)

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
      const res = await api.classes.parsePdf(file)
      setPdfPreview(res)
    } catch (err: any) {
      setError(err.message || 'فشل قراءة ملف PDF')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="arabic bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-sm text-right" dir="rtl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setCreateOpen(v => !v)}
                className="arabic py-3 bg-brand hover:bg-brand-hover text-white rounded-2xl text-sm font-semibold shadow-sm transition inline-flex items-center justify-center gap-2">
          <PlusIcon className="w-4 h-4" /> قسم جديد
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="arabic py-3 bg-surface border border-line hover:border-brand/50 text-brand hover:bg-brand-light/40 disabled:opacity-50 rounded-2xl text-sm font-semibold shadow-card transition inline-flex items-center justify-center gap-2">
          <UploadIcon className="w-4 h-4" />
          <span>{uploading ? 'جاري الاستيراد…' : 'استيراد PDF'}</span>
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
        <ListSkeleton rows={5} />
      ) : years.length === 0 ? (
        <EmptyState
          Icon={SchoolIcon}
          title="لا توجد أقسام بعد"
          description="أنشئوا أول قسم يدوياً أو استوردوا قائمة التلاميذ مباشرة من ملف PDF."
        />
      ) : (
        years.map(year => (
          <section key={year.label}>
            <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide mb-3 text-right num" dir="rtl">
              السنة الدراسية {year.label}
            </h2>
            <div className="bg-surface border border-line rounded-3xl divide-y divide-line shadow-card overflow-hidden">
              {year.classes.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-canvas/50 transition" dir="rtl">
                  <button onClick={() => navigate(`/classes/${c.id}`)} className="flex items-center gap-3 text-right min-w-0 flex-1 group">
                    <span className="w-10 h-10 rounded-xl bg-brand-light text-brand flex items-center justify-center flex-shrink-0 group-hover:bg-brand group-hover:text-white transition">
                      <SchoolIcon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="arabic text-sm font-bold text-ink group-hover:text-brand transition">{c.name}</span>
                        {c.level && <span className="arabic text-[11px] bg-canvas text-ink-muted px-2 py-0.5 rounded-full">{c.level}</span>}
                      </div>
                      <span className="arabic text-xs text-ink-subtle block truncate num">
                        {c.student_count} تلميذ · {c.subjects.length > 0
                          ? c.subjects.map(s => s.name).join('، ')
                          : 'لا مواد مسندة'}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      title="نسخ إلى سنة جديدة"
                      onClick={() => setCloneTarget({ id: c.id, name: c.name, level: c.level, year: year.label })}
                      className="arabic inline-flex items-center gap-1 text-xs text-ink-muted hover:text-emerald-700 border border-line hover:border-emerald-300 px-2.5 py-1.5 rounded-xl transition">
                      <CopyIcon className="w-3.5 h-3.5" /> نسخ
                    </button>
                    <button
                      title="تعديل اسم القسم"
                      onClick={async () => {
                        const name = await ui.prompt({ title: 'تعديل اسم القسم', defaultValue: c.name })
                        if (name && name !== c.name) run(() => api.classes.rename(c.id, name))
                      }}
                      className="p-2 text-ink-muted hover:text-brand border border-line hover:border-brand/40 rounded-xl transition">
                      <EditIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      title="حذف القسم"
                      onClick={async () => {
                        const ok = await ui.confirm({
                          title: 'حذف القسم',
                          message: `حذف القسم "${c.name}" وكل بياناته نهائياً؟`,
                          confirmLabel: 'حذف',
                          danger: true,
                        })
                        if (ok) run(() => api.classes.delete(c.id))
                      }}
                      className="p-2 text-ink-subtle hover:text-rose-600 border border-line hover:border-rose-300 rounded-xl transition">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {pdfPreview && (
        <PDFPreviewModal
          preview={pdfPreview}
          onClose={() => setPdfPreview(null)}
          onCreated={async (classId) => {
            setPdfPreview(null)
            await qc.invalidateQueries({ queryKey: ['classes'] })
            ui.toast('تم استيراد القسم بنجاح', 'success')
            navigate(`/classes/${classId}`)
          }}
        />
      )}

      {cloneTarget && (
        <CloneClassModal
          source={cloneTarget}
          onClose={() => setCloneTarget(null)}
          onCloned={async (classId) => {
            setCloneTarget(null)
            await qc.invalidateQueries({ queryKey: ['classes'] })
            ui.toast('تم نسخ القسم بنجاح', 'success')
            navigate(`/classes/${classId}`)
          }}
        />
      )}
    </div>
  )
}

function PDFPreviewModal({ preview, onClose, onCreated }: {
  preview: PDFPreviewResult
  onClose: () => void
  onCreated: (classId: string) => Promise<void>
}) {
  const [name, setName] = useState(preview.meta.class_name || '')
  const [year, setYear] = useState(preview.meta.school_year || currentSchoolYear())
  const [level, setLevel] = useState('')
  const [studentsText, setStudentsText] = useState(preview.students.join('\n'))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const students = parseNames(studentsText)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !year.trim()) return
    setSaving(true)
    setErr('')
    try {
      const cls = await api.classes.create(name.trim(), year.trim(), level || undefined)
      if (students.length > 0) await api.students.bulkAdd(cls.id, students)
      await onCreated(cls.id)
    } catch (e: any) {
      setErr(e.message || 'فشل الإنشاء')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4 animate-fade-in" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-surface border border-line rounded-3xl p-6 space-y-4 shadow-float max-h-[90vh] overflow-y-auto animate-scale-in" dir="rtl">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-brand-light text-brand flex items-center justify-center">
            <FileIcon className="w-4 h-4" />
          </span>
          <h3 className="arabic text-base font-bold text-ink">معاينة وتصحيح بيانات PDF</h3>
        </div>
        {err && <p className="arabic text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-xl">{err}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">اسم القسم</label>
            <input value={name} onChange={e => setName(e.target.value)} required
                   className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40" />
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">المستوى</label>
            <select value={level} onChange={e => setLevel(e.target.value)}
                    className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3 py-2 text-sm">
              <option value="">—</option>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">السنة الدراسية</label>
            <input value={year} onChange={e => setYear(e.target.value)} dir="ltr" required
                   className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3 py-2 text-sm num focus:outline-none focus:ring-2 focus:ring-brand/40" />
          </div>
        </div>
        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">
            قائمة التلاميذ المستخرجة ({students.length} تلميذ) — يمكن التعديل قبل الحفظ
          </label>
          <textarea rows={8} value={studentsText} onChange={e => setStudentsText(e.target.value)}
                    className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40" />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving || !name.trim()}
                  className="arabic flex-1 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition">
            {saving ? 'جاري الإنشاء…' : 'تأكيد وإنشاء القسم'}
          </button>
          <button type="button" onClick={onClose}
                  className="arabic px-5 py-2.5 border border-line rounded-xl text-sm text-ink-muted hover:bg-canvas transition">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}

function nextSchoolYear(y: string): string {
  const m = y.match(/(\d{4})-(\d{4})/)
  if (m) return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`
  return currentSchoolYear()
}

function nextLevel(lvl?: string | null): string {
  if (!lvl) return ''
  const idx = LEVELS.indexOf(lvl)
  return idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : lvl
}

function CloneClassModal({ source, onClose, onCloned }: {
  source: { id: string; name: string; level?: string | null; year: string }
  onClose: () => void
  onCloned: (classId: string) => Promise<void>
}) {
  const [name, setName] = useState(source.name)
  const [year, setYear] = useState(nextSchoolYear(source.year))
  const [level, setLevel] = useState(nextLevel(source.level))
  const [copyStudents, setCopyStudents] = useState(true)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.classes.clone(source.id, {
        name: name.trim(),
        school_year: year.trim(),
        level: level || null,
        copy_students: copyStudents,
      })
      await onCloned(res.id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4 animate-fade-in" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-surface border border-line rounded-3xl p-6 space-y-4 shadow-float animate-scale-in" dir="rtl">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <CopyIcon className="w-4 h-4" />
          </span>
          <h3 className="arabic text-base font-bold text-ink">نسخ القسم إلى سنة جديدة</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">اسم القسم الجديد</label>
            <input value={name} onChange={e => setName(e.target.value)} required
                   className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40" />
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">المستوى</label>
            <select value={level} onChange={e => setLevel(e.target.value)}
                    className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm">
              <option value="">—</option>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">السنة الدراسية المستهدفة</label>
            <input value={year} onChange={e => setYear(e.target.value)} dir="ltr" required
                   className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm num focus:outline-none focus:ring-2 focus:ring-brand/40" />
          </div>
          <label className="arabic flex items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" checked={copyStudents} onChange={e => setCopyStudents(e.target.checked)} className="accent-brand" />
            نسخ قائمة التلاميذ أيضاً
          </label>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving || !name.trim() || !year.trim()}
                  className="arabic flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition">
            {saving ? 'جاري النسخ…' : 'نسخ القسم'}
          </button>
          <button type="button" onClick={onClose}
                  className="arabic px-4 py-2.5 border border-line rounded-xl text-sm text-ink-muted hover:bg-canvas transition">
            إلغاء
          </button>
        </div>
      </form>
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
    <div className="bg-surface border border-brand-mid rounded-3xl p-5 space-y-4 shadow-card" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="arabic font-bold text-ink">إنشاء قسم جديد</h3>
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
              className={`arabic px-3 py-1 rounded-full transition ${
                step === s.n
                  ? 'bg-brand text-white font-semibold shadow-sm'
                  : 'bg-canvas text-ink-muted hover:bg-line/70 disabled:opacity-40'
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
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">اسم القسم</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
                   placeholder="مثال: الخامسة أ"
                   className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40" />
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">المستوى</label>
            <select value={level} onChange={e => setLevel(e.target.value)}
                    className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm">
              <option value="">—</option>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">السنة الدراسية</label>
            <input type="text" value={year} onChange={e => setYear(e.target.value)} dir="ltr"
                   className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm num focus:outline-none focus:ring-2 focus:ring-brand/40" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="arabic text-xs font-semibold text-ink-muted">
              لصق قائمة التلاميذ — اسم في كل سطر (اختياري)
            </label>
            <label className="arabic inline-flex items-center gap-1 text-xs text-brand font-semibold hover:underline cursor-pointer">
              <UploadIcon className="w-3.5 h-3.5" /> استيراد CSV/TXT
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
            className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
          <p className="arabic text-xs text-ink-subtle num">
            {parsedStudents.length > 0 ? `${parsedStudents.length} تلميذ جاهز للإضافة` : 'يمكنكم تخطي هذه الخطوة وإضافة التلاميذ لاحقاً.'}
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">المعلم (اختياري)</label>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
                    className="arabic w-full sm:w-64 border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm">
              <option value="">بدون إسناد الآن</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name || t.username}</option>)}
            </select>
          </div>
          {teacherId && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <label className="arabic text-xs font-semibold text-ink-muted">المواد المسندة</label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setSubjectIds(new Set(subjects.map(s => s.id)))}
                          className="arabic text-[11px] px-2.5 py-1 rounded-xl bg-brand-light text-brand hover:bg-brand-mid/60 font-semibold transition">
                    كل المواد (معلم فصل)
                  </button>
                  <button type="button" onClick={() => setSubjectIds(new Set(subjects.filter(s => ARABIC_PACK.has(s.code)).map(s => s.id)))}
                          className="arabic text-[11px] px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold transition">
                    مواد العربية
                  </button>
                  <button type="button" onClick={() => setSubjectIds(new Set(subjects.filter(s => SCI_FR_PACK.has(s.code)).map(s => s.id)))}
                          className="arabic text-[11px] px-2.5 py-1 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition">
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
                    className={`arabic text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                      subjectIds.has(s.id)
                        ? 'bg-brand text-white border-brand shadow-sm'
                        : 'bg-surface text-ink-muted border-line hover:border-brand/40'
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

      <div className="flex items-center gap-2 pt-2 border-t border-line">
        {step < 3 && (
          <button
            type="button"
            disabled={!canStep1}
            onClick={() => setStep((step + 1) as 2 | 3)}
            className="arabic inline-flex items-center gap-1 px-4 py-2 bg-brand-light hover:bg-brand-mid/60 disabled:opacity-40 text-brand rounded-xl text-sm font-semibold transition"
          >
            التالي: {step === 1 ? 'التلاميذ' : 'الإسناد'} <ChevronLeftIcon className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          disabled={!canStep1 || submitting}
          onClick={() => void finish()}
          className="arabic px-5 py-2 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition"
        >
          {submitting ? 'جاري الإنشاء…' : 'إنشاء القسم'}
        </button>
        <button type="button" onClick={onCancel}
                className="arabic mr-auto px-4 py-2 text-sm text-ink-muted hover:text-ink transition">
          إلغاء
        </button>
      </div>
    </div>
  )
}
