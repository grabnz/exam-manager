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
import AppShell from '../components/AppShell'
import {
  UserIcon, ShieldIcon, CalendarIcon, FolderIcon, ClockIcon,
  UsersIcon, SchoolIcon, GraduationCapIcon,
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
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const refresh = () => { void pendingCount().then(setPending) }
    refresh()
    return onQueueChange(refresh)
  }, [])

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: api.stats.get,
  })

  return (
    <AppShell
      title={`${greeting()}، ${user?.full_name || user?.username}`}
      subtitle={`${todayAr()}${isAdmin ? ' · مدير المدرسة' : ''}`}
      actions={
        isAdmin ? (
          <button
            onClick={() => navigate('/admin/classes')}
            className="arabic inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-xl text-xs md:text-sm font-medium shadow-sm transition"
          >
            <PlusIcon className="w-4 h-4" /> قسم جديد
          </button>
        ) : undefined
      }
    >
      {pending > 0 && (
        <div className="arabic mb-5 flex items-center gap-2.5 bg-accent-soft border border-accent-light text-amber-900 px-4 py-3 rounded-2xl text-sm shadow-card">
          <WifiOffIcon className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="font-medium">{pending} حفظ بانتظار المزامنة — سيُرسل تلقائياً عند عودة الاتصال.</span>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-24">
          <div className="animate-spin w-8 h-8 border-4 border-brand border-t-transparent rounded-full" />
        </div>
      )}

      {stats && <NowStrip isAdmin={isAdmin} />}
      {stats?.role === 'teacher' && <TeacherView stats={stats} />}
      {stats?.role === 'director' && <DirectorView stats={stats} />}
    </AppShell>
  )
}

// ════════════════════════════ "Now" strip (timetable) ══════════════════════════
function NowStrip({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate()
  const { data: slots = [] } = useQuery<TimetableSlot[]>({
    queryKey: ['timetable'],
    queryFn: api.timetable.list,
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
          <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide">في القاعات الآن</h2>
          <button onClick={() => navigate('/timetable')} className="arabic text-xs text-brand font-medium hover:underline flex items-center gap-1">
            جدول الأوقات <ChevronLeftIcon className="w-3 h-3" />
          </button>
        </div>
        {current.length === 0 ? (
          <p className="arabic text-xs text-ink-subtle bg-surface border border-line rounded-2xl px-4 py-3 shadow-card">
            لا حصص جارية الآن.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {current.map(s => {
              const st = subjectStyle(s.subject_code)
              return (
                <div key={s.id} className={`flex items-center gap-3 border rounded-2xl px-4 py-3 shadow-card ${st.card}`}>
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${st.badge}`}>
                    <st.Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="arabic block text-sm font-semibold text-ink truncate">
                      {s.teacher_name} — {s.subject_name ?? s.label}
                    </span>
                    <span className="arabic block text-xs text-ink-muted truncate num">
                      {s.class_name ?? ''}{s.room ? ` · قاعة ${s.room}` : ''} · <span dir="ltr">{s.start}–{s.end}</span>
                    </span>
                  </span>
                  <span className="mr-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  const cur = current[0]
  return (
    <section className="mb-6">
      <button
        onClick={() => navigate('/timetable')}
        className={`w-full text-right border rounded-2xl px-5 py-3.5 shadow-card transition hover:shadow-float ${
          cur ? subjectStyle(cur.subject_code).card : 'bg-surface border-line'
        }`}
      >
        <div className="flex items-center gap-4">
          {cur ? (
            <>
              <span className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${subjectStyle(cur.subject_code).badge}`}>
                {(() => { const I = subjectStyle(cur.subject_code).Icon; return <I className="w-5 h-5" /> })()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="arabic block text-[11px] text-ink-muted mb-0.5">
                  حصتك الآن <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                </span>
                <span className="arabic block text-base font-bold text-ink truncate">
                  {cur.subject_name ?? cur.label}{cur.class_name ? ` — ${cur.class_name}` : ''}
                </span>
                <span className="arabic block text-xs text-ink-muted num">
                  {cur.room ? `قاعة ${cur.room} · ` : ''}<span dir="ltr">{cur.start}–{cur.end}</span>
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="w-11 h-11 rounded-2xl bg-brand-light text-brand flex items-center justify-center flex-shrink-0">
                <ClockIcon className="w-5 h-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="arabic block text-sm font-bold text-ink">أنتم متاحون الآن</span>
                <span className="arabic block text-xs text-ink-muted num">
                  {next
                    ? <>الحصة القادمة: {next.subject_name ?? next.label}{next.class_name ? ` — ${next.class_name}` : ''} على <span dir="ltr">{next.start}</span>{next.room ? ` (قاعة ${next.room})` : ''}</>
                    : 'لا حصص متبقية اليوم.'}
                </span>
              </span>
            </>
          )}
          <ChevronLeftIcon className="w-4 h-4 text-ink-subtle flex-shrink-0" />
        </div>
      </button>
    </section>
  )
}

// ════════════════════════════ Upcoming events card ═════════════════════════════
const EVENT_BAR: Record<string, string> = {
  blue: 'bg-brand', green: 'bg-emerald-500', amber: 'bg-accent',
  rose: 'bg-rose-500', purple: 'bg-violet-500',
}
const EV_DAY = new Intl.DateTimeFormat('ar-TN', { weekday: 'short', day: 'numeric', month: 'short' })

function UpcomingEventsCard() {
  const navigate = useNavigate()
  const today = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const end = new Date(today)
  end.setDate(end.getDate() + 30)

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['events-upcoming'],
    queryFn: () => api.events.list(fmt(today), fmt(end)),
  })

  if (events.length === 0) return null

  return (
    <section className="bg-surface border border-line rounded-3xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide">القادم في الروزنامة</h2>
        <button onClick={() => navigate('/calendar')} className="arabic text-xs text-brand font-medium hover:underline flex items-center gap-0.5">
          الكل <ChevronLeftIcon className="w-3 h-3" />
        </button>
      </div>
      <div className="space-y-2">
        {events.slice(0, 4).map(e => (
          <button
            key={e.id}
            onClick={() => navigate('/calendar')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-canvas text-right transition"
          >
            <span className={`w-1 self-stretch rounded-full ${EVENT_BAR[e.color] ?? 'bg-brand'}`} />
            <span className="min-w-0 flex-1">
              <span className="arabic flex items-center gap-1.5 text-sm font-medium text-ink truncate">
                {e.is_school_wide && <MegaphoneIcon className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                {e.title}
              </span>
              <span className="arabic block text-[11px] text-ink-subtle num">
                {EV_DAY.format(new Date(e.date + 'T00:00:00'))}{e.time ? ` · ${e.time}` : ''}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ════════════════════════════ Teacher Bento Dashboard ══════════════════════════
function TeacherView({ stats }: { stats: TeacherStats }) {
  const navigate = useNavigate()
  const t = stats.totals
  const latestCard = stats.cards.find(c => c.last_session)

  if (stats.cards.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-3xl text-center py-20 px-6 shadow-card">
        <SchoolIcon className="w-12 h-12 mx-auto mb-3 text-ink-subtle/40" />
        <p className="arabic text-base font-bold text-ink">لا أقسام مسندة إليكم بعد</p>
        <p className="arabic text-sm text-ink-muted mt-1">اتصلوا بإدارة المدرسة ليتم إسناد أقسامكم وموادكم.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1-click Continue Last Session Hero CTA */}
      {latestCard && latestCard.last_session && (
        <div className="bg-brand text-white rounded-3xl p-5 md:p-6 shadow-float flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="arabic inline-block text-[11px] bg-white/15 px-2.5 py-0.5 rounded-full mb-2">
              آخر جلسة نشطة
            </span>
            <h2 className="arabic text-lg md:text-xl font-bold">
              {latestCard.subject_name} — {latestCard.class_name}
            </h2>
            <p className="arabic text-xs text-white/80 mt-0.5">
              الثلاثي {latestCard.last_session.trimester} · {latestCard.last_session.exam_type} · {latestCard.student_count} تلميذ
            </p>
          </div>
          <button
            onClick={() => navigate(`/sessions/${latestCard.last_session!.id}`)}
            className="arabic bg-white text-brand hover:bg-canvas px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition flex items-center gap-1.5"
          >
            مواصلة إدخال الأعداد <ChevronLeftIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard Icon={SchoolIcon}        tint="bg-brand-light text-brand"    label="أقسامي"  value={t.classes} />
        <StatCard Icon={BookOpenIcon}      tint="bg-violet-50 text-violet-700" label="موادّي"  value={t.subjects} />
        <StatCard Icon={GraduationCapIcon} tint="bg-accent-light text-amber-800" label="التلاميذ" value={t.students} />
        <RingCard pct={t.completion_pct} label="تقدّم السنة" sublabel="امتحانات منهاة" />
      </div>

      {/* 2-Column Bento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide">موادّي وأقسامي</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stats.cards.map(card => (
              <SubjectCard
                key={`${card.class_id}-${card.subject_id}`}
                card={card}
                onOpen={() => navigate(`/classes/${card.class_id}?subject=${card.subject_id}`)}
                onContinue={card.last_session ? () => navigate(`/sessions/${card.last_session!.id}`) : undefined}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Donut buckets={stats.distribution} title="توزيع أعداد تلاميذي" />
          <UpcomingEventsCard />
        </div>
      </div>
    </div>
  )
}

function SubjectCard({ card, onOpen, onContinue }: {
  card: PairStats; onOpen: () => void; onContinue?: () => void
}) {
  const style = subjectStyle(card.subject_code)
  return (
    <div className={`border rounded-3xl p-5 shadow-card transition hover:shadow-float ${style.card}`}>
      <button onClick={onOpen} className="w-full text-right">
        <div className="flex items-start justify-between mb-3">
          <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${style.badge}`}>
            <style.Icon className="w-5 h-5" />
          </span>
          {card.avg_final != null && (
            <span className={`arabic text-xs font-bold px-2.5 py-1 rounded-full bg-white/85 num ${
              card.avg_final >= 10 ? 'text-emerald-700' : 'text-rose-600'
            }`}>
              معدل {card.avg_final}
            </span>
          )}
        </div>
        <p className="arabic text-base font-bold text-ink leading-tight">{card.subject_name}</p>
        <p className="arabic text-xs text-ink-muted mt-0.5 mb-3">
          {card.class_name}{card.level ? ` · ${card.level}` : ''}
        </p>

        <div className="flex items-center gap-3 mb-3">
          {TRIMESTERS.map(t => {
            const ts = card.trimester_status[t]
            const color = !ts ? 'bg-gray-300/70'
              : ts.imtihan_finalized ? 'bg-emerald-500'
              : ts.imtihan_exists ? 'bg-accent'
              : ts.has_taqyim ? 'bg-brand' : 'bg-gray-300/70'
            return (
              <div key={t} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-[10px] text-ink-muted num">ث{t}</span>
              </div>
            )
          })}
        </div>
      </button>

      <div className="flex items-center justify-between text-xs text-ink-muted pt-2.5 border-t border-black/5">
        <span className="arabic num">{card.student_count} تلميذ · {card.session_count} جلسة</span>
        <button onClick={onContinue ?? onOpen} className={`arabic font-bold flex items-center gap-0.5 ${style.text}`}>
          {onContinue ? 'مواصلة' : 'فتح'} <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════ Director Bento Dashboard ═════════════════════════
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
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard Icon={UsersIcon}         tint="bg-violet-50 text-violet-700" label="المعلمون" value={t.teachers} onClick={() => navigate('/admin/users')} />
        <StatCard Icon={SchoolIcon}        tint="bg-brand-light text-brand"    label="الأقسام"  value={t.classes}  onClick={() => navigate('/admin/classes')} />
        <StatCard Icon={GraduationCapIcon} tint="bg-accent-light text-amber-800" label="التلاميذ" value={t.students} />
        <RingCard pct={t.completion_pct} label="إنجاز السنة" sublabel={`${t.sessions} جلسة`} />
      </div>

      {/* Action Alert */}
      {stats.alerts.unassigned_classes.length > 0 && (
        <button
          onClick={() => navigate('/admin/assignments')}
          className="arabic w-full text-right flex items-center gap-3 bg-accent-soft border border-accent-light text-amber-900 px-4 py-3 rounded-2xl text-sm shadow-card hover:bg-accent-light/60 transition"
        >
          <AlertIcon className="w-5 h-5 text-accent flex-shrink-0" />
          <span className="font-medium">
            {stats.alerts.unassigned_classes.length} قسم بدون معلم مسند:{' '}
            {stats.alerts.unassigned_classes.map(c => c.name).join('، ')}
          </span>
          <span className="mr-auto text-xs font-bold text-amber-800 flex items-center gap-1">
            الإسناد <ChevronLeftIcon className="w-3 h-3" />
          </span>
        </button>
      )}

      {/* 2-Column Bento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Column: Quick Actions + Classes Grid */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <QuickAction Icon={PlusIcon}     label="قسم جديد"  onClick={() => navigate('/admin/classes')} />
            <QuickAction Icon={UserIcon}     label="المعلمون"  onClick={() => navigate('/admin/users')} />
            <QuickAction Icon={LinkIcon}     label="الإسناد"   onClick={() => navigate('/admin/assignments')} />
            <QuickAction Icon={GridIcon}     label="الشبكات"   onClick={() => navigate('/admin/templates')} />
            <QuickAction Icon={ClockIcon}    label="الأوقات"   onClick={() => navigate('/timetable')} />
            <QuickAction Icon={FolderIcon}   label="الوثائق"   onClick={() => navigate('/documents')} />
          </div>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide">الأقسام ({classMap.size})</h2>
              <button onClick={() => navigate('/admin/classes')} className="arabic text-xs text-brand font-medium hover:underline">
                إدارة الأقسام
              </button>
            </div>
            {classMap.size === 0 ? (
              <div className="bg-surface border border-line rounded-3xl text-center py-14 text-ink-muted shadow-card">
                <SchoolIcon className="w-12 h-12 mx-auto mb-3 text-ink-subtle/40" />
                <p className="arabic text-sm">
                  لا توجد أقسام بعد —{' '}
                  <button onClick={() => navigate('/admin/classes')} className="text-brand font-semibold underline">أنشئوا الأقسام</button>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[...classMap.entries()].map(([cid, c]) => (
                  <button
                    key={cid}
                    onClick={() => navigate(`/classes/${cid}`)}
                    className="bg-surface border border-line hover:border-brand/50 hover:shadow-float rounded-3xl p-5 text-right shadow-card transition group"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="arabic text-base font-bold text-ink group-hover:text-brand">{c.name}</span>
                      {c.level && <span className="arabic text-[11px] bg-canvas text-ink-muted px-2 py-0.5 rounded-full">{c.level}</span>}
                    </div>
                    <p className="arabic text-xs text-ink-subtle mb-3 num">{c.students} تلميذ · {c.year}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {c.pairs.map(p => {
                        const style = subjectStyle(p.subject_code)
                        return (
                          <span key={p.subject_id}
                                className={`arabic inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full ${style.chip}`}>
                            <style.Icon className="w-3 h-3" />
                            {p.subject_name}
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              p.finalized_trimesters === 3 ? 'bg-emerald-500'
                              : p.finalized_trimesters > 0 ? 'bg-accent' : 'bg-gray-300'}`} />
                          </span>
                        )
                      })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Side Column: Analytics + Activity + Events */}
        <div className="space-y-4">
          <Donut buckets={stats.distribution} title="توزيع الأعداد" />

          <section className="bg-surface border border-line rounded-3xl p-5 shadow-card">
            <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide mb-4">معدلات المواد</h2>
            {stats.subject_averages.length === 0 ? (
              <p className="arabic text-xs text-ink-subtle py-4 text-center">لا توجد أعداد محفوظة بعد.</p>
            ) : (
              <div className="space-y-3">
                {stats.subject_averages.slice(0, 6).map(s => (
                  <div key={s.subject_name} className="flex items-center gap-3">
                    <span className="arabic text-xs text-ink w-24 truncate flex-shrink-0">{s.subject_name}</span>
                    <div className="flex-1 h-2 bg-canvas rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(s.avg ?? 0) >= 10 ? 'bg-brand' : 'bg-rose-500'}`}
                        style={{ width: `${Math.min(100, ((s.avg ?? 0) / 20) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-ink w-9 text-left flex-shrink-0 num" dir="ltr">
                      {s.avg ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-surface border border-line rounded-3xl p-5 shadow-card">
            <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide mb-3">آخر النشاطات</h2>
            {stats.activity.length === 0 ? (
              <p className="arabic text-xs text-ink-subtle py-4 text-center">لا نشاط بعد.</p>
            ) : (
              <div className="space-y-1">
                {stats.activity.slice(0, 5).map(a => (
                  <button
                    key={a.session_id}
                    onClick={() => navigate(`/sessions/${a.session_id}`)}
                    className="w-full text-right flex items-start gap-2.5 p-2 rounded-xl hover:bg-canvas transition"
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      a.is_finalized ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-light text-brand'}`}>
                      {a.is_finalized ? <LockIcon className="w-3.5 h-3.5" /> : <EditIcon className="w-3.5 h-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="arabic block text-xs font-semibold text-ink truncate">
                        {a.class_name} — {a.subject_name} · {a.exam_type}
                      </span>
                      <span className="arabic block text-[11px] text-ink-subtle">
                        {a.by ? `${a.by} · ` : ''}{relativeTimeAr(a.at)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <UpcomingEventsCard />
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════ Shared widgets ═══════════════════════════════════
function StatCard({ Icon, tint, label, value, onClick }: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  tint: string; label: string; value: number; onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 text-right shadow-card ${
        onClick ? 'hover:border-brand/40 hover:shadow-float transition' : ''
      }`}
    >
      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${tint}`}>
        <Icon className="w-5 h-5" />
      </span>
      <span>
        <span className="block text-2xl font-bold text-ink num" dir="ltr">{value}</span>
        <span className="arabic block text-xs text-ink-muted">{label}</span>
      </span>
    </Comp>
  )
}

function RingCard({ pct, label, sublabel }: { pct: number; label: string; sublabel?: string }) {
  const r = 22
  const circ = 2 * Math.PI * r
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 shadow-card">
      <div className="relative w-14 h-14 flex-shrink-0">
        <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
          <circle cx="28" cy="28" r={r} fill="none" stroke="#F0EFEA" strokeWidth="6" />
          <circle
            cx="28" cy="28" r={r} fill="none"
            stroke={pct >= 67 ? '#059669' : pct >= 34 ? '#D97706' : '#0F4C5C'}
            strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-ink num" dir="ltr">
          {pct}%
        </span>
      </div>
      <span>
        <span className="arabic block text-sm font-bold text-ink">{label}</span>
        {sublabel && <span className="arabic block text-xs text-ink-muted num">{sublabel}</span>}
      </span>
    </div>
  )
}

const BUCKET_COLORS = ['#E11D48', '#D97706', '#0284C7', '#059669']
const BUCKET_CHIPS  = ['bg-rose-50 text-rose-700', 'bg-amber-50 text-amber-800', 'bg-sky-50 text-sky-700', 'bg-emerald-50 text-emerald-700']

function Donut({ buckets, title }: { buckets: ScoreBucket[]; title: string }) {
  const total = buckets.reduce((s, b) => s + b.count, 0)
  const r = 38
  const circ = 2 * Math.PI * r
  let offset = 0

  return (
    <section className="bg-surface border border-line rounded-3xl p-5 shadow-card">
      <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide mb-4">{title}</h2>
      {total === 0 ? (
        <p className="arabic text-xs text-ink-subtle py-4 text-center">لا توجد أعداد محفوظة بعد.</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg viewBox="0 0 96 96" className="w-24 h-24 -rotate-90">
              <circle cx="48" cy="48" r={r} fill="none" stroke="#F0EFEA" strokeWidth="14" />
              {buckets.map((b, i) => {
                if (b.count === 0) return null
                const frac = b.count / total
                const seg = (
                  <circle
                    key={b.label} cx="48" cy="48" r={r} fill="none"
                    stroke={BUCKET_COLORS[i]} strokeWidth="14"
                    strokeDasharray={`${frac * circ} ${circ}`}
                    strokeDashoffset={-offset * circ}
                  />
                )
                offset += frac
                return seg
              })}
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-ink num" dir="ltr">{total}</span>
              <span className="arabic text-[10px] text-ink-subtle">عدد</span>
            </span>
          </div>
          <div className="space-y-1.5 min-w-0 flex-1">
            {buckets.map((b, i) => (
              <div key={b.label} className={`flex items-center justify-between gap-2 px-2.5 py-1 rounded-full text-xs num ${BUCKET_CHIPS[i]}`}>
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

function QuickAction({ Icon, label, onClick }: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="arabic flex flex-col items-center gap-1.5 bg-surface border border-line hover:border-brand/40 hover:bg-brand-light/30 rounded-2xl px-2 py-3 text-xs font-medium text-ink shadow-card transition"
    >
      <Icon className="w-4 h-4 text-brand" />
      {label}
    </button>
  )
}
