import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, SettingsData } from '../api/client'
import { useAuth } from '../auth'
import {
  SchoolIcon, ClockIcon, CalendarIcon, FolderIcon, ShieldIcon,
  UserIcon, KeyIcon, LogOutIcon, BookOpenIcon,
} from './icons'

export default function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin'

  const { data: settings } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: api.settings.get,
    staleTime: 5 * 60 * 1000,
  })

  const initial = (user?.full_name || user?.username || '؟').trim().charAt(0)

  const navItems = [
    { to: '/', label: 'الرئيسية', Icon: SchoolIcon, end: true },
    { to: '/timetable', label: 'جدول الأوقات', Icon: ClockIcon, end: false },
    { to: '/calendar', label: 'الروزنامة', Icon: CalendarIcon, end: false },
    { to: '/documents', label: 'الوثائق الرسمية', Icon: FolderIcon, end: false },
    ...(isAdmin ? [{ to: '/admin/classes', label: 'لوحة المدير', Icon: ShieldIcon, end: false }] : []),
    { to: '/profile', label: 'الملف الشخصي', Icon: UserIcon, end: false },
  ]

  return (
    <div className="min-h-screen bg-canvas text-ink flex" dir="rtl">
      {/* ── Desktop RTL Sidebar ── */}
      <aside className="hidden md:flex md:flex-col w-64 bg-surface border-l border-line sticky top-0 h-screen flex-shrink-0 print:hidden">
        {/* Brand mark */}
        <div className="px-5 py-5 border-b border-line">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 text-right w-full group">
            <span className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shadow-sm flex-shrink-0 group-hover:bg-brand-hover transition">
              <BookOpenIcon className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="arabic block text-base font-bold text-ink leading-tight">دفتر الأعداد</span>
              <span className="arabic block text-[11px] text-ink-muted truncate">
                {settings?.school_name || 'المدرسة الابتدائية'}
              </span>
            </span>
          </button>
          {settings?.active_year && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium bg-brand-light text-brand px-2.5 py-1 rounded-full num">
              <span className="w-1.5 h-1.5 rounded-full bg-brand" />
              السنة الدراسية {settings.active_year}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `arabic flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink hover:bg-canvas'
                }`
              }
            >
              <item.Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-line space-y-1">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <span className="w-9 h-9 rounded-xl bg-brand-light text-brand font-bold flex items-center justify-center text-sm flex-shrink-0">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="arabic text-xs font-bold text-ink truncate">{user?.full_name || user?.username}</p>
              <p className="arabic text-[11px] text-ink-subtle">{isAdmin ? 'مدير المدرسة' : 'معلم'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 pt-1">
            <button
              onClick={() => navigate('/change-password')}
              className="arabic flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-ink-muted hover:text-ink hover:bg-canvas transition"
            >
              <KeyIcon className="w-3.5 h-3.5" /> كلمة المرور
            </button>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="arabic flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 transition"
            >
              <LogOutIcon className="w-3.5 h-3.5" /> خروج
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content Column ── */}
      <div className="flex-1 min-w-0 flex flex-col pb-20 md:pb-8">
        {(title || actions) && (
          <header className="bg-surface/90 backdrop-blur border-b border-line px-4 md:px-8 py-4 sticky top-0 z-20 print:hidden">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
              <div className="min-w-0">
                {title && <h1 className="arabic text-lg md:text-xl font-bold text-ink truncate">{title}</h1>}
                {subtitle && <p className="arabic text-xs text-ink-muted mt-0.5 truncate">{subtitle}</p>}
              </div>
              {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
            </div>
          </header>
        )}
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
