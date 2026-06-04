import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, SessionInfo, ScoreRow } from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────
type Field = keyof Omit<ScoreRow, 'student_id' | 'student_name' | 'order_index'>

interface Subsection {
  label: string
  fields: Field[]
  bonusField?: Field   // present when subsection has ≥2 criteria
}

interface Tab {
  key: string
  label: string
  hdrBg: string
  tabActive: string
  tabInactive: string
  totalBg: string
  stBg: string
  subsections: Subsection[]
}

// ── Exam structure ────────────────────────────────────────────────────────────
const TABS: Tab[] = [
  {
    key: 'prod', label: 'Prod. écrite',
    hdrBg: 'bg-prod-mid', tabActive: 'bg-prod-dark text-white',
    tabInactive: 'bg-prod-light text-prod-dark hover:bg-prod-mid',
    totalBg: 'bg-[#BDD7EE]', stBg: 'bg-[#DAEAF5]',
    subsections: [
      { label: 'Dictée',       fields: ['prod_dictee_c4'] },
      { label: 'Écriture',     fields: ['prod_ecriture_c2', 'prod_ecriture_c7'],                                              bonusField: 'prod_ecriture_bonus' },
      { label: 'Prod. écrite', fields: ['prod_production_c1', 'prod_production_c3', 'prod_production_c5', 'prod_production_c6'], bonusField: 'prod_production_bonus' },
    ],
  },
  {
    key: 'lecture', label: 'Lecture',
    hdrBg: 'bg-lecture-mid', tabActive: 'bg-lecture-dark text-white',
    tabInactive: 'bg-lecture-light text-lecture-dark hover:bg-lecture-mid',
    totalBg: 'bg-[#A9D18E]', stBg: 'bg-[#D9EAD3]',
    subsections: [
      { label: 'Vocale',        fields: ['lect_vocale_c1', 'lect_vocale_c5'],                   bonusField: 'lect_vocale_bonus' },
      { label: 'Compréhension', fields: ['lect_comp_c2', 'lect_comp_c3', 'lect_comp_c4', 'lect_comp_c6'], bonusField: 'lect_comp_bonus' },
    ],
  },
  {
    key: 'com', label: 'Com. Orale',
    hdrBg: 'bg-com-mid', tabActive: 'bg-com-dark text-white',
    tabInactive: 'bg-com-light text-com-dark hover:bg-com-mid',
    totalBg: 'bg-[#F4B183]', stBg: 'bg-[#FDE9D9]',
    subsections: [
      { label: 'Récitation', fields: ['com_rec_c1', 'com_rec_c2', 'com_rec_c3', 'com_rec_c4'],                                            bonusField: 'com_rec_bonus' },
      { label: 'Com. Orale', fields: ['com_oral_c1', 'com_oral_c2', 'com_oral_c3', 'com_oral_c4', 'com_oral_c5', 'com_oral_c6'], bonusField: 'com_oral_bonus' },
    ],
  },
]

type ScoreMap = Record<string, Record<string, number | null>>

function allFields(tab: Tab): Field[] {
  return tab.subsections.flatMap(s => s.bonusField ? [...s.fields, s.bonusField] : s.fields)
}

function initScoreMap(rows: ScoreRow[]): ScoreMap {

  const map: ScoreMap = {}
  for (const row of rows) {
    map[row.student_id] = {}
    for (const tab of TABS)
      for (const f of allFields(tab))
        map[row.student_id][f] = (row[f] as number | null | undefined) ?? null
  }
  return map
}

function subTotal(sid: string, sub: Subsection, map: ScoreMap): number {
  const crit = sub.fields.reduce((s, f) => s + (map[sid]?.[f] ?? 0), 0)
  const bonus = sub.bonusField ? (map[sid]?.[sub.bonusField] ?? 0) : 0
  return crit + bonus
}

function tabTotal(sid: string, tab: Tab, map: ScoreMap): number {
  return tab.subsections.reduce((s, sub) => s + subTotal(sid, sub, map), 0)
}

function fmt(n: number) {
  return n > 0 ? n.toFixed(2).replace(/\.00$/, '') : '—'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ScoreEntry() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<string>('prod')
  const [scoreMap,  setScoreMap]  = useState<ScoreMap>({})
  const [isDirty,   setIsDirty]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState('')

  const { data: session } = useQuery<SessionInfo>({
    queryKey: ['session', id],
    queryFn:  () => api.sessions.get(id!),
  })
  const { data: rows = [], isLoading } = useQuery<ScoreRow[]>({
    queryKey: ['scores', id],
    queryFn:  () => api.scores.get(id!),
  })

  useEffect(() => { if (rows.length) setScoreMap(initScoreMap(rows)) }, [rows])

  const update = useCallback((sid: string, field: string, raw: string) => {
    const val = raw === '' ? null : parseFloat(raw)
    setScoreMap(prev => ({
      ...prev,
      [sid]: { ...prev[sid], [field]: isNaN(val as number) ? null : val },
    }))
    setIsDirty(true)
    setSaveMsg('')
  }, [])

  async function save() {
    setSaving(true)
    try {
      const scores = rows.map(r => {
        const entry: Record<string, unknown> = { student_id: r.student_id }
        for (const tab of TABS)
          for (const f of allFields(tab))
            entry[f] = scoreMap[r.student_id]?.[f] ?? null
        return entry
      })
      await api.scores.save(id!, scores as any)
      setIsDirty(false)
      setSaveMsg('Enregistré ✓')
      setTimeout(() => setSaveMsg(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  const currentTab = TABS.find(t => t.key === activeTab)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <button onClick={() => navigate(session ? `/classes/${session.class_id}` : '/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-2">
          ← {session?.class_name ?? 'Retour'}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="arabic text-xl font-bold text-gray-900">
              {session?.class_name} — Trimestre {session?.trimester}{' '}
              <span className="arabic font-normal text-gray-500">{session?.exam_type}</span>
            </h1>
            {session?.teacher && <p className="arabic text-sm text-gray-500">{session.teacher}</p>}
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && <span className="text-sm text-green-600 font-medium">{saveMsg}</span>}
            {isDirty && !saving && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                Non enregistré
              </span>
            )}
            <button onClick={() => window.open(api.scores.exportUrl(id!), '_blank')}
                    className="text-sm border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition">
              ↓ Excel
            </button>
            <button onClick={save} disabled={saving || !isDirty}
                    className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-1.5 rounded-lg font-medium transition">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
                    activeTab === t.key ? t.tabActive : t.tabInactive}`}>
            {t.label}
          </button>
        ))}
        <button onClick={() => setActiveTab('finale')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
                  activeTab === 'finale'
                    ? 'bg-finale-dark text-white'
                    : 'bg-finale-light text-finale-dark hover:bg-finale-mid'}`}>
          Note Finale
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : activeTab === 'finale' ? (
          <FinaleTable rows={rows} scoreMap={scoreMap} />
        ) : currentTab ? (
          <ExamTable rows={rows} tab={currentTab} scoreMap={scoreMap} onUpdate={update} />
        ) : null}
      </div>
    </div>
  )
}

// ── Exam tab table ─────────────────────────────────────────────────────────────
function ExamTable({ rows, tab, scoreMap, onUpdate }: {
  rows: ScoreRow[]
  tab: Tab
  scoreMap: ScoreMap
  onUpdate: (sid: string, field: string, val: string) => void
}) {
  return (
    <div className="rounded-b-xl rounded-tr-xl border border-gray-200 overflow-auto bg-white">
      <table className="text-sm border-collapse min-w-max">
        <thead>
          {/* Row 1: subsection headers */}
          <tr>
            <th className="bg-gray-100 border border-gray-200 px-3 py-2 text-right font-medium text-gray-600 min-w-[200px] sticky left-0 z-10">
              التلاميذ
            </th>
            {tab.subsections.map(sub => {
              const span = sub.fields.length + (sub.bonusField ? 2 : 0)
              return (
                <th key={sub.label} colSpan={span}
                    className={`${tab.hdrBg} border border-gray-200 px-3 py-2 text-center font-medium text-gray-700`}>
                  {sub.label}
                </th>
              )
            })}
            <th className={`${tab.totalBg} border border-gray-200 px-3 py-2 text-center font-bold text-gray-700`}>
              Total
            </th>
          </tr>
          {/* Row 2: criterion / Bonus / S.T. labels */}
          <tr>
            <th className="bg-gray-100 border border-gray-200 sticky left-0 z-10" />
            {tab.subsections.map(sub => (
              <>
                {sub.fields.map(f => (
                  <th key={f} className={`${tab.hdrBg} border border-gray-200 px-2 py-1.5 text-center font-medium text-gray-600 text-xs`}>
                    {f.split('_').pop()?.toUpperCase()}
                  </th>
                ))}
                {sub.bonusField && (
                  <th key={`${sub.label}-bonus`}
                      className="bg-[#E2EFDA] border border-gray-200 px-2 py-1.5 text-center font-medium text-gray-600 text-xs">
                    Bonus
                  </th>
                )}
                {sub.bonusField && (
                  <th key={`${sub.label}-st`}
                      className={`${tab.stBg} border border-gray-200 px-2 py-1.5 text-center font-bold text-gray-700 text-xs`}>
                    S.T.
                  </th>
                )}
              </>
            ))}
            <th className={`${tab.totalBg} border border-gray-200`} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const total = tabTotal(row.student_id, tab, scoreMap)
            return (
              <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className={`arabic border border-gray-200 px-3 py-1.5 text-right text-gray-800 sticky left-0 z-10 font-medium ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <span className="text-gray-400 text-xs mr-2">{i + 1}</span>
                  {row.student_name}
                </td>
                {tab.subsections.map(sub => {
                  const st = subTotal(row.student_id, sub, scoreMap)
                  return (
                    <>
                      {sub.fields.map(f => (
                        <td key={f} className="border border-gray-200 p-0 bg-[#EBF3FB]">
                          <input type="number" min={0} step={0.25} className="score-input h-8 px-1 w-14"
                                 value={scoreMap[row.student_id]?.[f] ?? ''}
                                 onChange={e => onUpdate(row.student_id, f, e.target.value)} />
                        </td>
                      ))}
                      {sub.bonusField && (
                        <td key={`${sub.label}-bonus`} className="border border-gray-200 p-0 bg-[#E2EFDA]">
                          <input type="number" min={0} step={0.25} className="score-input h-8 px-1 w-14"
                                 value={scoreMap[row.student_id]?.[sub.bonusField] ?? ''}
                                 onChange={e => onUpdate(row.student_id, sub.bonusField!, e.target.value)} />
                        </td>
                      )}
                      {sub.bonusField && (
                        <td key={`${sub.label}-st`}
                            className={`${tab.stBg} border border-gray-200 px-2 py-1.5 text-center font-bold text-gray-800 text-sm`}>
                          {fmt(st)}
                        </td>
                      )}
                    </>
                  )
                })}
                <td className={`${tab.totalBg} border border-gray-200 px-2 py-1.5 text-center font-bold text-gray-800`}>
                  {fmt(total)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Note Finale table ──────────────────────────────────────────────────────────
function FinaleTable({ rows, scoreMap }: { rows: ScoreRow[]; scoreMap: ScoreMap }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-auto bg-white">
      <table className="text-sm border-collapse min-w-max">
        <thead>
          <tr>
            <th className="bg-gray-100 border border-gray-200 px-4 py-2.5 text-right font-medium text-gray-600 min-w-[200px] sticky left-0">
              التلاميذ
            </th>
            <th className="bg-prod-mid border border-gray-200 px-4 py-2.5 text-center font-medium text-gray-700 min-w-[130px]">
              Prod. écrite
            </th>
            <th className="bg-lecture-mid border border-gray-200 px-4 py-2.5 text-center font-medium text-gray-700 min-w-[100px]">
              Lecture
            </th>
            <th className="bg-com-mid border border-gray-200 px-4 py-2.5 text-center font-medium text-gray-700 min-w-[130px]">
              Com. Orale
            </th>
            <th className="bg-finale-mid border border-gray-200 px-4 py-2.5 text-center font-bold text-gray-800 min-w-[110px]">
              Note Finale
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const p = tabTotal(row.student_id, TABS[0], scoreMap)
            const l = tabTotal(row.student_id, TABS[1], scoreMap)
            const c = tabTotal(row.student_id, TABS[2], scoreMap)
            const f = p + l + c
            return (
              <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className={`arabic border border-gray-200 px-4 py-2 text-right font-medium sticky left-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <span className="text-gray-400 text-xs mr-2">{i + 1}</span>
                  {row.student_name}
                </td>
                <td className="bg-prod-light border border-gray-200 px-4 py-2 text-center">{fmt(p)}</td>
                <td className="bg-lecture-light border border-gray-200 px-4 py-2 text-center">{fmt(l)}</td>
                <td className="bg-com-light border border-gray-200 px-4 py-2 text-center">{fmt(c)}</td>
                <td className="bg-finale-light border border-gray-200 px-4 py-2 text-center font-bold text-gray-900 text-base">
                  {fmt(f)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
