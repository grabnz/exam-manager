import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, AssignmentRow, CurriculumRow, Subject, UserRow, YearGroup } from '../../api/client'
import { useUI } from '../../components/ui'
import { AlertIcon, CheckIcon, PlusIcon, TrashIcon } from '../../components/icons'

export default function Assignments() {
  const qc = useQueryClient()
  const ui = useUI()
  const [error, setError] = useState('')
  const [view, setView] = useState<'matrix' | 'list'>('matrix')

  const { data: assignments = [] } = useQuery<AssignmentRow[]>({
    queryKey: ['assignments'], queryFn: api.assignments.list,
  })
  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ['users'], queryFn: api.users.list,
  })
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ['subjects'], queryFn: api.subjects.list,
  })
  const { data: years = [] } = useQuery<YearGroup[]>({
    queryKey: ['classes'], queryFn: api.classes.list,
  })
  const { data: curricula = [] } = useQuery<CurriculumRow[]>({
    queryKey: ['curriculum'], queryFn: api.curriculum.list,
  })

  const teachers = users.filter(u => u.role === 'teacher' && u.is_active)
  const classes  = years.flatMap(y => y.classes.map(c => ({ ...c, year: y.label })))

  // Compute live assigned weekly hours per teacher
  const teacherHours = useMemo(() => {
    const curMap = new Map<string, number>()
    const curFallback = new Map<string, number>()
    for (const c of curricula) {
      curMap.set(`${c.level}|${c.subject_id}`, c.weekly_hours)
      if (!curFallback.has(c.subject_id)) curFallback.set(c.subject_id, c.weekly_hours)
    }
    const classLevel = new Map<string, string>()
    for (const c of classes) classLevel.set(c.id, c.level || '')

    const totals = new Map<string, number>()
    for (const a of assignments) {
      const lvl = classLevel.get(a.class_id) || ''
      const h = curMap.get(`${lvl}|${a.subject_id}`) ?? curFallback.get(a.subject_id) ?? 2
      totals.set(a.teacher_id, (totals.get(a.teacher_id) ?? 0) + h)
    }
    return totals
  }, [assignments, curricula, classes])

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['assignments'] })
      await qc.invalidateQueries({ queryKey: ['classes'] })
      await qc.invalidateQueries({ queryKey: ['users'] })
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    }
  }

  // group assignments by class
  const byClass = new Map<string, AssignmentRow[]>()
  for (const a of assignments) {
    if (!byClass.has(a.class_id)) byClass.set(a.class_id, [])
    byClass.get(a.class_id)!.push(a)
  }

  return (
    <div className="space-y-6" dir="rtl">
      {error && (
        <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-right">
          {error}
        </div>
      )}

      {/* Live Teacher Weekly Load Meters */}
      {teachers.length > 0 && (
        <section className="bg-surface border border-line rounded-2xl p-4 shadow-card">
          <h2 className="arabic text-xs font-bold text-ink-muted mb-3">النصاب الأسبوعي للمعلمين (المسند / الحد القانوني)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {teachers.map(t => {
              const assigned = teacherHours.get(t.id) ?? 0
              const maxH = t.max_weekly_hours || 25
              const over = assigned > maxH
              const full = assigned === maxH
              const pct = Math.min(100, Math.round((assigned / maxH) * 100))
              return (
                <div key={t.id} className={`rounded-xl border p-2.5 ${over ? 'bg-rose-50/70 border-rose-200' : full ? 'bg-emerald-50/60 border-emerald-200' : 'bg-canvas border-line'}`}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="arabic font-semibold text-ink truncate">{t.full_name || t.username}</span>
                    <span className={`inline-flex items-center gap-1 font-bold num ${over ? 'text-rose-700' : full ? 'text-emerald-700' : 'text-brand'}`} dir="ltr">
                      {assigned}/{maxH}h
                      {over && <AlertIcon className="w-3.5 h-3.5" />}
                      {full && <CheckIcon className="w-3.5 h-3.5" />}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${over ? 'bg-rose-500' : full ? 'bg-emerald-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* View toggle + quick form */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex bg-surface border border-line rounded-xl p-1">
          <button onClick={() => setView('matrix')}
                  className={`arabic text-xs px-3 py-1.5 rounded-lg font-medium transition ${view === 'matrix' ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'}`}>
            جدول الإسناد الشبكي
          </button>
          <button onClick={() => setView('list')}
                  className={`arabic text-xs px-3 py-1.5 rounded-lg font-medium transition ${view === 'list' ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'}`}>
            عرض القائمة
          </button>
        </div>
      </div>

      <AddAssignmentForm
        teachers={teachers}
        classes={classes}
        subjects={subjects}
        existingByClass={byClass}
        onAdd={(teacherId, classId, subjectIds) =>
          run(() => api.assignments.create(teacherId, classId, subjectIds))}
      />

      {classes.length === 0 ? (
        <p className="arabic text-center text-gray-400 py-10">
          أنشئوا الأقسام أولاً من تبويب «الأقسام».
        </p>
      ) : view === 'matrix' ? (
        <div className="bg-surface border border-line rounded-2xl overflow-auto shadow-card">
          <table className="text-xs border-collapse min-w-max w-full">
            <thead>
              <tr className="bg-canvas">
                <th className="arabic border border-line px-3 py-2.5 text-right font-bold text-ink sticky start-0 bg-canvas min-w-[140px]">القسم</th>
                {subjects.map(s => (
                  <th key={s.id} className="arabic border border-line px-2 py-2.5 text-center font-semibold text-ink-muted min-w-[115px]">{s.name_ar}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classes.map(c => {
                const cRows = byClass.get(c.id) ?? []
                return (
                  <tr key={c.id} className="hover:bg-canvas/50">
                    <td className="arabic border border-line px-3 py-2 font-semibold text-ink sticky start-0 bg-surface">
                      {c.name}
                      {c.level && <span className="block text-[10px] text-ink-subtle font-normal">{c.level}</span>}
                    </td>
                    {subjects.map(s => {
                      const cur = cRows.find(a => a.subject_id === s.id)
                      return (
                        <td key={s.id} className="border border-line p-1 text-center">
                          <select
                            value={cur?.teacher_id ?? ''}
                            onChange={async e => {
                              const nextTid = e.target.value
                              if (cur) await run(() => api.assignments.delete(cur.id))
                              if (nextTid) await run(() => api.assignments.create(nextTid, c.id, [s.id]))
                            }}
                            className={`arabic w-full text-[11px] rounded-lg px-1.5 py-1 border transition ${
                              cur ? 'bg-brand-light/60 border-brand/30 text-brand font-medium' : 'bg-white border-transparent hover:border-line text-ink-subtle'
                            }`}
                          >
                            <option value="">—</option>
                            {teachers.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.full_name || t.username} ({teacherHours.get(t.id) ?? 0}/{t.max_weekly_hours ?? 25}h)
                              </option>
                            ))}
                          </select>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        classes.map(c => {
          const rows = byClass.get(c.id) ?? []
          return (
            <section key={c.id}>
              <h2 className="arabic text-sm font-semibold text-gray-600 mb-2 text-right" dir="rtl">
                {c.name} <span className="text-xs text-gray-400 font-normal">{c.year}</span>
              </h2>
              <div className="bg-surface border border-line rounded-2xl divide-y divide-line shadow-card">
                {rows.length === 0 ? (
                  <p className="arabic flex items-center gap-1.5 text-xs text-amber-700 px-4 py-3 text-right" dir="rtl">
                    <AlertIcon className="w-3.5 h-3.5 text-accent" /> لا معلم مسند لهذا القسم بعد
                  </p>
                ) : (
                  rows.map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5" dir="rtl">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="arabic text-sm font-semibold text-ink">{a.teacher_name}</span>
                        <span className="arabic text-xs bg-brand-light text-brand px-2.5 py-0.5 rounded-full font-medium">{a.subject_name}</span>
                      </div>
                      <button
                        onClick={async () => {
                          const ok = await ui.confirm({
                            title: 'إلغاء الإسناد',
                            message: `إلغاء إسناد ${a.subject_name} للمعلم ${a.teacher_name}؟ (تبقى الأعداد محفوظة)`,
                            confirmLabel: 'إلغاء الإسناد',
                            danger: true,
                          })
                          if (ok) run(() => api.assignments.delete(a.id))
                        }}
                        className="p-1.5 text-ink-subtle hover:text-rose-600 rounded-lg transition flex-shrink-0">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}

const ARABIC_PACK = new Set(['arabe', 'islamique', 'civique', 'histoire', 'geographie'])
const SCI_FR_PACK = new Set(['math', 'eveil', 'francais', 'anglais'])

function AddAssignmentForm({ teachers, classes, subjects, existingByClass, onAdd }: {
  teachers: { id: string; full_name: string; username: string }[]
  classes:  { id: string; name: string; year: string }[]
  subjects: Subject[]
  existingByClass: Map<string, AssignmentRow[]>
  onAdd: (teacherId: string, classId: string, subjectIds: string[]) => Promise<void> | void
}) {
  const [open,       setOpen]       = useState(false)
  const [teacherId,  setTeacherId]  = useState('')
  const [classId,    setClassId]    = useState('')
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set())

  const alreadyAssigned = new Set((existingByClass.get(classId) ?? []).map(a => a.subject_id))

  function toggleSubject(id: string) {
    setSubjectIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function applyPreset(filterFn: (s: Subject) => boolean) {
    setSubjectIds(new Set(subjects.filter(filterFn).map(s => s.id)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await onAdd(teacherId, classId, [...subjectIds])
    setSubjectIds(new Set())
    setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
              className="arabic w-full py-3 bg-brand hover:bg-brand-hover text-white rounded-2xl text-sm font-semibold shadow-sm transition inline-flex items-center justify-center gap-2">
        <PlusIcon className="w-4 h-4" /> إسناد معلم إلى قسم
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-brand-mid rounded-3xl p-5 space-y-4 shadow-card" dir="rtl">
      <h3 className="arabic font-bold text-ink">إسناد جديد</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">المعلم</label>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
                  className="arabic w-full bg-canvas/40 border border-line rounded-xl px-3.5 py-2 text-sm">
            <option value="">اختاروا…</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name || t.username}</option>)}
          </select>
        </div>
        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">القسم</label>
          <select value={classId} onChange={e => setClassId(e.target.value)}
                  className="arabic w-full bg-canvas/40 border border-line rounded-xl px-3.5 py-2 text-sm">
            <option value="">اختاروا…</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <label className="arabic text-xs font-semibold text-ink-muted">
            المواد (يمكن اختيار عدة مواد أو استعمال اختصار جاهز)
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => applyPreset(() => true)}
                    className="arabic text-[11px] px-2.5 py-1 rounded-xl bg-brand-light text-brand hover:bg-brand-mid/60 font-semibold transition">
              كل المواد (معلم فصل)
            </button>
            <button type="button" onClick={() => applyPreset(s => ARABIC_PACK.has(s.code))}
                    className="arabic text-[11px] px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold transition">
              مواد العربية
            </button>
            <button type="button" onClick={() => applyPreset(s => SCI_FR_PACK.has(s.code))}
                    className="arabic text-[11px] px-2.5 py-1 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition">
              العلمية والفرنسية
            </button>
            {subjectIds.size > 0 && (
              <button type="button" onClick={() => setSubjectIds(new Set())}
                      className="arabic text-[11px] px-2 py-1 rounded-lg text-ink-subtle hover:text-ink">
                مسح
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {subjects.map(s => {
            const isAssigned = alreadyAssigned.has(s.id)
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => toggleSubject(s.id)}
                title={isAssigned ? 'مادة مسندة مسبقاً لهذا القسم' : undefined}
                className={`arabic text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                  subjectIds.has(s.id)
                    ? 'bg-brand text-white border-brand shadow-sm'
                    : isAssigned
                    ? 'bg-canvas text-ink-subtle border-dashed border-line hover:border-brand/40'
                    : 'bg-surface text-ink-muted border-line hover:border-brand/40'
                }`}
              >
                {s.name_ar}{isAssigned && !subjectIds.has(s.id) ? ' ✓' : ''}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={!teacherId || !classId || subjectIds.size === 0}
                className="arabic px-5 py-2 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition">
          إسناد
        </button>
        <button type="button" onClick={() => setOpen(false)}
                className="arabic px-5 py-2 text-sm text-ink-muted hover:text-ink transition">
          إلغاء
        </button>
      </div>
    </form>
  )
}
