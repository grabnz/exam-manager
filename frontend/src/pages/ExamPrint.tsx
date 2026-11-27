import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, ExamPaper, SettingsData } from '../api/client'
import { PrinterIcon } from '../components/icons'

function renderCloze(sentence: string, showKey: boolean) {
  const parts = sentence.split(/(\[[^\]]+\])/g)
  return parts.map((part, i) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      const ans = part.slice(1, -1)
      return showKey ? (
        <span key={i} className="font-bold text-rose-700 underline decoration-rose-400 px-1">{ans}</span>
      ) : (
        <span key={i} className="inline-block border-b border-gray-800 min-w-[68px] mx-1">&nbsp;</span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function AnswerLines({ count, style }: { count: number; style: 'dotted' | 'seyes' }) {
  return (
    <div className={style === 'seyes' ? 'space-y-3 pt-1.5' : 'space-y-4 pt-2'}>
      {Array.from({ length: Math.max(1, count) }).map((_, li) =>
        style === 'seyes' ? (
          <div key={li} className="space-y-1">
            <div className="border-b border-sky-200 h-2" />
            <div className="border-b border-sky-400 h-2" />
          </div>
        ) : (
          <div key={li} className="border-b border-dotted border-gray-500 h-4" />
        )
      )}
    </div>
  )
}

function CriterionBox({ code, points }: { code: string; points: number }) {
  if (!points || points <= 0) return null
  return (
    <div className="w-24 flex-shrink-0 border border-gray-800 rounded text-center text-[10px] overflow-hidden">
      <div className="font-extrabold bg-gray-100 border-b border-gray-800 py-0.5">{code || 'C1'}</div>
      <div className="grid grid-cols-4 divide-x divide-gray-300 border-b border-gray-300 py-0.5 text-[9px] text-gray-600">
        <span>-</span><span>+</span><span>++</span><span>+++</span>
      </div>
      <div className="py-1 font-bold text-gray-800">…… / {points}</div>
    </div>
  )
}

export default function ExamPrint() {
  const { id } = useParams<{ id: string }>()
  const [sp] = useSearchParams()
  const [mode, setMode] = useState<'student' | 'key'>(sp.get('mode') === 'key' ? 'key' : 'student')
  const [lineStyle, setLineStyle] = useState<'dotted' | 'seyes'>('dotted')
  const [density, setDensity] = useState<'compact' | 'normal' | 'large'>('normal')

  const { data: paper } = useQuery<ExamPaper>({
    queryKey: ['exam', id],
    queryFn: () => api.exams.get(id!),
    enabled: !!id,
  })
  const { data: settings } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  })

  const blocks = useMemo(() => (Array.isArray(paper?.blocks) ? paper!.blocks : []), [paper])

  // Aggregate official Tunisian criteria breakdown (including sub-questions of reading_comprehension!)
  const criteriaSummary = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of blocks) {
      if (b.type === 'reading_comprehension' && Array.isArray(b.content?.questions)) {
        for (const q of b.content.questions) {
          const pts = Number(q.points) || 0
          if (pts <= 0) continue
          const key = (q.criterion || 'C2').trim().toUpperCase()
          map.set(key, +((map.get(key) ?? 0) + pts).toFixed(2))
        }
        continue
      }
      if (!b.points || b.points <= 0) continue
      const key = (b.criterion || 'C1').trim().toUpperCase()
      map.set(key, +((map.get(key) ?? 0) + Number(b.points)).toFixed(2))
    }
    if (map.size === 0) {
      return [
        { code: 'C1', label: 'Adéquation / Lecture', max: 4 },
        { code: 'C2', label: 'Compréhension',        max: 4 },
        { code: 'C3', label: 'Correction linguistique', max: 4 },
        { code: 'C4', label: 'Justification / Avis', max: 3 },
        { code: 'C5', label: 'Langue / Orthographe', max: 3 },
        { code: 'C6', label: 'Perfectionnement',     max: 2 },
      ]
    }
    const labels: Record<string, string> = {
      C1: 'Adéquation / Lecture',
      C2: 'Compréhension globale',
      C3: 'Structure / Syntaxe',
      C4: 'Justification / Cohérence',
      C5: 'Langue / Orthographe',
      C6: 'Perfectionnement',
      C7: 'Présentation / Écriture',
    }
    return [...map.entries()].map(([code, max]) => ({
      code,
      label: labels[code] ?? 'Critère d’évaluation',
      max,
    }))
  }, [blocks])

  if (!paper) return <div className="p-10 text-center text-gray-400">Chargement…</div>

  const showKey = mode === 'key'
  const textSizeCls = density === 'compact' ? 'text-xs' : density === 'large' ? 'text-base' : 'text-sm'
  const spacingCls = density === 'compact' ? 'space-y-3' : density === 'large' ? 'space-y-6' : 'space-y-4'

  return (
    <div className="min-h-screen bg-canvas py-6 px-4 print:bg-white print:p-0">
      {/* Screen-only adaptable print toolbar */}
      <div className="max-w-[210mm] mx-auto mb-4 flex items-center justify-between gap-2 flex-wrap bg-surface border border-line rounded-2xl px-4 py-2.5 shadow-card print:hidden" dir="rtl">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-canvas rounded-xl p-1">
            <button onClick={() => setMode('student')}
                    className={`arabic text-xs px-3 py-1.5 rounded-lg font-semibold transition ${!showKey ? 'bg-brand text-white' : 'text-ink-muted'}`}>
              ورقة التلميذ
            </button>
            <button onClick={() => setMode('key')}
                    className={`arabic text-xs px-3 py-1.5 rounded-lg font-semibold transition ${showKey ? 'bg-emerald-600 text-white' : 'text-ink-muted'}`}>
              الإصلاح (Corrigé)
            </button>
          </div>
          <div className="inline-flex bg-canvas rounded-xl p-1">
            <button onClick={() => setLineStyle('dotted')}
                    className={`arabic text-xs px-2.5 py-1 rounded-lg font-medium ${lineStyle === 'dotted' ? 'bg-surface text-brand shadow-sm' : 'text-ink-muted'}`}>
              أسطر منقّطة
            </button>
            <button onClick={() => setLineStyle('seyes')}
                    className={`arabic text-xs px-2.5 py-1 rounded-lg font-medium ${lineStyle === 'seyes' ? 'bg-surface text-brand shadow-sm' : 'text-ink-muted'}`}>
              خطوط كراس (Seyès)
            </button>
          </div>
          <select value={density} onChange={e => setDensity(e.target.value as any)}
                  className="arabic bg-canvas border border-line rounded-xl px-2.5 py-1.5 text-xs font-medium">
            <option value="compact">مضغوط (صفحة 1)</option>
            <option value="normal">عادي</option>
            <option value="large">كبير (سنة 3)</option>
          </select>
        </div>
        <button onClick={() => window.print()}
                className="arabic inline-flex items-center gap-1.5 text-xs bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-xl font-semibold">
          <PrinterIcon className="w-3.5 h-3.5" /> طباعة A4 / PDF
        </button>
      </div>

      {/* Official A4 Sheet */}
      <article
        dir={paper.direction}
        className={`max-w-[210mm] mx-auto bg-white border border-gray-300 print:border-0 p-7 md:p-9 shadow-float print:shadow-none text-gray-900 ${spacingCls} overflow-hidden`}
      >
        {/* Ministry-style Official Header */}
        <header className="border-2 border-gray-800 rounded-lg p-3.5 grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="font-bold">Ministère de l’Éducation</p>
            <p className="text-gray-600">{settings?.school_name || 'École Primaire'}</p>
            <p className="text-gray-600">Année scolaire : {paper.school_year}</p>
          </div>
          <div className="text-center flex flex-col justify-center">
            <h1 className="text-base font-extrabold uppercase tracking-wide">
              {paper.exam_type} de Français
            </h1>
            <p className="font-semibold text-gray-700">
              {paper.level} · Trimestre {paper.trimester}{paper.module_num ? ` · Module ${paper.module_num}` : ''}
            </p>
            {showKey && (
              <span className="inline-block mt-1 mx-auto bg-rose-100 text-rose-700 border border-rose-300 px-2 py-0.5 rounded font-bold text-[10px]">
                CORRIGÉ — COPIE ENSEIGNANT(E)
              </span>
            )}
          </div>
          <div className="border-l border-gray-300 pl-3 space-y-1.5">
            <p>Nom & Prénom : ______________</p>
            <p>Classe : _________</p>
            <div className="flex items-center justify-between pt-0.5">
              <span className="font-bold">Note :</span>
              <span className="border-2 border-gray-800 rounded px-2.5 py-0.5 font-extrabold text-sm">
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / {paper.total_points}
              </span>
            </div>
          </div>
        </header>

        {/* Render Blocks */}
        <div className={spacingCls}>
          {blocks.map((b, idx) => {
            const c = b.content ?? {}

            if (b.type === 'section_header') {
              return (
                <div key={b.id} className="border-b-2 border-gray-800 pb-1 pt-2 break-inside-avoid">
                  <h2 className="text-sm font-extrabold uppercase tracking-wide text-gray-900">{c.heading}</h2>
                  {c.subtitle && <p className="text-xs italic text-gray-600">{c.subtitle}</p>}
                </div>
              )
            }

            if (b.type === 'reading_comprehension') {
              const lines = String(c.text ?? '').split('\n')
              return (
                <div key={b.id} className="space-y-3">
                  <div className="border border-gray-400 rounded-lg p-4 bg-gray-50/40 space-y-2 overflow-hidden break-inside-avoid">
                    {c.title && <h2 className="text-center font-bold text-base underline">{c.title}</h2>}
                    <div className="flex gap-4 items-start">
                      <div className={`flex-1 min-w-0 ${textSizeCls} leading-7 space-y-1`}>
                        {c.numbered_lines ? lines.map((ln: string, li: number) => (
                          <p key={li} className="flex gap-2 break-words">
                            <span className="text-[10px] text-gray-400 w-4 flex-shrink-0 pt-1">{li + 1}</span>
                            <span className="flex-1 min-w-0 break-words">{ln}</span>
                          </p>
                        )) : (
                          <p className="whitespace-pre-line break-words">{c.text}</p>
                        )}
                      </div>
                      {c.image_url && (
                        <img src={c.image_url} alt="" className="w-40 h-28 object-contain border border-gray-200 rounded bg-white p-1 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  {(c.questions ?? []).map((q: any, qi: number) => (
                    <section key={qi} className="flex gap-3 items-start break-inside-avoid">
                      <div className={`flex-1 min-w-0 ${textSizeCls} space-y-1`}>
                        <p className="font-bold break-words">{qi + 1}. {q.prompt}</p>
                        {showKey && q.answer ? (
                          <p className="pl-4 text-rose-700 font-semibold italic break-words">{q.answer}</p>
                        ) : (
                          <div className="pl-4"><AnswerLines count={q.lines || 2} style={lineStyle} /></div>
                        )}
                      </div>
                      <CriterionBox code={q.criterion || 'C2'} points={Number(q.points) || 0} />
                    </section>
                  ))}
                </div>
              )
            }

            return (
              <section key={b.id} className="flex gap-3 items-start break-inside-avoid">
                <div className={`flex-1 min-w-0 space-y-2 ${textSizeCls}`}>
                  {b.type !== 'reading_text' && b.type !== 'production_ecrite' && c.image_url && (
                    <div className="mb-1.5">
                      <img src={c.image_url} alt="" className="max-h-32 max-w-[220px] object-contain border border-gray-200 rounded bg-white p-1" />
                    </div>
                  )}
                  {b.type === 'reading_text' && (
                    <div className="border border-gray-400 rounded-lg p-4 bg-gray-50/40 space-y-2 overflow-hidden">
                      {c.title && <h2 className="text-center font-bold text-base underline">{c.title}</h2>}
                      <div className="flex gap-4 items-start">
                        <p className="flex-1 min-w-0 leading-7 whitespace-pre-line break-words">{c.text}</p>
                        {c.image_url && (
                          <img src={c.image_url} alt="" className="w-40 h-28 object-contain border border-gray-200 rounded bg-white p-1 flex-shrink-0" />
                        )}
                      </div>
                      {c.source && <p className="text-right text-[11px] italic text-gray-500">{c.source}</p>}
                    </div>
                  )}

                  {b.type === 'mcq' && (
                    <div className="space-y-1.5">
                      <p className="font-bold break-words">{idx + 1}. {c.prompt}</p>
                      <div className="pl-4 space-y-1">
                        {(c.options ?? []).map((opt: string, oi: number) => (
                          <div key={oi} className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 border border-gray-800 text-center leading-4 text-xs font-bold text-rose-700 flex-shrink-0">
                              {showKey && c.answer_index === oi ? '✓' : ''}
                            </span>
                            <span className={`break-words ${showKey && c.answer_index === oi ? 'font-bold text-rose-700' : ''}`}>{opt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.type === 'true_false' && (
                    <div className="space-y-1.5">
                      <p className="font-bold break-words">{idx + 1}. {c.prompt}</p>
                      <div className="pl-4 space-y-1">
                        {(c.items ?? []).map((it: { statement: string; answer: boolean }, ii: number) => (
                          <div key={ii} className="flex items-center justify-between gap-4 border-b border-dotted border-gray-300 py-1">
                            <span className="break-words">• {it.statement}</span>
                            <span className="w-24 flex-shrink-0 text-center font-bold border border-gray-400 rounded px-2 py-0.5 text-xs">
                              {showKey ? <span className="text-rose-700">{it.answer ? 'Vrai' : 'Faux'}</span> : '\u00A0'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.type === 'open_question' && (
                    <div className="space-y-1.5">
                      <p className="font-bold break-words">{idx + 1}. {c.prompt}</p>
                      {showKey && c.answer ? (
                        <p className="pl-4 text-rose-700 font-semibold italic break-words">{c.answer}</p>
                      ) : (
                        <div className="pl-4"><AnswerLines count={c.lines || 2} style={lineStyle} /></div>
                      )}
                    </div>
                  )}

                  {b.type === 'fill_blanks' && (
                    <div className="space-y-1.5">
                      <p className="font-bold break-words">{idx + 1}. {c.prompt}</p>
                      <div className="pl-4 space-y-1.5">
                        {(c.sentences ?? []).filter(Boolean).map((s: string, si: number) => (
                          <p key={si} className="break-words">• {renderCloze(s, showKey)}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.type === 'table_fill' && (
                    <div className="space-y-2">
                      <p className="font-bold break-words">{idx + 1}. {c.prompt}</p>
                      <table className="w-full text-xs border-collapse border border-gray-700">
                        <thead>
                          <tr className="bg-gray-100">
                            {(c.headers ?? []).map((h: string, hi: number) => (
                              <th key={hi} className="border border-gray-700 px-2.5 py-1.5 text-center font-bold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(c.rows ?? []).map((row: string[], ri: number) => (
                            <tr key={ri}>
                              {row.map((cell: string, ci: number) => (
                                <td key={ci} className="border border-gray-700 px-2.5 py-2 text-center">
                                  {renderCloze(cell, showKey)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {b.type === 'transformation' && (
                    <div className="space-y-2">
                      <p className="font-bold break-words">{idx + 1}. {c.prompt}</p>
                      <div className="pl-4 space-y-2.5">
                        {(c.items ?? []).map((it: any, ii: number) => (
                          <div key={ii} className="space-y-1">
                            <p className="break-words">• {it.source}</p>
                            {showKey && it.answer ? (
                              <p className="pl-3 text-rose-700 font-semibold break-words">→ {it.answer}</p>
                            ) : (
                              <div className="pl-3"><AnswerLines count={it.lines || 2} style={lineStyle} /></div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.type === 'scramble' && (
                    <div className="space-y-1.5">
                      <p className="font-bold break-words">{idx + 1}. {c.prompt}</p>
                      <p className="pl-4 font-medium tracking-wide break-words">{(c.chunks ?? []).join('  /  ')}</p>
                      {showKey ? (
                        <p className="pl-4 text-rose-700 font-bold break-words">→ {c.answer}</p>
                      ) : (
                        <div className="pl-4"><AnswerLines count={1} style={lineStyle} /></div>
                      )}
                    </div>
                  )}

                  {b.type === 'matching' && (
                    <div className="space-y-1.5">
                      <p className="font-bold break-words">{idx + 1}. {c.prompt}</p>
                      <div className="pl-4 grid grid-cols-2 gap-x-10 gap-y-2 max-w-lg">
                        {(c.pairs ?? []).map((pr: { left: string; right: string }, pi: number) => (
                          <div key={pi} className="contents">
                            <div className="flex items-center justify-between">
                              <span>{pr.left}</span><span>●</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>●</span><span>{pr.right}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.type === 'production_ecrite' && (
                    <div className="space-y-3 border-t-2 border-gray-800 pt-3">
                      <p className="font-bold uppercase text-xs tracking-wider text-gray-600">Production Écrite</p>
                      <p className="font-bold break-words">{c.prompt}</p>
                      {Array.isArray(c.panels) && c.panels.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                          {c.panels.map((u: string, pi: number) => (
                            <div key={pi} className="border border-gray-400 rounded p-2 h-28 flex items-center justify-center relative">
                              <span className="absolute top-1 left-1.5 text-[10px] font-bold bg-gray-100 px-1.5 rounded">{pi + 1}</span>
                              <img src={u} alt="" className="max-h-full max-w-full object-contain" />
                            </div>
                          ))}
                        </div>
                      )}
                      {c.toolbox && (
                        <div className="border border-gray-400 rounded p-2.5 bg-gray-50/50 grid grid-cols-3 gap-2 text-xs">
                          <div><strong>Noms :</strong> {(c.toolbox.nouns ?? []).join(' · ')}</div>
                          <div><strong>Verbes :</strong> {(c.toolbox.verbs ?? []).join(' · ')}</div>
                          <div><strong>Mots de liaison :</strong> {(c.toolbox.connectors ?? []).join(' · ')}</div>
                        </div>
                      )}
                      {showKey && c.model_answer ? (
                        <p className="text-rose-700 font-medium italic bg-rose-50/50 border border-rose-200 rounded p-3 break-words">{c.model_answer}</p>
                      ) : (
                        <AnswerLines count={c.lines || 6} style={lineStyle} />
                      )}
                    </div>
                  )}
                </div>

                <CriterionBox code={b.criterion} points={b.points} />
              </section>
            )
          })}
        </div>

        {/* Official Tunisian Bottom Grille d'évaluation par critères & Score Box */}
        <footer className="pt-4 border-t-2 border-gray-800 space-y-3 break-inside-avoid">
          <p className="text-xs font-extrabold uppercase tracking-wider text-gray-800">
            Grille d’évaluation par critères
          </p>
          <table className="w-full text-xs border-collapse border border-gray-800">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-800 px-2.5 py-1.5 text-left w-16">Critère</th>
                <th className="border border-gray-800 px-2.5 py-1.5 text-left">Indicateur</th>
                <th className="border border-gray-800 px-2 py-1.5 text-center w-10">-</th>
                <th className="border border-gray-800 px-2 py-1.5 text-center w-10">+</th>
                <th className="border border-gray-800 px-2 py-1.5 text-center w-10">++</th>
                <th className="border border-gray-800 px-2 py-1.5 text-center w-12">+++</th>
                <th className="border border-gray-800 px-2.5 py-1.5 text-center w-24">Note</th>
              </tr>
            </thead>
            <tbody>
              {criteriaSummary.map(cr => (
                <tr key={cr.code}>
                  <td className="border border-gray-800 px-2.5 py-1.5 font-bold">{cr.code}</td>
                  <td className="border border-gray-800 px-2.5 py-1.5 text-gray-700">{cr.label}</td>
                  <td className="border border-gray-800 text-center">☐</td>
                  <td className="border border-gray-800 text-center">☐</td>
                  <td className="border border-gray-800 text-center">☐</td>
                  <td className="border border-gray-800 text-center">☐</td>
                  <td className="border border-gray-800 px-2 py-1.5 text-center font-semibold">…… / {cr.max}</td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-extrabold">
                <td colSpan={6} className="border border-gray-800 px-2.5 py-2 text-right uppercase">
                  Note Finale
                </td>
                <td className="border border-gray-800 px-2 py-2 text-center text-sm">
                  …… / {paper.total_points}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="pt-2 text-xs text-gray-700">
            <div className="border border-gray-400 rounded p-2.5 min-h-[52px]">
              <span className="font-bold">Observation de l’enseignant(e) :</span>
            </div>
          </div>
        </footer>
      </article>
    </div>
  )
}
