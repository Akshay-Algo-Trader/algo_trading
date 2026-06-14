import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Badge, Modal, FormField, Input, Btn, fmtDate, fmtCurrency,
} from '../../components/admin/TableHelpers'

const TABS = ['Account', 'Strategies', 'Orders', 'Virtual Money']

const KIND_META = {
  topup:    { label: 'Top-up',   variant: 'green' },
  withdraw: { label: 'Withdraw', variant: 'red' },
  set:      { label: 'Set',      variant: 'blue' },
  reset:    { label: 'Reset',    variant: 'gray' },
}

function fmtSigned(n) {
  if (n === null || n === undefined) return '—'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${fmtCurrency(Math.abs(n))}`
}

// ─── Account tab ────────────────────────────────────────────────────────────────
function AccountTab({ user, onChanged }) {
  const [pwd, setPwd] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)
  const [pwdMsg, setPwdMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function toggleActive() {
    setBusy(true)
    try {
      await axiosInstance.put(`/api/admin/users/${user.id}`, { is_active: !user.is_active })
      onChanged()
    } catch (ex) {
      alert(ex.response?.data?.error ?? 'Failed to update status')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(e) {
    e.preventDefault()
    if (pwd.length < 8) { setPwdMsg('Password must be at least 8 characters'); return }
    setSavingPwd(true); setPwdMsg('')
    try {
      await axiosInstance.put(`/api/admin/users/${user.id}`, { password: pwd })
      setPwd(''); setPwdMsg('Password updated')
    } catch (ex) {
      setPwdMsg(ex.response?.data?.error ?? 'Failed to update password')
    } finally {
      setSavingPwd(false)
    }
  }

  const rows = [
    ['Email', user.email],
    ['User ID', user.id],
    ['Role', <Badge variant={user.role === 'admin' ? 'orange' : 'gray'}>{user.role}</Badge>],
    ['Kite', <Badge variant={user.kite_connected ? 'green' : 'gray'}>{user.kite_connected ? 'Connected' : 'Not set'}</Badge>],
    ['Status', <Badge variant={user.is_active ? 'green' : 'gray'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>],
    ['Created', fmtDate(user.created_at)],
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Account details</h3>
        <dl className="space-y-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <dt className="text-xs text-gray-500 uppercase tracking-wide">{k}</dt>
              <dd className="text-sm text-gray-800 text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 pt-4 border-t border-gray-100">
          <Btn variant={user.is_active ? 'secondary' : 'primary'} disabled={busy} onClick={toggleActive}>
            {busy ? '…' : user.is_active ? 'Deactivate account' : 'Activate account'}
          </Btn>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Reset password</h3>
        <form onSubmit={resetPassword}>
          <FormField label="New password" hint="Minimum 8 characters. The customer is not notified.">
            <Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••" />
          </FormField>
          {pwdMsg && (
            <p className={`text-sm mb-3 ${pwdMsg === 'Password updated' ? 'text-green-600' : 'text-red-500'}`}>{pwdMsg}</p>
          )}
          <Btn variant="primary" type="submit" disabled={savingPwd || !pwd}>
            {savingPwd ? 'Saving…' : 'Update password'}
          </Btn>
        </form>
      </Card>
    </div>
  )
}

// ─── Strategies tab ─────────────────────────────────────────────────────────────
function StrategiesTab({ userId }) {
  const [strategies, setStrategies] = useState([])
  const [assigned, setAssigned] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [allRes, mineRes] = await Promise.all([
        axiosInstance.get('/api/admin/strategies'),
        axiosInstance.get(`/api/admin/users/${userId}/strategies`),
      ])
      setStrategies(allRes.data?.strategies ?? [])
      setAssigned(new Set((mineRes.data?.strategies ?? []).map(s => s.id)))
    } catch {
      setError('Failed to load strategies')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  async function toggle(strategy) {
    const isAssigned = assigned.has(strategy.id)
    setBusyId(strategy.id)
    try {
      if (isAssigned) {
        await axiosInstance.delete(`/api/admin/strategies/${strategy.id}/unassign/${userId}`)
      } else {
        await axiosInstance.post(`/api/admin/strategies/${strategy.id}/assign`, { user_id: Number(userId) })
      }
      setAssigned(prev => {
        const next = new Set(prev)
        if (isAssigned) next.delete(strategy.id); else next.add(strategy.id)
        return next
      })
    } catch (ex) {
      alert(ex.response?.data?.error ?? 'Failed to update assignment')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-sm text-gray-400 py-6">Loading strategies…</p>
  if (error)   return <p className="text-sm text-red-500 py-6">{error}</p>
  if (strategies.length === 0) return <p className="text-sm text-gray-400 py-6">No strategies exist yet.</p>

  return (
    <Card>
      <div className="divide-y divide-gray-100">
        {strategies.map(s => {
          const isAssigned = assigned.has(s.id)
          return (
            <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm truncate">{s.name}</span>
                  <Badge variant={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {s.instrument} ({s.exchange}) · {s.order_type} · SL {s.stop_loss_pct}% · TP {s.take_profit_pct}%
                </div>
              </div>
              <Btn
                size="sm"
                variant={isAssigned ? 'secondary' : 'primary'}
                disabled={busyId === s.id}
                onClick={() => toggle(s)}
              >
                {busyId === s.id ? '…' : isAssigned ? 'Unassign' : 'Assign'}
              </Btn>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Orders tab ─────────────────────────────────────────────────────────────────
function OrdersTab({ userId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true); setError('')
    axiosInstance.get(`/api/admin/users/${userId}/orders`)
      .then(r => setOrders(r.data?.orders ?? []))
      .catch(() => setError('Failed to load orders'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) return <p className="text-sm text-gray-400 py-6">Loading orders…</p>
  if (error)   return <p className="text-sm text-red-500 py-6">{error}</p>
  if (orders.length === 0) return <p className="text-sm text-gray-400 py-6">No orders found for this customer.</p>

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Mode', 'Symbol', 'Type', 'Qty', 'Price', 'Status', 'Date'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((o, i) => (
              <tr key={`${o.mode}-${o.id ?? i}`} className="hover:bg-gray-50">
                <td className="px-4 py-2.5"><Badge variant={o.mode === 'LIVE' ? 'red' : 'blue'}>{o.mode}</Badge></td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{o.symbol}</td>
                <td className="px-4 py-2.5"><Badge variant={o.transaction_type === 'BUY' ? 'green' : 'red'}>{o.transaction_type}</Badge></td>
                <td className="px-4 py-2.5">{o.quantity}</td>
                <td className="px-4 py-2.5">{fmtCurrency(o.fill_price ?? o.price)}</td>
                <td className="px-4 py-2.5">{o.status}</td>
                <td className="px-4 py-2.5 text-gray-400">{fmtDate(o.placed_at ?? o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── Virtual money: amount modal ─────────────────────────────────────────────────
function VirtualModal({ mode, account, onClose, onSaved }) {
  // mode: 'adjust' | 'set'
  const [value, setValue] = useState(mode === 'set' ? String(account?.balance ?? '') : '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const isSet = mode === 'set'

  async function submit(e) {
    e.preventDefault()
    const num = parseFloat(value)
    if (Number.isNaN(num)) { setErr('Enter a valid amount'); return }
    if (!isSet && num === 0) { setErr('Amount must be non-zero'); return }
    if (isSet && num < 0) { setErr('Balance cannot be negative'); return }
    setSaving(true); setErr('')
    try {
      const url = isSet
        ? `/api/admin/users/${account.user_id}/virtual/set`
        : `/api/admin/users/${account.user_id}/virtual/adjust`
      const body = isSet ? { balance: num, note } : { amount: num, note }
      await axiosInstance.post(url, body)
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Failed to update balance')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={isSet ? 'Set virtual balance' : 'Add / remove funds'}>
      <form onSubmit={submit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
        <FormField
          label={isSet ? 'New balance (₹)' : 'Amount (₹)'}
          hint={isSet
            ? 'The balance will be set to exactly this value; the difference is logged.'
            : 'Use a negative value to deduct funds (e.g. −5000).'}
        >
          <Input type="number" step="any" value={value} onChange={e => setValue(e.target.value)} autoFocus required />
        </FormField>
        <FormField label="Note" hint="Optional — shown in the ledger for context.">
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. promo top-up" />
        </FormField>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Apply'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

// ─── Virtual money tab ──────────────────────────────────────────────────────────
function VirtualMoneyTab({ userId, account, onAccountChanged }) {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'adjust' | 'set'
  const [resetting, setResetting] = useState(false)

  const loadTxns = useCallback(() => {
    setLoading(true)
    axiosInstance.get(`/api/admin/users/${userId}/virtual/transactions`)
      .then(r => setTxns(r.data?.transactions ?? []))
      .catch(() => setTxns([]))
      .finally(() => setLoading(false))
  }, [userId])

  useEffect(() => { loadTxns() }, [loadTxns])

  function afterChange() { onAccountChanged(); loadTxns() }

  async function handleReset() {
    if (!confirm('Reset this customer\'s virtual account back to its initial balance? This is logged.')) return
    setResetting(true)
    try {
      await axiosInstance.post(`/api/admin/users/${userId}/reset-virtual`)
      afterChange()
    } catch (ex) {
      alert(ex.response?.data?.error ?? 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  if (!account) {
    return <p className="text-sm text-gray-400 py-6">This customer has no virtual account.</p>
  }

  const pnl = account.total_realised_pnl ?? 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Current balance</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{fmtCurrency(account.balance)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Initial balance</p>
          <p className="text-2xl font-semibold text-gray-700 mt-1">{fmtCurrency(account.initial_balance)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Realised P&amp;L</p>
          <p className={`text-2xl font-semibold mt-1 ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtSigned(pnl)}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" onClick={() => setModal('adjust')}>Add / remove funds</Btn>
        <Btn variant="secondary" onClick={() => setModal('set')}>Set balance</Btn>
        <Btn variant="secondary" disabled={resetting} onClick={handleReset}>{resetting ? 'Resetting…' : 'Reset to initial'}</Btn>
      </div>

      <Card>
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Adjustment history</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-gray-400 py-6 px-5">Loading history…</p>
          ) : txns.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 px-5">No adjustments recorded yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['When', 'Kind', 'Amount', 'Balance after', 'Note', 'By'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {txns.map(t => {
                  const meta = KIND_META[t.kind] ?? { label: t.kind, variant: 'gray' }
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-400">{fmtDate(t.created_at)}</td>
                      <td className="px-4 py-2.5"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                      <td className={`px-4 py-2.5 font-medium ${t.amount > 0 ? 'text-green-600' : t.amount < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        {fmtSigned(t.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{fmtCurrency(t.balance_after)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{t.note ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400">{t.created_by_email ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {modal && (
        <VirtualModal mode={modal} account={account} onClose={() => setModal(null)} onSaved={afterChange} />
      )}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function CustomerEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Account')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await axiosInstance.get(`/api/admin/users/${id}`)
      setUser(res.data?.user ?? null)
    } catch {
      setError('Failed to load customer')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <p className="text-sm text-gray-400">Loading customer…</p>
  if (error || !user) {
    return (
      <div>
        <p className="text-sm text-red-500 mb-3">{error || 'Customer not found'}</p>
        <Btn variant="secondary" onClick={() => navigate('/admin/customers')}>← Back to Customers</Btn>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/admin/customers" className="text-sm text-gray-400 hover:text-gray-600">← Customers</Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-lg font-semibold text-gray-900">{user.email}</h1>
          <Badge variant={user.is_active ? 'green' : 'gray'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-[#eb5202] text-[#eb5202]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Account' && <AccountTab user={user} onChanged={load} />}
      {tab === 'Strategies' && <StrategiesTab userId={user.id} />}
      {tab === 'Orders' && <OrdersTab userId={user.id} />}
      {tab === 'Virtual Money' && (
        <VirtualMoneyTab userId={user.id} account={user.virtual_account} onAccountChanged={load} />
      )}
    </div>
  )
}
