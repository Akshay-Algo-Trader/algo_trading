import { useState, useEffect, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import { useTradingStore } from '../../store/tradingStore'

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatusBadge({ status }) {
  const map = {
    COMPLETE: 'bg-green-100 text-green-700',
    EXECUTED: 'bg-green-100 text-green-700',
    FILLED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    OPEN: 'bg-blue-100 text-blue-700',
    CANCELLED: 'bg-gray-100 text-gray-600',
  }
  const s = (status || '').toUpperCase()
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[s] || 'bg-gray-100 text-gray-600'}`}>
      {s || '—'}
    </span>
  )
}

function PnlCell({ value }) {
  if (value == null) return <span className="text-gray-400">—</span>
  const pos = value >= 0
  return (
    <span className={`font-semibold text-sm ${pos ? 'text-green-600' : 'text-red-600'}`}>
      {pos ? '+' : ''}{fmt(value)}
    </span>
  )
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function History() {
  const { mode } = useTradingStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await axiosInstance.get(`/api/customer/orders?mode=${mode}`)
      const raw = data.orders
      setOrders(mode === 'live' ? (raw.live || []) : (raw.paper || []))
    } catch {
      setError('Failed to load order history.')
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { load() }, [load])

  // Summary stats
  const totalOrders = orders.length
  const executed = orders.filter(o => ['COMPLETE', 'EXECUTED', 'FILLED'].includes((o.status || '').toUpperCase()))
  const totalPnl = executed.reduce((sum, o) => sum + (o.pnl ?? 0), 0)

  // Group by session for P&L summary
  const sessionMap = {}
  for (const o of orders) {
    const sid = o.session_id ?? 'unknown'
    if (!sessionMap[sid]) sessionMap[sid] = { orders: [], pnl: 0 }
    sessionMap[sid].orders.push(o)
    sessionMap[sid].pnl += o.pnl ?? 0
  }
  const sessions = Object.entries(sessionMap)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Order History</h1>
        <p className="text-sm text-gray-500 mt-0.5">Complete record of all your orders</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total Orders" value={totalOrders} />
        <SummaryCard label="Executed" value={executed.length} />
        <SummaryCard
          label="Realised P&L"
          value={
            <span className={totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
              {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)}
            </span>
          }
        />
        <SummaryCard label="Sessions" value={sessions.length} />
      </div>

      {/* P&L by session */}
      {sessions.length > 0 && sessions.some(([sid]) => sid !== 'unknown') && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">P&amp;L by Session</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {sessions.map(([sid, { orders: sOrders, pnl: sPnl }]) => (
              <div key={sid} className="px-5 py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-800">Session #{sid}</span>
                  <span className="ml-2 text-xs text-gray-400">{sOrders.length} orders</span>
                </div>
                <PnlCell value={sPnl} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <h2 className="font-semibold text-gray-800 text-sm">All Orders</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
            mode === 'live' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {mode}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            No {mode} orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Symbol', 'Type', 'Qty', 'Price', 'Status', 'P&L', 'Time'].map(h => (
                    <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o, i) => (
                  <tr key={o.id ?? i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{o.symbol || o.tradingsymbol || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold ${
                        (o.transaction_type || '').toUpperCase() === 'BUY' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {o.transaction_type || o.order_type || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{o.quantity ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{fmt(o.price ?? o.average_price)}</td>
                    <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-5 py-3"><PnlCell value={o.pnl} /></td>
                    <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {fmtDate(o.created_at || o.placed_at)}
                    </td>
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
