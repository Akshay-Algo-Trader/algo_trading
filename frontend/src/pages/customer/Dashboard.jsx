import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import { useTradingStore } from '../../store/tradingStore'

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }) {
  const map = {
    COMPLETE: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    OPEN: 'bg-blue-100 text-blue-700',
    EXECUTED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-gray-100 text-gray-600',
  }
  const s = (status || '').toUpperCase()
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[s] || 'bg-gray-100 text-gray-600'}`}>
      {s || '—'}
    </span>
  )
}


function KiteStatusCard({ kite }) {
  const connected = kite?.is_connected === true
  const hasCredentials = !!kite

  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${connected ? 'border-green-200' : 'border-gray-200'}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Kite Account</p>
      <div className="mt-2 flex items-center gap-2">
        {connected ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
            <span className="font-semibold text-green-700 text-sm">Connected</span>
          </>
        ) : (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
            <span className="font-semibold text-gray-500 text-sm">
              {hasCredentials ? 'Credentials set, not authorised' : 'Not configured'}
            </span>
          </>
        )}
      </div>
      {connected && kite?.token_generated_at && (
        <p className="text-xs text-gray-400 mt-1">
          Token: {fmtDate(kite.token_generated_at)}
        </p>
      )}
      {!connected && (
        <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
          Contact your admin to connect Kite credentials.
        </p>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { mode, setKiteConnected } = useTradingStore()
  const [data, setData] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [dashRes, ordersRes] = await Promise.all([
        axiosInstance.get('/api/customer/dashboard'),
        axiosInstance.get(`/api/customer/orders?mode=${mode}`),
      ])
      setData(dashRes.data)
      // Keep global kiteConnected in sync with fresh dashboard data
      setKiteConnected(dashRes.data?.kite?.is_connected === true)
      const raw = ordersRes.data.orders
      const list = mode === 'live' ? (raw.live || []) : (raw.paper || [])
      setOrders(list.slice(0, 5))
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [mode, setKiteConnected])

  useEffect(() => { load() }, [load])

  async function handleStopSession() {
    setSessionLoading(true)
    try {
      await axiosInstance.post('/api/customer/session/stop')
      await load()
    } catch {
      setError('Failed to stop session.')
    } finally {
      setSessionLoading(false)
    }
  }

  const isLive = mode === 'live'
  const kite = data?.kite
  const kiteConnected = kite?.is_connected === true
  const va = data?.virtual_account
  const session = data?.active_session
  const pnl = va?.total_realised_pnl ?? 0
  const margins = data?.margins

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading dashboard…</div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of your trading activity</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* KPI cards — 4 columns on large screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Balance / Portfolio value */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            {isLive ? 'Kite Portfolio Value' : 'Virtual Balance'}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {isLive ? fmt(data?.portfolio_value) : fmt(va?.balance)}
          </p>
          {!isLive && va && (
            <p className="text-xs text-gray-400 mt-1">Initial: {fmt(va.initial_balance)}</p>
          )}
          {isLive && data?.portfolio_value == null && (
            <p className="text-xs text-gray-400 mt-1">Fetched from Kite holdings</p>
          )}
        </div>

        {/* P&L */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Realised P&amp;L</p>
          <p className={`text-2xl font-bold mt-1 ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {pnl >= 0 ? '+' : ''}{fmt(pnl)}
          </p>
          <p className="text-xs text-gray-400 mt-1">All-time cumulative</p>
        </div>

        {/* Active Session */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Session</p>
          {session ? (
            <div className="mt-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                <span className="font-semibold text-gray-900 text-sm">Active</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${session.mode === 'live' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {session.mode}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Started {fmtDate(session.started_at)}</p>
              <button
                onClick={handleStopSession}
                disabled={sessionLoading}
                className="mt-3 w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {sessionLoading ? 'Stopping…' : 'Stop Session'}
              </button>
            </div>
          ) : (
            <div className="mt-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                <span className="text-gray-500 text-sm">No active session</span>
              </div>
              <Link
                to="/strategies"
                className="mt-3 inline-block w-full text-center bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Activate a Strategy →
              </Link>
            </div>
          )}
        </div>

        {/* Kite connection status */}
        <KiteStatusCard kite={kite} />
      </div>

      {/* Kite margin details — shown whenever Kite is connected */}
      {kiteConnected && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Kite Margin (Equity)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-green-100 p-5 shadow-sm">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Available Margin</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {margins?.available_margin != null ? fmt(margins.available_margin) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Net usable margin</p>
            </div>
            <div className="bg-white rounded-xl border border-red-100 p-5 shadow-sm">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Used Margin</p>
              <p className="text-2xl font-bold text-red-500 mt-1">
                {margins?.used_margin != null ? fmt(margins.used_margin) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Total debits / blocked</p>
            </div>
            <div className="bg-white rounded-xl border border-blue-100 p-5 shadow-sm">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Available Cash</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {margins?.available_cash != null ? fmt(margins.available_cash) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Ledger cash balance</p>
            </div>
          </div>
        </div>
      )}

      {/* Kite not connected + live mode warning */}
      {isLive && !kiteConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">Kite not connected</p>
            <p className="text-sm text-amber-700 mt-0.5">Your Kite account is not authorised. Live trading is disabled. Contact your admin to set up Kite credentials.</p>
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">
            Recent Orders
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${isLive ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {isLive ? 'Live' : 'Paper'}
            </span>
          </h2>
          <Link to="/history" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all →</Link>
        </div>

        {orders.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No {isLive ? 'live' : 'paper'} orders yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Symbol', 'Type', 'Qty', 'Price', 'Status', 'Time'].map(h => (
                    <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o, i) => (
                  <tr key={o.id ?? i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{o.symbol || o.tradingsymbol || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold ${(o.transaction_type || '').toUpperCase() === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                        {o.transaction_type || o.order_type || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{o.quantity ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{o.price != null ? fmt(o.price) : '—'}</td>
                    <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(o.created_at || o.placed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
