import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, SessionInfo, ScoreRow } from '../api/client'

// ── Exam structure config ─────────────────────────────────────────────────
type Field = keyof Omit<ScoreRow, 'student_id' | 'student_name' | 'order_index'>

const TABS = [
  {
    key: 'prod', label: 'Prod. écrite', fullLabel: 'Prod. écrite et écriture',
    bg: 'bg-prod-light', hdrBg: 'bg-prod-mid', tabActive: 'bg-prod-dark text-white',
    tabInactive: 'bg-prod-light text-prod-dark hover:bg-prod-mid',
    totalBg: 'bg-[#BDD7EE]',
    subsections: [
      { label: 'Dictée',        fields: ['prod_dictee_c4'] as Field[] },
      { label: 'Écriture',      fields: ['prod_ecriture_c2', 'prod_ecriture_c7'] as Field[] },
      { label: 'Prod. écrite',  fields: ['prod_production_c1', 'prod_production_c3', 'prod_production_c5', 'prod_production_c6'] as Field[] },
    ],
  },
  {
    key: 'lecture', label: 'Lecture', fullLabel: 'Lecture',
    bg: 'bg-lecture-light', hdrBg: 'bg-lecture-mid', tabActive: 'bg-lecture-dark text-white',
    tabInactive: 'bg-lecture-light text-lecture-dark hover:bg-lecture-mid',
    totalBg: 'bg-[#A9D18E]',
    subsections: [
      { label: 'Vocale',         fields: ['lect_vocale_c1', 'lect_vocale_c5'] as Field[] },
      { label: 'Compréhension',  fields: ['lect_comp_c2', 'lect_comp_c3', 'lect_comp_c4', 'lect_comp_c6'] as Field[] },
    ],
  },
  {
    key: 'com', label: 'Com. Orale', fullLabel: 'Com. Orale et Récitation',
    bg: 'bg-com-light', hdrBg: 'bg-com-mid', tabActive: 'bg-com-dark text-white',
    tabInactive: 'bg-com-light text-com-dark hover:bg-com-mid',
    totalBg: 'bg-[#F4B183]',
    subsections: [
      { label: 'Récitation', fields: ['com_rec_c1', 'com_rec_c2', 'com_rec_c3', 'com_rec_c4'] as Field[] },
      { label: 'Com. Orale', fields: ['com_oral_c1', 'com_oral_c2', 'com_oral_c3', 'com_oral_c4', 'com_oral_c5', 'com_oral_c6'] as Field[] },
    ],
  },
] as const

type TabKey = typeof TABS[number]['key']

type ScoreMap = Record<string, Record<string, number | null>>

function initScoreMap(rows: ScoreRow[]): ScoreMap {
  const map: ScoreMap = {}
  for (const row of rows) {
    map[row.student_id] = {}
    for (const tab of TABS) {
      for (const sub of tab.subsections) {
        for (const f of sub.fields) {
          map[row.student_id][f] = (row[f] as number | null | undefined) ?? null
        }
      }
    }
  }
  return map
}

function calcTotal(sid: string, fields: readonly Field[], map: ScoreMap): number {
  return fields.reduce((sum, f) => sum + (map[sid]?.[f] ?? 0), 0)
}

// ── Component ─────────────────────────────────────────────────────────────
export default function ScoreEntry() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<TabKey>('prod')
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

  useEffect(() => {
    if (rows.length) setScoreMap(initScoreMap(rows))
  }, [rows])

  const updateScore = useCallback((sid: string, field: string, raw: string) => {
    const val = raw === '' ? null : parseFloat(raw)
    setScoreMap(prev => ({
      ...prev,
      [sid]: { ...prev[sid], [field]: isNaN(val as number) ? null : val },
    }))
    setIsDirty(true)
    setSaveMsg('')
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const scores = rows.map(r => {
        const entry: Record<string, unknown> = { student_id: r.student_id }
        for (const tab of TABS)
          for (const sub of tab.subsections)
            for (const f of sub.fields)
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

  const allProdFields = TABS[0].subsections.flatMap(s => s.fields)
  const allLectFields = TABS[1].subsections.flatMap(s => s.fields)
  const allComFields  = TABS[2].subsections.flatMap(s => s.fields)

  const tab = TABS.find(t => t.key === activeTab)!
  const allTabFields = tab.subsections.flatMap(s => s.fields)

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
                Modifications non enregistrées
              </span>
            )}
            <button
              onClick={() => window.open(api.scores.exportUrl(id!), '_blank')}
              className="text-sm border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
            >
              ↓ Excel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-1.5 rounded-lg font-medium transition"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
              activeTab === t.key ? t.tabActive : t.tabInactive
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setActiveTab('finale' as TabKey)}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
            activeTab === ('finale' as any)
              ? 'bg-finale-dark text-white'
              : 'bg-finale-light text-finale-dark hover:bg-finale-mid'
          }`}
        >
          Note Finale
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : activeTab === ('finale' as any) ? (
          <FinaleTable rows={rows} scoreMap={scoreMap}
            prodFields={allProdFields} lectFields={allLectFields} comFields={allComFields} />
        ) : (
          <ExamTable
            rows={rows}
            tab={tab}
            allFields={allTabFields}
            scoreMap={scoreMap}
            onUpdate={updateScore}
          />
        )}
      </div>
    </div>
  )
}

// ── Exam tab table ────────────────────────────────────────────────────────
function ExamTable({ rows, tab, allFields, scoreMap, onUpdate }: {
  rows: ScoreRow[]
  tab: typeof TABS[number]
  allFields: Field[]
  scoreMap: ScoreMap
  onUpdate: (sid: string, field: string, val: string) => void
}) {
  return (
    <div className={`rounded-b-xl rounded-tr-xl border border-gray-200 overflow-auto bg-white`}>
      <table className="text-sm border-collapse min-w-max">
        <thead>
          {/* Row 1: subsection headers */}
          <tr>
            <th className="bg-gray-100 border border-gray-200 px-3 py-2 text-right font-medium text-gray-600 min-w-[200px] sticky left-0 z-10">
              التلاميذ
            </th>
            {tab.subsections.map(sub => (
              <th key={sub.label}
                  colSpan={sub.fields.length}
                  className={`${tab.hdrBg} border border-gray-200 px-3 py-2 text-center font-medium text-gray-700`}>
                {sub.label}
              </th>
            ))}
            <th className={`${tab.totalBg} border border-gray-200 px-3 py-2 text-center font-bold text-gray-700`}>
              Total
            </th>
          </tr>
          {/* Row 2: criterion labels */}
          <tr>
            <th className="bg-gray-100 border border-gray-200 sticky left-0 z-10" />
            {allFields.map(f => (
              <th key={f} className={`${tab.hdrBg} border border-gray-200 px-2 py-1.5 text-center font-medium text-gray-600 text-xs`}>
                {f.split('_').pop()?.toUpperCase()}
              </th>
            ))}
            <th className={`${tab.totalBg} border border-gray-200`} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const total = calcTotal(row.student_id, allFields, scoreMap)
            return (
              <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className={`arabic border border-gray-200 px-3 py-1.5 text-right text-gray-800 sticky left-0 z-10 font-medium ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <span className="text-gray-400 text-xs mr-2">{i + 1}</span>
                  {row.student_name}
                </td>
                {allFields.map(f => (
                  <td key={f} className={`border border-gray-200 p-0 ${tab.bg}`}>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      className="score-input h-8 px-1"
                      value={scoreMap[row.student_id]?.[f] ?? ''}
                      onChange={e => onUpdate(row.student_id, f, e.target.value)}
                    />
                  </td>
                ))}
                <td className={`${tab.totalBg} border border-gray-200 px-2 py-1.5 text-center font-bold text-gray-800`}>
                  {total > 0 ? total.toFixed(2).replace(/\.00$/, '') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Note Finale table ─────────────────────────────────────────────────────
function FinaleTable({ rows, scoreMap, prodFields, lectFields, comFields }: {
  rows: ScoreRow[]
  scoreMap: ScoreMap
  prodFields: Field[]
  lectFields: Field[]
  comFields:  Field[]
}) {
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
            const p = calcTotal(row.student_id, prodFields, scoreMap)
            const l = calcTotal(row.student_id, lectFields, scoreMap)
            const c = calcTotal(row.student_id, comFields,  scoreMap)
            const f = p + l + c
            const fmt = (n: number) => n > 0 ? n.toFixed(2).replace(/\.00$/, '') : '—'
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
