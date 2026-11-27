import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ExamBlock, ExamPaper, QuestionBankItem } from '../api/client'
import AppShell from '../components/AppShell'
import { useUI } from '../components/ui'
import { EmptyState, ListSkeleton } from '../components/Skeleton'
import {
  FileIcon, PlusIcon, SparklesIcon, UploadIcon, CopyIcon, PrinterIcon,
  TrashIcon, SearchIcon, DownloadIcon, BookOpenIcon, EditIcon, CheckIcon, ImageIcon,
} from '../components/icons'
import { getModulesForLevel } from '../lib/tunisianFrenchProgram'

function getBankThumbs(content?: Record<string, any>): string[] {
  if (!content) return []
  const urls: string[] = []
  if (typeof content.image_url === 'string' && content.image_url) urls.push(content.image_url)
  if (Array.isArray(content.panels)) {
    for (const p of content.panels) {
      if (typeof p === 'string' && p && !urls.includes(p)) urls.push(p)
    }
  }
  return urls
}

const LEVELS = ['3ème année', '4ème année', '5ème année', '6ème année']
const TRIMESTERS = [1, 2, 3]
const SECTIONS: Record<string, { label: string; tint: string }> = {
  lecture:    { label: 'Lecture',           tint: 'bg-sky-50 text-sky-700 border-sky-200' },
  langue:     { label: 'Langue',            tint: 'bg-violet-50 text-violet-700 border-violet-200' },
  production: { label: 'Production Écrite', tint: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

function currentSchoolYear(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

export default function Exams() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const ui = useUI()

  const [tab, setTab] = useState<'archive' | 'bank'>('archive')
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterTrim, setFilterTrim] = useState<number>(0)
  const [genOpen, setGenOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([])
  const [creatingFromBank, setCreatingFromBank] = useState(false)

  const { data: exams = [], isLoading: loadingExams } = useQuery<ExamPaper[]>({
    queryKey: ['exams', filterLevel, filterTrim, search],
    queryFn: () => api.exams.list({
      level: filterLevel || undefined,
      trimester: filterTrim || undefined,
      q: search.trim() || undefined,
    }),
  })

  const { data: bank = [], isLoading: loadingBank } = useQuery<QuestionBankItem[]>({
    queryKey: ['question-bank', filterLevel, search],
    queryFn: () => api.questionBank.list({
      level: filterLevel || undefined,
      q: search.trim() || undefined,
    }),
    enabled: tab === 'bank',
  })

  const groupedByYear = useMemo(() => {
    const map = new Map<string, ExamPaper[]>()
    for (const ex of exams) {
      if (!map.has(ex.school_year)) map.set(ex.school_year, [])
      map.get(ex.school_year)!.push(ex)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [exams])

  function createBlank() {
    const draft = {
      title: `Évaluation de Français — ${filterLevel || '4ème année'}`,
      school_year: currentSchoolYear(),
      level: filterLevel || '4ème année',
      trimester: filterTrim || 1,
      module_num: 1,
      exam_type: 'Évaluation',
      direction: 'ltr',
      blocks: [],
      total_points: 20,
    }
    sessionStorage.setItem('exam_draft_v1', JSON.stringify(draft))
    navigate('/exams/new')
  }

  async function createExamFromSelectedBank() {
    const picked = bank.filter(b => selectedBankIds.includes(b.id))
    if (picked.length === 0) return
    setCreatingFromBank(true)
    try {
      const blocks: ExamBlock[] = picked.map((b, i) => ({
        id: `pick-${Date.now()}-${i}`,
        bank_id: b.id,
        section: b.section,
        type: b.block_type,
        criterion: b.criterion,
        points: b.points,
        topic: b.topic,
        content: b.content,
      }))
      const totalPts = blocks.reduce((s, b) => s + (Number(b.points) || 0), 0)
      const lvl = filterLevel || picked[0].level || '4ème année'
      const created = await api.exams.create({
        title: `Évaluation de Français — ${lvl}`,
        school_year: currentSchoolYear(),
        level: lvl,
        trimester: filterTrim || picked[0].trimester || 1,
        module_num: picked[0].module_num || 1,
        exam_type: 'Évaluation',
        direction: 'ltr',
        blocks,
        total_points: totalPts || 20,
      })
      await qc.invalidateQueries({ queryKey: ['exams'] })
      setSelectedBankIds([])
      ui.toast(`تم إنشاء امتحان من ${picked.length} تمارين مختارة`, 'success')
      navigate(`/exams/${created.id}`)
    } catch (err: any) {
      ui.toast(err.message || 'تعذّر إنشاء الامتحان', 'error')
    } finally {
      setCreatingFromBank(false)
    }
  }

  const selectedBankPoints = useMemo(
    () => bank.filter(b => selectedBankIds.includes(b.id)).reduce((s, b) => s + (Number(b.points) || 0), 0),
    [bank, selectedBankIds],
  )

  return (
    <AppShell
      title="خزينة الامتحانات وبنك التمارين"
      subtitle="أرشيف سنوي لامتحانات الفرنسية، مولّد متوازن، واستيراد الامتحانات القديمة (Word / PDF) بتمارينها ورسومها"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setImportOpen(true)}
            className="arabic inline-flex items-center gap-1.5 text-xs bg-surface border border-line hover:border-brand/40 text-ink px-3 py-2 rounded-xl font-semibold transition"
          >
            <UploadIcon className="w-3.5 h-3.5 text-brand" />
            <span>استيراد امتحانات قديمة (Word / PDF)</span>
          </button>
          <button
            onClick={() => setGenOpen(true)}
            className="arabic inline-flex items-center gap-1.5 text-xs bg-accent hover:bg-amber-600 text-white px-3.5 py-2 rounded-xl font-semibold shadow-sm transition"
          >
            <SparklesIcon className="w-3.5 h-3.5" /> توليد امتحان ذكي
          </button>
          <button
            onClick={() => void createBlank()}
            className="arabic inline-flex items-center gap-1.5 text-xs bg-brand hover:bg-brand-hover text-white px-3.5 py-2 rounded-xl font-semibold shadow-sm transition"
          >
            <PlusIcon className="w-3.5 h-3.5" /> امتحان جديد
          </button>
        </div>
      }
    >

      <div className="space-y-5" dir="rtl">
        {/* Tabs + Filters */}
        <div className="flex items-center justify-between flex-wrap gap-3 bg-surface border border-line rounded-2xl p-3 shadow-card">
          <div className="inline-flex bg-canvas rounded-xl p-1">
            <button
              onClick={() => setTab('archive')}
              className={`arabic inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition ${
                tab === 'archive' ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <FileIcon className="w-3.5 h-3.5" /> أرشيف الامتحانات ({exams.length})
            </button>
            <button
              onClick={() => setTab('bank')}
              className={`arabic inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition ${
                tab === 'bank' ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <BookOpenIcon className="w-3.5 h-3.5" /> بنك التمارين المتعلّم
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <SearchIcon className="w-3.5 h-3.5 text-ink-subtle absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث في الامتحانات أو التمارين…"
                className="arabic bg-canvas border border-line rounded-xl pr-8 pl-3 py-1.5 text-xs focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/40 w-52"
              />
            </div>
            <select
              value={filterLevel}
              onChange={e => setFilterLevel(e.target.value)}
              className="bg-canvas border border-line rounded-xl px-3 py-1.5 text-xs font-medium text-ink"
              dir="ltr"
            >
              <option value="">Tous les niveaux</option>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            {tab === 'archive' && (
              <select
                value={filterTrim}
                onChange={e => setFilterTrim(Number(e.target.value))}
                className="arabic bg-canvas border border-line rounded-xl px-3 py-1.5 text-xs font-medium text-ink"
              >
                <option value={0}>كل الثلاثيات</option>
                {TRIMESTERS.map(t => <option key={t} value={t}>الثلاثي {t}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* ── Tab 1: Yearly Exam Archive ── */}
        {tab === 'archive' && (
          loadingExams ? <ListSkeleton rows={4} /> :
          groupedByYear.length === 0 ? (
            <EmptyState
              Icon={FileIcon}
              title="خزينة الامتحانات فارغة حالياً"
              description="أنشئوا أول امتحان فرنسية بالمحرر السريع، أو ولّدوا امتحاناً متوازناً من بنك التمارين، أو استوردوا امتحانات السنوات السابقة (PDF)."
              action={
                <button
                  onClick={() => setGenOpen(true)}
                  className="arabic inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition"
                >
                  <SparklesIcon className="w-4 h-4" /> توليد أول امتحان فرنسية (20 نقطة)
                </button>
              }
            />
          ) : (
            <div className="space-y-6">
              {groupedByYear.map(([year, items]) => (
                <section key={year}>
                  <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide mb-3 num">
                    السنة الدراسية {year} ({items.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {items.map(ex => (
                      <div
                        key={ex.id}
                        className="bg-surface border border-line hover:border-brand/40 rounded-3xl p-5 shadow-card hover:shadow-float transition flex flex-col justify-between gap-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                              <span className="text-[11px] font-semibold bg-brand-light text-brand px-2.5 py-0.5 rounded-full" dir="ltr">
                                {ex.level}
                              </span>
                              <span className="arabic text-[11px] bg-canvas text-ink-muted px-2 py-0.5 rounded-full num">
                                الثلاثي {ex.trimester}{ex.module_num ? ` · Module ${ex.module_num}` : ''}
                              </span>
                              <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold num" dir="ltr">
                                /{ex.total_points}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-ink truncate" dir="ltr">{ex.title}</h3>
                            <p className="arabic text-xs text-ink-subtle mt-0.5 num">
                              {ex.exam_type} · استُعمل {ex.used_count} مرة
                              {ex.avg_score != null && ` · المعدل السابق ${ex.avg_score}/20`}
                              {ex.source_file_name && ` · مرفق: ${ex.source_file_name}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 pt-3 border-t border-line flex-wrap">
                          <button
                            onClick={() => navigate(`/exams/${ex.id}`)}
                            className="arabic inline-flex items-center gap-1 text-xs bg-brand hover:bg-brand-hover text-white px-3.5 py-1.5 rounded-xl font-semibold transition"
                          >
                            <EditIcon className="w-3.5 h-3.5" /> فتح المحرر
                          </button>
                          <button
                            onClick={() => window.open(`/exams/${ex.id}/print`, '_blank')}
                            className="arabic inline-flex items-center gap-1 text-xs bg-canvas hover:bg-brand-light text-ink hover:text-brand px-3 py-1.5 rounded-xl font-medium transition"
                          >
                            <PrinterIcon className="w-3.5 h-3.5" /> طباعة / إصلاح
                          </button>
                          <button
                            onClick={async () => {
                              const ny = await ui.prompt({
                                title: 'إعادة استعمال الامتحان لسنة جديدة',
                                label: 'السنة الدراسية المستهدفة (مثال: 2026-2027)',
                                defaultValue: currentSchoolYear(),
                                dir: 'ltr',
                              })
                              if (!ny) return
                              const cloned = await api.exams.clone(ex.id, { school_year: ny })
                              await qc.invalidateQueries({ queryKey: ['exams'] })
                              ui.toast('تم نسخ الامتحان للسنة الجديدة', 'success')
                              navigate(`/exams/${cloned.id}`)
                            }}
                            className="arabic inline-flex items-center gap-1 text-xs border border-line hover:border-emerald-300 text-ink-muted hover:text-emerald-700 px-2.5 py-1.5 rounded-xl transition"
                          >
                            <CopyIcon className="w-3.5 h-3.5" /> نسخ لسنة جديدة
                          </button>
                          {ex.has_attachment && (
                            <button
                              onClick={() => void api.exams.downloadAttachment(ex.id, ex.source_file_name)}
                              title="تحميل الملف الأصلي"
                              className="p-1.5 border border-line hover:border-brand/40 text-ink-muted hover:text-brand rounded-xl transition"
                            >
                              <DownloadIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              const ok = await ui.confirm({
                                title: 'حذف الامتحان',
                                message: `حذف "${ex.title}" من الأرشيف؟ (تبقى التمارين المحفوظة في بنك التمارين)`,
                                confirmLabel: 'حذف',
                                danger: true,
                              })
                              if (ok) {
                                await api.exams.delete(ex.id)
                                await qc.invalidateQueries({ queryKey: ['exams'] })
                              }
                            }}
                            className="mr-auto p-1.5 text-ink-subtle hover:text-rose-600 rounded-xl transition"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )
        )}

        {/* ── Tab 2: Personal Learning Exercise Bank ── */}
        {tab === 'bank' && (
          loadingBank ? <ListSkeleton rows={5} /> : (
            <div className="space-y-4">
              {selectedBankIds.length > 0 && (
                <div className="sticky top-16 z-10 bg-brand text-white rounded-2xl px-4 py-3 shadow-float flex items-center justify-between gap-3 flex-wrap">
                  <div className="arabic text-xs font-semibold num">
                    تم اختيار {selectedBankIds.length} تمارين · المجموع: {selectedBankPoints} / 20 نقطة
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void createExamFromSelectedBank()}
                      disabled={creatingFromBank}
                      className="arabic inline-flex items-center gap-1.5 text-xs bg-white text-brand hover:bg-brand-light px-3.5 py-1.5 rounded-xl font-bold transition"
                    >
                      <CheckIcon className="w-3.5 h-3.5" /> {creatingFromBank ? 'جاري الإنشاء…' : 'إنشاء امتحان من التمارين المختارة'}
                    </button>
                    <button
                      onClick={() => setSelectedBankIds([])}
                      className="arabic text-xs text-white/80 hover:text-white px-2 py-1"
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {bank.map(b => {
                  const sec = SECTIONS[b.section] ?? SECTIONS.langue
                  const preview = b.content?.prompt || b.content?.title || b.topic || b.block_type
                  const thumbs = getBankThumbs(b.content)
                  const isPicked = selectedBankIds.includes(b.id)
                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBankIds(prev => prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id])}
                      className={`cursor-pointer bg-surface border rounded-3xl p-4 shadow-card space-y-2.5 transition ${
                        isPicked ? 'border-brand ring-2 ring-brand/20 bg-brand-light/15' : 'border-line hover:border-brand/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input
                            type="checkbox"
                            checked={isPicked}
                            onChange={() => {}}
                            className="w-4 h-4 accent-brand rounded"
                          />
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${sec.tint}`} dir="ltr">
                            {sec.label}
                          </span>
                          <span className="text-[11px] bg-canvas text-ink font-bold px-2 py-0.5 rounded-full num" dir="ltr">
                            {b.criterion} · {b.points}pt
                          </span>
                          <span className="text-[11px] text-ink-subtle" dir="ltr">{b.level}</span>
                          {thumbs.length > 0 && (
                            <span className="arabic inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full num">
                              <ImageIcon className="w-3 h-3" /> {thumbs.length}
                            </span>
                          )}
                        </div>
                        {!b.is_starter && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              await api.questionBank.delete(b.id)
                              await qc.invalidateQueries({ queryKey: ['question-bank'] })
                            }}
                            className="p-1 text-ink-subtle hover:text-rose-600 rounded-lg transition"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-ink line-clamp-2" dir="ltr">{preview}</p>
                      {thumbs.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-0.5">
                          {thumbs.slice(0, 4).map((url, ti) => (
                            <img
                              key={ti}
                              src={url}
                              alt=""
                              className="w-16 h-12 object-contain bg-white border border-line rounded-xl p-0.5 flex-shrink-0"
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-ink-subtle pt-2 border-t border-line num">
                        <span className="arabic">
                          {b.topic || b.block_type}
                          {b.last_used_year && ` · ${b.last_used_year}`}
                          {b.empirical_pass_rate != null && ` · نجاح فعلي ${Math.round(b.empirical_pass_rate * 100)}%`}
                        </span>
                        <span className="arabic">استُعمل {b.times_used} · قُبل {b.times_accepted}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}
      </div>

      {/* Legacy Multi-File Exam Import Modal (DOCX + PDF + Images) */}
      {importOpen && (
        <ImportLegacyModal
          defaultLevel={filterLevel || '4ème année'}
          defaultTrim={filterTrim || 1}
          onClose={() => setImportOpen(false)}
          onDone={async (summary) => {
            setImportOpen(false)
            await qc.invalidateQueries({ queryKey: ['exams'] })
            await qc.invalidateQueries({ queryKey: ['question-bank'] })
            ui.toast(summary.message, 'success')
            if (summary.openExamId) {
              navigate(`/exams/${summary.openExamId}`)
            }
          }}
        />
      )}

      {/* Balanced French Exam Generator Modal */}
      {genOpen && (
        <GenerateExamModal
          defaultLevel={filterLevel || '4ème année'}
          defaultTrim={filterTrim || 1}
          onClose={() => setGenOpen(false)}
          onGenerated={async (ex) => {
            setGenOpen(false)
            sessionStorage.setItem('exam_draft_v1', JSON.stringify(ex))
            ui.toast('تم توليد مسودة امتحان (20/20) — اضغطوا على «حفظ» لتخزينه في الخزينة', 'success')
            navigate('/exams/new')
          }}
        />
      )}
    </AppShell>
  )
}

function GenerateExamModal({ defaultLevel, defaultTrim, onClose, onGenerated }: {
  defaultLevel: string; defaultTrim: number; onClose: () => void; onGenerated: (ex: ExamPaper) => Promise<void>
}) {
  const [level, setLevel] = useState(defaultLevel)
  const [trimester, setTrimester] = useState(defaultTrim)
  const [moduleNum, setModuleNum] = useState(2)
  const [year, setYear] = useState(currentSchoolYear())
  const [examType, setExamType] = useState('Évaluation')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const ex = await api.exams.generate({
        school_year: year,
        level,
        trimester,
        module_num: moduleNum,
        exam_type: examType,
        dry_run: true,
      })
      await onGenerated(ex)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4 animate-fade-in" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-surface border border-line rounded-3xl p-6 space-y-4 shadow-float animate-scale-in" dir="rtl">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-accent-light text-accent flex items-center justify-center">
            <SparklesIcon className="w-5 h-5" />
          </span>
          <div>
            <h3 className="arabic text-base font-bold text-ink">توليد امتحان فرنسية متوازن</h3>
            <p className="arabic text-xs text-ink-muted">يختار أعلى التمارين ملاءمة من البنك (Lecture + Langue + Production)</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">المستوى</label>
            <select value={level} onChange={e => setLevel(e.target.value)} dir="ltr"
                    className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm">
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">السنة الدراسية</label>
            <input value={year} onChange={e => setYear(e.target.value)} dir="ltr"
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm num" />
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">الثلاثي</label>
            <select value={trimester} onChange={e => setTrimester(Number(e.target.value))}
                    className="arabic w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm">
              {TRIMESTERS.map(t => <option key={t} value={t}>الثلاثي {t}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">الوحدة (Module)</label>
            <select value={moduleNum} onChange={e => setModuleNum(Number(e.target.value))} dir="ltr"
                    className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs">
              {getModulesForLevel(level).map(m => (
                <option key={m.num} value={m.num}>M{m.num} — {m.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">نوع الامتحان</label>
          <div className="flex gap-2">
            {['Évaluation', 'Examen', 'Remédiation'].map(t => (
              <button key={t} type="button" onClick={() => setExamType(t)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                        examType === t ? 'bg-brand text-white border-brand' : 'bg-canvas text-ink-muted border-line'
                      }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={busy}
                  className="arabic flex-1 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition">
            {busy ? 'جاري التوليد…' : 'توليد وفتح في المحرر'}
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

function ImportLegacyModal({ defaultLevel, defaultTrim, onClose, onDone }: {
  defaultLevel: string
  defaultTrim: number
  onClose: () => void
  onDone: (summary: { message: string; openExamId?: string }) => Promise<void>
}) {
  const [files, setFiles] = useState<File[]>([])
  const [level, setLevel] = useState(defaultLevel)
  const [trimester, setTrimester] = useState(defaultTrim)
  const [moduleNum, setModuleNum] = useState(0)
  const [year, setYear] = useState('2024-2025')
  const [mode, setMode] = useState<'archive_and_bank' | 'bank_only'>('archive_and_bank')
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0) return
    setBusy(true)
    setErrMsg('')
    try {
      let totalBlocks = 0
      let totalImgs = 0
      let firstExamId: string | undefined
      for (const f of files) {
        const res = await api.exams.uploadLegacy(f, {
          school_year: year,
          level,
          trimester,
          module_num: moduleNum,
          mode,
        })
        totalBlocks += res.extracted_blocks_count ?? (Array.isArray(res.blocks) ? res.blocks.length : 0)
        totalImgs += res.extracted_images_count ?? 0
        if (!firstExamId && mode === 'archive_and_bank' && res.id) {
          firstExamId = res.id
        }
      }
      const msg = mode === 'bank_only'
        ? `تمت إضافة ${totalBlocks} تمرين و ${totalImgs} رسم توضيحي إلى بنك التمارين ومكتبة الرسوم`
        : `تم استيراد ${files.length} ملف واستخراج ${totalBlocks} تمرين و ${totalImgs} رسم توضيحي`
      await onDone({ message: msg, openExamId: files.length === 1 ? firstExamId : undefined })
    } catch (err: any) {
      setErrMsg(err.message || 'تعذّر استيراد الملفات')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4 animate-fade-in" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-surface border border-line rounded-3xl p-6 space-y-4 shadow-float animate-scale-in" dir="rtl">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-brand-light text-brand flex items-center justify-center">
            <UploadIcon className="w-5 h-5" />
          </span>
          <div>
            <h3 className="arabic text-base font-bold text-ink">استيراد امتحانات قديمة (Word / PDF / صور)</h3>
            <p className="arabic text-xs text-ink-muted">يستخرج التمارين والرسوم التوضيحية تلقائياً ويضيفها إلى بنك التمارين والاقتراحات</p>
          </div>
        </div>

        <label className="block border-2 border-dashed border-brand-mid hover:border-brand bg-brand-light/20 rounded-2xl p-4 text-center cursor-pointer transition">
          <input
            type="file"
            multiple
            accept=".docx,.pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={e => setFiles(Array.from(e.target.files ?? []))}
          />
          <p className="arabic text-xs font-bold text-brand">
            {files.length > 0 ? `تم اختيار ${files.length} ملف` : 'اضغطوا لاختيار ملف واحد أو عدة ملفات (.docx / .pdf / صور)'}
          </p>
          {files.length > 0 && (
            <p className="text-[11px] text-ink-muted mt-1 truncate" dir="ltr">
              {files.map(f => f.name).join(' · ')}
            </p>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">السنة الدراسية الأصلية</label>
            <input value={year} onChange={e => setYear(e.target.value)} dir="ltr"
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm num" />
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">المستوى</label>
            <select value={level} onChange={e => setLevel(e.target.value)} dir="ltr"
                    className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm">
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">الثلاثي</label>
            <select value={trimester} onChange={e => setTrimester(Number(e.target.value))}
                    className="arabic w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm">
              {TRIMESTERS.map(t => <option key={t} value={t}>الثلاثي {t}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">الوحدة (Module)</label>
            <select value={moduleNum} onChange={e => setModuleNum(Number(e.target.value))} dir="ltr"
                    className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs">
              <option value={0}>Non précisé</option>
              {getModulesForLevel(level).map(m => (
                <option key={m.num} value={m.num}>M{m.num} — {m.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="arabic block text-xs font-semibold text-ink-muted">طريقة الحفظ</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('archive_and_bank')}
              className={`arabic text-right p-2.5 rounded-xl border text-xs transition ${
                mode === 'archive_and_bank' ? 'bg-brand-light/60 border-brand text-brand font-bold' : 'bg-canvas border-line text-ink-muted'
              }`}
            >
              <div>أرشفة الامتحان + بنك التمارين</div>
              <div className="text-[10px] font-normal opacity-80">يُفتح للتعديل وتُضاف تمارينه ورسومه للبنك</div>
            </button>
            <button
              type="button"
              onClick={() => setMode('bank_only')}
              className={`arabic text-right p-2.5 rounded-xl border text-xs transition ${
                mode === 'bank_only' ? 'bg-brand-light/60 border-brand text-brand font-bold' : 'bg-canvas border-line text-ink-muted'
              }`}
            >
              <div>تغذية الاقتراحات فقط</div>
              <div className="text-[10px] font-normal opacity-80">استخراج التمارين والرسوم بدون إضافة للأرشيف</div>
            </button>
          </div>
        </div>

        {errMsg && <p className="arabic text-xs text-rose-600 font-semibold">{errMsg}</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={busy || files.length === 0}
                  className="arabic flex-1 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition">
            {busy ? 'جاري استخراج التمارين والرسوم…' : 'استيراد واستخراج التمارين'}
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
