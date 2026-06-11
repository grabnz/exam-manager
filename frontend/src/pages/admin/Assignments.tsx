import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, AssignmentRow, Subject, UserRow, YearGroup } from '../../api/client'

export default function Assignments() {
  const qc = useQueryClient()
  const [error, setError] = useState('')

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

  const teachers = users.filter(u => u.role === 'teacher' && u.is_active)
  const classes  = years.flatMap(y => y.classes.map(c => ({ ...c, year: y.label })))

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
    <div className="space-y-6">
      {error && (
        <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-right" dir="rtl">
          {error}
        </div>
      )}

      <AddAssignmentForm
        teachers={teachers}
        classes={classes}
        subjects={subjects}
        onAdd={(teacherId, classId, subjectIds) =>
          run(() => api.assignments.create(teacherId, classId, subjectIds))}
      />

      {classes.length === 0 ? (
        <p className="arabic text-center text-gray-400 py-10" dir="rtl">
          أنشئوا الأقسام أولاً من تبويب «الأقسام».
        </p>
      ) : (
        classes.map(c => {
          const rows = byClass.get(c.id) ?? []
          return (
            <section key={c.id}>
              <h2 className="arabic text-sm font-semibold text-gray-600 mb-2 text-right" dir="rtl">
                {c.name} <span className="text-xs text-gray-400 font-normal">{c.year}</span>
              </h2>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <p className="arabic text-xs text-amber-600 px-4 py-3 text-right" dir="rtl">
                    ⚠ لا معلم مسند لهذا القسم بعد
                  </p>
                ) : (
                  rows.map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5" dir="rtl">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="arabic text-sm font-medium text-gray-800">{a.teacher_name}</span>
                        <span className="arabic text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{a.subject_name}</span>
                      </div>
                      <button
                        onClick={() => {
                          if (window.confirm(`إلغاء إسناد ${a.subject_name} للمعلم ${a.teacher_name}؟ (تبقى الأعداد محفوظة)`))
                            run(() => api.assignments.delete(a.id))
                        }}
                        className="text-xs text-gray-300 hover:text-red-500 flex-shrink-0">
                        ✕
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

function AddAssignmentForm({ teachers, classes, subjects, onAdd }: {
  teachers: { id: string; full_name: string; username: string }[]
  classes:  { id: string; name: string; year: string }[]
  subjects: Subject[]
  onAdd: (teacherId: string, classId: string, subjectIds: string[]) => Promise<void> | void
}) {
  const [open,       setOpen]       = useState(false)
  const [teacherId,  setTeacherId]  = useState('')
  const [classId,    setClassId]    = useState('')
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set())

  function toggleSubject(id: string) {
    setSubjectIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
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
              className="arabic w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition">
        + إسناد معلم إلى قسم
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white border border-blue-200 rounded-xl p-5 space-y-4" dir="rtl">
      <h3 className="arabic font-semibold text-gray-800">إسناد جديد</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">المعلم</label>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
                  className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">اختاروا…</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name || t.username}</option>)}
          </select>
        </div>
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">القسم</label>
          <select value={classId} onChange={e => setClassId(e.target.value)}
                  className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">اختاروا…</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="arabic block text-xs font-medium text-gray-600 mb-2">
          المواد (يمكن اختيار عدة مواد — معلم السنة الأولى مثلاً يدرّس كل المواد)
        </label>
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

      <div className="flex gap-2">
        <button type="submit" disabled={!teacherId || !classId || subjectIds.size === 0}
                className="arabic px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium">
          إسناد
        </button>
        <button type="button" onClick={() => setOpen(false)}
                className="arabic px-5 py-2 text-sm text-gray-500 hover:text-gray-700">
          إلغاء
        </button>
      </div>
    </form>
  )
}
