import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, SessionInfo, ScoreRow } from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────
type Field = keyof Omit<ScoreRow, 'student_id' | 'student_name' | 'order_index'>

interface Subsection {
  label: string
  fields: Field[]
  bonusField?: Field
  stField?: Field   // when set: directly editable S.T. that overrides criteria+bonus
}
interface Tab {
  key: string; label: string
  hdrBg: string; dataBg: string; stBg: string; totalBg: string
  cardBg: string; cardBorder: string; accentText: string
  tabActive: string; tabInactive: string
  subsections: Subsection[]
}

// ── Exam structure ─────────────────────────────────────────────────────────────
const TABS: Tab[] = [
  {
    key: 'prod', label: 'Prod. écrite',
    hdrBg: 'bg-prod-mid', dataBg: 'bg-prod-light', stBg: 'bg-[#DAEAF5]', totalBg: 'bg-[#BDD7EE]',
    cardBg: 'bg-blue-50', cardBorder: 'border-blue-200', accentText: 'text-blue-800',
    tabActive: 'bg-prod-dark text-white', tabInactive: 'bg-prod-light text-prod-dark hover:bg-prod-mid',
    subsections: [
      { label: 'Dictée',       fields: ['prod_dictee_c4'] },
      { label: 'Écriture',     fields: ['prod_ecriture_c2', 'prod_ecriture_c7'],                                                bonusField: 'prod_ecriture_bonus',   stField: 'prod_ecriture_st' },
      { label: 'Prod. écrite', fields: ['prod_production_c1', 'prod_production_c3', 'prod_production_c5', 'prod_production_c6'], bonusField: 'prod_production_bonus', stField: 'prod_production_st' },
    ],
  },
  {
    key: 'lecture', label: 'Lecture',
    hdrBg: 'bg-lecture-mid', dataBg: 'bg-lecture-light', stBg: 'bg-[#D9EAD3]', totalBg: 'bg-[#A9D18E]',
    cardBg: 'bg-green-50', cardBorder: 'border-green-200', accentText: 'text-green-800',
    tabActive: 'bg-lecture-dark text-white', tabInactive: 'bg-lecture-light text-lecture-dark hover:bg-lecture-mid',
    subsections: [
      { label: 'Vocale',        fields: ['lect_vocale_c1', 'lect_vocale_c5'],                             bonusField: 'lect_vocale_bonus', stField: 'lect_vocale_st' },
      { label: 'Compréhension', fields: ['lect_comp_c2', 'lect_comp_c3', 'lect_comp_c4', 'lect_comp_c6'], bonusField: 'lect_comp_bonus',   stField: 'lect_comp_st' },
    ],
  },
  {
    key: 'com', label: 'Com. Orale',
    hdrBg: 'bg-com-mid', dataBg: 'bg-com-light', stBg: 'bg-[#FDE9D9]', totalBg: 'bg-[#F4B183]',
    cardBg: 'bg-orange-50', cardBorder: 'border-orange-200', accentText: 'text-orange-800',
    tabActive: 'bg-com-dark text-white', tabInactive: 'bg-com-light text-com-dark hover:bg-com-mid',
    subsections: [
      { label: 'Récitation', fields: ['com_rec_c1', 'com_rec_c2', 'com_rec_c3', 'com_rec_c4'],                                             bonusField: 'com_rec_bonus',  stField: 'com_rec_st' },
      { label: 'Com. Orale', fields: ['com_oral_c1', 'com_oral_c2', 'com_oral_c3', 'com_oral_c4', 'com_oral_c5', 'com_oral_c6'], bonusField: 'com_oral_bonus', stField: 'com_oral_st' },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
type ScoreMap = Record<string, Record<string, number | null>>

function allFields(tab: Tab): Field[] {
  return tab.subsections.flatMap(s => {
    const fs: Field[] = [...s.fields]
    if (s.bonusField) fs.push(s.bonusField)
    if (s.stField)    fs.push(s.stField)
    return fs
  })
}
function initMap(rows: ScoreRow[]): ScoreMap {
  const map: ScoreMap = {}
  for (const r of rows) {
    map[r.student_id] = {}
    for (const tab of TABS)
      for (const f of allFields(tab))
        map[r.student_id][f] = (r[f] as number | null | undefined) ?? null
  }
  return map
}
function subTot(sid: string, sub: Subsection, map: ScoreMap): number {
  // If a direct S.T. override has been entered, use it
  if (sub.stField) {
    const direct = map[sid]?.[sub.stField] ?? null
    if (direct !== null) return direct as number
  }
  const crit = sub.fields.reduce((s, f) => s + (map[sid]?.[f] ?? 0), 0)
  return crit + (sub.bonusField ? (map[sid]?.[sub.bonusField] ?? 0) : 0)
}
function isDirect(sid: string, sub: Subsection, map: ScoreMap): boolean {
  return !!sub.stField && (map[sid]?.[sub.stField] ?? null) !== null
}
function tabTot(sid: string, tab: Tab, map: ScoreMap) {
  return tab.subsections.reduce((s, sub) => s + subTot(sid, sub, map), 0)
}
function fmt(n: number) { return n > 0 ? +n.toFixed(2) + '' : '—' }

// ── Main component ────────────────────────────────────────────────────────────
export default function ScoreEntry() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [activeTab,    setActiveTab]    = useState('prod')
  const [scoreMap,     setScoreMap]     = useState<ScoreMap>({})
  const [isDirty,      setIsDirty]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saveMsg,      setSaveMsg]      = useState('')
  const [mobileIdx,    setMobileIdx]    = useState<number | null>(null)
  const [xlsxError,    setXlsxError]    = useState('')
  const [xlsxLoading,  setXlsxLoading]  = useState(false)

  const { data: session } = useQuery<SessionInfo>({ queryKey: ['session', id], queryFn: () => api.sessions.get(id!) })
  const { data: rows = [], isLoading } = useQuery<ScoreRow[]>({ queryKey: ['scores', id], queryFn: () => api.scores.get(id!) })

  useEffect(() => { if (rows.length) setScoreMap(initMap(rows)) }, [rows])

  const update = useCallback((sid: string, field: string, raw: string) => {
    const val = raw === '' ? null : parseFloat(raw)
    setScoreMap(prev => ({ ...prev, [sid]: { ...prev[sid], [field]: isNaN(val as number) ? null : val } }))
    setIsDirty(true)
    setSaveMsg('')
  }, [])

  async function save() {
    setSaving(true)
    try {
      const scores = rows.map(r => {
        const e: Record<string, unknown> = { student_id: r.student_id }
        for (const tab of TABS) for (const f of allFields(tab)) e[f] = scoreMap[r.student_id]?.[f] ?? null
        return e
      })
      await api.scores.save(id!, scores as any)
      setIsDirty(false)
      setSaveMsg('Enregistré ✓')
      setTimeout(() => setSaveMsg(''), 3000)
    } finally { setSaving(false) }
  }

  const tab = TABS.find(t => t.key === activeTab)!

  // Mobile: student editor open → show full-screen overlay
  if (mobileIdx !== null && activeTab !== 'finale') {
    return (
      <MobileEditor
        rows={rows} idx={mobileIdx} tab={tab} scoreMap={scoreMap}
        onUpdate={update}
        onClose={() => setMobileIdx(null)}
        onNavigate={setMobileIdx}
        isDirty={isDirty} saving={saving} saveMsg={saveMsg} onSave={save}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0">
        <button onClick={() => navigate(session ? `/classes/${session.class_id}` : '/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-1">
          ← {session?.class_name ?? 'Retour'}
        </button>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="arabic text-base md:text-xl font-bold text-gray-900 truncate">
              {session?.class_name} — T{session?.trimester}{' '}
              <span className="arabic font-normal text-gray-500 text-sm">{session?.exam_type}</span>
            </h1>
            {session?.teacher && <p className="arabic text-xs text-gray-400 truncate">{session.teacher}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saveMsg && <span className="hidden sm:block text-xs text-green-600 font-medium">{saveMsg}</span>}
            {xlsxError && <span className="text-xs text-red-500">{xlsxError}</span>}
            <button
              disabled={xlsxLoading}
              onClick={async () => {
                setXlsxError('')
                setXlsxLoading(true)
                const err = await api.scores.downloadExcel(id!)
                setXlsxLoading(false)
                if (err) setXlsxError('Export échoué')
              }}
              className="text-xs border border-gray-300 hover:border-gray-400 disabled:opacity-50 px-2 py-1.5 rounded-lg">
              {xlsxLoading ? '…' : '↓ Excel'}
            </button>
            <button onClick={() => window.open(`/sessions/${id}/print`, '_blank')}
                    className="text-xs border border-red-300 hover:border-red-400 text-red-600 px-2 py-1.5 rounded-lg">
              ↓ PDF
            </button>
            <button onClick={save} disabled={saving || !isDirty}
                    className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg font-medium">
              {saving ? '…' : isDirty ? 'Sauver' : '✓'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Tabs (scrollable on mobile) ── */}
      <div className="flex gap-1 px-4 md:px-6 pt-3 overflow-x-auto flex-shrink-0 scrollbar-hide">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setMobileIdx(null) }}
                  className={`px-3 md:px-4 py-2 rounded-t-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
                    activeTab === t.key ? t.tabActive : t.tabInactive}`}>
            {t.label}
          </button>
        ))}
        <button onClick={() => { setActiveTab('finale'); setMobileIdx(null) }}
                className={`px-3 md:px-4 py-2 rounded-t-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
                  activeTab === 'finale'
                    ? 'bg-finale-dark text-white'
                    : 'bg-finale-light text-finale-dark hover:bg-finale-mid'}`}>
          Note Finale
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : activeTab === 'finale' ? (
          <>
            {/* Mobile finale */}
            <div className="md:hidden space-y-2 pt-1">
              <MobileFinaleList rows={rows} scoreMap={scoreMap} />
            </div>
            {/* Desktop finale */}
            <div className="hidden md:block">
              <DesktopFinale rows={rows} scoreMap={scoreMap} />
            </div>
          </>
        ) : (
          <>
            {/* Mobile: student list */}
            <div className="md:hidden space-y-2 pt-1">
              <MobileStudentList rows={rows} tab={tab} scoreMap={scoreMap} onSelect={setMobileIdx} />
            </div>
            {/* Desktop: wide table */}
            <div className="hidden md:block">
              <DesktopTable rows={rows} tab={tab} scoreMap={scoreMap} onUpdate={update} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Mobile: student list ───────────────────────────────────────────────────────
function MobileStudentList({ rows, tab, scoreMap, onSelect }: {
  rows: ScoreRow[]; tab: Tab; scoreMap: ScoreMap; onSelect: (i: number) => void
}) {
  return (
    <>
      {rows.map((row, i) => {
        const total = tabTot(row.student_id, tab, scoreMap)
        const hasScores = tab.subsections.some(s =>
          s.fields.some(f => (scoreMap[row.student_id]?.[f] ?? null) !== null)
        )
        return (
          <button key={row.student_id} onClick={() => onSelect(i)}
                  className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-left active:bg-gray-50 transition">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{i + 1}</span>
              <span className="arabic text-gray-900 font-medium">{row.student_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${hasScores ? 'text-gray-800' : 'text-gray-300'}`}>
                {hasScores ? total : '—'}
              </span>
              <span className="text-gray-400 text-lg">›</span>
            </div>
          </button>
        )
      })}
    </>
  )
}

// ── Mobile: full-screen score editor ──────────────────────────────────────────
function MobileEditor({ rows, idx, tab, scoreMap, onUpdate, onClose, onNavigate, isDirty, saving, saveMsg, onSave }: {
  rows: ScoreRow[]; idx: number; tab: Tab; scoreMap: ScoreMap
  onUpdate: (sid: string, f: string, v: string) => void
  onClose: () => void; onNavigate: (i: number) => void
  isDirty: boolean; saving: boolean; saveMsg: string; onSave: () => void
}) {
  const row   = rows[idx]
  const total = tabTot(row.student_id, tab, scoreMap)

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onClose} className="text-blue-600 font-medium text-sm flex items-center gap-1">
          ← Liste
        </button>
        <div className="text-center">
          <p className="arabic font-bold text-gray-900 text-sm">{row.student_name}</p>
          <p className="text-xs text-gray-400">{idx + 1} / {rows.length}</p>
        </div>
        <button onClick={onSave} disabled={saving || !isDirty}
                className="text-xs bg-blue-600 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg font-medium">
          {saving ? '…' : saveMsg ? '✓' : 'Sauver'}
        </button>
      </div>

      {/* Score fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab.subsections.map(sub => {
          const st = subTot(row.student_id, sub, scoreMap)
          return (
            <div key={sub.label} className={`${tab.cardBg} border ${tab.cardBorder} rounded-2xl p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">{sub.label}</h3>
                {sub.bonusField && (
                  <span className={`text-sm font-bold ${tab.accentText}`}>
                    S.T. {fmt(st)}
                  </span>
                )}
              </div>

              {/* Criteria grid — dimmed when direct S.T. is active */}
              <div className={`grid grid-cols-3 gap-2 transition-opacity ${isDirect(row.student_id, sub, scoreMap) ? 'opacity-40 pointer-events-none' : ''}`}>
                {sub.fields.map(f => (
                  <div key={f}>
                    <label className="text-xs text-gray-500 mb-1 block text-center">
                      {f.split('_').pop()?.toUpperCase()}
                    </label>
                    <input type="number" min={0} step={0.25} inputMode="decimal"
                           className="w-full border border-gray-200 bg-white rounded-xl px-2 py-2.5 text-center text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                           value={scoreMap[row.student_id]?.[f] ?? ''}
                           onFocus={e => e.target.select()}
                           onChange={e => onUpdate(row.student_id, f, e.target.value)} />
                  </div>
                ))}
                {sub.bonusField && (
                  <div>
                    <label className="text-xs text-green-600 font-semibold mb-1 block text-center">Bonus</label>
                    <input type="number" min={0} step={0.25} inputMode="decimal"
                           className="w-full border border-green-300 bg-green-50 rounded-xl px-2 py-2.5 text-center text-base focus:outline-none focus:ring-2 focus:ring-green-400"
                           value={scoreMap[row.student_id]?.[sub.bonusField] ?? ''}
                           onFocus={e => e.target.select()}
                           onChange={e => onUpdate(row.student_id, sub.bonusField!, e.target.value)} />
                  </div>
                )}
              </div>

              {/* Direct S.T. override */}
              {sub.stField && (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-300">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">
                        Total direct{isDirect(row.student_id, sub, scoreMap) ? ' ✓' : ' (optionnel)'}
                      </label>
                      <input type="number" min={0} step={0.25} inputMode="decimal"
                             className={`w-full border rounded-xl px-3 py-2.5 text-center text-lg font-bold focus:outline-none focus:ring-2 ${
                               isDirect(row.student_id, sub, scoreMap)
                                 ? 'border-blue-400 bg-blue-50 focus:ring-blue-400'
                                 : 'border-gray-300 bg-white focus:ring-gray-400'
                             }`}
                             placeholder="Entrer le total directement"
                             value={scoreMap[row.student_id]?.[sub.stField] ?? ''}
                             onChange={e => onUpdate(row.student_id, sub.stField!, e.target.value)} />
                    </div>
                    {isDirect(row.student_id, sub, scoreMap) && (
                      <button onClick={() => onUpdate(row.student_id, sub.stField!, '')}
                              className="mt-5 text-xs text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-2 py-2">
                        ✕
                      </button>
                    )}
                  </div>
                  {isDirect(row.student_id, sub, scoreMap) && (
                    <p className="text-xs text-blue-600 mt-1">Les critères sont ignorés</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Total */}
        <div className={`${tab.totalBg} rounded-2xl px-4 py-4 flex justify-between items-center`}>
          <span className="font-bold text-gray-800">Total {tab.label}</span>
          <span className="text-2xl font-bold text-gray-900">{fmt(total)}</span>
        </div>
      </div>

      {/* Prev / Next */}
      <div className="bg-white border-t border-gray-200 p-3 grid grid-cols-2 gap-3 flex-shrink-0 safe-bottom">
        <button onClick={() => onNavigate(idx - 1)} disabled={idx === 0}
                className="py-3.5 border border-gray-200 rounded-xl text-gray-700 font-medium text-sm disabled:opacity-30 active:bg-gray-50">
          ← Précédent
        </button>
        <button onClick={() => onNavigate(idx + 1)} disabled={idx === rows.length - 1}
                className="py-3.5 border border-gray-200 rounded-xl text-gray-700 font-medium text-sm disabled:opacity-30 active:bg-gray-50">
          Suivant →
        </button>
      </div>
    </div>
  )
}

// ── Mobile: Note Finale list ───────────────────────────────────────────────────
function MobileFinaleList({ rows, scoreMap }: { rows: ScoreRow[]; scoreMap: ScoreMap }) {
  return (
    <>
      {rows.map((row, i) => {
        const p = tabTot(row.student_id, TABS[0], scoreMap)
        const l = tabTot(row.student_id, TABS[1], scoreMap)
        const c = tabTot(row.student_id, TABS[2], scoreMap)
        const total = p + l + c
        return (
          <div key={row.student_id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{i + 1}</span>
                <span className="arabic font-semibold text-gray-900">{row.student_name}</span>
              </div>
              <span className="text-xl font-bold text-yellow-700">{fmt(total)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-prod-light rounded-lg py-2">
                <div className="text-gray-500 mb-0.5">Prod.</div>
                <div className="font-bold text-gray-800">{fmt(p)}</div>
              </div>
              <div className="bg-lecture-light rounded-lg py-2">
                <div className="text-gray-500 mb-0.5">Lecture</div>
                <div className="font-bold text-gray-800">{fmt(l)}</div>
              </div>
              <div className="bg-com-light rounded-lg py-2">
                <div className="text-gray-500 mb-0.5">Com.</div>
                <div className="font-bold text-gray-800">{fmt(c)}</div>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── Desktop: wide scrollable table ────────────────────────────────────────────
function DesktopTable({ rows, tab, scoreMap, onUpdate }: {
  rows: ScoreRow[]; tab: Tab; scoreMap: ScoreMap
  onUpdate: (sid: string, f: string, v: string) => void
}) {
  return (
    <div className="rounded-b-xl rounded-tr-xl border border-gray-200 overflow-auto bg-white">
      <table className="text-sm border-collapse min-w-max">
        <thead>
          <tr>
            <th className="bg-gray-100 border border-gray-200 px-3 py-2 text-right font-medium text-gray-600 min-w-[200px] sticky left-0 z-10">
              التلاميذ
            </th>
            {tab.subsections.map(sub => (
              <th key={sub.label}
                  colSpan={sub.fields.length + (sub.bonusField ? 2 : 0)}
                  className={`${tab.hdrBg} border border-gray-200 px-3 py-2 text-center font-medium text-gray-700`}>
                {sub.label}
              </th>
            ))}
            <th className={`${tab.totalBg} border border-gray-200 px-3 py-2 text-center font-bold text-gray-700`}>
              Total
            </th>
          </tr>
          <tr>
            <th className="bg-gray-100 border border-gray-200 sticky left-0 z-10" />
            {tab.subsections.map(sub => (
              <>
                {sub.fields.map(f => (
                  <th key={f} className={`${tab.hdrBg} border border-gray-200 px-2 py-1.5 text-center font-medium text-gray-600 text-xs`}>
                    {f.split('_').pop()?.toUpperCase()}
                  </th>
                ))}
                {sub.bonusField && <th key={`${sub.label}-b`} className="bg-[#E2EFDA] border border-gray-200 px-2 py-1.5 text-center font-medium text-gray-600 text-xs">Bonus</th>}
                {sub.bonusField && <th key={`${sub.label}-s`} className={`${tab.stBg} border border-gray-200 px-2 py-1.5 text-center font-bold text-gray-700 text-xs`}>S.T.</th>}
              </>
            ))}
            <th className={`${tab.totalBg} border border-gray-200`} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className={`arabic border border-gray-200 px-3 py-1.5 text-right sticky left-0 z-10 font-medium ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <span className="text-gray-400 text-xs mr-2">{i + 1}</span>{row.student_name}
              </td>
              {tab.subsections.map(sub => (
                <>
                  {sub.fields.map(f => (
                    <td key={f} className={`border border-gray-200 p-0 ${tab.dataBg}`}>
                      <input
                        type="number" min={0} step={0.25}
                        data-row={i} data-field={f}
                        className="score-input h-8 px-1 w-14"
                        value={scoreMap[row.student_id]?.[f] ?? ''}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            document.querySelector<HTMLInputElement>(`[data-row="${i+1}"][data-field="${f}"]`)?.focus()
                          }
                        }}
                        onChange={e => onUpdate(row.student_id, f, e.target.value)}
                      />
                    </td>
                  ))}
                  {sub.bonusField && (
                    <td key={`${sub.label}-b`} className="border border-gray-200 p-0 bg-[#E2EFDA]">
                      <input
                        type="number" min={0} step={0.25}
                        data-row={i} data-field={sub.bonusField}
                        className="score-input h-8 px-1 w-14"
                        value={scoreMap[row.student_id]?.[sub.bonusField] ?? ''}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            document.querySelector<HTMLInputElement>(`[data-row="${i+1}"][data-field="${sub.bonusField}"]`)?.focus()
                          }
                        }}
                        onChange={e => onUpdate(row.student_id, sub.bonusField!, e.target.value)}
                      />
                    </td>
                  )}
                  {sub.bonusField && (
                    <td key={`${sub.label}-s`} className={`${tab.stBg} border border-gray-200 p-0`}>
                      {sub.stField ? (
                        <input
                          type="number" min={0} step={0.25}
                          data-row={i} data-field={sub.stField}
                          className="score-input h-8 px-1 w-16 font-bold"
                          title="Total direct (laissez vide pour calculer depuis les critères)"
                          placeholder={isDirect(row.student_id, sub, scoreMap) ? '' : fmt(subTot(row.student_id, sub, scoreMap))}
                          value={scoreMap[row.student_id]?.[sub.stField] ?? ''}
                          onFocus={e => e.target.select()}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              document.querySelector<HTMLInputElement>(`[data-row="${i+1}"][data-field="${sub.stField}"]`)?.focus()
                            }
                          }}
                          onChange={e => onUpdate(row.student_id, sub.stField!, e.target.value)}
                        />
                      ) : (
                        <span className="block px-2 text-center font-bold text-gray-800 text-sm">
                          {fmt(subTot(row.student_id, sub, scoreMap))}
                        </span>
                      )}
                    </td>
                  )}
                </>
              ))}
              <td className={`${tab.totalBg} border border-gray-200 px-2 py-1.5 text-center font-bold text-gray-800`}>
                {fmt(tabTot(row.student_id, tab, scoreMap))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Desktop: Note Finale table ─────────────────────────────────────────────────
function DesktopFinale({ rows, scoreMap }: { rows: ScoreRow[]; scoreMap: ScoreMap }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-auto bg-white">
      <table className="text-sm border-collapse min-w-max">
        <thead>
          <tr>
            {[['التلاميذ','bg-gray-100'],['Prod. écrite','bg-prod-mid'],['Lecture','bg-lecture-mid'],['Com. Orale','bg-com-mid'],['Note Finale','bg-finale-mid']].map(([h, bg]) => (
              <th key={h} className={`${bg} border border-gray-200 px-4 py-2.5 text-center font-medium text-gray-700 min-w-[120px] first:text-right first:min-w-[200px] first:sticky first:left-0`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const p = tabTot(row.student_id, TABS[0], scoreMap)
            const l = tabTot(row.student_id, TABS[1], scoreMap)
            const c = tabTot(row.student_id, TABS[2], scoreMap)
            return (
              <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className={`arabic border border-gray-200 px-4 py-2 text-right font-medium sticky left-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <span className="text-gray-400 text-xs mr-2">{i + 1}</span>{row.student_name}
                </td>
                <td className="bg-prod-light border border-gray-200 px-4 py-2 text-center">{fmt(p)}</td>
                <td className="bg-lecture-light border border-gray-200 px-4 py-2 text-center">{fmt(l)}</td>
                <td className="bg-com-light border border-gray-200 px-4 py-2 text-center">{fmt(c)}</td>
                <td className="bg-finale-light border border-gray-200 px-4 py-2 text-center font-bold text-gray-900 text-base">{fmt(p+l+c)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
