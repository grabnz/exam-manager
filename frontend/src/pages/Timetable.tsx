import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api, TimetableSlot, Subject, UserRow, YearGroup, RoomRow,
  CurriculumRow, ScheduleResult,
} from '../api/client'
import { useAuth } from '../auth'
import { subjectStyle } from '../lib/subjectStyle'
import AppShell from '../components/AppShell'
import { useUI } from '../components/ui'
import { PlusIcon, XIcon, LockIcon } from '../components/icons'

const DAYS = [
  { iso: 1, label: 'الإثنين' },
  { iso: 2, label: 'الثلاثاء' },
  { iso: 3, label: 'الأربعاء' },
  { iso: 4, label: 'الخميس' },
  { iso: 5, label: 'الجمعة' },
  { iso: 6, label: 'السبت' },
]
const LEVELS = [
  'السنة الأولى', 'السنة الثانية', 'السنة الثالثة',
  'السنة الرابعة', 'السنة الخامسة', 'السنة السادسة',
]
const DAY_START = 8 * 60
const DAY_END = 18 * 60
const PX_PER_MIN = 0.95

function toMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}
function isoDayNow(): number { return ((new Date().getDay() + 6) % 7) + 1 }
function nowMin(): number { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }

export default function Timetable() {
  const qc = useQueryClient()
  const ui = useUI()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [error, setError] = useState('')
  const [viewBy, setViewBy] = useState<'teacher' | 'class' | 'room'>('teacher')
  const [filterTeacher, setFilterTeacher] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterRoom, setFilterRoom] = useState('')

  const [addPreset, setAddPreset] = useState<{ day?: number; start?: string } | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [draft, setDraft] = useState<ScheduleResult | null>(null)

  const { data: slots = [] } = useQuery<TimetableSlot[]>({
    queryKey: ['timetable'], queryFn: api.timetable.list,
  })
  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ['users'], queryFn: api.users.list, enabled: isAdmin,
  })
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ['subjects'], queryFn: api.subjects.list,
  })
  const { data: years = [] } = useQuery<YearGroup[]>({
    queryKey: ['classes'], queryFn: api.classes.list,
  })
  const { data: rooms = [] } = useQuery<RoomRow[]>({
    queryKey: ['rooms'], queryFn: api.rooms.list,
  })
  const { data: curricula = [] } = useQuery<CurriculumRow[]>({
    queryKey: ['curriculum'], queryFn: api.curriculum.list, enabled: isAdmin,
  })

  const teachers = useMemo(() => users.filter(u => u.role === 'teacher' && u.is_active), [users])
  const classes = useMemo(() => years.flatMap(y => y.classes.map(c => ({ ...c, year: y.label }))), [years])

  const roomNames = useMemo(() => {
    const set = new Set<string>(rooms.map(r => r.name))
    for (const s of slots) if (s.room) set.add(s.room)
    return [...set].sort()
  }, [rooms, slots])

  const activeTeacher = filterTeacher || teachers[0]?.id || ''
  const activeClass = filterClass || classes[0]?.id || ''
  const activeRoom = filterRoom || roomNames[0] || ''

  const visibleSlots = useMemo(() => {
    if (!isAdmin) return slots
    if (viewBy === 'teacher') return activeTeacher ? slots.filter(s => s.teacher_id === activeTeacher) : slots
    if (viewBy === 'class') return activeClass ? slots.filter(s => s.class_id === activeClass) : slots
    return activeRoom ? slots.filter(s => s.room === activeRoom) : slots
  }, [slots, isAdmin, viewBy, activeTeacher, activeClass, activeRoom])

  // Free rooms right now
  const freeRoomsNow = useMemo(() => {
    const d = isoDayNow()
    const m = nowMin()
    const busy = new Set(
      slots.filter(s => s.day === d && toMin(s.start) <= m && m < toMin(s.end) && s.room).map(s => s.room)
    )
    return roomNames.filter(r => !busy.has(r))
  }, [slots, roomNames])

  async function runGenerate(shiftMode: 'double' | 'single') {
    setGenerating(true)
    setError('')
    try {
      const cfg = shiftMode === 'single'
        ? { days: [1, 2, 3, 4, 5, 6], morning_slots: ['08:00', '09:00', '10:00', '11:00', '12:00'], afternoon_slots: [] }
        : { days: [1, 2, 3, 4, 5, 6], morning_slots: ['08:00', '09:00', '10:00', '11:00'], afternoon_slots: ['13:00', '14:00', '15:00', '16:00'] }
      const res = await api.timetable.generate(cfg)
      setDraft(res)
    } catch (err: any) {
      setError(err.message || 'فشل توليد الجدول')
    } finally {
      setGenerating(false)
    }
  }

  async function commitDraft() {
    if (!draft) return
    setCommitting(true)
    try {
      await api.timetable.commit(draft.slots)
      await qc.invalidateQueries({ queryKey: ['timetable'] })
      setGenOpen(false)
      setDraft(null)
      ui.toast('تم اعتماد جدول الأوقات بنجاح', 'success')
    } catch (err: any) {
      ui.toast(err.message || 'فشل اعتماد الجدول', 'error')
    } finally {
      setCommitting(false)
    }
  }

  const hours = Array.from({ length: 11 }, (_, i) => 8 + i)
  const todayIso = isoDayNow()
  const nowM = nowMin()
  const showNowLine = nowM >= DAY_START && nowM <= DAY_END

  return (
    <AppShell
      title="جدول الأوقات"
      subtitle={isAdmin ? 'توزيع الحصص والقاعات والتوليد التلقائي العادل' : 'حصصكم الأسبوعية بالساعات والقاعات'}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => window.print()}
                  className="arabic text-xs bg-surface border border-line hover:border-brand/40 text-ink px-3 py-2 rounded-xl font-medium transition">
            طباعة
          </button>
          {isAdmin && (
            <>
              <button onClick={() => setConfigOpen(true)}
                      className="arabic text-xs bg-surface border border-line hover:border-brand/40 text-ink px-3 py-2 rounded-xl font-medium transition">
                القاعات والبرنامج
              </button>
              <button onClick={() => { setGenOpen(true); if (!draft) void runGenerate('double') }}
                      className="arabic text-xs bg-accent hover:bg-amber-600 text-white px-3.5 py-2 rounded-xl font-semibold shadow-sm transition">
                ⚡ توليد تلقائي
              </button>
              <button onClick={() => setAddPreset({})}
                      className="arabic inline-flex items-center gap-1 text-xs bg-brand hover:bg-brand-hover text-white px-3.5 py-2 rounded-xl font-semibold shadow-sm transition">
                <PlusIcon className="w-3.5 h-3.5" /> حصة جديدة
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="arabic bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Filter & 3-View Switcher (Admin) */}
        {isAdmin && (
          <div className="flex items-center justify-between flex-wrap gap-3 bg-surface border border-line rounded-2xl p-3 shadow-card print:hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex bg-canvas rounded-xl p-1">
                {([
                  { key: 'teacher', label: 'حسب المعلم' },
                  { key: 'class',   label: 'حسب القسم' },
                  { key: 'room',    label: 'حسب القاعة' },
                ] as const).map(v => (
                  <button key={v.key} onClick={() => setViewBy(v.key)}
                          className={`arabic text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                            viewBy === v.key ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
                          }`}>
                    {v.label}
                  </button>
                ))}
              </div>

              {viewBy === 'teacher' && (
                <select value={activeTeacher} onChange={e => setFilterTeacher(e.target.value)}
                        className="arabic bg-canvas border border-line rounded-xl px-3 py-1.5 text-xs font-medium text-ink">
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || t.username} ({t.max_weekly_hours ?? 25}h)
                    </option>
                  ))}
                </select>
              )}
              {viewBy === 'class' && (
                <select value={activeClass} onChange={e => setFilterClass(e.target.value)}
                        className="arabic bg-canvas border border-line rounded-xl px-3 py-1.5 text-xs font-medium text-ink">
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
                </select>
              )}
              {viewBy === 'room' && (
                <select value={activeRoom} onChange={e => setFilterRoom(e.target.value)}
                        className="arabic bg-canvas border border-line rounded-xl px-3 py-1.5 text-xs font-medium text-ink">
                  {roomNames.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
            </div>

            {freeRoomsNow.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="arabic font-medium">قاعات شاغرة الآن: {freeRoomsNow.slice(0, 4).join('، ')}{freeRoomsNow.length > 4 ? ` (+${freeRoomsNow.length - 4})` : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* Weekly Grid */}
        <div className="bg-surface border border-line rounded-3xl overflow-auto shadow-card">
          <div className="min-w-[760px]">
            {/* Day headers */}
            <div className="grid border-b border-line bg-canvas/70" style={{ gridTemplateColumns: '64px repeat(6, 1fr)' }}>
              <div className="p-3" />
              {DAYS.map(d => (
                <div key={d.iso} className={`arabic p-3 text-center text-xs font-bold border-r border-line ${
                  d.iso === todayIso ? 'text-brand bg-brand-light/40' : 'text-ink-muted'
                }`}>
                  {d.label}
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="grid relative" style={{ gridTemplateColumns: '64px repeat(6, 1fr)', height: (DAY_END - DAY_START) * PX_PER_MIN }}>
              {/* Hour ruler */}
              <div className="relative bg-canvas/30">
                {hours.map(h => (
                  <div key={h} className="absolute inset-x-0 text-[10px] text-ink-subtle text-center num -mt-2"
                       style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }} dir="ltr">
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {DAYS.map(d => {
                const daySlots = visibleSlots.filter(s => s.day === d.iso)
                return (
                  <div key={d.iso} className="relative border-r border-line">
                    {/* Clickable hour cells */}
                    {hours.slice(0, -1).map(h => (
                      <button
                        key={h}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => isAdmin && setAddPreset({ day: d.iso, start: `${String(h).padStart(2, '0')}:00` })}
                        className="absolute inset-x-0 border-b border-line/60 hover:bg-brand-light/20 transition text-left"
                        style={{ top: (h * 60 - DAY_START) * PX_PER_MIN, height: 60 * PX_PER_MIN }}
                      />
                    ))}

                    {showNowLine && d.iso === todayIso && (
                      <div className="absolute inset-x-0 border-t-2 border-accent z-20 pointer-events-none"
                           style={{ top: (nowM - DAY_START) * PX_PER_MIN }} />
                    )}

                    {/* Slots */}
                    {daySlots.map(s => {
                      const top = (toMin(s.start) - DAY_START) * PX_PER_MIN
                      const height = Math.max(32, (toMin(s.end) - toMin(s.start)) * PX_PER_MIN - 2)
                      const st = subjectStyle(s.subject_code)
                      return (
                        <div
                          key={s.id}
                          style={{ top, height }}
                          className={`absolute inset-x-1 rounded-xl border px-2 py-1 z-10 overflow-hidden shadow-sm group ${st.block}`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="arabic text-xs font-bold leading-tight truncate">
                              {s.subject_name || s.label || 'حصة'}
                            </span>
                            {isAdmin && (
                              <div className="flex items-center gap-0.5 print:hidden">
                                <button
                                  type="button"
                                  title={s.is_pinned ? 'مثبّت (لن يغيّره التوليد التلقائي)' : 'تثبيت هذه الحصة'}
                                  onClick={async e => {
                                    e.stopPropagation()
                                    await api.timetable.togglePin(s.id)
                                    await qc.invalidateQueries({ queryKey: ['timetable'] })
                                  }}
                                  className={`p-0.5 rounded ${s.is_pinned ? 'text-amber-700' : 'opacity-0 group-hover:opacity-70 hover:opacity-100'}`}
                                >
                                  <LockIcon className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  title="حذف الحصة"
                                  onClick={async e => {
                                    e.stopPropagation()
                                    await api.timetable.delete(s.id)
                                    await qc.invalidateQueries({ queryKey: ['timetable'] })
                                  }}
                                  className="p-0.5 rounded opacity-0 group-hover:opacity-80 hover:text-rose-700"
                                >
                                  <XIcon className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="arabic text-[10px] opacity-85 truncate">
                            {viewBy === 'class' ? s.teacher_name : s.class_name}
                            {s.room ? ` · ${s.room}` : ''}
                          </div>
                          <div className="text-[9px] opacity-70 num" dir="ltr">{s.start}–{s.end}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Add Slot Modal */}
      {isAdmin && addPreset && (
        <AddSlotModal
          preset={addPreset}
          defaultTeacherId={viewBy === 'teacher' ? activeTeacher : ''}
          defaultClassId={viewBy === 'class' ? activeClass : ''}
          defaultRoom={viewBy === 'room' ? activeRoom : ''}
          teachers={teachers}
          classes={classes}
          subjects={subjects}
          rooms={roomNames}
          onClose={() => setAddPreset(null)}
          onCreated={async () => {
            setAddPreset(null)
            await qc.invalidateQueries({ queryKey: ['timetable'] })
          }}
        />
      )}

      {/* Rooms & Curriculum Modal */}
      {isAdmin && configOpen && (
        <RoomsCurriculumModal
          rooms={rooms}
          subjects={subjects}
          curricula={curricula}
          onClose={() => setConfigOpen(false)}
          onChanged={async () => {
            await qc.invalidateQueries({ queryKey: ['rooms'] })
            await qc.invalidateQueries({ queryKey: ['curriculum'] })
          }}
        />
      )}

      {/* Auto-Generate Timetable Modal */}
      {isAdmin && genOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setGenOpen(false)}>
          <div onClick={e => e.stopPropagation()}
               className="w-full max-w-2xl bg-surface rounded-3xl p-6 space-y-4 shadow-float max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="arabic text-lg font-bold text-ink">⚡ محرك توليد جدول الأوقات العادل</h3>
                <p className="arabic text-xs text-ink-muted">يحترم النصاب الأسبوعي لكل معلم، القاعات المتاحة، والحصص المثبّتة — بدون أي محاباة.</p>
              </div>
              <button onClick={() => setGenOpen(false)} className="text-ink-subtle hover:text-ink">✕</button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => void runGenerate('double')} disabled={generating}
                      className="arabic text-xs px-3.5 py-2 rounded-xl bg-brand-light text-brand hover:bg-brand-mid/50 font-semibold">
                نظام الفوجين (08–12 و 13–17)
              </button>
              <button onClick={() => void runGenerate('single')} disabled={generating}
                      className="arabic text-xs px-3.5 py-2 rounded-xl bg-canvas border border-line hover:border-brand/40 text-ink font-medium">
                نظام الحصة الواحدة (08–13)
              </button>
            </div>

            {generating ? (
              <div className="py-12 text-center">
                <div className="animate-spin w-7 h-7 border-4 border-brand border-t-transparent rounded-full mx-auto mb-2" />
                <p className="arabic text-xs text-ink-muted">جاري حساب أفضل توزيع متوازن…</p>
              </div>
            ) : draft && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-canvas rounded-2xl p-3 text-center">
                    <div className="text-2xl font-bold text-brand num">{draft.quality_score}/100</div>
                    <div className="arabic text-[11px] text-ink-muted">جودة التوزيع</div>
                  </div>
                  <div className="bg-canvas rounded-2xl p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-700 num">{draft.slots.length}</div>
                    <div className="arabic text-[11px] text-ink-muted">حصة مبرمجة</div>
                  </div>
                  <div className="bg-canvas rounded-2xl p-3 text-center">
                    <div className={`text-2xl font-bold num ${draft.unplaced.length ? 'text-rose-600' : 'text-ink'}`}>{draft.unplaced.length}</div>
                    <div className="arabic text-[11px] text-ink-muted">حصص غير مبرمجة</div>
                  </div>
                </div>

                {draft.warnings.length > 0 && (
                  <div className="bg-accent-soft border border-accent-light rounded-2xl p-3 space-y-1">
                    {draft.warnings.map((w, i) => (
                      <p key={i} className="arabic text-xs text-amber-900">⚠ {w}</p>
                    ))}
                  </div>
                )}

                {draft.unplaced.length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 space-y-1">
                    <p className="arabic text-xs font-bold text-rose-800">حصص تعذّرت برمجتها:</p>
                    {draft.unplaced.map((u, i) => (
                      <p key={i} className="arabic text-xs text-rose-700">
                        • {u.class_name} — {u.subject_name} ({u.teacher_name}, {u.hours}h): {u.reason}
                      </p>
                    ))}
                  </div>
                )}

                {draft.teacher_loads.length > 0 && (
                  <div className="border border-line rounded-2xl overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-canvas text-ink-muted">
                          <th className="arabic px-3 py-2 text-right">المعلم</th>
                          <th className="arabic px-2 py-2 text-center">النصاب</th>
                          <th className="arabic px-2 py-2 text-center">المبرمج</th>
                          <th className="arabic px-2 py-2 text-center">فراغات</th>
                          <th className="arabic px-2 py-2 text-center">السبت</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {draft.teacher_loads.map(t => (
                          <tr key={t.teacher_id}>
                            <td className="arabic px-3 py-2 font-medium text-ink">{t.teacher_name}</td>
                            <td className="px-2 py-2 text-center num">{t.max_weekly_hours}h</td>
                            <td className={`px-2 py-2 text-center font-bold num ${t.scheduled_hours > t.max_weekly_hours ? 'text-rose-600' : 'text-brand'}`}>
                              {t.scheduled_hours}h
                            </td>
                            <td className="px-2 py-2 text-center num text-ink-muted">{t.gap_hours}h</td>
                            <td className="px-2 py-2 text-center num text-ink-muted">{t.saturday_hours}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button onClick={() => void commitDraft()} disabled={committing || draft.slots.length === 0}
                          className="arabic flex-1 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold">
                    {committing ? 'جاري الاعتماد…' : 'اعتماد الجدول المقترح'}
                  </button>
                  <button onClick={() => setGenOpen(false)}
                          className="arabic px-4 py-2.5 border border-line rounded-xl text-sm text-ink-muted">
                    إغلاق
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}

function AddSlotModal({
  preset, defaultTeacherId, defaultClassId, defaultRoom,
  teachers, classes, subjects, rooms, onClose, onCreated,
}: {
  preset: { day?: number; start?: string }
  defaultTeacherId: string; defaultClassId: string; defaultRoom: string
  teachers: UserRow[]; classes: { id: string; name: string; year: string }[]; subjects: Subject[]; rooms: string[]
  onClose: () => void; onCreated: () => Promise<void>
}) {
  const [teacherId, setTeacherId] = useState(defaultTeacherId || teachers[0]?.id || '')
  const [classId, setClassId] = useState(defaultClassId)
  const [subjectId, setSubjectId] = useState('')
  const [day, setDay] = useState(preset.day ?? 1)
  const [start, setStart] = useState(preset.start ?? '08:00')
  const [end, setEnd] = useState(() => {
    const h = parseInt((preset.start ?? '08:00').split(':')[0], 10)
    return `${String(Math.min(18, h + 1)).padStart(2, '0')}:00`
  })
  const [room, setRoom] = useState(defaultRoom || rooms[0] || '')
  const [label, setLabel] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      await api.timetable.create({
        teacher_id: teacherId,
        class_id: classId || null,
        subject_id: subjectId || null,
        day, start, end, room, label,
      })
      await onCreated()
    } catch (e: any) {
      setErr(e.message || 'تعذّرت الإضافة')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-surface rounded-3xl p-6 space-y-3.5 shadow-float" dir="rtl">
        <h3 className="arabic text-base font-bold text-ink">حصة جديدة</h3>
        {err && <p className="arabic text-xs bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-xl">{err}</p>}
        <div>
          <label className="arabic block text-xs text-ink-muted mb-1">المعلم</label>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)} required
                  className="arabic w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm">
            {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name || t.username}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="arabic block text-xs text-ink-muted mb-1">القسم</label>
            <select value={classId} onChange={e => setClassId(e.target.value)}
                    className="arabic w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm">
              <option value="">—</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs text-ink-muted mb-1">المادة</label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
                    className="arabic w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm">
              <option value="">—</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="arabic block text-xs text-ink-muted mb-1">اليوم</label>
            <select value={day} onChange={e => setDay(Number(e.target.value))}
                    className="arabic w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm">
              {DAYS.map(d => <option key={d.iso} value={d.iso}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="arabic block text-xs text-ink-muted mb-1">القاعة</label>
            <input list="rooms-list" value={room} onChange={e => setRoom(e.target.value)}
                   className="arabic w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm" />
            <datalist id="rooms-list">
              {rooms.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="arabic block text-xs text-ink-muted mb-1">البداية</label>
            <input type="time" value={start} onChange={e => setStart(e.target.value)} required
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm num" />
          </div>
          <div>
            <label className="arabic block text-xs text-ink-muted mb-1">النهاية</label>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)} required
                   className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm num" />
          </div>
        </div>
        <div>
          <label className="arabic block text-xs text-ink-muted mb-1">تسمية حرة (اختياري)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="مثال: فرض مراقبة / دعم"
                 className="arabic w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={saving || !teacherId}
                  className="arabic flex-1 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold">
            {saving ? 'جاري الإضافة…' : 'إضافة الحصة'}
          </button>
          <button type="button" onClick={onClose}
                  className="arabic px-4 py-2.5 border border-line rounded-xl text-sm text-ink-muted">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}

function RoomsCurriculumModal({ rooms, subjects, curricula, onClose, onChanged }: {
  rooms: RoomRow[]; subjects: Subject[]; curricula: CurriculumRow[]
  onClose: () => void; onChanged: () => Promise<void>
}) {
  const [tab, setTab] = useState<'rooms' | 'curriculum'>('rooms')
  const [newRoom, setNewRoom] = useState('')
  const [roomType, setRoomType] = useState<'standard' | 'computer' | 'yard' | 'multipurpose'>('standard')
  const [level, setLevel] = useState(LEVELS[3])
  const [hoursMap, setHoursMap] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const c of curricula) m[`${c.level}|${c.subject_id}`] = c.weekly_hours
    return m
  })
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           className="w-full max-w-lg bg-surface rounded-3xl p-6 space-y-4 shadow-float max-h-[88vh] overflow-y-auto" dir="rtl">
        <div className="flex items-center justify-between">
          <h3 className="arabic text-base font-bold text-ink">إعدادات القاعات والبرنامج الأسبوعي</h3>
          <button onClick={onClose} className="text-ink-subtle hover:text-ink">✕</button>
        </div>
        <div className="inline-flex bg-canvas rounded-xl p-1">
          <button onClick={() => setTab('rooms')}
                  className={`arabic text-xs px-3 py-1.5 rounded-lg font-medium ${tab === 'rooms' ? 'bg-brand text-white' : 'text-ink-muted'}`}>
            القاعات ({rooms.length})
          </button>
          <button onClick={() => setTab('curriculum')}
                  className={`arabic text-xs px-3 py-1.5 rounded-lg font-medium ${tab === 'curriculum' ? 'bg-brand text-white' : 'text-ink-muted'}`}>
            ساعات المواد حسب المستوى
          </button>
        </div>

        {tab === 'rooms' ? (
          <div className="space-y-3">
            <form
              onSubmit={async e => {
                e.preventDefault()
                if (!newRoom.trim()) return
                await api.rooms.create(newRoom.trim(), roomType)
                setNewRoom('')
                await onChanged()
              }}
              className="flex gap-2"
            >
              <input value={newRoom} onChange={e => setNewRoom(e.target.value)} placeholder="اسم القاعة (مثال: قاعة 7)"
                     className="arabic flex-1 bg-canvas border border-line rounded-xl px-3 py-2 text-sm" />
              <select value={roomType} onChange={e => setRoomType(e.target.value as any)}
                      className="arabic bg-canvas border border-line rounded-xl px-2.5 py-2 text-xs">
                <option value="standard">عادية</option>
                <option value="computer">إعلامية</option>
                <option value="yard">رياضة</option>
                <option value="multipurpose">متعددة</option>
              </select>
              <button type="submit" className="arabic px-4 py-2 bg-brand text-white rounded-xl text-xs font-semibold">+</button>
            </form>
            <div className="divide-y divide-line border border-line rounded-2xl">
              {rooms.map(r => (
                <div key={r.id} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                  <span className="arabic font-medium text-ink">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="arabic text-[11px] bg-canvas text-ink-muted px-2 py-0.5 rounded-full">{r.room_type}</span>
                    <button onClick={async () => { await api.rooms.delete(r.id); await onChanged() }}
                            className="text-xs text-ink-subtle hover:text-rose-600">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <select value={level} onChange={e => setLevel(e.target.value)}
                    className="arabic w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm font-medium">
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <div className="divide-y divide-line border border-line rounded-2xl max-h-72 overflow-y-auto">
              {subjects.map(s => {
                const key = `${level}|${s.id}`
                return (
                  <div key={s.id} className="flex items-center justify-between px-3.5 py-2 text-xs">
                    <span className="arabic font-medium text-ink">{s.name_ar}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min={0} max={12} step={1} dir="ltr"
                        value={hoursMap[key] ?? 0}
                        onChange={e => setHoursMap(p => ({ ...p, [key]: Number(e.target.value) }))}
                        className="w-14 bg-canvas border border-line rounded-lg px-2 py-1 text-center num font-bold"
                      />
                      <span className="arabic text-ink-subtle">ساعة/أسبوع</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                try {
                  await api.curriculum.save(
                    subjects.map(s => ({
                      level,
                      subject_id: s.id,
                      weekly_hours: hoursMap[`${level}|${s.id}`] ?? 0,
                      block_size: (hoursMap[`${level}|${s.id}`] ?? 0) >= 5 ? 2 : 1,
                      cognitive_weight: ['arabe', 'math', 'francais', 'anglais', 'eveil'].includes(s.code) ? 'heavy' : 'light',
                      room_type: s.code === 'sport' ? 'yard' : 'standard',
                    }))
                  )
                  await onChanged()
                  onClose()
                } finally {
                  setSaving(false)
                }
              }}
              className="arabic w-full py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-sm font-semibold"
            >
              {saving ? 'جاري الحفظ…' : `حفظ برنامج ${level}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
