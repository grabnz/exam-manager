import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { SchoolIcon, ClockIcon, CalendarIcon, FolderIcon, ShieldIcon, UserIcon } from './icons'

export default function BottomNav() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  if (!user) return null
  // Keep score entry, print, login, and password change full-screen
  if (
    pathname.startsWith('/sessions/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/change-password')
  ) {
    return null
  }

  const items = [
    { to: '/', label: 'الرئيسية', Icon: SchoolIcon, end: true },
    { to: '/timetable', label: 'الأوقات', Icon: ClockIcon, end: false },
    { to: '/calendar', label: 'الروزنامة', Icon: CalendarIcon, end: false },
    { to: '/documents', label: 'الوثائق', Icon: FolderIcon, end: false },
    user.role === 'admin'
      ? { to: '/admin/classes', label: 'المدير', Icon: ShieldIcon, end: false }
      : { to: '/profile', label: 'ملفي', Icon: UserIcon, end: false },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 safe-bottom print:hidden" dir="rtl">
      <div className="grid grid-cols-5">
        {items.map(it => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `arabic flex flex-col items-center justify-center py-2 text-[11px] font-medium transition ${
                isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-700'
              }`
            }
          >
            <it.Icon className="w-5 h-5 mb-0.5" />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
