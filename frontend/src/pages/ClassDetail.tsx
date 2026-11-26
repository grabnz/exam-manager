import { useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ClassDetail as ClassDetailType, SessionSummary, Subject, YearGroup } from '../api/client'
import { useUI } from '../components/ui'
import AppShell from '../components/AppShell'

const TRIMESTERS = [1, 2, 3]
const IMTIHAN    = 'امتحان'

function taqyimNum(examType: string): number {
  const m = examType.match(/\d+/)
  return m ? parseInt(m[0]) : -1
}

function isTaqyim(examType: string) {
  return examType.startsWith('تقييم')
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ClassDetail() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const ui        = useUI()
  const [searchParams, setSearchParams] = useSearchParams()

  const [deleting,   setDeleting]   = useState(false)
  const [creating,   setCreating]   = useState<string | null>(null)
  const [deletingS,  setDeletingS]  = useState<string | null>(null)
  const [newStudent, setNewStudent] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkAdding, setBulkAdding] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [transferStudent, setTransferStudent] = useState<{ id: string; full_name: string } | null>(null)
  const [transferClassId, setTransferClassId] = useState('')

  const { data, isLoading, error } = useQuery<ClassDetailType>({
    queryKey: ['class', id],
    queryFn:  () => api.classes.get(id!),
  })
  const { data: allSubjects = [] } = useQuery<Subject[]>({
    queryKey: ['subjects'],
    queryFn:  api.subjects.list,
  })

  // Subject tabs: my assigned subjects ∪ subjects of existing sessions
  const subjectTabs = useMemo(() => {
    if (!data) return []
    const byId = new Map<string, { id: string; name: string }>()
    for (const s of data.my_subjects) byId.set(s.id, { id: s.id, name: s.name })
    for (const sess of data.sessions) {
      if (sess.subject_id && !byId.has(sess.subject_id)) {
        const subj = allSubjects.find(x => x.id === sess.subject_id)
        if (subj) byId.set(subj.id, { id: subj.id, name: subj.name_ar })
      }
    }
    return [...byId.values()]
  }, [data, allSubjects])

  const activeSubject = searchParams.get('subject') ?? subjectTabs[0]?.id ?? null

  const { data: subjectTemplates = [] } = useQuery({
    queryKey: ['templates', activeSubject],
    queryFn: () => api.templates.listForSubject(activeSubject!),
    enabled: !!activeSubject,
  })
  const { data: allYears = [] } = useQuery<YearGroup[]>({
    queryKey: ['classes'],
    queryFn: api.classes.list,
    enabled: !!transferStudent,
  })
  const otherClasses = useMemo(
    () => allYears.flatMap(y => y.classes.map(c => ({ ...c, year: y.label }))).filter(c => c.id !== id),
    [allYears, id]
  )

  async function openOrCreate(trimester: number, examType: string) {
    if (!activeSubject) return
    const key = `${trimester}-${examType}`
    const existing = data?.sessions.find(
      s => s.subject_id === activeSubject && s.trimester === trimester && s.exam_type === examType
    )
    if (existing) { navigate(`/sessions/${existing.id}`); return }
    setCreating(key)
    try {
      const res = await api.sessions.create(id!, trimester, examType, activeSubject, selectedTemplateId || undefined)
      await qc.invalidateQueries({ queryKey: ['class', id] })
      navigate(`/sessions/${res.id}`)
    } catch (err: any) {
      ui.toast(err.message || 'حدث خطأ', 'error')
    } finally {
      setCreating(null)
    }
  }

  async function handleDelete() {
    const ok = await ui.confirm({
      title: 'حذف القسم',
      message: 'حذف هذا القسم وكل بياناته نهائياً؟',
      confirmLabel: 'حذف',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      await api.classes.delete(id!)
      navigate('/')
    } catch (err: any) {
      ui.toast(err.message || 'حدث خطأ', 'error')
      setDeleting(false)
    }
  }

  async function deleteSession(sessionId: string, examType: string) {
    const ok = await ui.confirm({
      title: 'حذف الجلسة',
      message: `حذف "${examType}" وجميع أعداده؟`,
      confirmLabel: 'حذف',
      danger: true,
    })
    if (!ok) return
    setDeletingS(sessionId)
    try {
      await api.sessions.delete(sessionId)
      await qc.invalidateQueries({ queryKey: ['class', id] })
    } catch (err: any) {
      ui.toast(err.message || 'حدث خطأ', 'error')
    } finally {
      setDeletingS(null)
    }
  }

  async function renameClass() {
    const name = await ui.prompt({ title: 'تعديل اسم القسم', defaultValue: data?.name ?? '' })
    if (!name || name === data?.name) return
    await api.classes.rename(id!, name)
    await qc.invalidateQueries({ queryKey: ['class', id] })
    await qc.invalidateQueries({ queryKey: ['classes'] })
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault()
    const name = newStudent.trim()
    if (!name) return
    setAddingStudent(true)
    try {
      await api.students.add(id!, name)
      setNewStudent('')
      await qc.invalidateQueries({ queryKey: ['class', id] })
    } finally {
      setAddingStudent(false)
    }
  }

  function parseBulkNames(raw: string): string[] {
    return raw
      .split(/\r?\n/)
      .map(line => line.split(/[,\t;]/)[0]?.trim() ?? '')
      .map(s => s.replace(/^\d+[\s.\-)]+/, '').trim())
      .filter(Boolean)
  }

  async function addBulkStudents(e: React.FormEvent) {
    e.preventDefault()
    const names = parseBulkNames(bulkText)
    if (names.length === 0) return
    setBulkAdding(true)
    try {
      await api.students.bulkAdd(id!, names)
      setBulkText('')
      setBulkOpen(false)
      await qc.invalidateQueries({ queryKey: ['class', id] })
      await qc.invalidateQueries({ queryKey: ['classes'] })
    } finally {
      setBulkAdding(false)
    }
  }

  async function renameStudent(studentId: string, current: string) {
    const name = await ui.prompt({ title: 'تعديل اسم التلميذ', defaultValue: current })
    if (!name || name === current) return
    await api.students.rename(studentId, name)
    await qc.invalidateQueries({ queryKey: ['class', id] })
  }

  async function deleteStudent(studentId: string, name: string) {
    const ok = await ui.confirm({
      title: 'حذف تلميذ',
      message: `حذف التلميذ "${name}" وجميع أعداده نهائياً؟`,
      confirmLabel: 'حذف',
      danger: true,
    })
    if (!ok) return
    await api.students.delete(studentId)
    await qc.invalidateQueries({ queryKey: ['class', id] })
  }

  async function moveStudent(index: number, delta: -1 | 1) {
    if (!data) return
    const target = index + delta
    if (target < 0 || target >= data.students.length) return
    const ids = data.students.map(s => s.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await api.students.reorder(id!, ids)
    await qc.invalidateQueries({ queryKey: ['class', id] })
  }

  async function confirmTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!transferStudent || !transferClassId) return
    await api.students.transfer(transferStudent.id, transferClassId)
    setTransferStudent(null)
    setTransferClassId('')
    ui.toast('تم نقل التلميذ مع الاحتفاظ بأعداده', 'success')
    await qc.invalidateQueries({ queryKey: ['class', id] })
    await qc.invalidateQueries({ queryKey: ['classes'] })
  }

  if (isLoading) return <Loading />
  if (error || !data) return <p className="p-8 text-red-600">خطأ في التحميل</p>

  const isAdmin = data.is_admin
  const subjectSessions = data.sessions.filter(s => s.subject_id === activeSubject)
  const byTrimester = (t: number) => subjectSessions.filter(s => s.trimester === t)
  const getTaqyim = (t: number) =>
    byTrimester(t).filter(s => isTaqyim(s.exam_type)).sort((a, b) => taqyimNum(a.exam_type) - taqyimNum(b.exam_type))
  const getImtihan = (t: number) => byTrimester(t).find(s => s.exam_type === IMTIHAN)
  const nextTaqyim = (t: number) => {
    const list = getTaqyim(t)
    const next = list.length === 0 ? 0 : taqyimNum(list[list.length - 1].exam_type) + 1
    return `تقييم ${next}`
  }

  return (
    <AppShell
      title={data.name}
      subtitle={`${data.level ? `${data.level} · ` : ''}${data.school_year} · ${data.students.length} تلميذ`}
      actions={
        <>
          {isAdmin && (
            <button onClick={renameClass} title="تعديل اسم القسم"
                    className="arabic text-xs text-ink-muted hover:text-brand border border-line bg-surface px-2.5 py-1.5 rounded-xl transition">
              ✎ تعديل الاسم
            </button>
          )}
          <button onClick={() => navigate(`/classes/${id}/synthesis`)}
                  className="arabic text-xs md:text-sm bg-brand text-white hover:bg-brand-hover px-3.5 py-1.5 rounded-xl font-medium shadow-sm transition">
            كشف النتائج والمقارنة
          </button>
          {isAdmin && (
            <button onClick={handleDelete} disabled={deleting}
                    className="arabic text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl transition">
              حذف
            </button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">

        {/* Sessions */}
        <div className="lg:col-span-2">
          {/* Subject tabs */}
          {subjectTabs.length > 0 ? (
            <div className="flex gap-1.5 mb-4 overflow-x-auto" dir="rtl">
              {subjectTabs.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSearchParams({ subject: s.id }, { replace: true })}
                  className={`arabic px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    activeSubject === s.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="arabic bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm mb-4 text-right" dir="rtl">
              {isAdmin
                ? '⚠ لا معلم مسند لهذا القسم — أسندوا المعلمين والمواد من لوحة المدير.'
                : '⚠ لستم مسندين لهذا القسم.'}
            </div>
          )}

          {activeSubject && subjectTemplates.length > 1 && (
            <div className="mb-3 flex items-center gap-2 text-xs" dir="rtl">
              <span className="arabic text-gray-500">شبكة الجلسات الجديدة:</span>
              <select
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                className="arabic bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700"
              >
                <option value="">الافتراضية (الأحدث)</option>
                {subjectTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {activeSubject && (
            <div className="grid grid-cols-3 gap-3">
              {TRIMESTERS.map(t => {
                const taqyim  = getTaqyim(t)
                const imtihan = getImtihan(t)
                const next    = nextTaqyim(t)

                return (
                  <div key={t} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 text-center">
                      <span className="arabic text-xs font-semibold text-gray-600 tracking-wider">
                        الثلاثي {t}
                      </span>
                    </div>

                    <div className="p-2 space-y-1.5">
                      {taqyim.map(s => (
                        <SessionBtn
                          key={s.id}
                          label={s.exam_type}
                          session={s}
                          loading={creating === `${t}-${s.exam_type}` || deletingS === s.id}
                          onClick={() => openOrCreate(t, s.exam_type)}
                          onDelete={() => deleteSession(s.id, s.exam_type)}
                        />
                      ))}

                      <button
                        onClick={() => openOrCreate(t, next)}
                        disabled={!!creating}
                        className="w-full flex items-center justify-center gap-1.5 arabic py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-dashed border-blue-300 hover:bg-blue-50 transition disabled:opacity-40"
                      >
                        <span className="text-base leading-none">+</span>
                        <span>{next}</span>
                      </button>

                      <div className="border-t border-gray-100 my-1" />

                      <SessionBtn
                        label={IMTIHAN}
                        session={imtihan}
                        loading={creating === `${t}-${IMTIHAN}` || deletingS === imtihan?.id}
                        onClick={() => openOrCreate(t, IMTIHAN)}
                        onDelete={imtihan ? () => deleteSession(imtihan.id, IMTIHAN) : undefined}
                        accent
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Student list */}
        <div>
          <div className="flex items-center justify-between mb-4" dir="rtl">
            <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider">
              قائمة التلاميذ ({data.students.length})
            </h2>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setBulkOpen(v => !v)}
                className="arabic text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition"
              >
                {bulkOpen ? 'إغلاق' : '+ إضافة جماعية'}
              </button>
            )}
          </div>
          {isAdmin && bulkOpen && (
            <form onSubmit={addBulkStudents} className="mb-3 bg-white border border-blue-200 rounded-xl p-3 space-y-2" dir="rtl">
              <div className="flex items-center justify-between">
                <label className="arabic text-xs font-medium text-gray-600">
                  لصق الأسماء (اسم في كل سطر)
                </label>
                <label className="arabic text-xs text-blue-600 hover:underline cursor-pointer">
                  ⬆ ملف CSV/TXT
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const txt = await f.text()
                      setBulkText(prev => (prev ? prev + '\n' + txt : txt))
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
              <textarea
                rows={5}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={"أحمد بن علي\nمريم الطرابلسي\nيوسف المنصوري"}
                className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="flex items-center justify-between">
                <span className="arabic text-xs text-gray-400">
                  {parseBulkNames(bulkText).length} تلميذ جاهز للإضافة
                </span>
                <button
                  type="submit"
                  disabled={bulkAdding || parseBulkNames(bulkText).length === 0}
                  className="arabic px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-medium"
                >
                  {bulkAdding ? 'جاري الإضافة…' : 'إضافة الكل'}
                </button>
              </div>
            </form>
          )}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto">
              {data.students.map((s, i) => (
                <div key={s.id}
                     className="group flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50">
                  <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">{i + 1}</span>
                  <span className="arabic text-sm text-gray-800 flex-1">{s.full_name}</span>
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => moveStudent(i, -1)} disabled={i === 0} title="أعلى"
                              className="text-xs text-gray-400 hover:text-blue-600 disabled:opacity-20 px-0.5">↑</button>
                      <button onClick={() => moveStudent(i, 1)} disabled={i === data.students.length - 1} title="أسفل"
                              className="text-xs text-gray-400 hover:text-blue-600 disabled:opacity-20 px-0.5">↓</button>
                      <button onClick={() => setTransferStudent({ id: s.id, full_name: s.full_name })} title="نقل إلى قسم آخر"
                              className="text-xs text-gray-400 hover:text-emerald-600 px-0.5">⇄</button>
                      <button onClick={() => renameStudent(s.id, s.full_name)} title="تعديل"
                              className="text-xs text-gray-400 hover:text-blue-500 px-0.5">✎</button>
                      <button onClick={() => deleteStudent(s.id, s.full_name)} title="حذف"
                              className="text-xs text-gray-400 hover:text-red-500 px-0.5">✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {isAdmin ? (
              <form onSubmit={addStudent} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-t border-gray-100">
                <input
                  type="text" value={newStudent} onChange={e => setNewStudent(e.target.value)}
                  placeholder="إضافة تلميذ…" dir="rtl"
                  className="arabic flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button type="submit" disabled={addingStudent || !newStudent.trim()}
                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-lg leading-none">
                  +
                </button>
              </form>
            ) : (
              <p className="arabic text-xs text-gray-400 px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-right" dir="rtl">
                قائمة التلاميذ تديرها إدارة المدرسة
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Transfer student modal (#17) */}
      {transferStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setTransferStudent(null)}>
          <form onSubmit={confirmTransfer} onClick={e => e.stopPropagation()}
                className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-xl" dir="rtl">
            <h3 className="arabic text-base font-bold text-gray-900">نقل التلميذ</h3>
            <p className="arabic text-sm text-gray-600">
              نقل «{transferStudent.full_name}» إلى قسم آخر (تبقى جميع أعداده محفوظة):
            </p>
            <select
              value={transferClassId}
              onChange={e => setTransferClassId(e.target.value)}
              required
              className="arabic w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">اختاروا القسم المستهدف…</option>
              {otherClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.year})</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="submit" disabled={!transferClassId}
                      className="arabic flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium">
                نقل
              </button>
              <button type="button" onClick={() => setTransferStudent(null)}
                      className="arabic flex-1 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  )
}

// ── Session button ─────────────────────────────────────────────────────────────
function SessionBtn({ label, session, loading, onClick, onDelete, accent = false }: {
  label: string
  session?: SessionSummary
  loading: boolean
  onClick: () => void
  onDelete?: () => void
  accent?: boolean
}) {
  const hasScores = session?.has_scores
  const exists    = !!session

  const isFinalized = session?.is_finalized

  let cls = 'flex-1 arabic py-2 rounded-lg text-xs font-medium transition text-center '
  if (loading)         cls += 'bg-gray-100 text-gray-400 cursor-wait'
  else if (isFinalized) cls += 'bg-green-100 text-green-700 hover:bg-green-200'
  else if (hasScores)  cls += 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
  else if (exists)     cls += 'bg-blue-50 text-blue-600 hover:bg-blue-100'
  else if (accent)     cls += 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'
  else                 cls += 'bg-gray-100 text-gray-500 hover:bg-gray-200'

  return (
    <div className="flex items-center gap-1">
      <button onClick={onClick} disabled={loading} className={cls}>
        {loading ? '…' : (
          <span className="flex items-center justify-between px-2" dir="rtl">
            <span>{label}</span>
            <span className="arabic text-gray-400 font-normal">
              {isFinalized ? '🔒 ✓' : hasScores ? 'جارٍ' : exists ? 'إدخال' : 'إنشاء'}
            </span>
          </span>
        )}
      </button>
      {exists && onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          disabled={loading}
          title="حذف"
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-30"
        >
          ✕
        </button>
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  )
}
