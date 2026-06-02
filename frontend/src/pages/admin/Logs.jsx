import { useEffect, useState, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  PageHeader, fmtDate,
} from '../../components/admin/TableHelpers'

const PAGE_SIZE = 20
const COLS = ['Timestamp', 'User', 'Event', 'Mode', 'Payload Preview']

function modeBadge(mode) {
  if (mode === 'live')  return <Badge variant="red">LIVE</Badge>
  if (mode === 'paper') return <Badge variant="blue">PAPER</Badge>
  if (mode)             return <Badge variant="gray">{mode}</Badge>
  return <span className="text-gray-400 text-xs">—</span>
}

function eventBadge(type) {
  if (!type) return null
  const v = type.includes('BUY') ? 'green' : type.includes('SELL') ? 'red' : type.includes('STOP') ? 'yellow' : 'gray'
  return <Badge variant={v}>{type.replace(/_/g, ' ')}</Badge>
}

function payloadPreview(payload) {
  if (!payload || typeof payload !== 'object') return '—'
  const keys = ['symbol', 'fill_price', 'realised_pnl', 'reason', 'session_id']
  const parts = keys.filter(k => payload[k] != null).map(k => `${k}: ${payload[k]}`)
  return parts.length > 0 ? parts.slice(0, 3).join(' · ') : JSON.stringify(payload).slice(0, 60)
}

function today() { return new Date().toISOString().slice(0, 10) }
function weekAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Logs() {
  const [logs, setLogs]         = useState([])
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [page, setPage]         = useState(1)
  const [expanded, setExpanded] = useState(null)

  const [filters, setFilters] = useState({
    mode: '', userId: '', from: weekAgo(), to: today(),
  })

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [lRes, uRes] = await Promise.all([
        axiosInstance.get('/api/admin/logs'),
        axiosInstance.get('/api/admin/users'),
      ])
      setLogs([...(lRes.data?.logs ?? lRes.data ?? [])].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      ))
      setUsers((uRes.data?.users ?? uRes.data ?? []))
    } catch { setError('Failed to load audit logs') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function updateFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }
  function clearFilters() {
    setFilters({ mode: '', userId: '', from: weekAgo(), to: today() })
    setPage(1)
  }

  const filtered = logs.filter(l => {
    const ts = new Date(l.created_at)
    if (filters.mode   && l.mode !== filters.mode) return false
    if (filters.userId && String(l.user_id) !== filters.userId) return false
    if (filters.from   && ts < new Date(filters.from)) return false
    if (filters.to     && ts > new Date(filters.to + 'T23:59:59')) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader title="Audit Logs" />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mode</label>
          <select
            value={filters.mode}
            onChange={e => updateFilter('mode', e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
          >
            <option value="">All modes</option>
            <option value="live">Live</option>
            <option value="paper">Paper</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Customer</label>
          <select
            value={filters.userId}
            onChange={e => updateFilter('userId', e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
          >
            <option value="">All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={filters.from} onChange={e => updateFilter('from', e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202]" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={filters.to} onChange={e => updateFilter('to', e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202]" />
        </div>
        <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-800 py-1.5 underline">
          Clear
        </button>
        <span className="text-xs text-gray-400 ml-auto self-end pb-1.5">
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={8} cols={5} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={5} /> :
           paginated.length === 0 ? <EmptyRow message="No log entries match the current filters" cols={5} /> :
           paginated.map((log, i) => (
             <>
               <tr
                 key={log.id ?? i}
                 className="hover:bg-gray-50 cursor-pointer"
                 onClick={() => setExpanded(expanded === (log.id ?? i) ? null : (log.id ?? i))}
               >
                 <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                   {fmtDate(log.created_at)}
                 </td>
                 <td className="px-4 py-3 text-xs text-gray-600">
                   {log.user_id ? `#${log.user_id}` : '—'}
                 </td>
                 <td className="px-4 py-3">{eventBadge(log.event_type)}</td>
                 <td className="px-4 py-3">{modeBadge(log.mode)}</td>
                 <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                   {payloadPreview(log.payload)}
                 </td>
               </tr>
               {expanded === (log.id ?? i) && (
                 <tr key={`${log.id ?? i}-exp`} className="bg-gray-50">
                   <td colSpan={5} className="px-4 pb-3 pt-0">
                     <div className="grid grid-cols-2 gap-3 text-xs">
                       <div>
                         <p className="text-gray-500 font-medium mb-1">Payload</p>
                         <pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto text-gray-700 max-h-32">
                           {JSON.stringify(log.payload, null, 2)}
                         </pre>
                       </div>
                       {log.response && (
                         <div>
                           <p className="text-gray-500 font-medium mb-1">Response</p>
                           <pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto text-gray-700 max-h-32">
                             {JSON.stringify(log.response, null, 2)}
                           </pre>
                         </div>
                       )}
                     </div>
                   </td>
                 </tr>
               )}
             </>
           ))
          }
        </Table>

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Page {page} of {totalPages} ({filtered.length} records)
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pn = page <= 3 ? i + 1 : page + i - 2
                if (pn < 1 || pn > totalPages) return null
                return (
                  <button
                    key={pn}
                    onClick={() => setPage(pn)}
                    className={`px-2.5 py-1 text-xs border rounded ${pn === page ? 'bg-[#eb5202] text-white border-[#eb5202]' : 'border-gray-300 hover:bg-gray-50'}`}
                  >
                    {pn}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
