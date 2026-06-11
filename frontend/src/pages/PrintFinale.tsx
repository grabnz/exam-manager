import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, SessionInfo, ScoreRow, SettingsData, TemplateDef } from '../api/client'
import { groups as templateGroups, groupTotal, finalFromGroupTotals, StudentValues } from '../lib/grid'
import { palette } from '../lib/palette'

function fmt(n: number | null): string {
  return n != null && n > 0 ? n.toFixed(2).replace(/\.00$/, '') : '—'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PrintFinale() {
  const { id } = useParams<{ id: string }>()

  const { data: session } = useQuery<SessionInfo>({
    queryKey: ['session', id],
    queryFn:  () => api.sessions.get(id!),
  })
  const { data: template } = useQuery<TemplateDef>({
    queryKey: ['template', session?.template_id],
    queryFn:  () => api.templates.get(session!.template_id!),
    enabled:  !!session?.template_id,
    staleTime: Infinity,
  })
  const { data: rows = [], isLoading } = useQuery<ScoreRow[]>({
    queryKey: ['scores', id],
    queryFn:  () => api.scores.get(id!),
  })
  const { data: settings } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn:  api.settings.get,
  })

  const tplGroups = useMemo(() => (template ? templateGroups(template) : []), [template])

  // Auto-print once data is loaded
  useEffect(() => {
    if (!isLoading && rows.length > 0 && session && template) {
      setTimeout(() => window.print(), 400)
    }
  }, [isLoading, rows.length, session, template])

  if (isLoading || !session || !template) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const finaleLabel = template.final_formula === 'avg_groups'
    ? (template.direction === 'ltr' ? 'Moyenne / Note Finale' : 'المعدل النهائي')
    : 'المجموع النهائي'

  return (
    <div className="bg-white min-h-screen">
      {/* Print button — hidden when printing */}
      <div className="print:hidden flex items-center justify-between px-8 py-4 border-b" dir="rtl">
        <span className="arabic text-gray-500 text-sm">معاينة قبل الطباعة</span>
        <button onClick={() => window.print()}
                className="arabic bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
          طباعة / حفظ PDF
        </button>
      </div>

      {/* Printable content */}
      <div className="px-8 py-6 print:p-4">
        {/* Header */}
        <div className="text-center mb-6">
          {settings?.school_name && (
            <p className="arabic text-sm text-gray-600 mb-1">
              {settings.region && <span>{settings.region} — </span>}{settings.school_name}
            </p>
          )}
          <h1 className="arabic text-xl font-bold mb-1">
            النتائج النهائية — {session.subject_name}
          </h1>
          <p className="arabic text-sm text-gray-600">
            <span className="font-semibold">{session.class_name}</span>
            {' — '}الثلاثي {session.trimester}
            {' — '}{session.exam_type}
            {' — '}{session.school_year}
          </p>
          {session.teacher && (
            <p className="arabic text-sm text-gray-500 mt-1">{session.teacher}</p>
          )}
        </div>

        {/* Table */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-center w-8">#</th>
              <th className="border border-gray-300 px-3 py-2 text-right arabic">التلاميذ</th>
              {tplGroups.map((g, gi) => (
                <th key={g.key}
                    className={`border border-gray-300 px-3 py-2 text-center ${palette(g.sections[0]?.color_key, gi).printBg}`}>
                  {g.label}
                </th>
              ))}
              <th className="border border-gray-300 px-3 py-2 text-center bg-yellow-50 font-bold arabic">{finaleLabel}</th>
              <th className="arabic border border-gray-300 px-3 py-2 text-center w-24">الإمضاء</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const vals: StudentValues = { criteria: row.criteria, sections: row.sections }
              const totals = tplGroups.map(g => groupTotal(g, vals))
              const final = finalFromGroupTotals(template, totals)
              return (
                <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border border-gray-300 px-3 py-2 text-center text-gray-400 text-xs">{i + 1}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right arabic font-medium">{row.student_name}</td>
                  {tplGroups.map((g, gi) => (
                    <td key={g.key}
                        className={`border border-gray-300 px-3 py-2 text-center ${palette(g.sections[0]?.color_key, gi).printBg}`}>
                      {fmt(totals[gi])}
                    </td>
                  ))}
                  <td className="border border-gray-300 px-3 py-2 text-center bg-yellow-50 font-bold text-base">{fmt(final)}</td>
                  <td className="border border-gray-300 px-3 py-2" />
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div className="mt-8 flex justify-between text-xs text-gray-400 print:mt-6" dir="rtl">
          <span className="arabic">{rows.length} تلميذ</span>
          <span className="arabic">{session.teacher}</span>
          <span className="arabic">التاريخ : _______________</span>
        </div>
      </div>
    </div>
  )
}
