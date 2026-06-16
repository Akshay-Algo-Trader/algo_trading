import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTradingStore } from '../store/tradingStore'
import axiosInstance from '../api/axiosInstance'

function Icon({ d, d2 }) {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  )
}

const NAV_ITEMS = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: <Icon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
  },
  {
    path: '/market',
    label: 'Market',
    icon: <Icon d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />,
  },
  {
    path: '/strategies',
    label: 'Strategies',
    icon: <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
  },
  {
    path: '/replay',
    label: 'Replay',
    icon: <Icon d="M14.752 11.168l-6.518-3.76A1 1 0 007 8.232v7.536a1 1 0 001.234.97l6.518-1.882a1 1 0 00.748-.97v-1.748a1 1 0 00-.748-.97z" />,
  },
  {
    path: '/portfolio',
    label: 'Portfolio',
    icon: <Icon d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  },
  {
    path: '/history',
    label: 'History',
    icon: <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
  },
  {
    path: '/backtest',
    label: 'Backtest',
    icon: <Icon d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  },
]

function ConfirmLiveModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="font-bold text-gray-900 text-lg mb-2">Switch to Live Trading?</h2>
        <p className="text-sm text-gray-500 mb-5">
          Live mode uses <strong>real money</strong>. Orders will be placed on your connected Kite account.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
            Yes, go Live
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CustomerLayout() {
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const { mode, setMode, kiteConnected, setKiteConnected } = useTradingStore()
  const [showConfirm, setShowConfirm] = useState(false)

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}') }
    catch { return {} }
  })()

  // Fetch kite connection status once on mount
  useEffect(() => {
    axiosInstance.get('/api/customer/dashboard')
      .then(r => setKiteConnected(r.data?.kite?.is_connected === true))
      .catch(() => setKiteConnected(false))
  }, [setKiteConnected])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function handleModeClick(newMode) {
    if (newMode === mode) return
    if (newMode === 'live') {
      if (!kiteConnected) return
      setShowConfirm(true)
    } else {
      setMode('paper')
    }
  }

  const isLive = mode === 'live'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {showConfirm && (
        <ConfirmLiveModal
          onConfirm={() => { setMode('live'); setShowConfirm(false) }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* ── Top Navbar ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-6 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                AT
              </div>
              <span className="font-semibold text-gray-900 text-sm hidden sm:block">AlgoTrader</span>
            </div>

            {/* Nav links */}
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map(({ path, label, icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`
                  }
                >
                  {icon}
                  <span className="hidden md:block">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right: mode toggle + user + logout */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Paper / Live toggle */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
              <button
                onClick={() => handleModeClick('paper')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  !isLive ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!isLive ? 'bg-blue-200' : 'bg-gray-400'}`} />
                Paper
              </button>
              {kiteConnected && (
                <button
                  onClick={() => handleModeClick('live')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isLive ? 'bg-green-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-green-200' : 'bg-gray-400'}`} />
                  Live
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-semibold flex-shrink-0">
                {(user?.email?.[0] ?? 'U').toUpperCase()}
              </div>
              <span className="text-sm text-gray-700 hidden lg:block max-w-[160px] truncate">{user?.email ?? 'User'}</span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
              title="Logout"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:block">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mode Banner ── */}
      {isLive ? (
        <div className="bg-green-600 text-white text-xs text-center py-1.5 font-medium flex-shrink-0">
          Live Trading Mode — real money at risk. Trade responsibly.
        </div>
      ) : (
        <div className="bg-blue-600 text-white text-xs text-center py-1.5 font-medium flex-shrink-0">
          Paper Trading Mode — no real money. Simulated orders only.
        </div>
      )}

      {/* ── Page Content ── */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
