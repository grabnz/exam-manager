import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { UsersIcon, SchoolIcon, LinkIcon, GridIcon, ShieldIcon } from '../../components/icons'

const TABS = [
  { to: '/admin/users',       label: 'الحسابات',      Icon: UsersIcon },
  { to: '/admin/classes',     label: 'الأقسام',       Icon: SchoolIcon },
  { to: '/admin/assignments', label: 'الإسناد',       Icon: LinkIcon },
  { to: '/admin/templates',   label: 'شبكات التقييم', Icon: GridIcon },
  { to: '/admin/settings',    label: 'الإعدادات',     Icon: ShieldIcon },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gray-50 pb-16 md:pb-0">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 pt-4">
        <button onClick={() => navigate('/')}
                className="arabic text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3">
          → الرئيسية
        </button>
        <h1 className="arabic text-xl font-bold text-gray-900" dir="rtl">لوحة المدير</h1>
        <nav className="flex gap-1 mt-3 -mb-px overflow-x-auto scrollbar-hide" dir="rtl">
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `arabic flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 whitespace-nowrap transition ${
                  isActive
                    ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`
              }
            >
              <t.Icon className="w-4 h-4" /> {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
