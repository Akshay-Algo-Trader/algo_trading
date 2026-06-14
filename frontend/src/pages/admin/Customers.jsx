import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Btn, PageHeader, fmtCurrency,
} from '../../components/admin/TableHelpers'

const COLS = ['Email', 'Role', 'Kite', 'Session', 'Virtual Balance', 'Status', 'Actions']

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
      setErr(ex.response?.data?.error ?? ex.response?.data?.message ?? 'Failed to create customer')
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Customers() {
  const navigate = useNavigate()
  const [users, setUsers]         = useState([])
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [addOpen, setAddOpen]     = useState(false)

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

  return (
    <div>
      <PageHeader
        title="Customers"
        action={<Btn variant="primary" onClick={() => setAddOpen(true)}>+ Add Customer</Btn>}
      />

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={6} cols={COLS.length} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={COLS.length} /> :
           users.length === 0 ? <EmptyRow message="No customers found" cols={COLS.length} /> :
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
                   <Btn size="sm" variant="ghost" onClick={() => navigate(`/admin/customers/${user.id}/edit`)}>
                     Manage →
                   </Btn>
                 </td>
               </tr>
             )
           })
          }
        </Table>
      </Card>

      <AddCustomerModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSaved={fetchData} />
    </div>
  )
}
