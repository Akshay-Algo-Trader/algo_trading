import { useEffect, useState, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge, fmtDate, fmtCurrency,
} from '../../components/admin/TableHelpers'

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color }) {
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </Card>
  )
}

const LIVE_COLS  = ['User', 'Symbol', 'Type', 'Qty', 'Price', 'Status', 'Time']
const PAPER_COLS = ['User', 'Symbol', 'Type', 'Qty', 'Fill Price', 'Status', 'Time']

function statusBadge(s) {
  const v = { FILLED: 'green', PENDING: 'yellow', CANCELLED: 'gray', REJECTED: 'red', OPEN: 'blue' }
  return <Badge variant={v[s] ?? 'gray'}>{s}</Badge>
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats]       = useState({ customers: 0, active: 0, liveToday: 0, paperToday: 0 })
  const [liveOrders, setLive]   = useState([])
  const [paperOrders, setPaper] = useState([])
  const [pnlData, setPnl]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [uRes, sRes, lRes, pRes, sellRes] = await Promise.all([
        axiosInstance.get('/api/admin/users'),
        axiosInstance.get('/api/admin/sessions'),
        axiosInstance.get('/api/admin/orders/live'),
        axiosInstance.get('/api/admin/orders/paper'),
        axiosInstance.get('/api/admin/logs?event_type=PAPER_SELL&per_page=200'),
      ])

      const users    = uRes.data?.users    ?? uRes.data   ?? []
      const sessions = sRes.data?.sessions ?? sRes.data   ?? []
      const live     = lRes.data?.orders   ?? lRes.data   ?? []
      const paper    = pRes.data?.orders   ?? pRes.data   ?? []
      const sellLogs = sellRes.data?.logs  ?? sellRes.data ?? []

      const today = new Date().toDateString()
      const liveToday  = live.filter(o  => new Date(o.placed_at  ?? o.created_at).toDateString() === today).length
      const paperToday = paper.filter(o => new Date(o.created_at).toDateString() === today).length

      setStats({
        customers: users.length,
        active:    sessions.filter(s => s.status === 'active').length,
        liveToday,
        paperToday,
      })

      setLive([...live].sort((a, b) => new Date(b.placed_at ?? b.created_at) - new Date(a.placed_at ?? a.created_at)).slice(0, 10))
      setPaper([...paper].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10))

      // P&L line chart from PAPER_SELL audit logs
      const sorted = [...sellLogs]
        .filter(l => l.payload?.realised_pnl != null)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      let cumPnl = 0
      const pnl = sorted.map(l => {
        cumPnl += l.payload.realised_pnl
        return { date: new Date(l.created_at).toLocaleDateString('en-IN'), pnl: +cumPnl.toFixed(2) }
      })
      setPnl(pnl)
    } catch {
      setError('Failed to load dashboard data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Customers"
          value={loading ? '—' : stats.customers}
          color="bg-blue-50"
          icon={<svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <StatCard
          label="Active Sessions"
          value={loading ? '—' : stats.active}
          color="bg-green-50"
          icon={<svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard
          label="Live Trades Today"
          value={loading ? '—' : stats.liveToday}
          color="bg-red-50"
          icon={<svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        />
        <StatCard
          label="Paper Trades Today"
          value={loading ? '—' : stats.paperToday}
          color="bg-purple-50"
          icon={<svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6M3 7l3-3 3 3M3 7v10a1 1 0 001 1h16a1 1 0 001-1V7M3 7h18" /></svg>}
        />
      </div>

      {/* P&L Chart */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Cumulative Paper P&amp;L</h2>
        {pnlData.length === 0 && !loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">
            No completed paper trades yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={pnlData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
              <Tooltip
                formatter={v => [`₹${Number(v).toFixed(2)}`, 'P&L']}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
              />
              <Line type="monotone" dataKey="pnl" stroke="#eb5202" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Recent orders */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Live orders */}
        <Card>
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Recent Live Orders</h2>
          </div>
          <Table headers={LIVE_COLS}>
            {loading ? <SkeletonTable rows={5} cols={7} /> :
             error   ? <ErrorRow message={error} onRetry={fetchAll} cols={7} /> :
             liveOrders.length === 0 ? <EmptyRow message="No live orders" cols={7} /> :
             liveOrders.map((o, i) => (
               <tr key={o.id ?? i} className="hover:bg-gray-50">
                 <td className="px-4 py-3 text-gray-600 text-xs">{o.user_id}</td>
                 <td className="px-4 py-3 font-medium text-gray-900">{o.symbol}</td>
                 <td className="px-4 py-3"><Badge variant={o.transaction_type === 'BUY' ? 'green' : 'red'}>{o.transaction_type}</Badge></td>
                 <td className="px-4 py-3 text-gray-700">{o.quantity}</td>
                 <td className="px-4 py-3 text-gray-700">{fmtCurrency(o.price)}</td>
                 <td className="px-4 py-3">{statusBadge(o.status)}</td>
                 <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(o.placed_at ?? o.created_at)}</td>
               </tr>
             ))
            }
          </Table>
        </Card>

        {/* Paper orders */}
        <Card>
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Recent Paper Orders</h2>
          </div>
          <Table headers={PAPER_COLS}>
            {loading ? <SkeletonTable rows={5} cols={7} /> :
             error   ? <ErrorRow message={error} onRetry={fetchAll} cols={7} /> :
             paperOrders.length === 0 ? <EmptyRow message="No paper orders" cols={7} /> :
             paperOrders.map((o, i) => (
               <tr key={o.id ?? i} className="hover:bg-gray-50">
                 <td className="px-4 py-3 text-gray-600 text-xs">{o.user_id}</td>
                 <td className="px-4 py-3 font-medium text-gray-900">{o.symbol}</td>
                 <td className="px-4 py-3"><Badge variant={o.transaction_type === 'BUY' ? 'green' : 'red'}>{o.transaction_type}</Badge></td>
                 <td className="px-4 py-3 text-gray-700">{o.quantity}</td>
                 <td className="px-4 py-3 text-gray-700">{fmtCurrency(o.fill_price)}</td>
                 <td className="px-4 py-3">{statusBadge(o.status)}</td>
                 <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(o.created_at)}</td>
               </tr>
             ))
            }
          </Table>
        </Card>
      </div>
    </div>
  )
}
