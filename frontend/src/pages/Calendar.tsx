import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, CalendarEvent } from '../api/client'
import { useAuth } from '../auth'

const EVENT_COLORS: Record<string, { dot: string; card: string; ring: string }> = {
  blue:   { dot: 'bg-blue-500',   card: 'bg-blue-50 border-blue-200',     ring: 'ring-blue-400' },
  green:  { dot: 'bg-green-500',  card: 'bg-green-50 border-green-200',   ring: 'ring-green-400' },
  amber:  { dot: 'bg-amber-500',  card: 'bg-amber-50 border-amber-200',   ring: 'ring-amber-400' },
  rose:   { dot: 'bg-rose-500',   card: 'bg-rose-50 border-rose-200',     ring: 'ring-rose-400' },
  purple: { dot: 'bg-purple-500', card: 'bg-purple-50 border-purple-200', ring: 'ring-purple-400' },
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()              // 0 = Sunday
  const diff = (day + 6) % 7          // Monday-based week
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
  const navigate = useNavigate()
  const qc = useQueryClient()
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <button onClick={() => navigate('/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3">
          ← الرئيسية
        </button>
        <div className="flex items-center justify-between" dir="rtl">
          <div>
            <h1 className="arabic text-xl font-bold text-gray-900">📅 الروزنامة</h1>
            <p className="arabic text-sm text-gray-400">{MONTH_FMT.format(days[3])}</p>
          </div>
          <button onClick={() => setAddOpen(true)}
                  className="arabic bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
            + حدث جديد
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6" dir="rtl">
        {error && (
          <div className="arabic mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm">{error}</div>
        )}

        {/* Week navigation */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))}
                  className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">›</button>
          <button onClick={() => { const t = new Date(); setWeekStart(startOfWeek(t)); setSelected(iso(t)) }}
                  className="arabic flex-1 text-center text-sm text-gray-500 hover:text-blue-600 py-2">
            اليوم
          </button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}
                  className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">‹</button>
        </div>

        {/* Day strip */}
        <div className="grid grid-cols-7 gap-1.5 mb-6">
          {days.map(d => {
            const key = iso(d)
            const isSel = key === selected
            const hasEvents = (byDay.get(key) ?? []).length > 0
            return (
              <button key={key} onClick={() => setSelected(key)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl border transition ${
                        isSel
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : key === today
                            ? 'bg-white border-blue-300 text-gray-800'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-200'
                      }`}>
                <span className={`arabic text-[10px] ${isSel ? 'text-blue-100' : 'text-gray-400'}`}>
                  {DAY_FMT.format(d)}
                </span>
                <span className="text-base font-bold" dir="ltr">{d.getDate()}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${hasEvents ? (isSel ? 'bg-white' : 'bg-blue-500') : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>

        {/* Selected day events */}
        <h2 className="arabic text-sm font-semibold text-gray-500 mb-3">
          {FULL_FMT.format(new Date(selected + 'T00:00:00'))}
        </h2>

        {dayEvents.length === 0 ? (
          <div className="text-center py-14 text-gray-300">
            <div className="text-4xl mb-2">🗓️</div>
            <p className="arabic text-sm text-gray-400">لا أحداث في هذا اليوم</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dayEvents.map(e => {
              const c = EVENT_COLORS[e.color] ?? EVENT_COLORS.blue
              return (
                <div key={e.id} className={`flex items-start gap-3 border rounded-2xl px-4 py-3 ${c.card}`}>
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${c.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="arabic text-sm font-semibold text-gray-800">{e.title}</span>
                      {e.time && <span className="text-xs text-gray-500 font-mono" dir="ltr">{e.time}</span>}
                      {e.is_school_wide && (
                        <span className="arabic text-[10px] bg-white/70 text-gray-600 px-2 py-0.5 rounded-full">
                          📢 للمدرسة كلها{e.by ? ` · ${e.by}` : ''}
                        </span>
                      )}
                    </div>
                    {e.note && <p className="arabic text-xs text-gray-500 mt-0.5">{e.note}</p>}
                  </div>
                  {(e.is_mine || isAdmin) && (
                    <button onClick={() => { if (confirm('حذف هذا الحدث؟')) run(() => api.events.delete(e.id)) }}
                            className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0">✕</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

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
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <form
        dir="rtl"
        className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 shadow-xl"
        onClick={e => e.stopPropagation()}
        onSubmit={async e => {
          e.preventDefault()
          setSaving(true)
          try {
            await onCreate({ title, date, time: time || null, note, color, is_school_wide: schoolWide })
          } finally { setSaving(false) }
        }}
      >
        <h3 className="arabic text-lg font-bold text-gray-900">حدث جديد</h3>

        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">العنوان</label>
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
                 placeholder="مثال: تقييم القراءة — الخامسة أ"
                 className="arabic w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">التاريخ</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                   className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">التوقيت (اختياري)</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
                   className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">ملاحظة (اختياري)</label>
          <input value={note} onChange={e => setNote(e.target.value)}
                 className="arabic w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-right" />
        </div>

        <div className="flex items-center gap-2">
          {Object.entries(EVENT_COLORS).map(([key, c]) => (
            <button type="button" key={key} onClick={() => setColor(key)}
                    className={`w-7 h-7 rounded-full ${c.dot} ${color === key ? `ring-2 ring-offset-2 ${c.ring}` : 'opacity-50 hover:opacity-100'}`} />
          ))}
        </div>

        {canSchoolWide && (
          <label className="arabic flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={schoolWide} onChange={e => setSchoolWide(e.target.checked)}
                   className="accent-blue-600" />
            📢 حدث للمدرسة كلها (يراه جميع المعلمين)
          </label>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={saving || !title.trim() || !date}
                  className="arabic flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium">
            {saving ? '…' : 'إضافة'}
          </button>
          <button type="button" onClick={onClose}
                  className="arabic px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}
