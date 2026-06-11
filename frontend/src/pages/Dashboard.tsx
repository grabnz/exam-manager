import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, DashboardStats, DirectorStats, TeacherStats, PairStats, CalendarEvent } from '../api/client'
import { useAuth } from '../auth'
import { pendingCount, onQueueChange } from '../lib/offlineQueue'
import { subjectStyle, relativeTimeAr } from '../lib/subjectStyle'

const TRIMESTERS = [1, 2, 3]

function todayAr(): string {
  return new Intl.DateTimeFormat('ar-TN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'صباح الخير' : 'مساء الخير'
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [menuOpen, setMenuOpen] = useState(false)
  const [pending,  setPending]  = useState(0)

  useEffect(() => {
    const refresh = () => { void pendingCount().then(setPending) }
    refresh()
    return onQueueChange(refresh)
  }, [])

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn:  api.stats.get,
  })

  const initial = (user?.full_name || user?.username || '؟').trim().charAt(0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar ── */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-lg font-bold flex-shrink-0">
              <span className="arabic">{initial}</span>
            </div>
            <div className="min-w-0">
              <h1 className="arabic text-lg md:text-xl font-bold text-gray-900 truncate">
                {greeting()}، {user?.full_name || user?.username} 👋
              </h1>
              <p className="arabic text-xs text-gray-400">{todayAr()}{isAdmin && ' · مدير المدرسة'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isAdmin && (
              <button
                onClick={() => navigate('/admin/users')}
                className="arabic hidden md:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
              >
                🛡️ لوحة المدير
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="w-10 h-10 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 text-lg"
              >
                ☰
              </button>
              {menuOpen && (
                <div className="absolute left-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <button onClick={() => { setMenuOpen(false); navigate('/profile') }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-right border-b border-gray-100 arabic" dir="rtl">
                    <span className="text-base">👤</span> الملف الشخصي
                  </button>
                  <button onClick={() => { setMenuOpen(false); navigate('/calendar') }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-right border-b border-gray-100 arabic" dir="rtl">
                    <span className="text-base">📅</span> الروزنامة
                  </button>
                  <button onClick={() => { setMenuOpen(false); navigate('/documents') }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-right border-b border-gray-100 arabic" dir="rtl">
                    <span className="text-base">📂</span> الوثائق الرسمية
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

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6" dir="rtl">
        {pending > 0 && (
          <div className="arabic mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl text-sm">
            <span>📡</span> {pending} حفظ بانتظار المزامنة — سيُرسل تلقائياً عند عودة الاتصال.
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-24">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}

        {stats && <UpcomingEvents />}
        {stats?.role === 'teacher'  && <TeacherView stats={stats} />}
        {stats?.role === 'director' && <DirectorView stats={stats} />}
      </main>

      {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}
    </div>
  )
}

// ════════════════════════════ Upcoming events strip ════════════════════════════
const EVENT_DOT: Record<string, string> = {
  blue: 'bg-blue-500', green: 'bg-green-500', amber: 'bg-amber-500',
  rose: 'bg-rose-500', purple: 'bg-purple-500',
}
const EV_DAY = new Intl.DateTimeFormat('ar-TN', { weekday: 'short', day: 'numeric', month: 'short' })

function UpcomingEvents() {
  const navigate = useNavigate()
  const today = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const end = new Date(today)
  end.setDate(end.getDate() + 30)

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['events-upcoming'],
    queryFn:  () => api.events.list(fmt(today), fmt(end)),
  })

  if (events.length === 0) return null
  const next = events.slice(0, 3)

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider">القادم في الروزنامة</h2>
        <button onClick={() => navigate('/calendar')} className="arabic text-xs text-blue-600 hover:underline">
          عرض الكل ←
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {next.map(e => (
          <button key={e.id} onClick={() => navigate('/calendar')}
                  className="flex items-center gap-3 bg-white border border-gray-200 hover:border-blue-300 rounded-2xl px-4 py-3 text-right transition">
            <span className={`w-1 self-stretch rounded-full ${EVENT_DOT[e.color] ?? 'bg-blue-500'}`} />
            <span className="min-w-0">
              <span className="arabic block text-sm font-medium text-gray-800 truncate">
                {e.is_school_wide ? '📢 ' : ''}{e.title}
              </span>
              <span className="arabic block text-xs text-gray-400">
                {EV_DAY.format(new Date(e.date + 'T00:00:00'))}{e.time ? ` · ${e.time}` : ''}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ════════════════════════════ Teacher dashboard ════════════════════════════════
function TeacherView({ stats }: { stats: TeacherStats }) {
  const navigate = useNavigate()
  const t = stats.totals

  if (stats.cards.length === 0) {
    return (
      <div className="text-center py-24 text-gray-400">
        <div className="text-5xl mb-4">🏫</div>
        <p className="arabic text-lg font-medium text-gray-500">لا أقسام مسندة إليكم بعد</p>
        <p className="arabic text-sm mt-1">اتصلوا بإدارة المدرسة ليتم إسناد أقسامكم وموادكم.</p>
      </div>
    )
  }

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard icon="🏫" label="أقسامي"  value={t.classes} />
        <StatCard icon="📚" label="موادّي"  value={t.subjects} />
        <StatCard icon="🧒" label="التلاميذ" value={t.students} />
        <RingCard pct={t.completion_pct} label="تقدّم السنة" sublabel="امتحانات منهاة" />
      </div>

      {/* Shortcuts */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <QuickAction icon="📅" label="روزنامتي"        onClick={() => navigate('/calendar')} />
        <QuickAction icon="📂" label="الوثائق الرسمية" onClick={() => navigate('/documents')} />
      </div>

      {/* Subject cards */}
      <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        موادّي وأقسامي
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.cards.map(card => (
          <SubjectCard key={`${card.class_id}-${card.subject_id}`} card={card}
                       onOpen={() => navigate(`/classes/${card.class_id}?subject=${card.subject_id}`)}
                       onContinue={card.last_session
                         ? () => navigate(`/sessions/${card.last_session!.id}`)
                         : undefined} />
        ))}
      </div>
    </>
  )
}

// One colorful (class × subject) tile — school-app style
function SubjectCard({ card, onOpen, onContinue }: {
  card: PairStats
  onOpen: () => void
  onContinue?: () => void
}) {
  const style = subjectStyle(card.subject_code)
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-blue-300 transition group">
      <button onClick={onOpen} className={`w-full bg-gradient-to-l ${style.gradient} px-5 py-4 text-right`}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="arabic text-white text-lg font-bold truncate">{card.subject_name}</p>
            <p className="arabic text-white/80 text-sm truncate">
              {card.class_name}{card.level ? ` · ${card.level}` : ''}
            </p>
          </div>
          <span className="text-3xl drop-shadow flex-shrink-0">{style.icon}</span>
        </div>
      </button>

      <div className="px-5 py-3.5">
        <div className="flex items-center justify-between mb-3">
          {/* Trimester dots */}
          <div className="flex items-center gap-3">
            {TRIMESTERS.map(t => {
              const ts = card.trimester_status[t]
              const color = !ts ? 'bg-gray-200'
                : ts.imtihan_finalized ? 'bg-green-500'
                : ts.imtihan_exists ? 'bg-amber-400'
                : ts.has_taqyim ? 'bg-blue-400' : 'bg-gray-200'
              return (
                <div key={t} className="flex items-center gap-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <span className="text-[10px] text-gray-400">ث{t}</span>
                </div>
              )
            })}
          </div>
          {/* Average chip */}
          {card.avg_final != null && (
            <span className={`arabic text-xs font-bold px-2.5 py-1 rounded-full ${
              card.avg_final >= 10 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}>
              معدل {card.avg_final}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="arabic">{card.student_count} تلميذ · {card.session_count} جلسة</span>
          {onContinue ? (
            <button onClick={onContinue}
                    className="arabic text-blue-600 hover:text-blue-800 font-medium">
              مواصلة الإدخال ←
            </button>
          ) : (
            <button onClick={onOpen} className="arabic text-blue-600 hover:text-blue-800 font-medium">
              فتح ←
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════ Director dashboard ═══════════════════════════════
function DirectorView({ stats }: { stats: DirectorStats }) {
  const navigate = useNavigate()
  const t = stats.totals

  // group pairs by class for the classes grid
  const classMap = new Map<string, { name: string; level?: string | null; year: string; students: number; pairs: PairStats[] }>()
  for (const p of stats.pairs) {
    let c = classMap.get(p.class_id)
    if (!c) {
      c = { name: p.class_name, level: p.level, year: p.school_year, students: p.student_count, pairs: [] }
      classMap.set(p.class_id, c)
    }
    c.pairs.push(p)
  }

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon="👩‍🏫" label="المعلمون" value={t.teachers} onClick={() => navigate('/admin/users')} />
        <StatCard icon="🏫" label="الأقسام"   value={t.classes}  onClick={() => navigate('/admin/classes')} />
        <StatCard icon="🧒" label="التلاميذ"  value={t.students} />
        <RingCard pct={t.completion_pct} label="إنجاز السنة" sublabel={`${t.sessions} جلسة`} />
      </div>

      {/* Alerts */}
      {stats.alerts.unassigned_classes.length > 0 && (
        <button onClick={() => navigate('/admin/assignments')}
                className="arabic w-full text-right mb-6 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm hover:bg-amber-100 transition">
          <span>⚠</span>
          <span className="font-medium">
            {stats.alerts.unassigned_classes.length} قسم بدون معلم مسند :
            {' '}{stats.alerts.unassigned_classes.map(c => c.name).join('، ')}
          </span>
          <span className="mr-auto text-xs">الإسناد ←</span>
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Subject averages */}
        <section className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            معدلات المواد (آخر الامتحانات)
          </h2>
          {stats.subject_averages.length === 0 ? (
            <p className="arabic text-sm text-gray-400 py-6 text-center">لا توجد أعداد محفوظة بعد.</p>
          ) : (
            <div className="space-y-3">
              {stats.subject_averages.map(s => (
                <div key={s.subject_name} className="flex items-center gap-3">
                  <span className="arabic text-sm text-gray-700 w-32 truncate flex-shrink-0">{s.subject_name}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(s.avg ?? 0) >= 10 ? 'bg-gradient-to-l from-green-400 to-emerald-500' : 'bg-gradient-to-l from-rose-400 to-red-500'}`}
                      style={{ width: `${Math.min(100, ((s.avg ?? 0) / 20) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-800 w-12 text-left flex-shrink-0" dir="ltr">
                    {s.avg ?? '—'}
                  </span>
                </div>
              ))}
              <p className="arabic text-[10px] text-gray-300 pt-1">المقياس : 20</p>
            </div>
          )}
        </section>

        {/* Recent activity */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            آخر النشاطات
          </h2>
          {stats.activity.length === 0 ? (
            <p className="arabic text-sm text-gray-400 py-6 text-center">لا نشاط بعد.</p>
          ) : (
            <div className="space-y-1">
              {stats.activity.map(a => (
                <button key={a.session_id}
                        onClick={() => navigate(`/sessions/${a.session_id}`)}
                        className="w-full text-right flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition">
                  <span className="text-base mt-0.5">{a.is_finalized ? '🔒' : '✏️'}</span>
                  <span className="min-w-0">
                    <span className="arabic block text-sm text-gray-800 truncate">
                      {a.class_name} — {a.subject_name} · {a.exam_type} (ث{a.trimester})
                    </span>
                    <span className="arabic block text-xs text-gray-400">
                      {a.by ? `${a.by} · ` : ''}{relativeTimeAr(a.at)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-8">
        <QuickAction icon="➕" label="قسم جديد"      onClick={() => navigate('/admin/classes')} />
        <QuickAction icon="👤" label="حساب معلم"     onClick={() => navigate('/admin/users')} />
        <QuickAction icon="🔗" label="إسناد المواد"  onClick={() => navigate('/admin/assignments')} />
        <QuickAction icon="📐" label="شبكات التقييم" onClick={() => navigate('/admin/templates')} />
        <QuickAction icon="📅" label="الروزنامة"     onClick={() => navigate('/calendar')} />
        <QuickAction icon="📂" label="الوثائق"       onClick={() => navigate('/documents')} />
      </div>

      {/* Classes grid */}
      <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        الأقسام
      </h2>
      {classMap.size === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🏫</div>
          <p className="arabic text-sm">
            لا توجد أقسام بعد —{' '}
            <button onClick={() => navigate('/admin/classes')} className="text-blue-600 underline">أنشئوا الأقسام</button>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...classMap.entries()].map(([cid, c]) => (
            <button key={cid} onClick={() => navigate(`/classes/${cid}`)}
                    className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-2xl p-5 text-right transition group">
              <div className="flex items-start justify-between mb-1">
                <span className="arabic text-lg font-bold text-gray-900 group-hover:text-blue-700">{c.name}</span>
                {c.level && <span className="arabic text-xs text-gray-400">{c.level}</span>}
              </div>
              <p className="arabic text-xs text-gray-400 mb-3">{c.students} تلميذ · {c.year}</p>
              <div className="flex flex-wrap gap-1.5">
                {c.pairs.map(p => {
                  const style = subjectStyle(p.subject_code)
                  return (
                    <span key={p.subject_id}
                          className={`arabic inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${style.chip}`}>
                      {style.icon} {p.subject_name}
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        p.finalized_trimesters === 3 ? 'bg-green-500'
                        : p.finalized_trimesters > 0 ? 'bg-amber-400' : 'bg-gray-300'}`} />
                    </span>
                  )
                })}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ════════════════════════════ Shared widgets ═══════════════════════════════════
function StatCard({ icon, label, value, onClick }: {
  icon: string; label: string; value: number; onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick}
          className={`bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3 text-right ${onClick ? 'hover:border-blue-300 hover:shadow-sm transition' : ''}`}>
      <span className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">{icon}</span>
      <span>
        <span className="block text-2xl font-bold text-gray-900" dir="ltr">{value}</span>
        <span className="arabic block text-xs text-gray-400">{label}</span>
      </span>
    </Comp>
  )
}

function RingCard({ pct, label, sublabel }: { pct: number; label: string; sublabel?: string }) {
  const r = 22
  const circ = 2 * Math.PI * r
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3">
      <div className="relative w-14 h-14 flex-shrink-0">
        <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
          <circle cx="28" cy="28" r={r} fill="none" stroke="#f3f4f6" strokeWidth="6" />
          <circle cx="28" cy="28" r={r} fill="none"
                  stroke={pct >= 67 ? '#22c55e' : pct >= 34 ? '#f59e0b' : '#3b82f6'}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * circ} ${circ}`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-800" dir="ltr">
          {pct}%
        </span>
      </div>
      <span>
        <span className="arabic block text-sm font-semibold text-gray-800">{label}</span>
        {sublabel && <span className="arabic block text-xs text-gray-400">{sublabel}</span>}
      </span>
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
            className="arabic flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 rounded-2xl px-4 py-3.5 text-sm font-medium text-gray-700 transition">
      <span className="text-lg">{icon}</span> {label}
    </button>
  )
}
