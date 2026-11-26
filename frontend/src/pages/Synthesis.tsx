import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, SettingsData, SynthesisData } from '../api/client'

const TRIMESTERS = [1, 2, 3]

function fmt(n: number | null | undefined): string {
  return n != null ? (+n.toFixed(2)).toString() : '—'
}

export default function Synthesis() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [trimester, setTrimester] = useState(1)
  const [tab, setTab] = useState<'synthesis' | 'progression'>('synthesis')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [progSubjectId, setProgSubjectId] = useState<string>('')

  const { data, isLoading } = useQuery<SynthesisData>({
    queryKey: ['synthesis', id, trimester],
    queryFn: () => api.classes.synthesis(id!, trimester),
    enabled: !!id,
  })
  const { data: settings } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  })

  const activeProgSubject = useMemo(() => {
    if (!data?.subjects.length) return null
    return data.subjects.find(s => s.id === progSubjectId) ?? data.subjects[0]
  }, [data, progSubjectId])

  const selectedStudent = useMemo(
    () => data?.students.find(s => s.student_id === selectedStudentId) ?? null,
    [data, selectedStudentId]
  )

  const classStats = useMemo(() => {
    if (!data) return null
    const avgs = data.students.map(s => s.average).filter((v): v is number => v != null)
    if (!avgs.length) return null
    return {
      count: avgs.length,
      avg: +(avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2),
      min: Math.min(...avgs),
      max: Math.max(...avgs),
      passPct: Math.round((avgs.filter(v => v >= 10).length / avgs.length) * 100),
    }
  }, [data])

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-8" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 print:hidden">
        <button onClick={() => navigate(`/classes/${id}`)}
                className="arabic text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-2">
          → {data?.class_name ?? 'رجوع إلى القسم'}
        </button>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="arabic text-xl font-bold text-gray-900">
              كشف النتائج والمقارنة — {data?.class_name}
            </h1>
            {data && (
              <p className="arabic text-xs text-gray-400">
                {data.level ? `${data.level} · ` : ''}{data.school_year} · الثلاثي {trimester}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-100 rounded-xl p-1">
              {TRIMESTERS.map(t => (
                <button
                  key={t}
                  onClick={() => { setTrimester(t); setSelectedStudentId(null) }}
                  className={`arabic px-3 py-1 text-xs rounded-lg font-medium transition ${
                    trimester === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  الثلاثي {t}
                </button>
              ))}
            </div>
            <button onClick={() => window.print()}
                    className="arabic text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium">
              طباعة / PDF
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setTab('synthesis')}
            className={`arabic text-xs px-4 py-2 rounded-xl font-medium transition ${
              tab === 'synthesis' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            الجدول الجامع وبطاقات الأعداد
          </button>
          <button
            onClick={() => setTab('progression')}
            className={`arabic text-xs px-4 py-2 rounded-xl font-medium transition ${
              tab === 'progression' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            مقارنة التقييمات (التدارك)
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {isLoading || !data ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : selectedStudent ? (
          /* Printable Individual Student Report Card (بطاقة أعداد) */
          <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm print:border-0 print:shadow-none">
            <div className="print:hidden flex items-center justify-between">
              <button onClick={() => setSelectedStudentId(null)} className="arabic text-xs text-blue-600 hover:underline">
                → العودة إلى الجدول الجامع
              </button>
              <button onClick={() => window.print()} className="arabic text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg">
                طباعة البطاقة
              </button>
            </div>
            <div className="text-center border-b border-gray-200 pb-4">
              {settings?.school_name && (
                <p className="arabic text-xs text-gray-500">
                  {settings.region ? `${settings.region} — ` : ''}{settings.school_name}
                </p>
              )}
              <h2 className="arabic text-lg font-bold text-gray-900 mt-1">بطاقة أعداد — الثلاثي {trimester}</h2>
              <p className="arabic text-sm text-gray-700 font-semibold mt-1">{selectedStudent.student_name}</p>
              <p className="arabic text-xs text-gray-500">
                القسم: {data.class_name} · السنة الدراسية: {data.school_year}
              </p>
            </div>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="arabic border border-gray-200 px-3 py-2 text-right">المادة</th>
                  <th className="arabic border border-gray-200 px-3 py-2 text-center w-28">العدد / 20</th>
                </tr>
              </thead>
              <tbody>
                {data.subjects.map(subj => {
                  const st = selectedStudent.statuses[subj.id]
                  const sc = selectedStudent.scores[subj.id]
                  return (
                    <tr key={subj.id}>
                      <td className="arabic border border-gray-200 px-3 py-2 font-medium text-gray-800">{subj.name}</td>
                      <td className={`border border-gray-200 px-3 py-2 text-center font-bold ${
                        sc != null ? (sc >= 10 ? 'text-green-700' : 'text-red-600') : 'text-gray-400'
                      }`}>
                        {st === 'absent' ? 'غ' : st === 'exempt' ? 'معفى' : fmt(sc)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-yellow-50 font-bold">
                  <td className="arabic border border-gray-200 px-3 py-2.5 text-right">المعدل العام</td>
                  <td className="border border-gray-200 px-3 py-2.5 text-center text-base">{fmt(selectedStudent.average)}</td>
                </tr>
                <tr className="bg-gray-50 text-xs">
                  <td className="arabic border border-gray-200 px-3 py-2 text-right">الرتبة في القسم</td>
                  <td className="border border-gray-200 px-3 py-2 text-center font-bold">
                    {selectedStudent.rank ? `${selectedStudent.rank} / ${data.students.length}` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="flex justify-between pt-6 text-xs text-gray-500">
              <span className="arabic">إمضاء المدير(ة): _______________</span>
              <span className="arabic">إمضاء الولي: _______________</span>
            </div>
          </div>
        ) : tab === 'synthesis' ? (
          <div className="space-y-4">
            {/* Print header */}
            <div className="hidden print:block text-center mb-4">
              {settings?.school_name && (
                <p className="arabic text-xs text-gray-600">{settings.region ? `${settings.region} — ` : ''}{settings.school_name}</p>
              )}
              <h2 className="arabic text-lg font-bold">الجدول الجامع للنتائج — {data.class_name} — الثلاثي {trimester} ({data.school_year})</h2>
            </div>

            {data.subjects.length === 0 ? (
              <p className="arabic text-center text-gray-400 py-16">لا توجد مواد أو أعداد مسجلة لهذا الثلاثي.</p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-auto">
                <table className="w-full text-sm border-collapse min-w-max">
                  <thead>
                    <tr className="bg-gray-100 text-xs">
                      <th className="arabic border border-gray-200 px-3 py-2.5 text-right sticky start-0 bg-gray-100 min-w-[200px]">التلميذ</th>
                      {data.subjects.map(s => (
                        <th key={s.id} className="arabic border border-gray-200 px-3 py-2.5 text-center min-w-[90px]">{s.name}</th>
                      ))}
                      <th className="arabic border border-gray-200 px-3 py-2.5 text-center bg-yellow-100 min-w-[85px]">المعدل</th>
                      <th className="arabic border border-gray-200 px-3 py-2.5 text-center w-16">الرتبة</th>
                      <th className="arabic border border-gray-200 px-3 py-2.5 text-center w-20 print:hidden">بطاقة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((st, idx) => (
                      <tr key={st.student_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className={`arabic border border-gray-200 px-3 py-2 font-medium sticky start-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <span className="text-xs text-gray-400 mx-1.5">{idx + 1}</span>{st.student_name}
                        </td>
                        {data.subjects.map(s => {
                          const status = st.statuses[s.id]
                          const sc = st.scores[s.id]
                          return (
                            <td key={s.id} className={`border border-gray-200 px-2 py-2 text-center ${
                              sc != null ? (sc >= 10 ? 'text-gray-800' : 'text-red-600 font-medium') : 'text-gray-400'
                            }`}>
                              {status === 'absent' ? 'غ' : status === 'exempt' ? 'معفى' : fmt(sc)}
                            </td>
                          )
                        })}
                        <td className={`border border-gray-200 px-3 py-2 text-center font-bold bg-yellow-50 ${
                          st.average != null ? (st.average >= 10 ? 'text-green-800' : 'text-red-700') : 'text-gray-400'
                        }`}>
                          {fmt(st.average)}
                        </td>
                        <td className="border border-gray-200 px-2 py-2 text-center font-semibold text-gray-600">
                          {st.rank ?? '—'}
                        </td>
                        <td className="border border-gray-200 px-2 py-2 text-center print:hidden">
                          <button
                            onClick={() => setSelectedStudentId(st.student_id)}
                            className="arabic text-xs text-blue-600 hover:underline font-medium"
                          >
                            عرض
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {classStats && (
                    <tfoot>
                      <tr className="bg-gray-100 text-xs font-semibold text-gray-700">
                        <td className="arabic border border-gray-200 px-3 py-2.5 sticky start-0 bg-gray-100">
                          ملخص القسم ({classStats.count})
                        </td>
                        <td colSpan={data.subjects.length} className="arabic border border-gray-200 px-3 py-2.5 text-center">
                          أدنى: {classStats.min} · أقصى: {classStats.max} · نسبة النجاح: {classStats.passPct}%
                        </td>
                        <td className="arabic border border-gray-200 px-3 py-2.5 text-center bg-yellow-100 font-bold">
                          {classStats.avg}
                        </td>
                        <td colSpan={2} className="border border-gray-200" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Session Progression Comparison Tab */
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5 print:hidden">
              {data.subjects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setProgSubjectId(s.id)}
                  className={`arabic text-xs px-3 py-1.5 rounded-full border transition ${
                    activeProgSubject?.id === s.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>

            {!activeProgSubject || activeProgSubject.sessions.length === 0 ? (
              <p className="arabic text-center text-gray-400 py-14">لا توجد جلسات تقييم أو امتحان لهذه المادة في الثلاثي {trimester}.</p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-auto">
                <table className="w-full text-sm border-collapse min-w-max">
                  <thead>
                    <tr className="bg-gray-100 text-xs">
                      <th className="arabic border border-gray-200 px-3 py-2.5 text-right sticky start-0 bg-gray-100 min-w-[200px]">التلميذ</th>
                      {activeProgSubject.sessions.map(sess => (
                        <th key={sess.id} className="arabic border border-gray-200 px-3 py-2.5 text-center min-w-[100px]">
                          {sess.exam_type}
                        </th>
                      ))}
                      <th className="arabic border border-gray-200 px-3 py-2.5 text-center min-w-[110px]">التطور / الملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((st, idx) => {
                      const vals = activeProgSubject.sessions.map(sess => sess.scores[st.student_id] ?? null)
                      const nonNull = vals.filter((v): v is number => v != null)
                      const delta = nonNull.length >= 2 ? +(nonNull[nonNull.length - 1] - nonNull[0]).toFixed(2) : null
                      const latest = nonNull.length ? nonNull[nonNull.length - 1] : null
                      const needsRemediation = latest != null && latest < 10
                      return (
                        <tr key={st.student_id} className={needsRemediation ? 'bg-rose-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="arabic border border-gray-200 px-3 py-2 font-medium sticky start-0 bg-inherit">
                            <span className="text-xs text-gray-400 mx-1.5">{idx + 1}</span>{st.student_name}
                          </td>
                          {vals.map((v, vi) => (
                            <td key={vi} className={`border border-gray-200 px-3 py-2 text-center ${
                              v != null ? (v >= 10 ? 'text-gray-800' : 'text-red-600 font-semibold') : 'text-gray-300'
                            }`}>
                              {fmt(v)}
                            </td>
                          ))}
                          <td className="arabic border border-gray-200 px-3 py-2 text-center text-xs">
                            <div className="flex items-center justify-center gap-1.5">
                              {delta != null && (
                                <span className={`font-bold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-gray-400'}`} dir="ltr">
                                  {delta > 0 ? `+${delta}` : delta}
                                </span>
                              )}
                              {needsRemediation && (
                                <span className="arabic bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold">تدارك</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
