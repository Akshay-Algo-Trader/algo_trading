import { useEffect, useState, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Btn, PageHeader, fmtDate, fmtCurrency,
} from '../../components/admin/TableHelpers'

const COLS = ['Email', 'Role', 'Kite', 'Session', 'Virtual Balance', 'Status', 'Actions', 'Strategies']

function sessionBadge(mode) {
  if (!mode) return <Badge variant="gray">None</Badge>
  if (mode === 'live')  return <Badge variant="red">LIVE</Badge>
  if (mode === 'paper') return <Badge variant="blue">PAPER</Badge>
  return <Badge variant="gray">{mode}</Badge>
}

// ─── Add Customer Modal ────────────────────────────────────────────────────────
function AddCustomerModal({ isOpen, onClose, onSaved }) {
  const [form, setForm]   = useState({ email: '', password: '', initial_balance: '100000' })
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState('')

  function reset() { setForm({ email: '', password: '', initial_balance: '100000' }); setErr('') }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) { setErr('Email and password are required'); return }
    setSaving(true); setErr('')
    try {
      await axiosInstance.post('/api/admin/users', {
        email: form.email,
        password: form.password,
        initial_balance: parseFloat(form.initial_balance) || 100000,
      })
      onSaved(); reset(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.message ?? 'Failed to create customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose() }} title="Add Customer">
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
        <FormField label="Email">
          <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="trader@example.com" required />
        </FormField>
        <FormField label="Password">
          <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimum 8 characters" required />
        </FormField>
        <FormField label="Initial Virtual Balance (₹)" hint="Default ₹1,00,000">
          <Input type="number" value={form.initial_balance} onChange={e => setForm(f => ({ ...f, initial_balance: e.target.value }))} min={0} step={1000} />
        </FormField>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" type="button" onClick={() => { reset(); onClose() }}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Customer'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

// ─── Orders Modal ─────────────────────────────────────────────────────────────
function CustomerOrdersModal({ user, isOpen, onClose }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !user) return
    setLoading(true)
    Promise.all([
      axiosInstance.get('/api/admin/orders/live'),
      axiosInstance.get('/api/admin/orders/paper'),
    ]).then(([lRes, pRes]) => {
      const live  = (lRes.data?.orders ?? lRes.data ?? []).filter(o => o.user_id === user.id).map(o => ({ ...o, _mode: 'LIVE' }))
      const paper = (pRes.data?.orders ?? pRes.data ?? []).filter(o => o.user_id === user.id).map(o => ({ ...o, _mode: 'PAPER' }))
      setOrders([...live, ...paper].sort((a, b) => new Date(b.created_at ?? b.placed_at) - new Date(a.created_at ?? a.placed_at)))
    }).catch(() => setOrders([])).finally(() => setLoading(false))
  }, [isOpen, user])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Orders — ${user?.email ?? ''}`} size="xl">
      <div className="max-h-96 overflow-y-auto -mx-6 px-6">
        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No orders found</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {['Mode', 'Symbol', 'Type', 'Qty', 'Price', 'Status', 'Date'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2"><Badge variant={o._mode === 'LIVE' ? 'red' : 'blue'}>{o._mode}</Badge></td>
                  <td className="px-3 py-2 font-medium">{o.symbol}</td>
                  <td className="px-3 py-2"><Badge variant={o.transaction_type === 'BUY' ? 'green' : 'red'}>{o.transaction_type}</Badge></td>
                  <td className="px-3 py-2">{o.quantity}</td>
                  <td className="px-3 py-2">{fmtCurrency(o.fill_price ?? o.price)}</td>
                  <td className="px-3 py-2">{o.status}</td>
                  <td className="px-3 py-2 text-gray-400">{fmtDate(o.created_at ?? o.placed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex justify-end mt-4">
        <Btn variant="secondary" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  )
}

// ─── Strategies Modal ─────────────────────────────────────────────────────────
function CustomerStrategiesModal({ user, isOpen, onClose }) {
  const [strategies, setStrategies] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !user) return
    setLoading(true)
    axiosInstance.get(`/api/admin/users/${user.id}/strategies`)
      .then(r => setStrategies(r.data?.strategies ?? []))
      .catch(() => setStrategies([]))
      .finally(() => setLoading(false))
  }, [isOpen, user])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Strategies — ${user?.email ?? ''}`} size="lg">
      <div className="max-h-96 overflow-y-auto -mx-6 px-6">
        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : strategies.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No strategies assigned</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {['Name', 'Instrument', 'Order Type', 'Entry Condition', 'SL%', 'TP%', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {strategies.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    {s.description && <div className="text-xs text-gray-400">{s.description}</div>}
                  </td>
                  <td className="px-3 py-2 font-medium">{s.instrument} <span className="text-gray-400">({s.exchange})</span></td>
                  <td className="px-3 py-2"><Badge variant="gray">{s.order_type}</Badge></td>
                  <td className="px-3 py-2 text-gray-600">
                    {s.entry_condition?.type?.replace(/_/g, ' ')} @ {s.entry_condition?.value}
                  </td>
                  <td className="px-3 py-2 text-red-600 font-medium">{s.stop_loss_pct}%</td>
                  <td className="px-3 py-2 text-green-600 font-medium">{s.take_profit_pct}%</td>
                  <td className="px-3 py-2">
                    <Badge variant={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex justify-end mt-4">
        <Btn variant="secondary" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Customers() {
  const [users, setUsers]         = useState([])
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [addOpen, setAddOpen]         = useState(false)
  const [ordersUser, setOrdersUser]   = useState(null)
  const [strategiesUser, setStrategiesUser] = useState(null)
  const [resetting, setResetting]     = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [uRes, sRes] = await Promise.all([
        axiosInstance.get('/api/admin/users'),
        axiosInstance.get('/api/admin/sessions'),
      ])
      setUsers(uRes.data?.users ?? uRes.data ?? [])
      setSessions(sRes.data?.sessions ?? sRes.data ?? [])
    } catch {
      setError('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function getActiveSession(userId) {
    return sessions.find(s => s.user_id === userId && s.status === 'active')
  }

  async function handleReset(user) {
    if (!confirm(`Reset virtual account for ${user.email}? This cannot be undone.`)) return
    setResetting(user.id)
    try {
      await axiosInstance.post(`/api/admin/users/${user.id}/reset-virtual`)
      fetchData()
    } catch (ex) {
      alert(ex.response?.data?.message ?? 'Reset failed')
    } finally {
      setResetting(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        action={<Btn variant="primary" onClick={() => setAddOpen(true)}>+ Add Customer</Btn>}
      />

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={6} cols={7} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={7} /> :
           users.length === 0 ? <EmptyRow message="No customers found" cols={7} /> :
           users.map(user => {
             const activeSess = getActiveSession(user.id)
             return (
               <tr key={user.id} className="hover:bg-gray-50">
                 <td className="px-4 py-3">
                   <div className="font-medium text-gray-900 text-sm">{user.email}</div>
                   <div className="text-xs text-gray-400">ID: {user.id}</div>
                 </td>
                 <td className="px-4 py-3">
                   <Badge variant={user.role === 'ADMIN' ? 'orange' : 'gray'}>{user.role}</Badge>
                 </td>
                 <td className="px-4 py-3">
                   <Badge variant={user.kite_connected ? 'green' : 'gray'}>
                     {user.kite_connected ? 'Connected' : 'Not set'}
                   </Badge>
                 </td>
                 <td className="px-4 py-3">{sessionBadge(activeSess?.mode)}</td>
                 <td className="px-4 py-3 text-gray-700 text-sm">
                   {fmtCurrency(user.virtual_balance ?? user.balance)}
                 </td>
                 <td className="px-4 py-3">
                   <Badge variant={user.is_active !== false ? 'green' : 'gray'}>
                     {user.is_active !== false ? 'Active' : 'Inactive'}
                   </Badge>
                 </td>
                 <td className="px-4 py-3">
                   <div className="flex items-center gap-2">
                     <Btn size="sm" variant="ghost" onClick={() => setOrdersUser(user)}>
                       Orders
                     </Btn>
                     <Btn
                       size="sm" variant="ghost"
                       disabled={resetting === user.id}
                       onClick={() => handleReset(user)}
                     >
                       {resetting === user.id ? '…' : 'Reset'}
                     </Btn>
                   </div>
                 </td>
                 <td className="px-4 py-3">
                   <Btn size="sm" variant="ghost" onClick={() => setStrategiesUser(user)}>
                     Strategies
                   </Btn>
                 </td>
               </tr>
             )
           })
          }
        </Table>
      </Card>

      <AddCustomerModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSaved={fetchData} />
      <CustomerOrdersModal user={ordersUser} isOpen={!!ordersUser} onClose={() => setOrdersUser(null)} />
      <CustomerStrategiesModal user={strategiesUser} isOpen={!!strategiesUser} onClose={() => setStrategiesUser(null)} />
    </div>
  )
}
