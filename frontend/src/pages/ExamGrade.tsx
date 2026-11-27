import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, ExamGradingData, StudentGradingRow } from '../api/client'
import { useUI } from '../components/ui'
import {
  ArrowRightIcon, CheckIcon, PrinterIcon, UsersIcon, ChartIcon, EditIcon,
} from '../components/icons'

function buildScorePills(maxPts: number): number[] {
  const step = maxPts <= 3 ? 0.5 : maxPts <= 6 ? 1 : 1
  const out: number[] = []
  for (let v = 0; v <= maxPts + 0.001; v += step) {
    out.push(Math.round(v * 10) / 10)
  }
  if (out[out.length - 1] !== maxPts) out.push(maxPts)
  return out
}

export default function ExamGrade() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const ui = useUI()

  const { data: yearGroups = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['classes'],
    queryFn: () => api.classes.list(),
  })
  const classes = useMemo(
    () => yearGroups.flatMap(g => g.classes),
    [yearGroups],
  )

  const [classId, setClassId] = useState('')
  const [tab, setTab] = useState<'grade' | 'remediation'>('grade')
  const [syncToSession, setSyncToSession] = useState(true)
  const [saving, setSaving] = useState(false)

  // Local editable rows + active student index
  const [rows, setRows] = useState<StudentGradingRow[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [linkedSessionId, setLinkedSessionId] = useState('')
  const [analytics, setAnalytics] = useState<ExamGradingData['analytics'] | null>(null)

  useEffect(() => {
    if (!classId && classes.length > 0) {
      setClassId(classes[0].id)
    }
  }, [classes, classId])

  const { data: grading, isLoading: loadingGrading } = useQuery<ExamGradingData>({
    queryKey: ['exam-grading', id, classId],
    queryFn: () => api.exams.getGrading(id!, classId),
    enabled: !!id && !!classId,
  })

  useEffect(() => {
    if (!grading) return
    setRows(grading.students)
    setLinkedSessionId(grading.linked_session_id)
    setAnalytics(grading.analytics)
    // Start at first ungraded student if any
    const firstUngraded = grading.students.findIndex(s => s.status === 'present' && s.total_score == null)
    setActiveIdx(firstUngraded >= 0 ? firstUngraded : 0)
  }, [grading])

  const items = grading?.items ?? []
  const activeStudent = rows[activeIdx]

  const activeTotal = useMemo(() => {
    if (!activeStudent || activeStudent.status !== 'present') return null
    const vals = Object.values(activeStudent.item_scores ?? {})
    if (vals.length === 0) return null
    const sum = vals.reduce((a, b) => a + (Number(b) || 0), 0)
    return Math.min(20, Math.round(sum * 100) / 100)
  }, [activeStudent])

  function setItemScore(studentId: string, itemKey: string, val: number) {
    setRows(prev => prev.map(r => {
      if (r.student_id !== studentId) return r
      const nextScores = { ...r.item_scores, [itemKey]: val }
      const sum = Object.values(nextScores).reduce((a, b) => a + (Number(b) || 0), 0)
      return {
        ...r,
        status: 'present',
        item_scores: nextScores,
        total_score: Math.min(20, Math.round(sum * 100) / 100),
      }
    }))
  }

  function setStudentStatus(studentId: string, status: 'present' | 'absent' | 'exempt') {
    setRows(prev => prev.map(r => {
      if (r.student_id !== studentId) return r
      return {
        ...r,
        status,
        total_score: status === 'present' ? r.total_score : null,
      }
    }))
  }

  function fillFullMarks(studentId: string) {
    const all: Record<string, number> = {}
    let sum = 0
    for (const it of items) {
      all[it.key] = it.max_points
      sum += it.max_points
    }
    setRows(prev => prev.map(r => r.student_id === studentId ? {
      ...r, status: 'present', item_scores: all, total_score: Math.min(20, Math.round(sum * 100) / 100),
    } : r))
  }

  async function saveCurrent(advance = false) {
    if (!id || !classId || rows.length === 0) return
    setSaving(true)
    try {
      const res = await api.exams.saveGrading(id, classId, {
        sync_to_session: syncToSession,
        entries: rows.map(r => ({
          student_id: r.student_id,
          status: r.status,
          item_scores: r.item_scores,
        })),
      })
      setLinkedSessionId(res.linked_session_id)
      setAnalytics(res.analytics)
      if (advance && activeIdx < rows.length - 1) {
        setActiveIdx(i => i + 1)
      } else {
        ui.toast(
          syncToSession
            ? 'تم حفظ الأعداد ومزامنتها تلقائياً مع دفتر الأعداد وبنك التمارين'
            : 'تم حفظ الأعداد بنجاح',
          'success',
        )
      }
    } catch (err: any) {
      ui.toast(err.message || 'تعذّر حفظ الأعداد', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Keyboard shortcut: Ctrl+Enter or Enter (when not inside a button) saves and jumps to next student
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== 'grade') return
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void saveCurrent(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rows, activeIdx, syncToSession, classId])

  const gradedCount = rows.filter(r => r.status !== 'present' || r.total_score != null).length

  return (
    <div className="min-h-screen bg-canvas flex flex-col" dir="rtl">
      {/* Top Bar */}
      <header className="print:hidden bg-surface/95 backdrop-blur border-b border-line px-4 md:px-6 py-3 sticky top-0 z-20 shadow-card">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/exams')}
              className="arabic inline-flex items-center gap-1 text-xs text-ink-muted hover:text-brand font-semibold"
            >
              <ArrowRightIcon className="w-4 h-4" /> الخزينة
            </button>
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-ink truncate" dir="ltr">
                {grading?.exam?.title || 'تصحيح الامتحان السريع'}
              </h1>
              <p className="arabic text-[11px] text-ink-muted">
                إدخال سريع لأعداد الأوراق المصحّحة يدوياً مع حساب المجموع الآلي والمزامنة مع دفتر الأعداد
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={classId}
              onChange={e => setClassId(e.target.value)}
              className="arabic bg-canvas border border-line rounded-xl px-3 py-2 text-xs font-bold text-ink"
            >
              {classes.length === 0 && <option value="">لا توجد أقسام</option>}
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.level ? `(${c.level})` : ''} · {c.student_count} تلميذ
                </option>
              ))}
            </select>

            {linkedSessionId && (
              <button
                onClick={() => navigate(`/sessions/${linkedSessionId}`)}
                className="arabic inline-flex items-center gap-1.5 text-xs bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 px-3 py-2 rounded-xl font-semibold transition"
              >
                <EditIcon className="w-3.5 h-3.5" /> فتح دفتر الأعداد
              </button>
            )}

            <button
              onClick={() => void saveCurrent(false)}
              disabled={saving || !classId}
              className="arabic inline-flex items-center gap-1.5 text-xs bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white px-4 py-2 rounded-xl font-semibold shadow-sm transition"
            >
              <CheckIcon className="w-3.5 h-3.5" /> {saving ? 'جاري الحفظ…' : 'حفظ ومزامنة الكل'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-5 space-y-5">
        {/* Tabs + Sync toggle */}
        <div className="print:hidden flex items-center justify-between flex-wrap gap-3 bg-surface border border-line rounded-2xl p-3 shadow-card">
          <div className="inline-flex bg-canvas rounded-xl p-1">
            <button
              onClick={() => setTab('grade')}
              className={`arabic inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition ${
                tab === 'grade' ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <UsersIcon className="w-3.5 h-3.5" /> إدخال سريع من الأوراق ({gradedCount}/{rows.length})
            </button>
            <button
              onClick={() => setTab('remediation')}
              className={`arabic inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition ${
                tab === 'remediation' ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <ChartIcon className="w-3.5 h-3.5" /> تحليل النتائج والتدارك (Remédiation)
            </button>
          </div>

          <label className="arabic inline-flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
            <input
              type="checkbox"
              checked={syncToSession}
              onChange={e => setSyncToSession(e.target.checked)}
              className="w-4 h-4 accent-brand rounded"
            />
            <span>مزامنة تلقائية مع دفتر الأعداد (C1–C6) ومعايرة بنك التمارين</span>
          </label>
        </div>

        {loadingClasses || loadingGrading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-brand border-t-transparent rounded-full" />
          </div>
        ) : !classId || rows.length === 0 ? (
          <div className="bg-surface border border-line rounded-3xl p-10 text-center space-y-2">
            <p className="arabic text-sm font-bold text-ink">لا يوجد تلاميذ في هذا القسم بعد</p>
            <p className="arabic text-xs text-ink-muted">اختاروا قسماً آخر من القائمة أعلاه أو أضيفوا التلاميذ في صفحة الأقسام.</p>
          </div>
        ) : tab === 'grade' && activeStudent ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Student Queue Sidebar (4 cols) */}
            <aside className="lg:col-span-4 bg-surface border border-line rounded-3xl p-4 shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="arabic text-xs font-bold text-ink">قائمة تلاميذ القسم</span>
                <span className="text-xs font-bold text-brand num">{gradedCount} / {rows.length}</span>
              </div>
              <div className="w-full h-1.5 bg-canvas rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${rows.length ? (gradedCount / rows.length) * 100 : 0}%` }}
                />
              </div>
              <div className="space-y-1 max-h-[60vh] overflow-y-auto pl-1">
                {rows.map((st, idx) => {
                  const active = idx === activeIdx
                  const done = st.status !== 'present' || st.total_score != null
                  return (
                    <button
                      key={st.student_id}
                      type="button"
                      onClick={() => setActiveIdx(idx)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition ${
                        active
                          ? 'bg-brand text-white font-bold shadow-sm'
                          : done
                          ? 'bg-emerald-50/70 text-ink hover:bg-emerald-100/70'
                          : 'bg-canvas/60 text-ink-muted hover:bg-canvas'
                      }`}
                    >
                      <span className="arabic truncate">
                        <span className="num opacity-70 ml-1.5">{idx + 1}.</span>
                        {st.student_name}
                      </span>
                      <span className={`text-[11px] font-bold num px-2 py-0.5 rounded-full ${
                        active
                          ? 'bg-white/20 text-white'
                          : st.status === 'absent'
                          ? 'bg-rose-100 text-rose-700'
                          : st.status === 'exempt'
                          ? 'bg-amber-100 text-amber-800'
                          : st.total_score != null
                          ? st.total_score >= 10
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-700'
                          : 'text-ink-subtle'
                      }`}>
                        {st.status === 'absent'
                          ? 'غائب'
                          : st.status === 'exempt'
                          ? 'معفى'
                          : st.total_score != null
                          ? `${st.total_score}/20`
                          : '—'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </aside>

            {/* Active Student Rapid Score Card (8 cols) */}
            <section className="lg:col-span-8 bg-surface border border-line rounded-3xl p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap border-b border-line pb-3">
                <div>
                  <span className="arabic text-[11px] text-ink-subtle num">
                    التلميذ {activeIdx + 1} من {rows.length}
                  </span>
                  <h2 className="arabic text-lg font-extrabold text-ink">{activeStudent.student_name}</h2>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex bg-canvas p-1 rounded-xl text-xs">
                    {([['present', 'حاضر'], ['absent', 'غائب'], ['exempt', 'معفى']] as const).map(([st, lbl]) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStudentStatus(activeStudent.student_id, st)}
                        className={`arabic px-2.5 py-1 rounded-lg font-semibold transition ${
                          activeStudent.status === st ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {activeStudent.status === 'present' && (
                    <button
                      type="button"
                      onClick={() => fillFullMarks(activeStudent.student_id)}
                      className="arabic text-[11px] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 px-2.5 py-1.5 rounded-xl font-semibold transition"
                    >
                      علامة كاملة (20/20)
                    </button>
                  )}

                  <div className={`px-3.5 py-1.5 rounded-xl font-extrabold text-sm num border ${
                    activeTotal == null
                      ? 'bg-canvas text-ink-subtle border-line'
                      : activeTotal >= 10
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-rose-600 text-white border-rose-700'
                  }`} dir="ltr">
                    {activeTotal != null ? `${activeTotal} / 20` : '— / 20'}
                  </div>
                </div>
              </div>

              {activeStudent.status !== 'present' ? (
                <div className="py-10 text-center bg-canvas/50 rounded-2xl border border-dashed border-line">
                  <p className="arabic text-sm font-semibold text-ink-muted">
                    هذا التلميذ مسجّل كـ «{activeStudent.status === 'absent' ? 'غائب' : 'معفى'}» — لن يُحتسب في معدل القسم.
                  </p>
                </div>
              ) : items.length === 0 ? (
                <div className="py-10 text-center bg-canvas/50 rounded-2xl border border-dashed border-line">
                  <p className="arabic text-sm text-ink-muted">هذا الامتحان لا يحتوي على تمارين منقّطة بعد.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((it, idx) => {
                    const curVal = activeStudent.item_scores[it.key]
                    const pills = buildScorePills(it.max_points)
                    return (
                      <div key={it.key} className="bg-canvas/60 border border-line rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0" dir="ltr">
                            <span className="text-[11px] font-bold bg-surface border border-line px-2 py-0.5 rounded-full text-brand">
                              {idx + 1} · {it.criterion}
                            </span>
                            <span className="text-xs font-bold text-ink truncate">{it.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5" dir="ltr">
                            <input
                              type="number"
                              min={0}
                              max={it.max_points}
                              step={0.25}
                              value={curVal ?? ''}
                              placeholder="—"
                              onChange={e => {
                                const n = parseFloat(e.target.value)
                                if (!Number.isNaN(n)) setItemScore(activeStudent.student_id, it.key, Math.max(0, Math.min(it.max_points, n)))
                              }}
                              className="w-16 bg-surface border border-line rounded-lg px-2 py-1 text-xs text-center font-bold num focus:outline-none focus:ring-2 focus:ring-brand/40"
                            />
                            <span className="text-xs text-ink-subtle font-semibold num">/ {it.max_points}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5" dir="ltr">
                          {pills.map(p => {
                            const selected = curVal !== undefined && Math.abs(curVal - p) < 0.01
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setItemScore(activeStudent.student_id, it.key, p)}
                                className={`min-w-[36px] px-2.5 py-1 rounded-xl text-xs font-bold num border transition ${
                                  selected
                                    ? 'bg-brand text-white border-brand shadow-sm'
                                    : 'bg-surface border-line text-ink hover:border-brand/50'
                                }`}
                              >
                                {p}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Footer Nav: Previous / Save & Next */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  disabled={activeIdx === 0}
                  onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                  className="arabic px-4 py-2 border border-line rounded-xl text-xs font-semibold text-ink-muted hover:bg-canvas disabled:opacity-40 transition"
                >
                  ← التلميذ السابق
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveCurrent(activeIdx < rows.length - 1)}
                    className="arabic px-5 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-xs font-bold shadow-sm transition"
                  >
                    {saving
                      ? 'جاري الحفظ…'
                      : activeIdx < rows.length - 1
                      ? 'حفظ والانتقال للتلميذ التالي ←'
                      : 'حفظ وإنهاء القسم ✓'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : (
          /* ── Tab 2: Automatic Class Remediation & Inspector Report ── */
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="arabic text-base font-extrabold text-ink">
                  تقرير تحليل النتائج والتدارك (Remédiation) — {grading?.class?.name}
                </h2>
                <p className="arabic text-xs text-ink-muted" dir="ltr">
                  {grading?.exam?.title} · {grading?.exam?.school_year}
                </p>
              </div>
              <button
                onClick={() => window.print()}
                className="print:hidden arabic inline-flex items-center gap-1.5 text-xs bg-surface border border-line hover:border-brand/40 text-ink px-3.5 py-2 rounded-xl font-semibold transition"
              >
                <PrinterIcon className="w-3.5 h-3.5 text-brand" /> طباعة تقرير التدارك
              </button>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-surface border border-line rounded-2xl p-4 shadow-card">
                <p className="arabic text-xs text-ink-muted">معدل القسم</p>
                <p className="text-2xl font-extrabold text-brand num mt-1" dir="ltr">
                  {analytics?.class_avg != null ? `${analytics.class_avg} / 20` : '—'}
                </p>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-4 shadow-card">
                <p className="arabic text-xs text-ink-muted">نسبة النجاح (≥ 10/20)</p>
                <p className="text-2xl font-extrabold text-emerald-700 num mt-1" dir="ltr">
                  {analytics ? `${analytics.pass_rate}%` : '—'}
                </p>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-4 shadow-card">
                <p className="arabic text-xs text-ink-muted">تلاميذ التدارك (&lt; 10)</p>
                <p className="text-2xl font-extrabold text-rose-600 num mt-1">
                  {analytics?.remediation_students.length ?? 0}
                </p>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-4 shadow-card">
                <p className="arabic text-xs text-ink-muted">الأوراق المصححة</p>
                <p className="text-2xl font-extrabold text-ink num mt-1" dir="ltr">
                  {analytics?.graded_count ?? 0} / {analytics?.total_students ?? 0}
                </p>
              </div>
            </div>

            {/* Per-Exercise Difficulty / Remediation Breakdown */}
            <div className="bg-surface border border-line rounded-3xl p-5 shadow-card space-y-3">
              <h3 className="arabic text-sm font-bold text-ink">نسبة التملّك حسب التمرين والمعيار (مرتّبة من الأصعب إلى الأسهل)</h3>
              <div className="space-y-3">
                {(analytics?.item_stats ?? []).map(st => {
                  const low = st.pass_rate < 60
                  return (
                    <div key={st.key} className="bg-canvas/60 border border-line rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2" dir="ltr">
                          <span className="text-[11px] font-bold bg-surface border border-line px-2 py-0.5 rounded-full text-brand">
                            {st.criterion} · /{st.max_points}
                          </span>
                          <span className="text-xs font-bold text-ink">{st.label}</span>
                        </div>
                        <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full num ${
                          low ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          نجاح {st.pass_rate}% · معدل {st.avg_score}/{st.max_points}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-surface rounded-full overflow-hidden border border-line">
                        <div
                          className={`h-full ${low ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, st.pass_rate)}%` }}
                        />
                      </div>
                      {st.struggling_students.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="arabic text-[11px] font-semibold text-rose-700">يحتاجون دعماً:</span>
                          {st.struggling_students.map((name, ni) => (
                            <span key={ni} className="arabic text-[11px] bg-surface border border-rose-200 text-ink px-2 py-0.5 rounded-full">
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Remediation Students List */}
            {(analytics?.remediation_students.length ?? 0) > 0 && (
              <div className="bg-surface border border-rose-200 rounded-3xl p-5 shadow-card space-y-3">
                <h3 className="arabic text-sm font-bold text-rose-700">
                  قائمة التلاميذ المعنيين بحصص التدارك (&lt; 10 / 20)
                </h3>
                <div className="space-y-2">
                  {analytics!.remediation_students.map(st => (
                    <div key={st.student_id} className="flex items-start justify-between gap-3 bg-rose-50/40 border border-rose-200/70 rounded-2xl p-3">
                      <div>
                        <p className="arabic text-xs font-bold text-ink">{st.student_name}</p>
                        <p className="text-[11px] text-ink-muted mt-0.5" dir="ltr">
                          {st.weak_areas.slice(0, 4).join(' · ')}
                        </p>
                      </div>
                      <span className="text-xs font-extrabold bg-rose-600 text-white px-2.5 py-1 rounded-xl num" dir="ltr">
                        {st.total_score} / 20
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
