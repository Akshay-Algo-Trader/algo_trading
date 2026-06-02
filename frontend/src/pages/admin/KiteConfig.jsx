import { useEffect, useState, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Btn, PageHeader, fmtDate,
} from '../../components/admin/TableHelpers'

const COLS = ['Customer', 'API Key', 'Connected', 'Token Age', 'Static IP', 'Actions']

function mask(key) {
  if (!key) return '—'
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

function tokenAge(ts) {
  if (!ts) return 'Never'
  const hours = Math.floor((Date.now() - new Date(ts)) / 3_600_000)
  if (hours < 1)  return '< 1h ago'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function tokenStale(ts) {
  if (!ts) return true
  const hours = (Date.now() - new Date(ts)) / 3_600_000
  return hours >= 16 // Kite tokens expire daily at ~16h
}

// ─── Set credentials modal ────────────────────────────────────────────────────
function SetCredentialsModal({ isOpen, onClose, user, onSaved }) {
  const [form, setForm]   = useState({ api_key: '', api_secret: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState('')

  useEffect(() => { setForm({ api_key: '', api_secret: '' }); setErr('') }, [isOpen])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.api_key || !form.api_secret) { setErr('Both fields are required'); return }
    setSaving(true); setErr('')
    try {
      await axiosInstance.post(`/api/admin/kite/config/${user.id}`, form)
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.message ?? 'Failed to save credentials')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Set Kite Credentials — ${user?.email ?? ''}`}>
      <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
        <p className="text-xs text-amber-700 font-medium">Security Notice</p>
        <p className="text-xs text-amber-600 mt-0.5">
          API credentials are encrypted before storage. Never share your API secret.
          Only set credentials for accounts you manage.
        </p>
      </div>
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
        <FormField label="Kite API Key">
          <Input
            value={form.api_key}
            onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
            placeholder="kitecredentials123"
            autoComplete="off"
            required
          />
        </FormField>
        <FormField label="Kite API Secret">
          <Input
            type="password"
            value={form.api_secret}
            onChange={e => setForm(f => ({ ...f, api_secret: e.target.value }))}
            placeholder="••••••••••••••••"
            autoComplete="new-password"
            required
          />
        </FormField>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Credentials'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function KiteConfig() {
  const [configs, setConfigs] = useState([])
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [credUser, setCredUser] = useState(null)
  const [urlLoading, setUrlLoading] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [cRes, uRes] = await Promise.all([
        axiosInstance.get('/api/admin/kite/config'),
        axiosInstance.get('/api/admin/users'),
      ])
      setConfigs(cRes.data?.configs ?? cRes.data ?? [])
      setUsers(uRes.data?.users ?? uRes.data ?? [])
    } catch { setError('Failed to load Kite configurations') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function generateLoginUrl(userId) {
    setUrlLoading(userId)
    try {
      const r = await axiosInstance.get(`/api/admin/kite/login-url/${userId}`)
      const url = r.data?.login_url ?? r.data?.url ?? r.data
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else alert('No login URL returned')
    } catch (ex) {
      alert(ex.response?.data?.message ?? 'Failed to generate login URL')
    } finally {
      setUrlLoading(null)
    }
  }

  // Merge users without config
  const rows = users.filter(u => u.role !== 'ADMIN').map(user => {
    const cfg = configs.find(c => c.user_id === user.id) ?? null
    return { user, cfg }
  })

  return (
    <div>
      <PageHeader title="Kite Configuration" />

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={5} cols={6} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={6} /> :
           rows.length === 0 ? <EmptyRow message="No customers found" cols={6} /> :
           rows.map(({ user, cfg }) => {
             const stale = tokenStale(cfg?.token_generated_at)
             return (
               <tr key={user.id} className="hover:bg-gray-50">
                 <td className="px-4 py-3">
                   <div className="text-sm font-medium text-gray-900">{user.email}</div>
                   <div className="text-xs text-gray-400">ID: {user.id}</div>
                 </td>
                 <td className="px-4 py-3 font-mono text-sm text-gray-600">
                   {mask(cfg?.api_key)}
                 </td>
                 <td className="px-4 py-3">
                   {!cfg
                     ? <Badge variant="gray">Not configured</Badge>
                     : cfg.is_connected
                       ? <Badge variant="green">Connected</Badge>
                       : <Badge variant="red">Disconnected</Badge>
                   }
                 </td>
                 <td className="px-4 py-3 text-sm">
                   {cfg ? (
                     <span className={stale ? 'text-red-500' : 'text-gray-600'}>
                       {tokenAge(cfg.token_generated_at)}
                     </span>
                   ) : '—'}
                 </td>
                 <td className="px-4 py-3 font-mono text-xs text-gray-500">
                   {cfg?.static_ip ?? '—'}
                 </td>
                 <td className="px-4 py-3">
                   <div className="flex items-center gap-2">
                     <Btn size="sm" variant="secondary" onClick={() => setCredUser(user)}>
                       Set Keys
                     </Btn>
                     {cfg && (
                       <Btn
                         size="sm" variant="primary"
                         disabled={urlLoading === user.id}
                         onClick={() => generateLoginUrl(user.id)}
                       >
                         {urlLoading === user.id ? '…' : 'Login URL'}
                       </Btn>
                     )}
                   </div>
                 </td>
               </tr>
             )
           })
          }
        </Table>
      </Card>

      <SetCredentialsModal
        isOpen={!!credUser}
        onClose={() => setCredUser(null)}
        user={credUser}
        onSaved={fetchData}
      />
    </div>
  )
}
