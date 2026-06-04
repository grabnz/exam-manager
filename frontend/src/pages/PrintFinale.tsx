import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, SessionInfo, ScoreRow } from '../api/client'

// ── Score helpers (same as ScoreEntry) ───────────────────────────────────────
type Field = keyof Omit<ScoreRow, 'student_id' | 'student_name' | 'order_index'>

const SUBSECTIONS = {
  prod: [
    { fields: ['prod_dictee_c4'] as Field[] },
    { fields: ['prod_ecriture_c2', 'prod_ecriture_c7'] as Field[],                                               bonus: 'prod_ecriture_bonus' as Field,   st: 'prod_ecriture_st' as Field },
    { fields: ['prod_production_c1', 'prod_production_c3', 'prod_production_c5', 'prod_production_c6'] as Field[], bonus: 'prod_production_bonus' as Field, st: 'prod_production_st' as Field },
  ],
  lecture: [
    { fields: ['lect_vocale_c1', 'lect_vocale_c5'] as Field[],                            bonus: 'lect_vocale_bonus' as Field, st: 'lect_vocale_st' as Field },
    { fields: ['lect_comp_c2', 'lect_comp_c3', 'lect_comp_c4', 'lect_comp_c6'] as Field[], bonus: 'lect_comp_bonus' as Field,   st: 'lect_comp_st' as Field },
  ],
  com: [
    { fields: ['com_rec_c1', 'com_rec_c2', 'com_rec_c3', 'com_rec_c4'] as Field[],                                              bonus: 'com_rec_bonus' as Field,  st: 'com_rec_st' as Field },
    { fields: ['com_oral_c1', 'com_oral_c2', 'com_oral_c3', 'com_oral_c4', 'com_oral_c5', 'com_oral_c6'] as Field[], bonus: 'com_oral_bonus' as Field, st: 'com_oral_st' as Field },
  ],
}

function calcSub(row: ScoreRow, sub: typeof SUBSECTIONS.prod[0]): number {
  if ('st' in sub) {
    const direct = row[sub.st as Field] as number | null | undefined
    if (direct != null) return direct
    const bonus  = row[sub.bonus as Field] as number | null | undefined
    return sub.fields.reduce((s, f) => s + ((row[f] as number | null) ?? 0), 0) + (bonus ?? 0)
  }
  return sub.fields.reduce((s, f) => s + ((row[f] as number | null) ?? 0), 0)
}

function calcTab(row: ScoreRow, subs: typeof SUBSECTIONS.prod): number {
  return subs.reduce((s, sub) => s + calcSub(row, sub), 0)
}

function fmt(n: number): string {
  return n > 0 ? n.toFixed(2).replace(/\.00$/, '') : '—'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PrintFinale() {
  const { id } = useParams<{ id: string }>()

  const { data: session } = useQuery<SessionInfo>({
    queryKey: ['session', id],
    queryFn:  () => api.sessions.get(id!),
  })
  const { data: rows = [], isLoading } = useQuery<ScoreRow[]>({
    queryKey: ['scores', id],
    queryFn:  () => api.scores.get(id!),
  })

  // Auto-print once data is loaded
  useEffect(() => {
    if (!isLoading && rows.length > 0 && session) {
      setTimeout(() => window.print(), 400)
    }
  }, [isLoading, rows.length, session])

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="bg-white min-h-screen">
      {/* Print button — hidden when printing */}
      <div className="print:hidden flex items-center justify-between px-8 py-4 border-b">
        <span className="text-gray-500 text-sm">Aperçu avant impression</span>
        <button onClick={() => window.print()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
          Imprimer / Enregistrer PDF
        </button>
      </div>

      {/* Printable content */}
      <div className="px-8 py-6 print:p-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-1">Notes Finales — Langue Française</h1>
          <p className="text-sm text-gray-600">
            <span className="arabic font-semibold">{session.class_name}</span>
            {' — '}Trimestre {session.trimester}
            {' — '}<span className="arabic">{session.exam_type}</span>
            {' — '}Année {session.school_year}
          </p>
          {session.teacher && (
            <p className="text-sm text-gray-500 mt-1">
              <span className="arabic">{session.teacher}</span>
            </p>
          )}
        </div>

        {/* Table */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-center w-8">#</th>
              <th className="border border-gray-300 px-3 py-2 text-right arabic">التلاميذ</th>
              <th className="border border-gray-300 px-3 py-2 text-center bg-blue-50">Prod. écrite</th>
              <th className="border border-gray-300 px-3 py-2 text-center bg-green-50">Lecture</th>
              <th className="border border-gray-300 px-3 py-2 text-center bg-orange-50">Com. Orale</th>
              <th className="border border-gray-300 px-3 py-2 text-center bg-yellow-50 font-bold">Moyenne / Note Finale</th>
              <th className="border border-gray-300 px-3 py-2 text-center w-24">Signature</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const p = calcTab(row, SUBSECTIONS.prod)
              const l = calcTab(row, SUBSECTIONS.lecture)
              const c = calcTab(row, SUBSECTIONS.com)
              const f = (p + l + c) / 3
              return (
                <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border border-gray-300 px-3 py-2 text-center text-gray-400 text-xs">{i + 1}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right arabic font-medium">{row.student_name}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center bg-blue-50">{fmt(p)}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center bg-green-50">{fmt(l)}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center bg-orange-50">{fmt(c)}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center bg-yellow-50 font-bold text-base">{fmt(f)}</td>
                  <td className="border border-gray-300 px-3 py-2" />
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div className="mt-8 flex justify-between text-xs text-gray-400 print:mt-6">
          <span>{rows.length} élèves</span>
          <span className="arabic">{session.teacher}</span>
          <span>Date : _______________</span>
        </div>
      </div>
    </div>
  )
}
