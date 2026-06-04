import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, YearGroup } from '../api/client'

export default function Dashboard() {
  const navigate     = useNavigate()
  const qc           = useQueryClient()
  const fileRef      = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')

  const { data: years = [], isLoading } = useQuery<YearGroup[]>({
    queryKey: ['classes'],
    queryFn:  api.classes.list,
  })

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const res = await api.classes.upload(file)
      await qc.invalidateQueries({ queryKey: ['classes'] })
      if (res.session_id) {
        navigate(`/sessions/${res.session_id}`)
      } else {
        navigate(`/classes/${res.id}`)
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gestion des Notes</h1>
          <p className="text-sm text-gray-500">Français — École primaire</p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          {uploading ? (
            <><Spinner /> Import PDF en cours…</>
          ) : (
            <><UploadIcon /> Importer un PDF</>
          )}
        </button>
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-20"><Spinner large /></div>
        )}

        {!isLoading && years.length === 0 && (
          <div className="text-center py-24 text-gray-400">
            <div className="text-5xl mb-4">📄</div>
            <p className="text-lg font-medium text-gray-500">Aucune classe pour l'instant</p>
            <p className="text-sm mt-1">Importez le PDF exporté depuis le site pour commencer.</p>
          </div>
        )}

        {years.map(year => (
          <section key={year.label} className="mb-10">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Année scolaire {year.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {year.classes.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => navigate(`/classes/${cls.id}`)}
                  className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-xl p-5 text-left transition group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="arabic text-lg font-bold text-gray-900 group-hover:text-blue-700">
                      {cls.name}
                    </span>
                    {cls.has_scores && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        Notes saisies
                      </span>
                    )}
                  </div>
                  {cls.teacher && (
                    <p className="arabic text-sm text-gray-500 mb-3">{cls.teacher}</p>
                  )}
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>{cls.student_count} élèves</span>
                    <span>{cls.session_count} session{cls.session_count !== 1 ? 's' : ''}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" />
    </svg>
  )
}

function Spinner({ large = false }: { large?: boolean }) {
  return (
    <svg className={`animate-spin ${large ? 'w-8 h-8 text-blue-500' : 'w-4 h-4'}`}
         fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path  className="opacity-75" fill="currentColor"
             d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
