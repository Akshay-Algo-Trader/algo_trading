import { useEffect, useState, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Select, Btn, PageHeader, fmtDate,
} from '../../components/admin/TableHelpers'

const COLS = ['User', 'Strategy', 'Mode', 'Status', 'Started', 'Duration', 'Actions']

function duration(start, end) {
  const ms = (end ? new Date(end) : new Date()) - new Date(start)
  if (ms < 0) return '—'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function modeBadge(mode) {
  if (mode === 'live')  return <Badge variant="red">LIVE</Badge>
  if (mode === 'paper') return <Badge variant="blue">PAPER</Badge>
  return <Badge variant="gray">{mode}</Badge>
}

function statusBadge(status) {
  const v = { active: 'green', stopped: 'gray', completed: 'blue' }
  return <Badge variant={v[status] ?? 'gray'}>{status?.toUpperCase()}</Badge>
}

// ─── Start Session Modal ───────────────────────────────────────────────────────
function StartSessionModal({ isOpen, onClose, onStarted }) {
  const [users, setUsers]         = useState([])
  const [strategies, setStrategies] = useState([])
  const [form, setForm]           = useState({ user_id: '', strategy_id: '', mode: 'paper' })
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  useEffect(() => {
    if (!isOpen) return
    setErr(''); setForm({ user_id: '', strategy_id: '', mode: 'paper' })
    Promise.all([
      axiosInstance.get('/api/admin/users'),
      axiosInstance.get('/api/admin/strategies'),
    ]).then(([uRes, sRes]) => {
      setUsers((uRes.data?.users ?? uRes.data ?? []).filter(u => u.role !== 'ADMIN'))
      setStrategies(sRes.data?.strategies ?? sRes.data ?? [])
    }).catch(() => { setUsers([]); setStrategies([]) })
  }, [isOpen])

  async function handleStart() {
    if (!form.user_id || !form.strategy_id) { setErr('Select user and strategy'); return }
    setSaving(true); setErr('')
    try {
      await axiosInstance.post('/api/admin/sessions', {
        user_id:     parseInt(form.user_id),
        strategy_id: parseInt(form.strategy_id),
        mode:        form.mode,
      })
      onStarted(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.message ?? 'Failed to start session')
    } finally {
      setSaving(false)
    }
  }

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start Trading Session">
      {err && <p className="text-sm text-red-500 mb-3">{err}</p>}

      <FormField label="Customer">
        <Select value={form.user_id} onChange={set('user_id')}>
          <option value="">— select customer —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
        </Select>
      </FormField>

      <FormField label="Strategy">
        <Select value={form.strategy_id} onChange={set('strategy_id')}>
          <option value="">— select strategy —</option>
          {strategies.filter(s => s.is_active !== false).map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.instrument})</option>
          ))}
        </Select>
      </FormField>

      <FormField label="Trading Mode">
        <div className="flex gap-4 mt-1">
          {['paper', 'live'].map(m => (
            <label key={m} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio" name="mode" value={m}
                checked={form.mode === m}
                onChange={() => setForm(f => ({ ...f, mode: m }))}
                className="accent-[#eb5202]"
              />
              <span className="text-sm capitalize">{m}</span>
              {m === 'live' && (
                <span className="text-xs text-red-500">(requires Kite connection)</span>
              )}
            </label>
          ))}
        </div>
      </FormField>

      {form.mode === 'live' && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
          <p className="text-xs text-red-700 font-medium">Live Trading Warning</p>
          <p className="text-xs text-red-600 mt-0.5">
            This will place real orders using the customer's Kite account. Ensure credentials are configured and valid.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn
          variant={form.mode === 'live' ? 'danger' : 'primary'}
          onClick={handleStart}
          disabled={saving}
        >
          {saving ? 'Starting…' : `Start ${form.mode === 'live' ? 'Live' : 'Paper'} Session`}
        </Btn>
      </div>
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Sessions() {
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [startOpen, setStartOpen] = useState(false)
  const [stopping, setStopping]   = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await axiosInstance.get('/api/admin/sessions')
      setSessions([...(r.data?.sessions ?? r.data ?? [])].sort(
        (a, b) => new Date(b.started_at) - new Date(a.started_at)
      ))
    } catch { setError('Failed to load sessions') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function stopSession(s) {
    if (!confirm(`Stop session for ${s.user_email ?? `user #${s.user_id}`}?`)) return
    setStopping(s.id)
    try {
      await axiosInstance.post(`/api/admin/sessions/${s.id}/stop`)
      fetchData()
    } catch (ex) {
      alert(ex.response?.data?.message ?? 'Stop failed')
    } finally {
      setStopping(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Trading Sessions"
        action={<Btn variant="primary" onClick={() => setStartOpen(true)}>+ Start Session</Btn>}
      />

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={6} cols={7} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={7} /> :
           sessions.length === 0 ? <EmptyRow message="No sessions found" cols={7} /> :
           sessions.map(s => {
             const isActive = s.status === 'active'
             const isLive   = s.mode === 'live'
             return (
               <tr
                 key={s.id}
                 className={`hover:bg-gray-50 ${isLive && isActive ? 'border-l-2 border-red-400' : isActive ? 'border-l-2 border-blue-400' : ''}`}
               >
                 <td className="px-4 py-3 text-sm">
                   <div className="text-gray-900">{s.user_email ?? `User #${s.user_id}`}</div>
                 </td>
                 <td className="px-4 py-3 text-sm text-gray-700">
                   {s.strategy_name ?? `Strategy #${s.strategy_id}`}
                 </td>
                 <td className="px-4 py-3">{modeBadge(s.mode)}</td>
                 <td className="px-4 py-3">{statusBadge(s.status)}</td>
                 <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(s.started_at)}</td>
                 <td className="px-4 py-3 text-sm text-gray-700">
                   {duration(s.started_at, s.stopped_at)}
                 </td>
                 <td className="px-4 py-3">
                   {isActive ? (
                     <Btn
                       size="sm" variant="danger"
                       disabled={stopping === s.id}
                       onClick={() => stopSession(s)}
                     >
                       {stopping === s.id ? 'Stopping…' : 'Stop'}
                     </Btn>
                   ) : (
                     <span className="text-xs text-gray-400">
                       {s.auto_stop_reason ?? '—'}
                     </span>
                   )}
                 </td>
               </tr>
             )
           })
          }
        </Table>
      </Card>

      <StartSessionModal isOpen={startOpen} onClose={() => setStartOpen(false)} onStarted={fetchData} />
    </div>
  )
}
