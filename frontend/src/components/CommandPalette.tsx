import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, YearGroup } from '../api/client'
import { useAuth } from '../auth'
import {
  SearchIcon, SchoolIcon, ClockIcon, CalendarIcon, FolderIcon,
  ShieldIcon, UserIcon, UsersIcon, LinkIcon, GridIcon, SettingsIcon,
  KeyIcon, XIcon, ChevronLeftIcon, FileIcon,
} from './icons'

interface PaletteItem {
  id: string
  label: string
  hint?: string
  group: string
  to: string
  Icon: React.ComponentType<{ className?: string }>
}

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  const { data: years = [] } = useQuery<YearGroup[]>({
    queryKey: ['classes'],
    queryFn: api.classes.list,
    enabled: open,
    staleTime: 60 * 1000,
  })

  const items = useMemo<PaletteItem[]>(() => {
    const nav: PaletteItem[] = [
      { id: 'home', label: 'الرئيسية', hint: 'لوحة المتابعة', group: 'التنقل', to: '/', Icon: SchoolIcon },
      { id: 'exams', label: 'خزينة الامتحانات', hint: 'أرشيف السنوات، المحرر، وبنك التمارين', group: 'التنقل', to: '/exams', Icon: FileIcon },
      { id: 'timetable', label: 'جدول الأوقات', hint: 'الحصص والقاعات', group: 'التنقل', to: '/timetable', Icon: ClockIcon },
      { id: 'calendar', label: 'الروزنامة', hint: 'المواعيد والأحداث', group: 'التنقل', to: '/calendar', Icon: CalendarIcon },
      { id: 'documents', label: 'الوثائق الرسمية', hint: 'المذكرات والمنشورات', group: 'التنقل', to: '/documents', Icon: FolderIcon },
      { id: 'profile', label: 'الملف الشخصي', hint: 'الاسم والرتبة', group: 'التنقل', to: '/profile', Icon: UserIcon },
      { id: 'pw', label: 'تغيير كلمة المرور', group: 'التنقل', to: '/change-password', Icon: KeyIcon },
    ]
    const admin: PaletteItem[] = isAdmin ? [
      { id: 'adm-classes', label: 'إدارة الأقسام', hint: 'إنشاء واستيراد PDF', group: 'لوحة المدير', to: '/admin/classes', Icon: ShieldIcon },
      { id: 'adm-users', label: 'حسابات المعلمين', hint: 'النصاب الأسبوعي', group: 'لوحة المدير', to: '/admin/users', Icon: UsersIcon },
      { id: 'adm-assign', label: 'مصفوفة الإسناد', hint: 'ربط المعلمين بالمواد', group: 'لوحة المدير', to: '/admin/assignments', Icon: LinkIcon },
      { id: 'adm-tpl', label: 'شبكات التقييم', hint: 'قوالب الامتحانات', group: 'لوحة المدير', to: '/admin/templates', Icon: GridIcon },
      { id: 'adm-set', label: 'إعدادات المدرسة', hint: 'السنة الدراسية والمندوبية', group: 'لوحة المدير', to: '/admin/settings', Icon: SettingsIcon },
    ] : []
    const cls: PaletteItem[] = years.flatMap(y =>
      y.classes.map(c => ({
        id: `cls-${c.id}`,
        label: c.name,
        hint: `${c.level ? c.level + ' · ' : ''}${c.student_count} تلميذ · ${y.label}`,
        group: 'الأقسام',
        to: `/classes/${c.id}`,
        Icon: SchoolIcon,
      }))
    )
    return [...cls, ...nav, ...admin]
  }, [years, isAdmin])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 10)
    return items.filter(it =>
      it.label.toLowerCase().includes(q) ||
      (it.hint?.toLowerCase().includes(q) ?? false) ||
      it.group.toLowerCase().includes(q)
    ).slice(0, 12)
  }, [items, query])

  useEffect(() => { setActiveIdx(0) }, [query, open])
  useEffect(() => { if (!open) setQuery('') }, [open])

  if (!open) return null

  function go(item: PaletteItem) {
    onClose()
    navigate(item.to)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-ink/35 backdrop-blur-[2px] px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-full max-w-lg bg-surface border border-line rounded-2xl shadow-float overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)) }
          if (e.key === 'Enter' && filtered[activeIdx]) { e.preventDefault(); go(filtered[activeIdx]) }
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <SearchIcon className="w-4 h-4 text-ink-subtle flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="انتقال سريع إلى قسم، صفحة، أو أداة…"
            className="arabic flex-1 bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-ink-subtle hover:text-ink hover:bg-canvas transition"
            aria-label="إغلاق"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="arabic text-center text-xs text-ink-subtle py-10">لا نتائج مطابقة لـ «{query}»</p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => go(item)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-right transition ${
                  i === activeIdx ? 'bg-brand-light/70 text-brand' : 'text-ink hover:bg-canvas'
                }`}
              >
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  i === activeIdx ? 'bg-brand text-white' : 'bg-canvas text-ink-muted'
                }`}>
                  <item.Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="arabic block text-sm font-semibold truncate">{item.label}</span>
                  {item.hint && <span className="arabic block text-[11px] text-ink-subtle truncate">{item.hint}</span>}
                </span>
                <span className="arabic text-[10px] text-ink-subtle bg-canvas px-2 py-0.5 rounded-full flex-shrink-0">
                  {item.group}
                </span>
                <ChevronLeftIcon className="w-3.5 h-3.5 text-ink-subtle flex-shrink-0" />
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 bg-canvas/70 border-t border-line flex items-center justify-between text-[11px] text-ink-subtle">
          <span className="arabic">استعمل ↑ ↓ للتنقل و Enter للفتح</span>
          <kbd className="font-mono bg-surface border border-line px-1.5 py-0.5 rounded text-[10px]">ESC</kbd>
        </div>
      </div>
    </div>
  )
}
