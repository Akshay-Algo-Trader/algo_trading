import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'

// ─── SVG icons ────────────────────────────────────────────────────────────────
function Icon({ d, d2 }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  )
}

const NAV_ITEMS = [
  {
    path: '/admin/dashboard',
    label: 'Dashboard',
    icon: <Icon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
  },
  {
    path: '/admin/customers',
    label: 'Customers',
    icon: <Icon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
  },
  {
    path: '/admin/strategies',
    label: 'Strategies',
    icon: <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
  },
  {
    path: '/admin/kite-config',
    label: 'Kite Config',
    icon: <Icon d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />,
  },
  {
    path: '/admin/sessions',
    label: 'Sessions',
    icon: <Icon d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" d2="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  },
  {
    path: '/admin/orders',
    label: 'Orders',
    icon: <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />,
  },
  {
    path: '/admin/logs',
    label: 'Logs',
    icon: <Icon d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
  },
]

const BREADCRUMB_MAP = {
  admin: 'Admin',
  dashboard: 'Dashboard',
  customers: 'Customers',
  strategies: 'Strategies',
  'kite-config': 'Kite Config',
  sessions: 'Sessions',
  orders: 'Orders',
  logs: 'Logs',
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}') }
    catch { return {} }
  })()

  const crumbs = location.pathname
    .split('/')
    .filter(Boolean)
    .map(s => BREADCRUMB_MAP[s] ?? s)

  function handleLogout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    navigate('/admin/login')
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside
        className="flex flex-col flex-shrink-0 transition-[width] duration-200 overflow-hidden"
        style={{ width: collapsed ? 64 : 240, background: '#1a1a2e' }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-16 px-4 flex-shrink-0 border-b"
          style={{ borderColor: '#16213e' }}
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm text-white" style={{ background: '#eb5202' }}>
            AT
          </div>
          {!collapsed && (
            <span className="ml-3 font-semibold text-white text-sm tracking-wide whitespace-nowrap">
              AlgoTrader
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
          {NAV_ITEMS.map(({ path, label, icon }) => (
            <NavLink
              key={path}
              to={path}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-white border-l-2 border-[#eb5202]'
                    : 'text-[#8b8fa8] hover:text-white hover:bg-[#16213e]'
                }`
              }
              style={({ isActive }) => isActive ? { background: '#16213e' } : {}}
            >
              <span className="flex-shrink-0">{icon}</span>
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t p-3 flex-shrink-0" style={{ borderColor: '#16213e' }}>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center justify-center gap-2 text-[#8b8fa8] hover:text-white py-1 text-xs transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {collapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />}
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-sm text-gray-400">
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">/</span>}
                <span className={i === crumbs.length - 1 ? 'text-gray-800 font-medium' : ''}>
                  {crumb}
                </span>
              </span>
            ))}
          </nav>

          {/* User + logout */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                style={{ background: '#eb5202' }}
              >
                {(user?.email?.[0] ?? 'A').toUpperCase()}
              </div>
              <span className="text-sm text-gray-700 hidden sm:block">{user?.email ?? 'Admin'}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
