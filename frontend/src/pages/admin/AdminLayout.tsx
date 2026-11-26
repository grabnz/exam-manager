import { NavLink, Outlet } from 'react-router-dom'
import AppShell from '../../components/AppShell'
import { UsersIcon, SchoolIcon, LinkIcon, GridIcon, ShieldIcon } from '../../components/icons'

const TABS = [
  { to: '/admin/classes',     label: 'الأقسام',       Icon: SchoolIcon },
  { to: '/admin/users',       label: 'الحسابات',      Icon: UsersIcon },
  { to: '/admin/assignments', label: 'الإسناد',       Icon: LinkIcon },
  { to: '/admin/templates',   label: 'شبكات التقييم', Icon: GridIcon },
  { to: '/admin/settings',    label: 'الإعدادات',     Icon: ShieldIcon },
]

export default function AdminLayout() {
  return (
    <AppShell title="لوحة المدير" subtitle="إدارة الأقسام، حسابات المعلمين، الإسناد، وشبكات التقييم">
      <div className="max-w-4xl space-y-6">
        <nav className="flex gap-1.5 p-1.5 bg-surface border border-line rounded-2xl shadow-card overflow-x-auto scrollbar-hide" dir="rtl">
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `arabic flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-xl whitespace-nowrap transition ${
                  isActive
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink hover:bg-canvas'
                }`
              }
            >
              <t.Icon className="w-4 h-4" /> {t.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </AppShell>
  )
}
