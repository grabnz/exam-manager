import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  api, DashboardStats, DirectorStats, TeacherStats, PairStats,
  CalendarEvent, TimetableSlot, ScoreBucket,
} from '../api/client'
import { useAuth } from '../auth'
import { pendingCount, onQueueChange } from '../lib/offlineQueue'
import { subjectStyle, relativeTimeAr } from '../lib/subjectStyle'
import {
  MenuIcon, UserIcon, ShieldIcon, CalendarIcon, FolderIcon, ClockIcon,
  KeyIcon, LogOutIcon, UsersIcon, SchoolIcon, GraduationCapIcon,
  AlertIcon, LockIcon, EditIcon, PlusIcon, LinkIcon, GridIcon,
  MegaphoneIcon, WifiOffIcon, BookOpenIcon, ChevronLeftIcon,
} from '../components/icons'

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
function isoDayNow(): number { return ((new Date().getDay() + 6) % 7) + 1 }
function hmNow(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

  const menuItems = [
    { Icon: UserIcon,     label: 'الملف الشخصي',     to: '/profile' },
    ...(isAdmin ? [{ Icon: ShieldIcon, label: 'لوحة المدير', to: '/admin/users' }] : []),
    { Icon: ClockIcon,    label: 'جدول الأوقات',     to: '/timetable' },
    { Icon: CalendarIcon, label: 'الروزنامة',        to: '/calendar' },
    { Icon: FolderIcon,   label: 'الوثائق الرسمية',  to: '/documents' },
    { Icon: KeyIcon,      label: 'تغيير كلمة المرور', to: '/change-password' },
  ]

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
                {greeting()}، {user?.full_name || user?.username}
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
                <ShieldIcon className="w-4 h-4" /> لوحة المدير
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="w-10 h-10 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600"
              >
                <MenuIcon className="w-5 h-5" />
              </button>
              {menuOpen && (
                <div className="absolute left-0 mt-1 w-60 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden">
                  {menuItems.map(item => (
                    <button key={item.to} onClick={() => { setMenuOpen(false); navigate(item.to) }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-right border-b border-gray-100 arabic" dir="rtl">
                      <span className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500">
                        <item.Icon className="w-4 h-4" />
                      </span>
                      {item.label}
                    </button>
                  ))}
                  <button onClick={() => { setMenuOpen(false); logout(); navigate('/login') }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 text-right arabic" dir="rtl">
                    <span className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500">
                      <LogOutIcon className="w-4 h-4" />
                    </span>
                    تسجيل الخروج
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
            <WifiOffIcon className="w-4 h-4 flex-shrink-0" />
            {pending} حفظ بانتظار المزامنة — سيُرسل تلقائياً عند عودة الاتصال.
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-24">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}

        {stats && <NowStrip isAdmin={isAdmin} />}
        {stats && <UpcomingEvents />}
        {stats?.role === 'teacher'  && <TeacherView stats={stats} />}
        {stats?.role === 'director' && <DirectorView stats={stats} />}
      </main>

      {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}
    </div>
  )
}

// ════════════════════════════ "Now" strip (timetable) ══════════════════════════
function NowStrip({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate()
  const { data: slots = [] } = useQuery<TimetableSlot[]>({
    queryKey: ['timetable'],
    queryFn:  api.timetable.list,
  })

  const day = isoDayNow()
  const now = hmNow()
  const todaySlots = slots.filter(s => s.day === day).sort((a, b) => a.start.localeCompare(b.start))
  const current = todaySlots.filter(s => s.start <= now && now < s.end)
  const next = todaySlots.find(s => s.start > now)

  if (slots.length === 0) return null

  if (isAdmin) {
    return (
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider">في القاعات الآن</h2>
          <button onClick={() => navigate('/timetable')} className="arabic text-xs text-blue-600 hover:underline flex items-center gap-1">
            جدول الأوقات <ChevronLeftIcon className="w-3 h-3" />
          </button>
        </div>
        {current.length === 0 ? (
          <p className="arabic text-sm text-gray-400 bg-white border border-gray-200 rounded-2xl px-4 py-3">
            لا حصص جارية الآن.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {current.map(s => {
              const st = subjectStyle(s.subject_code)
              return (
                <div key={s.id} className={`flex items-center gap-3 border rounded-2xl px-4 py-3 ${st.card}`}>
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${st.badge}`}>
                    <st.Icon className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="arabic block text-sm font-semibold text-gray-800 truncate">
                      {s.teacher_name} — {s.subject_name ?? s.label}
                    </span>
                    <span className="arabic block text-xs text-gray-500 truncate">
                      {s.class_name ?? ''}{s.room ? ` · قاعة ${s.room}` : ''} · <span dir="ltr">{s.start}–{s.end}</span>
                    </span>
                  </span>
                  <span className="mr-auto w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  // Teacher: current / next lesson
  const cur = current[0]
  return (
    <section className="mb-6">
      <button onClick={() => navigate('/timetable')}
              className={`w-full text-right border rounded-2xl px-5 py-4 transition hover:shadow-sm ${
                cur ? subjectStyle(cur.subject_code).card : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-4">
          {cur ? (
            <>
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${subjectStyle(cur.subject_code).badge}`}>
                {(() => { const I = subjectStyle(cur.subject_code).Icon; return <I className="w-6 h-6" /> })()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="arabic block text-xs text-gray-500 mb-0.5">حصتك الآن <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1" /></span>
                <span className="arabic block text-base font-bold text-gray-900 truncate">
                  {cur.subject_name ?? cur.label}{cur.class_name ? ` — ${cur.class_name}` : ''}
                </span>
                <span className="arabic block text-xs text-gray-500">
                  {cur.room ? `قاعة ${cur.room} · ` : ''}<span dir="ltr">{cur.start}–{cur.end}</span>
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0">
                <ClockIcon className="w-6 h-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="arabic block text-base font-bold text-gray-900">أنتم متاحون الآن</span>
                <span className="arabic block text-xs text-gray-500">
                  {next
                    ? <>الحصة القادمة: {next.subject_name ?? next.label}{next.class_name ? ` — ${next.class_name}` : ''} على <span dir="ltr">{next.start}</span>{next.room ? ` (قاعة ${next.room})` : ''}</>
                    : 'لا حصص متبقية اليوم.'}
                </span>
              </span>
            </>
          )}
          <ChevronLeftIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
        </div>
      </button>
    </section>
  )
}

// ════════════════════════════ Upcoming events strip ════════════════════════════
const EVENT_BAR: Record<string, string> = {
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
        <button onClick={() => navigate('/calendar')} className="arabic text-xs text-blue-600 hover:underline flex items-center gap-1">
          عرض الكل <ChevronLeftIcon className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {next.map(e => (
          <button key={e.id} onClick={() => navigate('/calendar')}
                  className="flex items-center gap-3 bg-white border border-gray-200 hover:border-blue-300 rounded-2xl px-4 py-3 text-right transition">
            <span className={`w-1 self-stretch rounded-full ${EVENT_BAR[e.color] ?? 'bg-blue-500'}`} />
            <span className="min-w-0 flex-1">
              <span className="arabic flex items-center gap-1.5 text-sm font-medium text-gray-800 truncate">
                {e.is_school_wide && <MegaphoneIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                {e.title}
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
        <SchoolIcon className="w-14 h-14 mx-auto mb-4 text-gray-200" />
        <p className="arabic text-lg font-medium text-gray-500">لا أقسام مسندة إليكم بعد</p>
        <p className="arabic text-sm mt-1">اتصلوا بإدارة المدرسة ليتم إسناد أقسامكم وموادكم.</p>
      </div>
    )
  }

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard Icon={SchoolIcon}        tint="bg-blue-50 text-blue-600"     label="أقسامي"  value={t.classes} />
        <StatCard Icon={BookOpenIcon}      tint="bg-violet-50 text-violet-600" label="موادّي"  value={t.subjects} />
        <StatCard Icon={GraduationCapIcon} tint="bg-amber-50 text-amber-600"   label="التلاميذ" value={t.students} />
        <RingCard pct={t.completion_pct} label="تقدّم السنة" sublabel="امتحانات منهاة" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <Donut buckets={stats.distribution} title="توزيع أعداد تلاميذي" />
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          <ShortcutCard Icon={ClockIcon}    tint="bg-cyan-50 text-cyan-600"   label="جدول الأوقات" sub="حصصكم الأسبوعية بالساعات" onClick={() => navigate('/timetable')} />
          <ShortcutCard Icon={CalendarIcon} tint="bg-rose-50 text-rose-600"   label="الروزنامة"    sub="مواعيدكم وأحداث المدرسة"  onClick={() => navigate('/calendar')} />
          <ShortcutCard Icon={FolderIcon}   tint="bg-amber-50 text-amber-600" label="الوثائق الرسمية" sub="منشورات ومذكرات الإدارة" onClick={() => navigate('/documents')} />
          <ShortcutCard Icon={UserIcon}     tint="bg-green-50 text-green-600" label="الملف الشخصي" sub="الاسم والرتبة وكلمة المرور" onClick={() => navigate('/profile')} />
        </div>
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

// Pastel (class × subject) tile with circular icon badge
function SubjectCard({ card, onOpen, onContinue }: {
  card: PairStats
  onOpen: () => void
  onContinue?: () => void
}) {
  const style = subjectStyle(card.subject_code)
  return (
    <div className={`border rounded-3xl p-5 transition hover:shadow-md ${style.card}`}>
      <button onClick={onOpen} className="w-full text-right">
        <div className="flex items-start justify-between mb-3">
          <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${style.badge}`}>
            <style.Icon className="w-6 h-6" />
          </span>
          {card.avg_final != null && (
            <span className={`arabic text-xs font-bold px-2.5 py-1 rounded-full bg-white/80 ${
              card.avg_final >= 10 ? 'text-green-700' : 'text-red-600'
            }`}>
              معدل {card.avg_final}
            </span>
          )}
        </div>
        <p className="arabic text-lg font-bold text-gray-900 leading-tight">{card.subject_name}</p>
        <p className="arabic text-sm text-gray-500 mb-3">
          {card.class_name}{card.level ? ` · ${card.level}` : ''}
        </p>

        <div className="flex items-center gap-3 mb-3">
          {TRIMESTERS.map(t => {
            const ts = card.trimester_status[t]
            const color = !ts ? 'bg-gray-300/70'
              : ts.imtihan_finalized ? 'bg-green-500'
              : ts.imtihan_exists ? 'bg-amber-400'
              : ts.has_taqyim ? 'bg-blue-400' : 'bg-gray-300/70'
            return (
              <div key={t} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                <span className="text-[10px] text-gray-400">ث{t}</span>
              </div>
            )
          })}
        </div>
      </button>

      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-white/60">
        <span className="arabic">{card.student_count} تلميذ · {card.session_count} جلسة</span>
        <button onClick={onContinue ?? onOpen}
                className={`arabic font-semibold flex items-center gap-1 ${style.text}`}>
          {onContinue ? 'مواصلة الإدخال' : 'فتح'} <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════ Director dashboard ═══════════════════════════════
function DirectorView({ stats }: { stats: DirectorStats }) {
  const navigate = useNavigate()
  const t = stats.totals

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
        <StatCard Icon={UsersIcon}         tint="bg-violet-50 text-violet-600" label="المعلمون" value={t.teachers} onClick={() => navigate('/admin/users')} />
        <StatCard Icon={SchoolIcon}        tint="bg-blue-50 text-blue-600"     label="الأقسام"  value={t.classes}  onClick={() => navigate('/admin/classes')} />
        <StatCard Icon={GraduationCapIcon} tint="bg-amber-50 text-amber-600"   label="التلاميذ" value={t.students} />
        <RingCard pct={t.completion_pct} label="إنجاز السنة" sublabel={`${t.sessions} جلسة`} />
      </div>

      {/* Alerts */}
      {stats.alerts.unassigned_classes.length > 0 && (
        <button onClick={() => navigate('/admin/assignments')}
                className="arabic w-full text-right mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl text-sm hover:bg-amber-100 transition">
          <AlertIcon className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium">
            {stats.alerts.unassigned_classes.length} قسم بدون معلم مسند :
            {' '}{stats.alerts.unassigned_classes.map(c => c.name).join('، ')}
          </span>
          <span className="mr-auto text-xs flex items-center gap-1">الإسناد <ChevronLeftIcon className="w-3 h-3" /></span>
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Distribution donut */}
        <Donut buckets={stats.distribution} title="توزيع الأعداد" />

        {/* Subject averages */}
        <section className="bg-white border border-gray-200 rounded-3xl p-5">
          <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            معدلات المواد
          </h2>
          {stats.subject_averages.length === 0 ? (
            <p className="arabic text-sm text-gray-400 py-6 text-center">لا توجد أعداد محفوظة بعد.</p>
          ) : (
            <div className="space-y-3">
              {stats.subject_averages.slice(0, 6).map(s => (
                <div key={s.subject_name} className="flex items-center gap-3">
                  <span className="arabic text-sm text-gray-700 w-24 truncate flex-shrink-0">{s.subject_name}</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(s.avg ?? 0) >= 10 ? 'bg-gradient-to-l from-green-400 to-emerald-500' : 'bg-gradient-to-l from-rose-400 to-red-500'}`}
                      style={{ width: `${Math.min(100, ((s.avg ?? 0) / 20) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-800 w-10 text-left flex-shrink-0" dir="ltr">
                    {s.avg ?? '—'}
                  </span>
                </div>
              ))}
              <p className="arabic text-[10px] text-gray-300 pt-1">المقياس : 20</p>
            </div>
          )}
        </section>

        {/* Recent activity */}
        <section className="bg-white border border-gray-200 rounded-3xl p-5">
          <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            آخر النشاطات
          </h2>
          {stats.activity.length === 0 ? (
            <p className="arabic text-sm text-gray-400 py-6 text-center">لا نشاط بعد.</p>
          ) : (
            <div className="space-y-1">
              {stats.activity.slice(0, 6).map(a => (
                <button key={a.session_id}
                        onClick={() => navigate(`/sessions/${a.session_id}`)}
                        className="w-full text-right flex items-start gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 transition">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    a.is_finalized ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-500'}`}>
                    {a.is_finalized ? <LockIcon className="w-3.5 h-3.5" /> : <EditIcon className="w-3.5 h-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="arabic block text-sm text-gray-800 truncate">
                      {a.class_name} — {a.subject_name} · {a.exam_type}
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
      <div className="grid grid-cols-3 lg:grid-cols-7 gap-2 mb-8">
        <QuickAction Icon={PlusIcon}     label="قسم جديد"   onClick={() => navigate('/admin/classes')} />
        <QuickAction Icon={UserIcon}     label="حساب معلم"  onClick={() => navigate('/admin/users')} />
        <QuickAction Icon={LinkIcon}     label="الإسناد"    onClick={() => navigate('/admin/assignments')} />
        <QuickAction Icon={GridIcon}     label="الشبكات"    onClick={() => navigate('/admin/templates')} />
        <QuickAction Icon={ClockIcon}    label="جدول الأوقات" onClick={() => navigate('/timetable')} />
        <QuickAction Icon={CalendarIcon} label="الروزنامة"  onClick={() => navigate('/calendar')} />
        <QuickAction Icon={FolderIcon}   label="الوثائق"    onClick={() => navigate('/documents')} />
      </div>

      {/* Classes grid */}
      <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        الأقسام
      </h2>
      {classMap.size === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <SchoolIcon className="w-14 h-14 mx-auto mb-4 text-gray-200" />
          <p className="arabic text-sm">
            لا توجد أقسام بعد —{' '}
            <button onClick={() => navigate('/admin/classes')} className="text-blue-600 underline">أنشئوا الأقسام</button>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...classMap.entries()].map(([cid, c]) => (
            <button key={cid} onClick={() => navigate(`/classes/${cid}`)}
                    className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-3xl p-5 text-right transition group">
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
                          className={`arabic inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${style.chip}`}>
                      <style.Icon className="w-3 h-3" />
                      {p.subject_name}
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
function StatCard({ Icon, tint, label, value, onClick }: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  tint: string; label: string; value: number; onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick}
          className={`bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3 text-right ${onClick ? 'hover:border-blue-300 hover:shadow-sm transition' : ''}`}>
      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${tint}`}>
        <Icon className="w-5 h-5" />
      </span>
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

const BUCKET_COLORS = ['#f43f5e', '#f59e0b', '#38bdf8', '#22c55e']
const BUCKET_CHIPS  = ['bg-rose-50 text-rose-700', 'bg-amber-50 text-amber-700', 'bg-sky-50 text-sky-700', 'bg-green-50 text-green-700']

function Donut({ buckets, title }: { buckets: ScoreBucket[]; title: string }) {
  const total = buckets.reduce((s, b) => s + b.count, 0)
  const r = 38
  const circ = 2 * Math.PI * r
  let offset = 0

  return (
    <section className="bg-white border border-gray-200 rounded-3xl p-5">
      <h2 className="arabic text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h2>
      {total === 0 ? (
        <p className="arabic text-sm text-gray-400 py-6 text-center">لا توجد أعداد محفوظة بعد.</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="relative w-28 h-28 flex-shrink-0">
            <svg viewBox="0 0 96 96" className="w-28 h-28 -rotate-90">
              <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="14" />
              {buckets.map((b, i) => {
                if (b.count === 0) return null
                const frac = b.count / total
                const seg = (
                  <circle key={b.label} cx="48" cy="48" r={r} fill="none"
                          stroke={BUCKET_COLORS[i]} strokeWidth="14"
                          strokeDasharray={`${frac * circ} ${circ}`}
                          strokeDashoffset={-offset * circ} />
                )
                offset += frac
                return seg
              })}
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-gray-900" dir="ltr">{total}</span>
              <span className="arabic text-[10px] text-gray-400">عدد</span>
            </span>
          </div>
          <div className="space-y-1.5 min-w-0">
            {buckets.map((b, i) => (
              <div key={b.label} className={`flex items-center justify-between gap-3 px-2.5 py-1 rounded-full text-xs ${BUCKET_CHIPS[i]}`}>
                <span dir="ltr" className="font-medium">{b.label}</span>
                <span className="font-bold" dir="ltr">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ShortcutCard({ Icon, tint, label, sub, onClick }: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  tint: string; label: string; sub: string; onClick: () => void
}) {
  return (
    <button onClick={onClick}
            className="flex items-center gap-3 bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm rounded-2xl px-4 py-3.5 text-right transition">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tint}`}>
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0">
        <span className="arabic block text-sm font-semibold text-gray-800">{label}</span>
        <span className="arabic block text-xs text-gray-400 truncate">{sub}</span>
      </span>
      <ChevronLeftIcon className="w-4 h-4 text-gray-300 mr-auto flex-shrink-0" />
    </button>
  )
}

function QuickAction({ Icon, label, onClick }: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string; onClick: () => void
}) {
  return (
    <button onClick={onClick}
            className="arabic flex flex-col items-center gap-1.5 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 rounded-2xl px-2 py-3 text-xs font-medium text-gray-700 transition">
      <Icon className="w-5 h-5 text-gray-500" />
      {label}
    </button>
  )
}
