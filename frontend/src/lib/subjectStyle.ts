// Visual identity per subject — stroke icon + soft pastel palette
// (clean card style: light tinted card, circular icon badge).
import type { ComponentType, SVGProps } from 'react'
import {
  BookOpenIcon, CalculatorIcon, FlaskIcon, PenLineIcon, GlobeIcon,
  CrescentIcon, ScaleIcon, LandmarkIcon, MapIcon, PaletteIcon,
  MusicIcon, ActivityIcon, FileIcon,
} from '../components/icons'

export interface SubjectStyle {
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  card: string     // pastel card surface
  badge: string    // circular icon badge
  text: string     // accent text
  chip: string     // compact chip
  block: string    // timetable block
}

const STYLES: Record<string, SubjectStyle> = {
  arabe: {
    Icon: BookOpenIcon,
    card: 'bg-emerald-50/70 border-emerald-100', badge: 'bg-emerald-100 text-emerald-600',
    text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700',
    block: 'bg-emerald-100/80 border-emerald-300 text-emerald-900',
  },
  math: {
    Icon: CalculatorIcon,
    card: 'bg-orange-50/70 border-orange-100', badge: 'bg-orange-100 text-orange-600',
    text: 'text-orange-700', chip: 'bg-orange-50 text-orange-700',
    block: 'bg-orange-100/80 border-orange-300 text-orange-900',
  },
  eveil: {
    Icon: FlaskIcon,
    card: 'bg-cyan-50/70 border-cyan-100', badge: 'bg-cyan-100 text-cyan-600',
    text: 'text-cyan-700', chip: 'bg-cyan-50 text-cyan-700',
    block: 'bg-cyan-100/80 border-cyan-300 text-cyan-900',
  },
  francais: {
    Icon: PenLineIcon,
    card: 'bg-blue-50/70 border-blue-100', badge: 'bg-blue-100 text-blue-600',
    text: 'text-blue-700', chip: 'bg-blue-50 text-blue-700',
    block: 'bg-blue-100/80 border-blue-300 text-blue-900',
  },
  anglais: {
    Icon: GlobeIcon,
    card: 'bg-violet-50/70 border-violet-100', badge: 'bg-violet-100 text-violet-600',
    text: 'text-violet-700', chip: 'bg-violet-50 text-violet-700',
    block: 'bg-violet-100/80 border-violet-300 text-violet-900',
  },
  islamique: {
    Icon: CrescentIcon,
    card: 'bg-green-50/70 border-green-100', badge: 'bg-green-100 text-green-700',
    text: 'text-green-700', chip: 'bg-green-50 text-green-700',
    block: 'bg-green-100/80 border-green-300 text-green-900',
  },
  civique: {
    Icon: ScaleIcon,
    card: 'bg-amber-50/70 border-amber-100', badge: 'bg-amber-100 text-amber-600',
    text: 'text-amber-700', chip: 'bg-amber-50 text-amber-700',
    block: 'bg-amber-100/80 border-amber-300 text-amber-900',
  },
  histoire: {
    Icon: LandmarkIcon,
    card: 'bg-rose-50/70 border-rose-100', badge: 'bg-rose-100 text-rose-600',
    text: 'text-rose-700', chip: 'bg-rose-50 text-rose-700',
    block: 'bg-rose-100/80 border-rose-300 text-rose-900',
  },
  geographie: {
    Icon: MapIcon,
    card: 'bg-sky-50/70 border-sky-100', badge: 'bg-sky-100 text-sky-600',
    text: 'text-sky-700', chip: 'bg-sky-50 text-sky-700',
    block: 'bg-sky-100/80 border-sky-300 text-sky-900',
  },
  arts: {
    Icon: PaletteIcon,
    card: 'bg-fuchsia-50/70 border-fuchsia-100', badge: 'bg-fuchsia-100 text-fuchsia-600',
    text: 'text-fuchsia-700', chip: 'bg-fuchsia-50 text-fuchsia-700',
    block: 'bg-fuchsia-100/80 border-fuchsia-300 text-fuchsia-900',
  },
  musique: {
    Icon: MusicIcon,
    card: 'bg-purple-50/70 border-purple-100', badge: 'bg-purple-100 text-purple-600',
    text: 'text-purple-700', chip: 'bg-purple-50 text-purple-700',
    block: 'bg-purple-100/80 border-purple-300 text-purple-900',
  },
  sport: {
    Icon: ActivityIcon,
    card: 'bg-lime-50/70 border-lime-100', badge: 'bg-lime-100 text-lime-700',
    text: 'text-lime-700', chip: 'bg-lime-50 text-lime-700',
    block: 'bg-lime-100/80 border-lime-300 text-lime-900',
  },
}

const DEFAULT: SubjectStyle = {
  Icon: FileIcon,
  card: 'bg-slate-50/70 border-slate-200', badge: 'bg-slate-100 text-slate-500',
  text: 'text-slate-600', chip: 'bg-slate-100 text-slate-600',
  block: 'bg-slate-100/80 border-slate-300 text-slate-800',
}

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
