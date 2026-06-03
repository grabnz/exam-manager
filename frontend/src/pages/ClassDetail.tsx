import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ClassDetail as ClassDetailType, SessionSummary } from '../api/client'

const EXAM_TYPES = ['امتحان', 'فرض']
const TRIMESTERS = [1, 2, 3]

export default function ClassDetail() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const [deleting, setDeleting] = useState(false)

  const { data, isLoading, error } = useQuery<ClassDetailType>({
    queryKey: ['class', id],
    queryFn:  () => api.classes.get(id!),
  })

  async function openSession(trimester: number, examType: string) {
    // Find existing session or create one
    const existing = data?.sessions.find(
      s => s.trimester === trimester && s.exam_type === examType
    )
    if (existing) {
      navigate(`/sessions/${existing.id}`)
      return
    }
    const res = await api.sessions.create(id!, trimester, examType)
    await qc.invalidateQueries({ queryKey: ['class', id] })
    navigate(`/sessions/${res.id}`)
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette classe et toutes ses données ?')) return
    setDeleting(true)
    await api.classes.delete(id!)
    navigate('/')
  }

  if (isLoading) return <Loading />
  if (error || !data) return <p className="p-8 text-red-600">Erreur de chargement</p>

  const sessionMap: Record<string, SessionSummary> = {}
  data.sessions.forEach(s => { sessionMap[`${s.trimester}-${s.exam_type}`] = s })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <button onClick={() => navigate('/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3">
          ← Toutes les classes
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="arabic text-2xl font-bold text-gray-900">{data.name}</h1>
            <div className="flex gap-4 mt-1 text-sm text-gray-500">
              {data.teacher && <span className="arabic">{data.teacher}</span>}
              <span>Année {data.school_year}</span>
              <span>{data.students.length} élèves</span>
            </div>
          </div>
          <button onClick={handleDelete} disabled={deleting}
                  className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition">
            Supprimer
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Exam sessions grid */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Sessions d'examen
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                  {TRIMESTERS.map(t => (
                    <th key={t} className="px-4 py-3 text-center font-medium text-gray-600">
                      Trimestre {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EXAM_TYPES.map(type => (
                  <tr key={type} className="border-b border-gray-100 last:border-0">
                    <td className="arabic px-4 py-3 font-medium text-gray-700">{type}</td>
                    {TRIMESTERS.map(t => {
                      const s   = sessionMap[`${t}-${type}`]
                      return (
                        <td key={t} className="px-4 py-3 text-center">
                          <button
                            onClick={() => openSession(t, type)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                              s?.has_scores
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : s
                                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {s?.has_scores ? 'Voir/Modifier' : s ? 'Saisir' : 'Créer'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Student list */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Liste des élèves ({data.students.length})
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-[520px] overflow-y-auto">
            {data.students.map((s, i) => (
              <div key={s.id}
                   className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">{i + 1}</span>
                <span className="arabic text-sm text-gray-800">{s.full_name}</span>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  )
}
