import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, CalendarEvent } from '../api/client'
import { useAuth } from '../auth'
import { useUI } from '../components/ui'
import AppShell from '../components/AppShell'
import { EmptyState } from '../components/Skeleton'
import {
  CalendarIcon, ChevronLeftIcon, ChevronRightIcon,
  MegaphoneIcon, PlusIcon, TrashIcon,
} from '../components/icons'

const EVENT_COLORS: Record<string, { dot: string; card: string; ring: string }> = {
  blue:   { dot: 'bg-brand',       card: 'bg-brand-light/45 border-brand-mid',     ring: 'ring-brand/40' },
  green:  { dot: 'bg-emerald-500', card: 'bg-emerald-50/70 border-emerald-200',    ring: 'ring-emerald-400' },
  amber:  { dot: 'bg-accent',      card: 'bg-accent-soft border-accent-light',     ring: 'ring-accent/50' },
  rose:   { dot: 'bg-rose-500',    card: 'bg-rose-50/70 border-rose-200',          ring: 'ring-rose-400' },
  purple: { dot: 'bg-violet-500',  card: 'bg-violet-50/70 border-violet-200',      ring: 'ring-violet-400' },
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  const diff = (day + 6) % 7
  x.setDate(x.getDate() - diff)
  return x
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const DAY_FMT   = new Intl.DateTimeFormat('ar-TN', { weekday: 'short' })
const MONTH_FMT = new Intl.DateTimeFormat('ar-TN', { month: 'long', year: 'numeric' })
const FULL_FMT  = new Intl.DateTimeFormat('ar-TN', { weekday: 'long', day: 'numeric', month: 'long' })

export default function Calendar() {
  const qc = useQueryClient()
  const ui = useUI()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selected,  setSelected]  = useState(() => iso(new Date()))
  const [addOpen,   setAddOpen]   = useState(false)
  const [error,     setError]     = useState('')

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const rangeStart = iso(days[0])
  const rangeEnd   = iso(days[6])

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['events', rangeStart, rangeEnd],
    queryFn:  () => api.events.list(rangeStart, rangeEnd),
  })

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      if (!m.has(e.date)) m.set(e.date, [])
      m.get(e.date)!.push(e)
    }
    return m
  }, [events])

  const dayEvents = byDay.get(selected) ?? []
  const today = iso(new Date())

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['events'] })
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    }
  }

  return (
    <AppShell
      title="الروزنامة"
      subtitle={MONTH_FMT.format(days[3])}
      actions={
        <button onClick={() => setAddOpen(true)}
                className="arabic inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-xl text-xs md:text-sm font-semibold shadow-sm transition">
          <PlusIcon className="w-4 h-4" /> حدث جديد
        </button>
      }
    >
      <div className="max-w-3xl" dir="rtl">
        {error && (
          <div className="arabic mb-4 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-2xl text-sm">{error}</div>
        )}

        {/* Week navigation */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))}
                  className="w-9 h-9 flex items-center justify-center bg-surface border border-line rounded-xl hover:border-brand/40 text-ink-muted hover:text-brand shadow-card transition">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
          <button onClick={() => { const t = new Date(); setWeekStart(startOfWeek(t)); setSelected(iso(t)) }}
                  className="arabic flex-1 text-center text-sm font-semibold text-ink-muted hover:text-brand py-2 transition">
            اليوم
          </button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}
                  className="w-9 h-9 flex items-center justify-center bg-surface border border-line rounded-xl hover:border-brand/40 text-ink-muted hover:text-brand shadow-card transition">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Day strip */}
        <div className="grid grid-cols-7 gap-2 mb-6">
          {days.map(d => {
            const key = iso(d)
            const isSel = key === selected
            const hasEvents = (byDay.get(key) ?? []).length > 0
            return (
              <button key={key} onClick={() => setSelected(key)}
                      className={`flex flex-col items-center gap-1 py-3 rounded-2xl border shadow-card transition ${
                        isSel
                          ? 'bg-brand border-brand text-white shadow-float'
                          : key === today
                            ? 'bg-surface border-brand/50 text-ink'
                            : 'bg-surface border-line text-ink-muted hover:border-brand/30'
                      }`}>
                <span className={`arabic text-[10px] ${isSel ? 'text-white/80' : 'text-ink-subtle'}`}>
                  {DAY_FMT.format(d)}
                </span>
                <span className="text-base font-bold num" dir="ltr">{d.getDate()}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${hasEvents ? (isSel ? 'bg-white' : 'bg-brand') : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>

        {/* Selected day events */}
        <h2 className="arabic text-xs font-bold text-ink-muted tracking-wide mb-3">
          {FULL_FMT.format(new Date(selected + 'T00:00:00'))}
        </h2>

        {dayEvents.length === 0 ? (
          <EmptyState
            Icon={CalendarIcon}
            title="لا أحداث في هذا اليوم"
            description="أضيفوا مواعيد الامتحانات، الاجتماعات، أو التذكيرات المدرسية."
          />
        ) : (
          <div className="space-y-2.5">
            {dayEvents.map(e => {
              const c = EVENT_COLORS[e.color] ?? EVENT_COLORS.blue
              return (
                <div key={e.id} className={`flex items-start gap-3 border rounded-2xl px-4 py-3.5 shadow-card ${c.card}`}>
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${c.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="arabic text-sm font-bold text-ink">{e.title}</span>
                      {e.time && <span className="text-xs text-ink-muted font-mono num" dir="ltr">{e.time}</span>}
                      {e.is_school_wide && (
                        <span className="arabic inline-flex items-center gap-1 text-[10px] bg-surface/85 text-ink-muted px-2 py-0.5 rounded-full font-medium">
                          <MegaphoneIcon className="w-3 h-3 text-accent" />
                          للمدرسة كلها{e.by ? ` · ${e.by}` : ''}
                        </span>
                      )}
                    </div>
                    {e.note && <p className="arabic text-xs text-ink-muted mt-1">{e.note}</p>}
                  </div>
                  {(e.is_mine || isAdmin) && (
                    <button
                      onClick={async () => {
                        const ok = await ui.confirm({
                          title: 'حذف الحدث',
                          message: `حذف "${e.title}" من الروزنامة؟`,
                          confirmLabel: 'حذف',
                          danger: true,
                        })
                        if (ok) run(() => api.events.delete(e.id))
                      }}
                      className="p-1.5 text-ink-subtle hover:text-rose-600 rounded-lg transition flex-shrink-0"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {addOpen && (
        <AddEventModal
          defaultDate={selected}
          canSchoolWide={isAdmin}
          onClose={() => setAddOpen(false)}
          onCreate={async data => {
            await run(() => api.events.create(data))
            setAddOpen(false)
            setSelected(data.date)
          }}
        />
      )}
    </AppShell>
  )
}

function AddEventModal({ defaultDate, canSchoolWide, onClose, onCreate }: {
  defaultDate: string
  canSchoolWide: boolean
  onClose: () => void
  onCreate: (data: { title: string; date: string; time?: string | null; note?: string; color?: string; is_school_wide?: boolean }) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [date,  setDate]  = useState(defaultDate)
  const [time,  setTime]  = useState('')
  const [note,  setNote]  = useState('')
  const [color, setColor] = useState('blue')
  const [schoolWide, setSchoolWide] = useState(false)
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4 animate-fade-in" onClick={onClose}>
      <form
        dir="rtl"
        className="w-full max-w-sm bg-surface border border-line rounded-3xl p-6 space-y-4 shadow-float animate-scale-in"
        onClick={e => e.stopPropagation()}
        onSubmit={async e => {
          e.preventDefault()
          setSaving(true)
          try {
            await onCreate({ title, date, time: time || null, note, color, is_school_wide: schoolWide })
          } finally { setSaving(false) }
        }}
      >
        <h3 className="arabic text-lg font-bold text-ink">حدث جديد</h3>

        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">العنوان</label>
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
                 placeholder="مثال: تقييم القراءة — الخامسة أ"
                 className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">التاريخ</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                   className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3 py-2 text-sm num" />
          </div>
          <div>
            <label className="arabic block text-xs font-semibold text-ink-muted mb-1">التوقيت (اختياري)</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
                   className="w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3 py-2 text-sm num" />
          </div>
        </div>

        <div>
          <label className="arabic block text-xs font-semibold text-ink-muted mb-1">ملاحظة (اختياري)</label>
          <input value={note} onChange={e => setNote(e.target.value)}
                 className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2 text-sm text-right" />
        </div>

        <div className="flex items-center gap-2.5">
          {Object.entries(EVENT_COLORS).map(([key, c]) => (
            <button type="button" key={key} onClick={() => setColor(key)}
                    className={`w-7 h-7 rounded-full ${c.dot} transition ${color === key ? `ring-2 ring-offset-2 ${c.ring}` : 'opacity-50 hover:opacity-100'}`} />
          ))}
        </div>

        {canSchoolWide && (
          <label className="arabic flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={schoolWide} onChange={e => setSchoolWide(e.target.checked)}
                   className="accent-brand" />
            <MegaphoneIcon className="w-4 h-4 text-accent" />
            <span>حدث للمدرسة كلها (يراه جميع المعلمين)</span>
          </label>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={saving || !title.trim() || !date}
                  className="arabic flex-1 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition">
            {saving ? '…' : 'إضافة'}
          </button>
          <button type="button" onClick={onClose}
                  className="arabic px-5 py-2.5 text-sm text-ink-muted hover:text-ink transition">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}
