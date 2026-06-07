import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ClassDetail as ClassDetailType, SessionSummary } from '../api/client'

const TRIMESTERS = [1, 2, 3]
const IMTIHAN    = 'امتحان'

function taqyimNum(examType: string): number {
  const m = examType.match(/\d+/)
  return m ? parseInt(m[0]) : -1
}

function isTaqyim(examType: string) {
  return examType.startsWith('تقييم')
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ClassDetail() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const [deleting,  setDeleting]  = useState(false)
  const [creating,  setCreating]  = useState<string | null>(null) // key being created

  const { data, isLoading, error } = useQuery<ClassDetailType>({
    queryKey: ['class', id],
    queryFn:  () => api.classes.get(id!),
  })

  async function openOrCreate(trimester: number, examType: string) {
    const key = `${trimester}-${examType}`
    const existing = data?.sessions.find(
      s => s.trimester === trimester && s.exam_type === examType
    )
    if (existing) { navigate(`/sessions/${existing.id}`); return }
    setCreating(key)
    const res = await api.sessions.create(id!, trimester, examType)
    await qc.invalidateQueries({ queryKey: ['class', id] })
    setCreating(null)
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

  // Group sessions by trimester
  const byTrimester = (t: number) => data.sessions.filter(s => s.trimester === t)

  // Sorted تقييم sessions for a trimester
  const getTaqyim = (t: number) =>
    byTrimester(t).filter(s => isTaqyim(s.exam_type)).sort((a, b) => taqyimNum(a.exam_type) - taqyimNum(b.exam_type))

  // امتحان session for a trimester (may not exist yet)
  const getImtihan = (t: number) => byTrimester(t).find(s => s.exam_type === IMTIHAN)

  // Next تقييم type to add for a trimester
  const nextTaqyim = (t: number) => {
    const list = getTaqyim(t)
    const next = list.length === 0 ? 0 : taqyimNum(list[list.length - 1].exam_type) + 1
    return `تقييم ${next}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <button onClick={() => navigate('/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3">
          ← Toutes les classes
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="arabic text-xl md:text-2xl font-bold text-gray-900">{data.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
              {data.teacher && <span className="arabic">{data.teacher}</span>}
              <span>Année {data.school_year}</span>
              <span>{data.students.length} élèves</span>
            </div>
          </div>
          <button onClick={handleDelete} disabled={deleting}
                  className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition flex-shrink-0">
            Supprimer
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">

        {/* Exam sessions */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Sessions d'examen
          </h2>

          {/* 3 trimester columns */}
          <div className="grid grid-cols-3 gap-3">
            {TRIMESTERS.map(t => {
              const taqyim  = getTaqyim(t)
              const imtihan = getImtihan(t)
              const next    = nextTaqyim(t)

              return (
                <div key={t} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Column header */}
                  <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 text-center">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Trimestre {t}
                    </span>
                  </div>

                  <div className="p-2 space-y-1.5">
                    {/* Existing تقييم sessions */}
                    {taqyim.map(s => (
                      <SessionBtn
                        key={s.id}
                        label={s.exam_type}
                        session={s}
                        loading={creating === `${t}-${s.exam_type}`}
                        onClick={() => openOrCreate(t, s.exam_type)}
                      />
                    ))}

                    {/* + Add next تقييم */}
                    <button
                      onClick={() => openOrCreate(t, next)}
                      disabled={!!creating}
                      className="w-full flex items-center justify-center gap-1.5 arabic py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-dashed border-blue-300 hover:bg-blue-50 transition disabled:opacity-40"
                    >
                      <span className="text-base leading-none">+</span>
                      <span>{next}</span>
                    </button>

                    {/* Divider */}
                    <div className="border-t border-gray-100 my-1" />

                    {/* امتحان — always at bottom */}
                    <SessionBtn
                      label={IMTIHAN}
                      session={imtihan}
                      loading={creating === `${t}-${IMTIHAN}`}
                      onClick={() => openOrCreate(t, IMTIHAN)}
                      accent
                    />
                  </div>
                </div>
              )
            })}
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

// ── Session button ─────────────────────────────────────────────────────────────
function SessionBtn({ label, session, loading, onClick, accent = false }: {
  label: string
  session?: SessionSummary
  loading: boolean
  onClick: () => void
  accent?: boolean
}) {
  const hasScores = session?.has_scores
  const exists    = !!session

  let cls = 'w-full arabic py-2 rounded-lg text-xs font-medium transition text-center '
  if (loading)       cls += 'bg-gray-100 text-gray-400 cursor-wait'
  else if (hasScores) cls += 'bg-green-100 text-green-700 hover:bg-green-200'
  else if (exists)    cls += 'bg-blue-50 text-blue-600 hover:bg-blue-100'
  else if (accent)    cls += 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'
  else                cls += 'bg-gray-100 text-gray-500 hover:bg-gray-200'

  return (
    <button onClick={onClick} disabled={loading} className={cls}>
      {loading ? '…' : (
        <span className="flex items-center justify-between px-2">
          <span>{label}</span>
          <span className="text-gray-400 font-normal">
            {hasScores ? '✓' : exists ? 'Saisir' : 'Créer'}
          </span>
        </span>
      )}
    </button>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  )
}
