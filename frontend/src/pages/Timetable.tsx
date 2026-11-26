import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, TimetableSlot, Subject, UserRow, YearGroup } from '../api/client'
import { useAuth } from '../auth'
import { subjectStyle } from '../lib/subjectStyle'
import { ClockIcon, PlusIcon, XIcon, ArrowLeftIcon } from '../components/icons'

const DAYS = [
  { iso: 1, label: 'الإثنين' },
  { iso: 2, label: 'الثلاثاء' },
  { iso: 3, label: 'الأربعاء' },
  { iso: 4, label: 'الخميس' },
  { iso: 5, label: 'الجمعة' },
  { iso: 6, label: 'السبت' },
]
const DAY_START = 8 * 60       // 08:00
const DAY_END   = 18 * 60      // 18:00
const PX_PER_MIN = 1

function toMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}
function isoDayNow(): number { return ((new Date().getDay() + 6) % 7) + 1 }
function nowMin(): number { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }

export default function Timetable() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [error,   setError]   = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [viewBy,  setViewBy]  = useState<'teacher' | 'room'>('teacher')
  const [filterTeacher, setFilterTeacher] = useState('')
  const [filterRoom,    setFilterRoom]    = useState('')

  const { data: slots = [] } = useQuery<TimetableSlot[]>({
    queryKey: ['timetable'],
    queryFn:  api.timetable.list,
  })
  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ['users'], queryFn: api.users.list, enabled: isAdmin,
  })

  const teachers = users.filter(u => u.role === 'teacher' && u.is_active)
  const rooms = useMemo(
    () => [...new Set(slots.map(s => s.room).filter(Boolean))].sort(),
    [slots])

  const activeTeacher = filterTeacher || teachers[0]?.id || ''
  const visible = !isAdmin
    ? slots
    : viewBy === 'teacher'
      ? slots.filter(s => s.teacher_id === activeTeacher)
      : slots.filter(s => s.room === (filterRoom || rooms[0] || ''))

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['timetable'] })
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <button onClick={() => navigate('/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3">
          <ArrowLeftIcon className="w-4 h-4" /> الرئيسية
        </button>
        <div className="flex items-center justify-between gap-3 flex-wrap" dir="rtl">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
              <ClockIcon className="w-6 h-6" />
            </span>
            <div>
              <h1 className="arabic text-xl font-bold text-gray-900">جدول الأوقات</h1>
              <p className="arabic text-sm text-gray-400">
                {isAdmin ? 'حصص المعلمين وتوزيع القاعات' : 'حصصكم الأسبوعية'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setAddOpen(true)}
                    className="arabic flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
              <PlusIcon className="w-4 h-4" /> حصة جديدة
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6" dir="rtl">
        {error && (
          <div className="arabic mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm">{error}</div>
        )}

        {/* Director filters */}
        {isAdmin && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setViewBy('teacher')}
                      className={`arabic px-4 py-2 text-sm font-medium transition ${viewBy === 'teacher' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                حسب المعلم
              </button>
              <button onClick={() => setViewBy('room')}
                      className={`arabic px-4 py-2 text-sm font-medium transition ${viewBy === 'room' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                حسب القاعة
              </button>
            </div>
            {viewBy === 'teacher' ? (
              <select value={activeTeacher} onChange={e => setFilterTeacher(e.target.value)}
                      className="arabic bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name || t.username}</option>)}
              </select>
            ) : rooms.length > 0 ? (
              <select value={filterRoom || rooms[0]} onChange={e => setFilterRoom(e.target.value)}
                      className="arabic bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {rooms.map(r => <option key={r} value={r}>قاعة {r}</option>)}
              </select>
            ) : (
              <span className="arabic text-sm text-gray-400">لا قاعات مسجلة بعد</span>
            )}
          </div>
        )}

        {slots.length === 0 && !isAdmin ? (
          <div className="text-center py-20 text-gray-300">
            <ClockIcon className="w-14 h-14 mx-auto mb-3 text-gray-200" />
            <p className="arabic text-sm text-gray-400">لم تُسند لكم حصص بعد — جدول الأوقات تعدّه إدارة المدرسة.</p>
          </div>
        ) : (
          <WeekGrid slots={visible} isAdmin={isAdmin}
                    onDelete={id => { if (confirm('حذف هذه الحصة؟')) run(() => api.timetable.delete(id)) }} />
        )}
      </main>

      {addOpen && (
        <AddSlotModal
          teachers={teachers}
          rooms={rooms}
          onClose={() => setAddOpen(false)}
          onCreate={async data => {
            setError('')
            try {
              await api.timetable.create(data)
              await qc.invalidateQueries({ queryKey: ['timetable'] })
              setAddOpen(false)
            } catch (err: any) {
              throw new Error(err.message || 'حدث خطأ')
            }
          }}
        />
      )}
    </div>
  )
}

// ── Week grid ──────────────────────────────────────────────────────────────────
function WeekGrid({ slots, isAdmin, onDelete }: {
  slots: TimetableSlot[]
  isAdmin: boolean
  onDelete: (id: string) => void
}) {
  const gridHeight = (DAY_END - DAY_START) * PX_PER_MIN
  const today = isoDayNow()
  const now = nowMin()
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60)

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-4 overflow-x-auto">
      <div className="min-w-[720px]">
        {/* Day headers */}
        <div className="grid mb-2" style={{ gridTemplateColumns: '3.5rem repeat(6, 1fr)' }}>
          <div />
          {DAYS.map(d => (
            <div key={d.iso} className={`arabic text-center text-sm font-semibold py-1.5 rounded-xl mx-0.5 ${
              d.iso === today ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}>
              {d.label}
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '3.5rem repeat(6, 1fr)' }}>
          {/* Time axis */}
          <div className="relative" style={{ height: gridHeight }}>
            {hours.map(m => (
              <span key={m} className="absolute -translate-y-1/2 text-[10px] text-gray-400 left-0" dir="ltr"
                    style={{ top: (m - DAY_START) * PX_PER_MIN }}>
                {String(Math.floor(m / 60)).padStart(2, '0')}:00
              </span>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map(d => {
            const daySlots = slots.filter(s => s.day === d.iso)
            return (
              <div key={d.iso} className="relative border-r border-gray-100 mx-0.5 rounded-xl bg-gray-50/50"
                   style={{ height: gridHeight }}>
                {/* hour lines */}
                {hours.map(m => (
                  <div key={m} className="absolute inset-x-0 border-t border-gray-100"
                       style={{ top: (m - DAY_START) * PX_PER_MIN }} />
                ))}
                {/* now line */}
                {d.iso === today && now >= DAY_START && now <= DAY_END && (
                  <div className="absolute inset-x-0 z-10 flex items-center"
                       style={{ top: (now - DAY_START) * PX_PER_MIN }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 -mr-0.5" />
                    <div className="flex-1 border-t-2 border-red-500/70" />
                  </div>
                )}
                {/* slots */}
                {daySlots.map(s => {
                  const top = Math.max(0, (toMin(s.start) - DAY_START) * PX_PER_MIN)
                  const height = Math.max(28, (toMin(s.end) - toMin(s.start)) * PX_PER_MIN)
                  const st = subjectStyle(s.subject_code)
                  const live = d.iso === today && toMin(s.start) <= now && now < toMin(s.end)
                  return (
                    <div key={s.id}
                         className={`absolute inset-x-1 border rounded-xl px-2 py-1 overflow-hidden group ${st.block} ${live ? 'ring-2 ring-green-400' : ''}`}
                         style={{ top, height }}>
                      <p className="arabic text-[11px] font-bold leading-tight truncate">
                        {s.subject_name ?? s.label ?? 'حصة'}
                      </p>
                      <p className="arabic text-[10px] opacity-80 truncate">
                        {s.class_name ?? ''}{s.room ? ` · ق ${s.room}` : ''}
                      </p>
                      <p className="text-[9px] opacity-70" dir="ltr">{s.start}–{s.end}</p>
                      {isAdmin && (
                        <button onClick={() => onDelete(s.id)}
                                className="absolute top-1 left-1 w-4 h-4 hidden group-hover:flex items-center justify-center rounded bg-white/70 text-gray-500 hover:text-red-600">
                          <XIcon className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Add slot modal (director) ──────────────────────────────────────────────────
function AddSlotModal({ teachers, rooms, onClose, onCreate }: {
  teachers: { id: string; full_name: string; username: string }[]
  rooms: string[]
  onClose: () => void
  onCreate: (data: {
    teacher_id: string; class_id?: string | null; subject_id?: string | null
    day: number; start: string; end: string; room?: string; label?: string
  }) => Promise<void>
}) {
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ['subjects'], queryFn: api.subjects.list,
  })
  const { data: years = [] } = useQuery<YearGroup[]>({
    queryKey: ['classes'], queryFn: api.classes.list,
  })
  const classes = years.flatMap(y => y.classes)

  const [teacherId, setTeacherId] = useState('')
  const [classId,   setClassId]   = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [day,       setDay]       = useState(1)
  const [start,     setStart]     = useState('08:00')
  const [end,       setEnd]       = useState('09:00')
  const [room,      setRoom]      = useState('')
  const [label,     setLabel]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <form
        dir="rtl"
        className="w-full max-w-md bg-white rounded-3xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        onSubmit={async e => {
          e.preventDefault()
          setSaving(true)
          setError('')
          try {
            await onCreate({
              teacher_id: teacherId, class_id: classId || null, subject_id: subjectId || null,
              day, start, end, room, label,
            })
          } catch (err: any) {
            setError(err.message)
          } finally {
            setSaving(false)
          }
        }}
      >
        <h3 className="arabic text-lg font-bold text-gray-900">حصة جديدة</h3>

        {error && (
          <div className="arabic bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-sm">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">المعلم</label>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
                    className="arabic w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">اختاروا…</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name || t.username}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">القسم (اختياري)</label>
            <select value={classId} onChange={e => setClassId(e.target.value)}
                    className="arabic w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">—</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">المادة (اختياري)</label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
                    className="arabic w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">—</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">اليوم</label>
            <select value={day} onChange={e => setDay(+e.target.value)}
                    className="arabic w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              {DAYS.map(d => <option key={d.iso} value={d.iso}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">القاعة</label>
            <input value={room} onChange={e => setRoom(e.target.value)} list="rooms-list"
                   placeholder="مثال: 5"
                   className="arabic w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-right" />
            <datalist id="rooms-list">
              {rooms.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">البداية</label>
            <input type="time" value={start} onChange={e => setStart(e.target.value)}
                   className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">النهاية</label>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)}
                   className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="arabic block text-xs font-medium text-gray-600 mb-1">تسمية حرة (إذا لا مادة)</label>
            <input value={label} onChange={e => setLabel(e.target.value)}
                   placeholder="مثال: فرض مراقبة / مناوبة"
                   className="arabic w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-right" />
          </div>
        </div>

        <p className="arabic text-xs text-gray-400">
          يُرفض الإدراج تلقائياً عند تعارض: معلم مشغول، قاعة محجوزة، أو قسم في حصة أخرى.
        </p>

        <div className="flex gap-2">
          <button type="submit" disabled={saving || !teacherId || !start || !end}
                  className="arabic flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium">
            {saving ? '…' : 'إضافة الحصة'}
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
