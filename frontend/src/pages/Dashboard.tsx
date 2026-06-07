import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, YearGroup, ClassSummary, TrimesterStatus } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TRIMESTERS = [1, 2, 3]

function trimesterDot(ts: TrimesterStatus | undefined, t: number) {
  if (!ts) return { color: 'bg-gray-200', label: `T${t}` }
  if (ts.imtihan_finalized) return { color: 'bg-green-500', label: `T${t}` }
  if (ts.imtihan_exists)    return { color: 'bg-amber-400', label: `T${t}` }
  if (ts.has_taqyim)        return { color: 'bg-blue-400',  label: `T${t}` }
  return { color: 'bg-gray-200', label: `T${t}` }
}

// Returns true if امتحان exists for this trimester but no تقييم was ever added
function hasImtihanWithoutTaqyim(status: TrimesterStatus) {
  return status.imtihan_exists && !status.has_taqyim
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate    = useNavigate()
  const qc          = useQueryClient()
  const fileRef     = useRef<HTMLInputElement>(null)

  const [uploading,  setUploading]  = useState(false)
  const [error,      setError]      = useState('')
  const [menuOpen,   setMenuOpen]   = useState(false)
  // Dismissed "no taqyim" warnings per class-trimester key
  const [dismissed,  setDismissed]  = useState<Set<string>>(new Set())

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
      if (res.session_id) navigate(`/sessions/${res.session_id}`)
      else                navigate(`/classes/${res.id}`)
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar ── */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">إدارة النقاط</h1>
            <p className="arabic text-sm text-gray-500">اللغة الفرنسية — المرحلة الابتدائية</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Upload */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              {uploading ? <><Spinner /> <span className="hidden md:inline arabic">جاري الاستيراد…</span></> : <><UploadIcon /> <span className="hidden md:inline arabic">استيراد PDF</span></>}
            </button>

            {/* Hamburger / nav menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 text-lg"
              >
                ☰
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <button onClick={() => { setMenuOpen(false); navigate('/profile') }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-right border-b border-gray-100 arabic" dir="rtl">
                    <span className="text-base">👩‍🏫</span> ملف المعلم
                  </button>
                  {years.flatMap(y => y.classes).map(cls => (
                    <button
                      key={cls.id}
                      onClick={() => { setMenuOpen(false); navigate(`/classes/${cls.id}`) }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
                    >
                      <span className="arabic truncate flex-1">{cls.name}</span>
                      <span className="flex gap-1 ml-2">
                        {TRIMESTERS.map(t => {
                          const ts = cls.trimester_status[t]
                          const dot = trimesterDot(ts, t)
                          return <span key={t} className={`w-2 h-2 rounded-full ${dot.color}`} title={dot.label} />
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {isLoading && <div className="flex justify-center py-20"><Spinner large /></div>}

        {!isLoading && years.length === 0 && (
          <div className="text-center py-24 text-gray-400">
            <div className="text-5xl mb-4">📄</div>
            <p className="arabic text-lg font-medium text-gray-500">لا توجد أقسام حالياً</p>
            <p className="arabic text-sm mt-1">استوردوا ملف PDF المُصدَّر من الموقع للبدء.</p>
          </div>
        )}

        {years.map(year => (
          <section key={year.label} className="mb-10">
            <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              السنة الدراسية {year.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {year.classes.map(cls => (
                <ClassCard
                  key={cls.id}
                  cls={cls}
                  dismissed={dismissed}
                  onDismiss={key => setDismissed(prev => new Set([...prev, key]))}
                  onClick={() => navigate(`/classes/${cls.id}`)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />

      {/* Close menu on outside click */}
      {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}
    </div>
  )
}

// ── Class card ─────────────────────────────────────────────────────────────────
function ClassCard({ cls, dismissed, onDismiss, onClick }: {
  cls: ClassSummary
  dismissed: Set<string>
  onDismiss: (key: string) => void
  onClick: () => void
}) {
  // Warnings: امتحان exists but no تقييم for this trimester
  const warnings = TRIMESTERS.filter(t => {
    const ts = cls.trimester_status[t]
    return ts && hasImtihanWithoutTaqyim(ts) && !dismissed.has(`${cls.id}-${t}`)
  })

  return (
    <div className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-xl overflow-hidden transition group">
      {/* Warning banners */}
      {warnings.map(t => (
        <div key={t} className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-xs text-amber-700" dir="rtl">
          <span className="arabic">⚠ الثلاثي {t} : امتحان بدون تقييم</span>
          <button
            onClick={e => { e.stopPropagation(); onDismiss(`${cls.id}-${t}`) }}
            className="text-amber-500 hover:text-amber-700 mr-2 font-bold"
            title="تجاهل"
          >✕</button>
        </div>
      ))}

      {/* Card body */}
      <button className="w-full text-left p-5" onClick={onClick}>
        <div className="flex items-start justify-between mb-3">
          <span className="arabic text-lg font-bold text-gray-900 group-hover:text-blue-700">
            {cls.name}
          </span>
        </div>

        {cls.teacher && <p className="arabic text-sm text-gray-500 mb-3">{cls.teacher}</p>}

        {/* Trimester progress dots */}
        <div className="flex items-center gap-3 mb-3">
          {TRIMESTERS.map(t => {
            const ts  = cls.trimester_status[t]
            const dot = trimesterDot(ts, t)
            return (
              <div key={t} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${dot.color}`} />
                <span className="text-xs text-gray-500">T{t}</span>
              </div>
            )
          })}
          <span className="arabic ml-auto text-xs text-gray-400">
            {Object.values(cls.trimester_status).filter(s => s.imtihan_finalized).length}/3 مكتمل
          </span>
        </div>

        <div className="flex gap-4 text-xs text-gray-400">
          <span className="arabic">{cls.student_count} تلميذ</span>
          <span className="arabic">{cls.session_count} جلسة</span>
        </div>
      </button>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" />
    </svg>
  )
}
function Spinner({ large = false }: { large?: boolean }) {
  return (
    <svg className={`animate-spin ${large ? 'w-8 h-8 text-blue-500' : 'w-4 h-4'}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
