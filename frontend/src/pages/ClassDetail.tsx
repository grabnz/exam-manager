import { useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ClassDetail as ClassDetailType, SessionSummary, Subject } from '../api/client'

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
  const [searchParams, setSearchParams] = useSearchParams()

  const [deleting,   setDeleting]   = useState(false)
  const [creating,   setCreating]   = useState<string | null>(null)
  const [deletingS,  setDeletingS]  = useState<string | null>(null)
  const [newStudent, setNewStudent] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)

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

  async function openOrCreate(trimester: number, examType: string) {
    if (!activeSubject) return
    const key = `${trimester}-${examType}`
    const existing = data?.sessions.find(
      s => s.subject_id === activeSubject && s.trimester === trimester && s.exam_type === examType
    )
    if (existing) { navigate(`/sessions/${existing.id}`); return }
    setCreating(key)
    try {
      const res = await api.sessions.create(id!, trimester, examType, activeSubject)
      await qc.invalidateQueries({ queryKey: ['class', id] })
      navigate(`/sessions/${res.id}`)
    } catch (err: any) {
      alert(err.message || 'حدث خطأ')
    } finally {
      setCreating(null)
    }
  }

  async function handleDelete() {
    if (!confirm('حذف هذا القسم وكل بياناته نهائياً ؟')) return
    setDeleting(true)
    try {
      await api.classes.delete(id!)
      navigate('/')
    } catch (err: any) {
      alert(err.message || 'حدث خطأ')
      setDeleting(false)
    }
  }

  async function deleteSession(sessionId: string, examType: string) {
    if (!confirm(`حذف "${examType}" وجميع أعداده ؟`)) return
    setDeletingS(sessionId)
    try {
      await api.sessions.delete(sessionId)
      await qc.invalidateQueries({ queryKey: ['class', id] })
    } catch (err: any) {
      alert(err.message || 'حدث خطأ')
    } finally {
      setDeletingS(null)
    }
  }

  async function renameClass() {
    const name = window.prompt('اسم القسم الجديد :', data?.name ?? '')
    if (!name?.trim() || name.trim() === data?.name) return
    await api.classes.rename(id!, name.trim())
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

  async function renameStudent(studentId: string, current: string) {
    const name = window.prompt('الاسم الجديد :', current)
    if (!name?.trim() || name.trim() === current) return
    await api.students.rename(studentId, name.trim())
    await qc.invalidateQueries({ queryKey: ['class', id] })
  }

  async function deleteStudent(studentId: string, name: string) {
    if (!confirm(`حذف التلميذ "${name}" وجميع أعداده نهائياً ؟`)) return
    await api.students.delete(studentId)
    await qc.invalidateQueries({ queryKey: ['class', id] })
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <button onClick={() => navigate('/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3">
          ← الرئيسية
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="arabic text-xl md:text-2xl font-bold text-gray-900">
              {data.name}
              {isAdmin && (
                <button onClick={renameClass} title="تعديل الاسم"
                        className="mr-2 ml-2 text-sm text-gray-300 hover:text-blue-500 align-middle">✎</button>
              )}
            </h1>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
              {data.level && <span className="arabic">{data.level}</span>}
              <span className="arabic">{data.school_year}</span>
              <span className="arabic">{data.students.length} تلميذ</span>
            </div>
          </div>
          {isAdmin && (
            <button onClick={handleDelete} disabled={deleting}
                    className="arabic text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition flex-shrink-0">
              حذف القسم
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">

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
          <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 text-right" dir="rtl">
            قائمة التلاميذ ({data.students.length})
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto">
              {data.students.map((s, i) => (
                <div key={s.id}
                     className="group flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50">
                  <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">{i + 1}</span>
                  <span className="arabic text-sm text-gray-800 flex-1">{s.full_name}</span>
                  {isAdmin && (
                    <>
                      <button onClick={() => renameStudent(s.id, s.full_name)} title="تعديل"
                              className="text-xs text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition">✎</button>
                      <button onClick={() => deleteStudent(s.id, s.full_name)} title="حذف"
                              className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">✕</button>
                    </>
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

      </main>
    </div>
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
