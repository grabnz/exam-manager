import { useState } from 'react'
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

export default function ExamPrint() {
  const { id } = useParams<{ id: string }>()
  const [sp] = useSearchParams()
  const [mode, setMode] = useState<'student' | 'key'>(sp.get('mode') === 'key' ? 'key' : 'student')

  const { data: paper } = useQuery<ExamPaper>({
    queryKey: ['exam', id],
    queryFn: () => api.exams.get(id!),
    enabled: !!id,
  })
  const { data: settings } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  })

  if (!paper) return <div className="p-10 text-center text-gray-400">Chargement…</div>

  const showKey = mode === 'key'

  return (
    <div className="min-h-screen bg-canvas py-6 px-4 print:bg-white print:p-0">
      {/* Screen-only toolbar */}
      <div className="max-w-[210mm] mx-auto mb-4 flex items-center justify-between gap-3 bg-surface border border-line rounded-2xl px-4 py-2.5 shadow-card print:hidden" dir="rtl">
        <div className="inline-flex bg-canvas rounded-xl p-1">
          <button onClick={() => setMode('student')}
                  className={`arabic text-xs px-4 py-1.5 rounded-lg font-semibold transition ${
                    !showKey ? 'bg-brand text-white' : 'text-ink-muted'
                  }`}>
            ورقة التلميذ (Feuille de l’élève)
          </button>
          <button onClick={() => setMode('key')}
                  className={`arabic text-xs px-4 py-1.5 rounded-lg font-semibold transition ${
                    showKey ? 'bg-emerald-600 text-white' : 'text-ink-muted'
                  }`}>
            ورقة الإصلاح (Corrigé)
          </button>
        </div>
        <button onClick={() => window.print()}
                className="arabic inline-flex items-center gap-1.5 text-xs bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-xl font-semibold">
          <PrinterIcon className="w-3.5 h-3.5" /> طباعة A4 / PDF
        </button>
      </div>

      {/* Official A4 Sheet */}
      <article
        dir={paper.direction}
        className="max-w-[210mm] mx-auto bg-white border border-gray-300 print:border-0 p-8 md:p-10 shadow-float print:shadow-none text-gray-900 space-y-5"
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
          <div className="border-l border-gray-300 pl-3 space-y-1">
            <p>Nom & Prénom : __________________</p>
            <p>Classe : _________</p>
            <p className="font-bold">Note : ______ / {paper.total_points}</p>
          </div>
        </header>

        {/* Render Blocks */}
        <div className="space-y-5">
          {(Array.isArray(paper.blocks) ? paper.blocks : []).map((b, idx) => {
            const c = b.content ?? {}
            return (
              <section key={b.id} className="flex gap-3 items-start break-inside-avoid">
                <div className="flex-1 space-y-2">
                  {b.type === 'reading_text' && (
                    <div className="border border-gray-400 rounded-lg p-4 bg-gray-50/40 space-y-2">
                      {c.title && <h2 className="text-center font-bold text-base underline">{c.title}</h2>}
                      <div className="flex gap-4 items-start">
                        <p className="flex-1 text-sm leading-7 whitespace-pre-line">{c.text}</p>
                        {c.image_url && (
                          <img src={c.image_url} alt="" className="w-36 h-28 object-contain border border-gray-200 rounded bg-white p-1 flex-shrink-0" />
                        )}
                      </div>
                      {c.source && <p className="text-right text-[11px] italic text-gray-500">{c.source}</p>}
                    </div>
                  )}

                  {b.type === 'mcq' && (
                    <div className="space-y-1.5 text-sm">
                      <p className="font-bold">{idx + 1}. {c.prompt}</p>
                      <div className="pl-4 space-y-1">
                        {(c.options ?? []).map((opt: string, oi: number) => (
                          <div key={oi} className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 border border-gray-800 text-center leading-4 text-xs font-bold text-rose-700">
                              {showKey && c.answer_index === oi ? '✓' : ''}
                            </span>
                            <span className={showKey && c.answer_index === oi ? 'font-bold text-rose-700' : ''}>{opt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.type === 'true_false' && (
                    <div className="space-y-1.5 text-sm">
                      <p className="font-bold">{idx + 1}. {c.prompt}</p>
                      <div className="pl-4 space-y-1">
                        {(c.items ?? []).map((it: { statement: string; answer: boolean }, ii: number) => (
                          <div key={ii} className="flex items-center justify-between gap-4 border-b border-dotted border-gray-300 py-1">
                            <span>• {it.statement}</span>
                            <span className="w-24 text-center font-bold border border-gray-400 rounded px-2 py-0.5 text-xs">
                              {showKey ? <span className="text-rose-700">{it.answer ? 'Vrai' : 'Faux'}</span> : '\u00A0'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.type === 'open_question' && (
                    <div className="space-y-1.5 text-sm">
                      <p className="font-bold">{idx + 1}. {c.prompt}</p>
                      {showKey && c.answer ? (
                        <p className="pl-4 text-rose-700 font-semibold italic">{c.answer}</p>
                      ) : (
                        <div className="pl-4 space-y-4 pt-2">
                          {Array.from({ length: c.lines || 2 }).map((_, li) => (
                            <div key={li} className="border-b border-dotted border-gray-500 h-4" />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {b.type === 'fill_blanks' && (
                    <div className="space-y-1.5 text-sm">
                      <p className="font-bold">{idx + 1}. {c.prompt}</p>
                      <div className="pl-4 space-y-1.5">
                        {(c.sentences ?? []).filter(Boolean).map((s: string, si: number) => (
                          <p key={si}>• {renderCloze(s, showKey)}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.type === 'scramble' && (
                    <div className="space-y-1.5 text-sm">
                      <p className="font-bold">{idx + 1}. {c.prompt}</p>
                      <p className="pl-4 font-medium tracking-wide">{(c.chunks ?? []).join('  /  ')}</p>
                      {showKey ? (
                        <p className="pl-4 text-rose-700 font-bold">→ {c.answer}</p>
                      ) : (
                        <div className="pl-4 pt-2"><div className="border-b border-dotted border-gray-500 h-5" /></div>
                      )}
                    </div>
                  )}

                  {b.type === 'matching' && (
                    <div className="space-y-1.5 text-sm">
                      <p className="font-bold">{idx + 1}. {c.prompt}</p>
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
                    <div className="space-y-3 text-sm border-t-2 border-gray-800 pt-3">
                      <p className="font-bold uppercase text-xs tracking-wider text-gray-600">Production Écrite</p>
                      <p className="font-bold">{c.prompt}</p>
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
                        <p className="text-rose-700 font-medium italic bg-rose-50/50 border border-rose-200 rounded p-3">{c.model_answer}</p>
                      ) : (
                        <div className="space-y-5 pt-2">
                          {Array.from({ length: c.lines || 6 }).map((_, li) => (
                            <div key={li} className="border-b border-gray-400 h-4" />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Official Criteria Margin Box */}
                {b.points > 0 && (
                  <div className="w-16 flex-shrink-0 border border-gray-700 rounded text-center text-[11px] py-1">
                    <div className="font-bold border-b border-gray-300 pb-0.5">{b.criterion}</div>
                    <div className="pt-0.5 font-semibold text-gray-600">… / {b.points}</div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </article>
    </div>
  )
}
