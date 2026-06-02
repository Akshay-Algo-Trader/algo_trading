import { useEffect, useState, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  PageHeader, fmtDate, fmtCurrency,
} from '../../components/admin/TableHelpers'

const LIVE_COLS  = ['User', 'Symbol', 'Exchange', 'Transaction', 'Order Type', 'Qty', 'Price', 'Status', 'Placed At']
const PAPER_COLS = ['User', 'Symbol', 'Exchange', 'Transaction', 'Order Type', 'Qty', 'Trigger', 'Fill Price', 'Status', 'Time']

function txBadge(t) {
  return <Badge variant={t === 'BUY' ? 'green' : 'red'}>{t}</Badge>
}
function statusBadge(s) {
  const v = { FILLED: 'green', PENDING: 'yellow', CANCELLED: 'gray', REJECTED: 'red', OPEN: 'blue', EXPIRED: 'gray' }
  return <Badge variant={v[s] ?? 'gray'}>{s}</Badge>
}

function today() { return new Date().toISOString().slice(0, 10) }
function monthAgo() {
  const d = new Date(); d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

// ─── Filters bar ──────────────────────────────────────────────────────────────
function Filters({ users, filters, onChange }) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Customer</label>
        <select
          value={filters.userId}
          onChange={e => onChange('userId', e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202] bg-white"
        >
          <option value="">All customers</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">From</label>
        <input
          type="date" value={filters.from}
          onChange={e => onChange('from', e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">To</label>
        <input
          type="date" value={filters.to}
          onChange={e => onChange('to', e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
        />
      </div>
      <button
        onClick={() => onChange('_reset')}
        className="text-sm text-gray-500 hover:text-gray-800 py-1.5 underline"
      >
        Clear
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Orders() {
  const [tab, setTab]         = useState('paper')
  const [liveOrders, setLive] = useState([])
  const [paperOrders, setPaper] = useState([])
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [filters, setFilters] = useState({ userId: '', from: monthAgo(), to: today() })

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [lRes, pRes, uRes] = await Promise.all([
        axiosInstance.get('/api/admin/orders/live'),
        axiosInstance.get('/api/admin/orders/paper'),
        axiosInstance.get('/api/admin/users'),
      ])
      setLive(lRes.data?.orders  ?? lRes.data ?? [])
      setPaper(pRes.data?.orders ?? pRes.data ?? [])
      setUsers((uRes.data?.users ?? uRes.data ?? []).filter(u => u.role !== 'ADMIN'))
    } catch { setError('Failed to load orders') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function updateFilter(key, value) {
    if (key === '_reset') { setFilters({ userId: '', from: monthAgo(), to: today() }); return }
    setFilters(f => ({ ...f, [key]: value }))
  }

  function applyFilters(orders, dateField) {
    return orders.filter(o => {
      const ts = new Date(o[dateField] ?? o.created_at)
      if (filters.userId && String(o.user_id) !== filters.userId) return false
      if (filters.from && ts < new Date(filters.from)) return false
      if (filters.to   && ts > new Date(filters.to + 'T23:59:59')) return false
      return true
    }).sort((a, b) => new Date(b[dateField] ?? b.created_at) - new Date(a[dateField] ?? a.created_at))
  }

  const filteredLive  = applyFilters(liveOrders,  'placed_at')
  const filteredPaper = applyFilters(paperOrders, 'created_at')

  return (
    <div>
      <PageHeader title="Orders" />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          { key: 'paper', label: 'Paper Orders', count: paperOrders.length },
          { key: 'live',  label: 'Live Orders',  count: liveOrders.length  },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-[#eb5202] text-[#eb5202]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${tab === t.key ? 'bg-orange-100 text-[#eb5202]' : 'bg-gray-100 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <Filters users={users} filters={filters} onChange={updateFilter} />

      {tab === 'live' && (
        <Card>
          <Table headers={LIVE_COLS}>
            {loading ? <SkeletonTable rows={6} cols={9} /> :
             error   ? <ErrorRow message={error} onRetry={fetchData} cols={9} /> :
             filteredLive.length === 0 ? <EmptyRow message="No live orders match filters" cols={9} /> :
             filteredLive.map((o, i) => (
               <tr key={o.id ?? i} className="hover:bg-gray-50">
                 <td className="px-4 py-3 text-xs text-gray-500">{o.user_id}</td>
                 <td className="px-4 py-3 font-medium text-gray-900">{o.symbol}</td>
                 <td className="px-4 py-3 text-xs text-gray-500">{o.exchange}</td>
                 <td className="px-4 py-3">{txBadge(o.transaction_type)}</td>
                 <td className="px-4 py-3 text-xs"><Badge variant="gray">{o.order_type}</Badge></td>
                 <td className="px-4 py-3 text-gray-700">{o.quantity}</td>
                 <td className="px-4 py-3 text-gray-700">{fmtCurrency(o.price)}</td>
                 <td className="px-4 py-3">{statusBadge(o.status)}</td>
                 <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(o.placed_at)}</td>
               </tr>
             ))
            }
          </Table>
        </Card>
      )}

      {tab === 'paper' && (
        <Card>
          <Table headers={PAPER_COLS}>
            {loading ? <SkeletonTable rows={6} cols={10} /> :
             error   ? <ErrorRow message={error} onRetry={fetchData} cols={10} /> :
             filteredPaper.length === 0 ? <EmptyRow message="No paper orders match filters" cols={10} /> :
             filteredPaper.map((o, i) => (
               <tr key={o.id ?? i} className="hover:bg-gray-50">
                 <td className="px-4 py-3 text-xs text-gray-500">{o.user_id}</td>
                 <td className="px-4 py-3 font-medium text-gray-900">{o.symbol}</td>
                 <td className="px-4 py-3 text-xs text-gray-500">{o.exchange}</td>
                 <td className="px-4 py-3">{txBadge(o.transaction_type)}</td>
                 <td className="px-4 py-3 text-xs"><Badge variant="gray">{o.order_type}</Badge></td>
                 <td className="px-4 py-3 text-gray-700">{o.quantity}</td>
                 <td className="px-4 py-3 text-gray-700">{fmtCurrency(o.trigger_price)}</td>
                 <td className="px-4 py-3 text-gray-700">{fmtCurrency(o.fill_price)}</td>
                 <td className="px-4 py-3">{statusBadge(o.status)}</td>
                 <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(o.created_at)}</td>
               </tr>
             ))
            }
          </Table>
        </Card>
      )}
    </div>
  )
}
