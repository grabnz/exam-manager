import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, YearGroup, ClassSummary, ClassSubjectStatus, TrimesterStatus } from '../api/client'
import { useAuth } from '../auth'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TRIMESTERS = [1, 2, 3]

function trimesterDot(ts: TrimesterStatus | undefined) {
  if (!ts) return 'bg-gray-200'
  if (ts.imtihan_finalized) return 'bg-green-500'
  if (ts.imtihan_exists)    return 'bg-amber-400'
  if (ts.has_taqyim)        return 'bg-blue-400'
  return 'bg-gray-200'
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [menuOpen, setMenuOpen] = useState(false)

  const { data: years = [], isLoading } = useQuery<YearGroup[]>({
    queryKey: ['classes'],
    queryFn:  api.classes.list,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar ── */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">إدارة النقاط</h1>
            <p className="arabic text-sm text-gray-500">
              {isAdmin ? 'لوحة المدير — المرحلة الابتدائية' : 'المرحلة الابتدائية'}
              {user?.full_name && <span className="text-gray-700 font-medium"> · {user.full_name}</span>}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => navigate('/admin/users')}
                className="arabic hidden md:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                🛡️ لوحة المدير
              </button>
            )}

            {/* Hamburger / nav menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 text-lg"
              >
                ☰
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <button onClick={() => { setMenuOpen(false); navigate('/profile') }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-right border-b border-gray-100 arabic" dir="rtl">
                    <span className="text-base">👤</span> الملف الشخصي
                  </button>
                  {isAdmin && (
                    <button onClick={() => { setMenuOpen(false); navigate('/admin/users') }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-right border-b border-gray-100 arabic" dir="rtl">
                      <span className="text-base">🛡️</span> لوحة المدير
                    </button>
                  )}
                  <button onClick={() => { setMenuOpen(false); navigate('/change-password') }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-right border-b border-gray-100 arabic" dir="rtl">
                    <span className="text-base">🔑</span> تغيير كلمة المرور
                  </button>
                  <button onClick={() => { setMenuOpen(false); logout(); navigate('/login') }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 text-right arabic" dir="rtl">
                    <span className="text-base">🚪</span> تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        {isLoading && <div className="flex justify-center py-20"><Spinner /></div>}

        {!isLoading && years.length === 0 && (
          <div className="text-center py-24 text-gray-400" dir="rtl">
            <div className="text-5xl mb-4">🏫</div>
            {isAdmin ? (
              <>
                <p className="arabic text-lg font-medium text-gray-500">لا توجد أقسام بعد</p>
                <p className="arabic text-sm mt-1">
                  أنشئوا الأقسام وأسندوا المعلمين من{' '}
                  <button onClick={() => navigate('/admin/classes')} className="text-blue-600 underline">لوحة المدير</button>.
                </p>
              </>
            ) : (
              <>
                <p className="arabic text-lg font-medium text-gray-500">لا أقسام مسندة إليكم بعد</p>
                <p className="arabic text-sm mt-1">اتصلوا بإدارة المدرسة ليتم إسناد أقسامكم وموادكم.</p>
              </>
            )}
          </div>
        )}

        {years.map(year => (
          <section key={year.label} className="mb-10">
            <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 text-right" dir="rtl">
              السنة الدراسية {year.label}
            </h2>
            {isAdmin ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {year.classes.map(cls => (
                  <DirectorClassCard key={cls.id} cls={cls} onClick={() => navigate(`/classes/${cls.id}`)} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {year.classes.flatMap(cls =>
                  cls.subjects.map(subj => (
                    <TeacherSubjectCard
                      key={`${cls.id}-${subj.subject_id}`}
                      cls={cls}
                      subj={subj}
                      onClick={() => navigate(`/classes/${cls.id}?subject=${subj.subject_id}`)}
                    />
                  ))
                )}
              </div>
            )}
          </section>
        ))}
      </main>

      {/* Close menu on outside click */}
      {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}
    </div>
  )
}

// ── Teacher card: one (class × subject) ───────────────────────────────────────
function TeacherSubjectCard({ cls, subj, onClick }: {
  cls: ClassSummary
  subj: ClassSubjectStatus
  onClick: () => void
}) {
  const doneCount = Object.values(subj.trimester_status).filter(s => s.imtihan_finalized).length
  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-xl p-5 text-right transition group"
      dir="rtl"
    >
      <div className="flex items-start justify-between mb-1">
        <span className="arabic text-lg font-bold text-gray-900 group-hover:text-blue-700">{cls.name}</span>
        {cls.level && <span className="arabic text-xs text-gray-400">{cls.level}</span>}
      </div>
      <p className="arabic text-sm text-blue-600 font-medium mb-3">{subj.name}</p>

      <div className="flex items-center gap-3 mb-3">
        {TRIMESTERS.map(t => (
          <div key={t} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${trimesterDot(subj.trimester_status[t])}`} />
            <span className="text-xs text-gray-500">T{t}</span>
          </div>
        ))}
        <span className="arabic mr-auto text-xs text-gray-400">{doneCount}/3 مكتمل</span>
      </div>

      <div className="flex gap-4 text-xs text-gray-400">
        <span className="arabic">{cls.student_count} تلميذ</span>
        <span className="arabic">{subj.session_count} جلسة</span>
      </div>
    </button>
  )
}

// ── Director card: class with subject chips ───────────────────────────────────
function DirectorClassCard({ cls, onClick }: {
  cls: ClassSummary
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-xl p-5 text-right transition group"
      dir="rtl"
    >
      <div className="flex items-start justify-between mb-1">
        <span className="arabic text-lg font-bold text-gray-900 group-hover:text-blue-700">{cls.name}</span>
        {cls.level && <span className="arabic text-xs text-gray-400">{cls.level}</span>}
      </div>
      <p className="arabic text-xs text-gray-400 mb-3">{cls.student_count} تلميذ · {cls.session_count} جلسة</p>

      {cls.subjects.length === 0 ? (
        <p className="arabic text-xs text-amber-600">⚠ لا معلم مسند — أسندوا من لوحة المدير</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {cls.subjects.map(s => {
            const done = Object.values(s.trimester_status).filter(x => x.imtihan_finalized).length
            return (
              <span key={s.subject_id}
                    className="arabic inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 text-gray-600 px-2 py-1 rounded-full">
                {s.name}
                <span className={`w-1.5 h-1.5 rounded-full ${done === 3 ? 'bg-green-500' : done > 0 ? 'bg-amber-400' : 'bg-gray-300'}`} />
              </span>
            )
          })}
        </div>
      )}
    </button>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
