// Visual identity per subject — icon + gradient for the dashboard cards
// (inspired by school-app subject tiles).

export interface SubjectStyle {
  icon: string
  gradient: string   // tailwind gradient classes
  chip: string       // soft chip colors for compact contexts
}

const STYLES: Record<string, SubjectStyle> = {
  arabe:      { icon: '📖', gradient: 'from-emerald-500 to-green-600',  chip: 'bg-emerald-50 text-emerald-700' },
  math:       { icon: '➗', gradient: 'from-orange-400 to-amber-500',   chip: 'bg-orange-50 text-orange-700' },
  eveil:      { icon: '🔬', gradient: 'from-cyan-500 to-teal-600',      chip: 'bg-cyan-50 text-cyan-700' },
  francais:   { icon: '🖋️', gradient: 'from-blue-500 to-indigo-600',    chip: 'bg-blue-50 text-blue-700' },
  anglais:    { icon: '🗣️', gradient: 'from-violet-500 to-purple-600',  chip: 'bg-violet-50 text-violet-700' },
  islamique:  { icon: '🕌', gradient: 'from-green-600 to-emerald-700',  chip: 'bg-green-50 text-green-700' },
  civique:    { icon: '⚖️', gradient: 'from-amber-500 to-yellow-600',   chip: 'bg-amber-50 text-amber-700' },
  histoire:   { icon: '🏛️', gradient: 'from-rose-500 to-pink-600',      chip: 'bg-rose-50 text-rose-700' },
  geographie: { icon: '🗺️', gradient: 'from-sky-500 to-blue-600',       chip: 'bg-sky-50 text-sky-700' },
  arts:       { icon: '🎨', gradient: 'from-fuchsia-500 to-pink-600',   chip: 'bg-fuchsia-50 text-fuchsia-700' },
  musique:    { icon: '🎵', gradient: 'from-purple-500 to-violet-600',  chip: 'bg-purple-50 text-purple-700' },
  sport:      { icon: '⚽', gradient: 'from-lime-500 to-green-500',     chip: 'bg-lime-50 text-lime-700' },
}

const DEFAULT: SubjectStyle = { icon: '📋', gradient: 'from-slate-500 to-gray-600', chip: 'bg-gray-100 text-gray-600' }

export function subjectStyle(code: string | null | undefined): SubjectStyle {
  return (code && STYLES[code]) || DEFAULT
}

/** "منذ 5 دقائق" style relative time for activity feeds. */
export function relativeTimeAr(iso: string): string {
  const diff = (Date.now() - new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).getTime()) / 1000
  if (diff < 60) return 'الآن'
  const mins = Math.floor(diff / 60)
  if (mins < 60) return mins === 1 ? 'منذ دقيقة' : mins === 2 ? 'منذ دقيقتين' : `منذ ${mins} دقيقة`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours === 1 ? 'منذ ساعة' : hours === 2 ? 'منذ ساعتين' : `منذ ${hours} ساعات`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'أمس' : days === 2 ? 'منذ يومين' : `منذ ${days} أيام`
}
