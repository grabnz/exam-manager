import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api, ExamBlock, ExamBlockType, ExamPaper,
  IllustrationSuggestion, ScoredSuggestion,
} from '../api/client'
import { useUI } from '../components/ui'
import {
  ArrowRightIcon, CheckIcon, PlusIcon, PrinterIcon, SparklesIcon,
  TrashIcon, ImageIcon, SearchIcon, RefreshCwIcon, XIcon, BookOpenIcon,
} from '../components/icons'

const BLOCK_CATALOG: { type: ExamBlockType; section: 'lecture' | 'langue' | 'production'; label: string; crit: string; pts: number }[] = [
  { type: 'reading_text',      section: 'lecture',    label: 'Texte de lecture',       crit: 'C1', pts: 0 },
  { type: 'mcq',               section: 'lecture',    label: 'QCM (Je coche)',         crit: 'C2', pts: 2 },
  { type: 'true_false',        section: 'lecture',    label: 'Vrai / Faux',            crit: 'C2', pts: 3 },
  { type: 'open_question',     section: 'lecture',    label: 'Question ouverte',       crit: 'C4', pts: 2 },
  { type: 'fill_blanks',       section: 'langue',     label: 'Texte à trous (Cloze)',  crit: 'C5', pts: 3 },
  { type: 'scramble',          section: 'langue',     label: 'Remets en ordre',        crit: 'C3', pts: 2 },
  { type: 'matching',          section: 'langue',     label: 'Je relie (Matching)',    crit: 'C5', pts: 2 },
  { type: 'production_ecrite', section: 'production', label: 'Production Écrite',      crit: 'C1', pts: 6 },
]

const CLOZE_PRESETS = [
  { label: 'a / à', words: ['a', 'à'], sentence: 'Sami [a] un livre et il va [à] l’école.' },
  { label: 'et / est', words: ['et', 'est'], sentence: 'Le jardin [est] grand [et] propre.' },
  { label: 'son / sont', words: ['son', 'sont'], sentence: 'Les élèves [sont] dans la cour avec [son] ballon.' },
  { label: 'on / ont', words: ['on', 'ont'], sentence: 'Les enfants [ont] fini, [on] peut jouer.' },
  { label: 'Présent (1er gr.)', words: [], sentence: 'Nous (chanter) [chantons] et tu (dessiner) [dessines].' },
]

function defaultContent(type: ExamBlockType): Record<string, any> {
  switch (type) {
    case 'reading_text':
      return { title: 'Titre du texte', text: '', source: '', image_url: '' }
    case 'mcq':
      return { prompt: 'Je coche la bonne réponse :', options: ['Option 1', 'Option 2', 'Option 3'], answer_index: 0 }
    case 'true_false':
      return { prompt: 'J’écris « Vrai » ou « Faux » :', items: [{ statement: 'Phrase 1', answer: true }, { statement: 'Phrase 2', answer: false }] }
    case 'open_question':
      return { prompt: 'Je réponds à la question :', lines: 2, answer: '' }
    case 'fill_blanks':
      return { prompt: 'Je complète par « a » ou « à » :', word_bank: ['a', 'à'], sentences: ['Sami [a] un cahier [à] la main.'] }
    case 'scramble':
      return { prompt: 'Je remets les mots en ordre :', chunks: ['dans la cour.', 'Les élèves', 'jouent'], answer: 'Les élèves jouent dans la cour.' }
    case 'matching':
      return { prompt: 'Je relie par une flèche :', pairs: [{ left: 'Je', right: 'mange.' }, { left: 'Nous', right: 'jouons.' }] }
    case 'production_ecrite':
      return {
        prompt: 'Observe les images et raconte l’histoire en 4 ou 5 phrases :',
        lines: 6,
        toolbox: { nouns: ['un enfant', 'la cour', 'un oiseau'], verbs: ['trouver', 'soigner', 'voler'], connectors: ["D'abord,", 'Ensuite,', 'Enfin,'] },
        panels: [] as string[],
        model_answer: '',
      }
  }
}

export default function ExamEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const ui = useUI()

  const { data: paper, isLoading } = useQuery<ExamPaper>({
    queryKey: ['exam', id],
    queryFn: () => api.exams.get(id!),
    enabled: !!id,
  })

  const [title, setTitle] = useState('')
  const [schoolYear, setSchoolYear] = useState('2025-2026')
  const [level, setLevel] = useState('4ème année')
  const [trimester, setTrimester] = useState(1)
  const [moduleNum, setModuleNum] = useState(1)
  const [examType, setExamType] = useState('Évaluation')
  const [blocks, setBlocks] = useState<ExamBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [savedFlag, setSavedFlag] = useState(false)

  // Right helper drawer: ML Suggestions vs Illustration Search
  const [drawerTab, setDrawerTab] = useState<'suggest' | 'illustrations'>('suggest')
  const [suggestSec, setSuggestSec] = useState<string>('')
  const [suggestions, setSuggestions] = useState<ScoredSuggestion[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)

  const [imgQuery, setImgQuery] = useState('jardin école')
  const [imgResults, setImgResults] = useState<IllustrationSuggestion[]>([])
  const [loadingImg, setLoadingImg] = useState(false)
  const [activeImageTarget, setActiveImageTarget] = useState<string | null>(null) // block id

  useEffect(() => {
    if (!paper) return
    setTitle(paper.title)
    setSchoolYear(paper.school_year)
    setLevel(paper.level)
    setTrimester(paper.trimester)
    setModuleNum(paper.module_num)
    setExamType(paper.exam_type)
    setBlocks(Array.isArray(paper.blocks) ? paper.blocks : [])
  }, [paper])

  const loadSuggestions = async (sec = suggestSec) => {
    setLoadingSuggest(true)
    try {
      const exclude = blocks.map(b => b.bank_id).filter((x): x is string => !!x)
      const res = await api.questionBank.suggest({
        level,
        trimester,
        module_num: moduleNum,
        section: sec || undefined,
        current_year: schoolYear,
        exclude_ids: exclude,
        limit: 8,
      })
      setSuggestions(Array.isArray(res) ? res : [])
    } catch {
      setSuggestions([])
    } finally {
      setLoadingSuggest(false)
    }
  }

  const searchImages = async (q = imgQuery) => {
    setLoadingImg(true)
    try {
      const res = await api.illustrations.search(q)
      setImgResults(Array.isArray(res) ? res : [])
    } catch {
      setImgResults([])
    } finally {
      setLoadingImg(false)
    }
  }

  useEffect(() => {
    if (paper) {
      void loadSuggestions('')
      void searchImages('jardin école')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id])

  const pointsSummary = useMemo(() => {
    let lecture = 0, langue = 0, production = 0
    for (const b of blocks) {
      const p = Number(b.points) || 0
      if (b.section === 'lecture') lecture += p
      else if (b.section === 'langue') langue += p
      else production += p
    }
    return { lecture, langue, production, total: +(lecture + langue + production).toFixed(2) }
  }, [blocks])

  async function handleSave(saveToBank = false) {
    if (!id) return
    setSaving(true)
    try {
      await api.exams.update(id, {
        title,
        school_year: schoolYear,
        level,
        trimester,
        module_num: moduleNum,
        exam_type: examType,
        direction: 'ltr',
        blocks,
        total_points: pointsSummary.total || 20,
        save_to_bank: saveToBank,
      })
      await qc.invalidateQueries({ queryKey: ['exam', id] })
      await qc.invalidateQueries({ queryKey: ['exams'] })
      if (saveToBank) {
        await qc.invalidateQueries({ queryKey: ['question-bank'] })
        ui.toast('تم حفظ الامتحان وإضافة تمارينه إلى بنك التمارين', 'success')
      } else {
        setSavedFlag(true)
        setTimeout(() => setSavedFlag(false), 2000)
      }
    } catch (err: any) {
      ui.toast(err.message || 'فشل الحفظ', 'error')
    } finally {
      setSaving(false)
    }
  }

  function addBlock(type: ExamBlockType) {
    const meta = BLOCK_CATALOG.find(c => c.type === type)!
    const nb: ExamBlock = {
      id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      section: meta.section,
      type,
      criterion: meta.crit,
      points: meta.pts,
      topic: meta.label,
      content: defaultContent(type),
    }
    setBlocks(prev => [...prev, nb])
  }

  function updateBlock(bid: string, patch: Partial<ExamBlock>) {
    setBlocks(prev => prev.map(b => b.id === bid ? { ...b, ...patch } : b))
  }

  function updateContent(bid: string, patch: Record<string, any>) {
    setBlocks(prev => prev.map(b => b.id === bid ? { ...b, content: { ...b.content, ...patch } } : b))
  }

  function insertIllustration(url: string) {
    // Insert into active target block, or first reading_text / production_ecrite block
    const target = blocks.find(b => b.id === activeImageTarget)
      ?? blocks.find(b => b.type === 'production_ecrite')
      ?? blocks.find(b => b.type === 'reading_text')
    if (!target) {
      ui.toast('أضيفوا أولاً «Texte de lecture» أو «Production Écrite» لإدراج الرسم', 'info')
      return
    }
    if (target.type === 'production_ecrite') {
      const panels: string[] = Array.isArray(target.content.panels) ? [...target.content.panels] : []
      if (panels.length >= 4) panels.shift()
      panels.push(url)
      updateContent(target.id, { panels })
      ui.toast('تمت إضافة الرسم إلى قصة Production Écrite', 'success')
    } else {
      updateContent(target.id, { image_url: url })
      ui.toast('تم إدراج الرسم التوضيحي في النص', 'success')
    }
  }

  if (isLoading || !paper) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand border-t-transparent rounded-full" />
      </div>
    )
  }

  const totalOk = Math.abs(pointsSummary.total - 20) < 0.01

  return (
    <div className="min-h-screen bg-canvas flex flex-col" dir="rtl">
      {/* ── Top Studio Bar ── */}
      <header className="bg-surface/95 backdrop-blur border-b border-line px-4 md:px-6 py-3 sticky top-0 z-20 shadow-card">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/exams')}
                    className="arabic inline-flex items-center gap-1 text-xs text-ink-muted hover:text-brand font-semibold">
              <ArrowRightIcon className="w-4 h-4" /> الخزينة
            </button>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              dir="ltr"
              className="text-sm md:text-base font-bold text-ink bg-canvas/60 border border-line rounded-xl px-3 py-1.5 w-60 md:w-80 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => void handleSave(true)}
              disabled={saving}
              className="arabic inline-flex items-center gap-1.5 text-xs bg-surface border border-line hover:border-brand/40 text-ink px-3 py-2 rounded-xl font-medium transition"
            >
              <BookOpenIcon className="w-3.5 h-3.5 text-brand" /> حفظ في بنك التمارين
            </button>
            <button
              onClick={async () => { await handleSave(false); window.open(`/exams/${id}/print?mode=student`, '_blank') }}
              className="arabic inline-flex items-center gap-1.5 text-xs bg-surface border border-line hover:border-brand/40 text-ink px-3 py-2 rounded-xl font-medium transition"
            >
              <PrinterIcon className="w-3.5 h-3.5 text-brand" /> ورقة التلميذ (A4)
            </button>
            <button
              onClick={async () => { await handleSave(false); window.open(`/exams/${id}/print?mode=key`, '_blank') }}
              className="arabic inline-flex items-center gap-1.5 text-xs bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 px-3 py-2 rounded-xl font-semibold transition"
            >
              <PrinterIcon className="w-3.5 h-3.5" /> ورقة الإصلاح (Corrigé)
            </button>
            <button
              onClick={() => void handleSave(false)}
              disabled={saving}
              className="arabic inline-flex items-center gap-1 text-xs bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-xl font-semibold shadow-sm transition"
            >
              {savedFlag && <CheckIcon className="w-3.5 h-3.5" />}
              <span>{saving ? 'جاري الحفظ…' : savedFlag ? 'تم الحفظ' : 'حفظ'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Live /20 Barème & Metadata Strip ── */}
      <div className="bg-surface border-b border-line px-4 md:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <select value={level} onChange={e => setLevel(e.target.value)} dir="ltr"
                    className="bg-canvas border border-line rounded-xl px-2.5 py-1 font-medium">
              {['3ème année', '4ème année', '5ème année', '6ème année'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={trimester} onChange={e => setTrimester(Number(e.target.value))}
                    className="arabic bg-canvas border border-line rounded-xl px-2.5 py-1 font-medium">
              {[1, 2, 3].map(t => <option key={t} value={t}>الثلاثي {t}</option>)}
            </select>
            <select value={moduleNum} onChange={e => setModuleNum(Number(e.target.value))} dir="ltr"
                    className="bg-canvas border border-line rounded-xl px-2.5 py-1 font-medium">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(m => <option key={m} value={m}>{m === 0 ? 'Tous modules' : `Module ${m}`}</option>)}
            </select>
            <input value={schoolYear} onChange={e => setSchoolYear(e.target.value)} dir="ltr"
                   className="bg-canvas border border-line rounded-xl px-2.5 py-1 w-24 text-center num" />
          </div>

          <div className="flex items-center gap-2 flex-wrap num" dir="ltr">
            <span className="bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-1 rounded-full font-semibold">
              Lecture: {pointsSummary.lecture}pt
            </span>
            <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full font-semibold">
              Langue: {pointsSummary.langue}pt
            </span>
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-semibold">
              Production: {pointsSummary.production}pt
            </span>
            <span className={`px-3 py-1 rounded-full font-bold border ${
              totalOk
                ? 'bg-emerald-600 text-white border-emerald-700'
                : 'bg-accent-soft text-amber-900 border-accent-light'
            }`}>
              Total: {pointsSummary.total} / 20 {totalOk ? '✓' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Workspace: Block Canvas + Right Smart Helper Drawer ── */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left/Main Column (8 cols): French Exam Blocks */}
        <div className="lg:col-span-8 space-y-4">
          {/* Quick-Add Block Palette */}
          <div className="bg-surface border border-line rounded-2xl p-3 shadow-card">
            <p className="arabic text-[11px] font-bold text-ink-muted mb-2">إضافة تمرين فرنسية سريع:</p>
            <div className="flex flex-wrap gap-1.5" dir="ltr">
              {BLOCK_CATALOG.map(item => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => addBlock(item.type)}
                  className="inline-flex items-center gap-1 text-xs bg-canvas hover:bg-brand-light border border-line hover:border-brand-mid text-ink hover:text-brand px-3 py-1.5 rounded-xl font-medium transition"
                >
                  <PlusIcon className="w-3.5 h-3.5" /> {item.label}
                </button>
              ))}
            </div>
          </div>

          {blocks.length === 0 ? (
            <div className="bg-surface border border-dashed border-brand-mid rounded-3xl p-12 text-center space-y-2">
              <p className="arabic text-sm font-bold text-ink">ابدأوا بإضافة تمرين من الشريط أعلاه أو اسحبوا تمريناً مقترحاً من القائمة الجانبية</p>
              <p className="arabic text-xs text-ink-muted">كل تمرين يُطبع تلقائياً في ورقة التلميذ + ورقة الإصلاح (Corrigé).</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {blocks.map((b, idx) => (
                <BlockEditorCard
                  key={b.id}
                  block={b}
                  index={idx}
                  isImgTarget={activeImageTarget === b.id}
                  onSelectImgTarget={() => { setActiveImageTarget(b.id); setDrawerTab('illustrations') }}
                  onUpdate={patch => updateBlock(b.id, patch)}
                  onUpdateContent={patch => updateContent(b.id, patch)}
                  onMove={dir => {
                    const next = [...blocks]
                    const j = idx + dir
                    if (j < 0 || j >= next.length) return
                    ;[next[idx], next[j]] = [next[j], next[idx]]
                    setBlocks(next)
                  }}
                  onDelete={() => setBlocks(prev => prev.filter(x => x.id !== b.id))}
                />
              ))}
            </div>
          )}
        </div>

        {/* Side Column (4 cols): ML Scored Suggestions + Print-Ready Illustrations */}
        <aside className="lg:col-span-4 bg-surface border border-line rounded-3xl p-4 shadow-card sticky top-20 space-y-4">
          <div className="grid grid-cols-2 gap-1 bg-canvas p-1 rounded-xl">
            <button
              onClick={() => setDrawerTab('suggest')}
              className={`arabic inline-flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg font-semibold transition ${
                drawerTab === 'suggest' ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <SparklesIcon className="w-3.5 h-3.5" /> اقتراحات ذكية
            </button>
            <button
              onClick={() => setDrawerTab('illustrations')}
              className={`arabic inline-flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg font-semibold transition ${
                drawerTab === 'illustrations' ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" /> رسوم للطباعة
            </button>
          </div>

          {drawerTab === 'suggest' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <select
                  value={suggestSec}
                  onChange={e => { setSuggestSec(e.target.value); void loadSuggestions(e.target.value) }}
                  className="arabic flex-1 bg-canvas border border-line rounded-xl px-2.5 py-1.5 text-xs"
                >
                  <option value="">كل المجالات</option>
                  <option value="lecture">Lecture</option>
                  <option value="langue">Langue</option>
                  <option value="production">Production Écrite</option>
                </select>
                <button
                  onClick={() => void loadSuggestions(suggestSec)}
                  className="p-2 bg-canvas border border-line hover:border-brand/40 rounded-xl text-ink-muted hover:text-brand transition"
                  title="تحديث الاقتراحات"
                >
                  <RefreshCwIcon className={`w-3.5 h-3.5 ${loadingSuggest ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="space-y-2.5 max-h-[62vh] overflow-y-auto pl-1">
                {suggestions.map(s => (
                  <div key={s.block.id} className="bg-canvas/70 border border-line rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full num" dir="ltr">
                        {s.fit_score}% fit
                      </span>
                      <span className="text-[11px] text-ink-muted font-semibold num" dir="ltr">
                        {s.block.criterion} · {s.block.points}pt
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-ink line-clamp-2" dir="ltr">
                      {s.block.content?.prompt || s.block.content?.title || s.block.topic}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(s.reasons ?? []).map((r, ri) => (
                        <span key={ri} className="arabic text-[10px] bg-surface border border-line text-ink-muted px-2 py-0.5 rounded-full">
                          {r}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={async () => {
                          const nb: ExamBlock = {
                            id: `sug-${Date.now()}-${s.block.id.slice(0, 5)}`,
                            bank_id: s.block.id,
                            section: s.block.section,
                            type: s.block.block_type,
                            criterion: s.block.criterion,
                            points: s.block.points,
                            topic: s.block.topic,
                            content: s.block.content,
                          }
                          setBlocks(prev => [...prev, nb])
                          setSuggestions(prev => prev.filter(x => x.block.id !== s.block.id))
                          void api.questionBank.feedback(s.block.id, { action: 'accepted', school_year: schoolYear })
                        }}
                        className="arabic flex-1 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-semibold transition"
                      >
                        + إدراج في الامتحان
                      </button>
                      <button
                        onClick={() => {
                          setSuggestions(prev => prev.filter(x => x.block.id !== s.block.id))
                          void api.questionBank.feedback(s.block.id, { action: 'skipped' })
                        }}
                        title="تجاهل (يتعلّم النظام تفضيلك)"
                        className="p-1.5 border border-line hover:border-rose-300 text-ink-subtle hover:text-rose-600 rounded-xl transition"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {!loadingSuggest && suggestions.length === 0 && (
                  <p className="arabic text-xs text-ink-subtle text-center py-6">لا توجد اقتراحات إضافية حالياً.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <form
                onSubmit={e => { e.preventDefault(); void searchImages(imgQuery) }}
                className="flex gap-1.5"
              >
                <div className="relative flex-1">
                  <SearchIcon className="w-3.5 h-3.5 text-ink-subtle absolute right-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={imgQuery}
                    onChange={e => setImgQuery(e.target.value)}
                    placeholder="oiseau, jardin, école, famille…"
                    dir="ltr"
                    className="w-full bg-canvas border border-line rounded-xl pr-8 pl-2.5 py-1.5 text-xs focus:bg-surface focus:outline-none"
                  />
                </div>
                <button type="submit" disabled={loadingImg}
                        className="arabic px-3 py-1.5 bg-brand text-white rounded-xl text-xs font-semibold">
                  {loadingImg ? '…' : 'بحث'}
                </button>
              </form>

              <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pl-1">
                {imgResults.map(img => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => insertIllustration(img.url)}
                    className="bg-canvas/60 border border-line hover:border-brand rounded-2xl p-2 text-right space-y-1.5 transition group"
                  >
                    <div className="bg-white rounded-xl border border-line h-24 flex items-center justify-center overflow-hidden p-1">
                      <img src={img.url} alt={img.title} className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full num" dir="ltr">
                        {img.print_score}%
                      </span>
                      <span className="text-[10px] text-ink-muted truncate" dir="ltr">{img.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// ── Individual French Block Editor Card ──────────────────────────────────────
function BlockEditorCard({
  block, index, isImgTarget, onSelectImgTarget, onUpdate, onUpdateContent, onMove, onDelete,
}: {
  block: ExamBlock
  index: number
  isImgTarget: boolean
  onSelectImgTarget: () => void
  onUpdate: (patch: Partial<ExamBlock>) => void
  onUpdateContent: (patch: Record<string, any>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  const c = block.content ?? {}
  const secBadge = block.section === 'lecture'
    ? 'bg-sky-50 text-sky-700 border-sky-200'
    : block.section === 'langue'
    ? 'bg-violet-50 text-violet-700 border-violet-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200'

  return (
    <div className={`bg-surface border rounded-3xl p-4 shadow-card space-y-3 transition ${
      isImgTarget ? 'border-brand ring-2 ring-brand/20' : 'border-line'
    }`}>
      {/* Block header */}
      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-canvas text-ink-muted text-xs font-bold flex items-center justify-center num">
            {index + 1}
          </span>
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${secBadge}`} dir="ltr">
            {block.section} · {block.type}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <input
            value={block.criterion}
            onChange={e => onUpdate({ criterion: e.target.value })}
            dir="ltr"
            title="Critère (C1..C6)"
            className="w-14 bg-canvas border border-line rounded-lg px-2 py-1 text-xs text-center font-bold"
          />
          <div className="flex items-center gap-1 bg-canvas border border-line rounded-lg px-2 py-1" dir="ltr">
            <input
              type="number" min={0} max={20} step={0.5}
              value={block.points}
              onChange={e => onUpdate({ points: Number(e.target.value) })}
              className="w-10 bg-transparent text-xs text-center font-bold num focus:outline-none"
            />
            <span className="text-[10px] text-ink-subtle">pt</span>
          </div>
          <button type="button" onClick={() => onMove(-1)} className="px-2 py-1 text-xs border border-line rounded-lg text-ink-muted hover:text-ink">↑</button>
          <button type="button" onClick={() => onMove(1)} className="px-2 py-1 text-xs border border-line rounded-lg text-ink-muted hover:text-ink">↓</button>
          <button type="button" onClick={onDelete} className="p-1.5 text-ink-subtle hover:text-rose-600 rounded-lg transition">
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Block-specific French editors (LTR) */}
      <div dir="ltr" className="space-y-2.5 text-left">
        {block.type === 'reading_text' && (
          <>
            <div className="flex gap-2">
              <input value={c.title ?? ''} onChange={e => onUpdateContent({ title: e.target.value })}
                     placeholder="Titre du texte"
                     className="flex-1 bg-canvas border border-line rounded-xl px-3 py-2 text-sm font-bold" />
              <button type="button" onClick={onSelectImgTarget}
                      className="arabic inline-flex items-center gap-1 text-xs bg-brand-light text-brand px-3 py-2 rounded-xl font-semibold">
                <ImageIcon className="w-3.5 h-3.5" /> إضافة رسم
              </button>
            </div>
            {c.image_url && (
              <div className="relative w-40 h-24 bg-white border border-line rounded-xl p-1">
                <img src={c.image_url} alt="" className="w-full h-full object-contain" />
                <button type="button" onClick={() => onUpdateContent({ image_url: '' })}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">✕</button>
              </div>
            )}
            <textarea rows={4} value={c.text ?? ''} onChange={e => onUpdateContent({ text: e.target.value })}
                      placeholder="Saisissez ou collez le texte de lecture…"
                      className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm leading-relaxed" />
            <input value={c.source ?? ''} onChange={e => onUpdateContent({ source: e.target.value })}
                   placeholder="Source (optionnel)"
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-1.5 text-xs text-ink-muted" />
          </>
        )}

        {block.type === 'fill_blanks' && (
          <>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="arabic text-[11px] text-ink-muted">قواعد فرنسية جاهزة:</span>
              {CLOZE_PRESETS.map(pr => (
                <button key={pr.label} type="button"
                        onClick={() => onUpdateContent({
                          prompt: `Je complète par « ${pr.label} » :`,
                          word_bank: pr.words,
                          sentences: [...(c.sentences ?? []), pr.sentence],
                        })}
                        className="text-[11px] bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 px-2.5 py-0.5 rounded-full font-semibold">
                  + {pr.label}
                </button>
              ))}
            </div>
            <input value={c.prompt ?? ''} onChange={e => onUpdateContent({ prompt: e.target.value })}
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-1.5 text-sm font-semibold" />
            <p className="arabic text-[11px] text-ink-subtle text-right">
              ضعوا الكلمة المطلوبة بين معقوفتين مثل <code className="font-mono">[a]</code> ليحوّلها النظام تلقائياً إلى فراغ في ورقة التلميذ وإجابة في الإصلاح.
            </p>
            <textarea
              rows={3}
              value={(c.sentences ?? []).join('\n')}
              onChange={e => onUpdateContent({ sentences: e.target.value.split('\n') })}
              className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm font-mono"
            />
          </>
        )}

        {block.type === 'scramble' && (
          <>
            <input value={c.prompt ?? ''} onChange={e => onUpdateContent({ prompt: e.target.value })}
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-1.5 text-sm font-semibold" />
            <div className="flex gap-2">
              <input value={c.answer ?? ''} onChange={e => onUpdateContent({ answer: e.target.value })}
                     placeholder="Phrase correcte (ex: Le petit garçon arrose les fleurs.)"
                     className="flex-1 bg-canvas border border-line rounded-xl px-3 py-2 text-sm" />
              <button
                type="button"
                onClick={() => {
                  const words = String(c.answer ?? '').trim().split(/\s+/).filter(Boolean)
                  for (let i = words.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1))
                    ;[words[i], words[j]] = [words[j], words[i]]
                  }
                  onUpdateContent({ chunks: words })
                }}
                className="px-3 py-2 bg-brand text-white rounded-xl text-xs font-semibold whitespace-nowrap"
              >
                Mélanger
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(c.chunks ?? []).map((ch: string, ci: number) => (
                <span key={ci} className="bg-brand-light text-brand px-2.5 py-1 rounded-lg text-xs font-semibold">{ch}</span>
              ))}
            </div>
          </>
        )}

        {block.type === 'mcq' && (
          <>
            <input value={c.prompt ?? ''} onChange={e => onUpdateContent({ prompt: e.target.value })}
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-1.5 text-sm font-semibold" />
            <div className="space-y-1.5">
              {(c.options ?? []).map((opt: string, oi: number) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="radio" checked={c.answer_index === oi} onChange={() => onUpdateContent({ answer_index: oi })} className="accent-brand" />
                  <input
                    value={opt}
                    onChange={e => {
                      const next = [...(c.options ?? [])]
                      next[oi] = e.target.value
                      onUpdateContent({ options: next })
                    }}
                    className="flex-1 bg-canvas border border-line rounded-lg px-2.5 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {block.type === 'true_false' && (
          <>
            <input value={c.prompt ?? ''} onChange={e => onUpdateContent({ prompt: e.target.value })}
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-1.5 text-sm font-semibold" />
            <div className="space-y-1.5">
              {(c.items ?? []).map((it: { statement: string; answer: boolean }, ii: number) => (
                <div key={ii} className="flex items-center gap-2">
                  <input
                    value={it.statement}
                    onChange={e => {
                      const next = [...(c.items ?? [])]
                      next[ii] = { ...it, statement: e.target.value }
                      onUpdateContent({ items: next })
                    }}
                    className="flex-1 bg-canvas border border-line rounded-lg px-2.5 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(c.items ?? [])]
                      next[ii] = { ...it, answer: !it.answer }
                      onUpdateContent({ items: next })
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold ${it.answer ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                  >
                    {it.answer ? 'Vrai' : 'Faux'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {block.type === 'open_question' && (
          <>
            <input value={c.prompt ?? ''} onChange={e => onUpdateContent({ prompt: e.target.value })}
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-1.5 text-sm font-semibold" />
            <div className="flex gap-2 items-center">
              <input value={c.answer ?? ''} onChange={e => onUpdateContent({ answer: e.target.value })}
                     placeholder="Réponse attendue (pour le Corrigé)"
                     className="flex-1 bg-emerald-50/50 border border-emerald-200 rounded-xl px-3 py-1.5 text-xs" />
              <label className="text-xs text-ink-muted flex items-center gap-1">
                Lignes:
                <input type="number" min={1} max={6} value={c.lines ?? 2} onChange={e => onUpdateContent({ lines: Number(e.target.value) })}
                       className="w-12 bg-canvas border border-line rounded-lg px-2 py-1 text-center num" />
              </label>
            </div>
          </>
        )}

        {block.type === 'matching' && (
          <>
            <input value={c.prompt ?? ''} onChange={e => onUpdateContent({ prompt: e.target.value })}
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-1.5 text-sm font-semibold" />
            <div className="space-y-1.5">
              {(c.pairs ?? []).map((pr: { left: string; right: string }, pi: number) => (
                <div key={pi} className="grid grid-cols-2 gap-2">
                  <input value={pr.left} onChange={e => {
                    const next = [...(c.pairs ?? [])]; next[pi] = { ...pr, left: e.target.value }; onUpdateContent({ pairs: next })
                  }} className="bg-canvas border border-line rounded-lg px-2.5 py-1 text-sm" />
                  <input value={pr.right} onChange={e => {
                    const next = [...(c.pairs ?? [])]; next[pi] = { ...pr, right: e.target.value }; onUpdateContent({ pairs: next })
                  }} className="bg-canvas border border-line rounded-lg px-2.5 py-1 text-sm" />
                </div>
              ))}
            </div>
          </>
        )}

        {block.type === 'production_ecrite' && (
          <>
            <div className="flex gap-2">
              <textarea rows={2} value={c.prompt ?? ''} onChange={e => onUpdateContent({ prompt: e.target.value })}
                        className="flex-1 bg-canvas border border-line rounded-xl px-3 py-1.5 text-sm font-semibold" />
              <button type="button" onClick={onSelectImgTarget}
                      className="arabic inline-flex items-center gap-1 text-xs bg-brand-light text-brand px-3 py-2 rounded-xl font-semibold self-start">
                <ImageIcon className="w-3.5 h-3.5" /> + صورة للقصة
              </button>
            </div>
            {Array.isArray(c.panels) && c.panels.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {c.panels.map((u: string, pi: number) => (
                  <div key={pi} className="relative bg-white border border-line rounded-xl p-1.5 h-24">
                    <img src={u} alt="" className="w-full h-full object-contain" />
                    <button type="button" onClick={() => onUpdateContent({ panels: c.panels.filter((_: string, i: number) => i !== pi) })}
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px]">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <input value={(c.toolbox?.nouns ?? []).join(', ')}
                     onChange={e => onUpdateContent({ toolbox: { ...(c.toolbox ?? {}), nouns: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })}
                     placeholder="Noms (séparés par ,)"
                     className="bg-canvas border border-line rounded-lg px-2.5 py-1.5" />
              <input value={(c.toolbox?.verbs ?? []).join(', ')}
                     onChange={e => onUpdateContent({ toolbox: { ...(c.toolbox ?? {}), verbs: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })}
                     placeholder="Verbes (séparés par ,)"
                     className="bg-canvas border border-line rounded-lg px-2.5 py-1.5" />
              <input value={(c.toolbox?.connectors ?? []).join(', ')}
                     onChange={e => onUpdateContent({ toolbox: { ...(c.toolbox ?? {}), connectors: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })}
                     placeholder="Connecteurs"
                     className="bg-canvas border border-line rounded-lg px-2.5 py-1.5" />
            </div>
            <textarea rows={2} value={c.model_answer ?? ''} onChange={e => onUpdateContent({ model_answer: e.target.value })}
                      placeholder="Exemple de production (pour le Corrigé)"
                      className="w-full bg-emerald-50/50 border border-emerald-200 rounded-xl px-3 py-1.5 text-xs" />
          </>
        )}
      </div>
    </div>
  )
}
