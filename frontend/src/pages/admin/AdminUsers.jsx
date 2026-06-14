import { useEffect, useState, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Btn, PageHeader, fmtDate,
} from '../../components/admin/TableHelpers'

const COLS = ['Email', 'Status', 'Session Timeout', 'Created', 'Actions']

function currentAdmin() {
  try { return JSON.parse(localStorage.getItem('user') || '{}') }
  catch { return {} }
}

// ─── Add Admin Modal ───────────────────────────────────────────────────────────
function AddAdminModal({ isOpen, onClose, onSaved }) {
  const [form, setForm] = useState({ email: '', password: '', session_timeout_minutes: '60' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function reset() { setForm({ email: '', password: '', session_timeout_minutes: '60' }); setErr('') }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) { setErr('Email and password are required'); return }
    if (form.password.length < 8) { setErr('Password must be at least 8 characters'); return }
    setSaving(true); setErr('')
    try {
      await axiosInstance.post('/api/admin/admin-users', {
        email: form.email,
        password: form.password,
        session_timeout_minutes: parseInt(form.session_timeout_minutes, 10) || 60,
      })
      onSaved(); reset(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Failed to create admin')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose() }} title="Add Admin User">
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
        <FormField label="Email">
          <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="admin@example.com" required />
        </FormField>
        <FormField label="Password">
          <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimum 8 characters" required />
        </FormField>
        <FormField label="Session Timeout (minutes)" hint="How long this admin stays logged in before re-login is required">
          <Input type="number" value={form.session_timeout_minutes} onChange={e => setForm(f => ({ ...f, session_timeout_minutes: e.target.value }))} min={1} step={5} />
        </FormField>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" type="button" onClick={() => { reset(); onClose() }}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Admin'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

// ─── Change Password Modal ───────────────────────────────────────────────────────
function ChangePasswordModal({ admin, onClose, onSaved }) {
  const [form, setForm] = useState({ current_password: '', new_password: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const isSelf = admin && currentAdmin().id === admin.id

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.new_password.length < 8) { setErr('New password must be at least 8 characters'); return }
    setSaving(true); setErr('')
    try {
      await axiosInstance.post(`/api/admin/admin-users/${admin.id}/change-password`, form)
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={!!admin} onClose={onClose} title={isSelf ? 'Change Your Password' : `Change Password — ${admin?.email}`}>
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
        {!isSelf && (
          <p className="text-xs text-gray-500 mb-3">
            Enter <strong>your own</strong> current password to authorize changing this admin's password.
          </p>
        )}
        <FormField label="Your Current Password">
          <Input type="password" value={form.current_password} onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))} required />
        </FormField>
        <FormField label="New Password">
          <Input type="password" value={form.new_password} onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))} placeholder="Minimum 8 characters" required />
        </FormField>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update Password'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

// ─── Edit Timeout Modal ──────────────────────────────────────────────────────────
function EditTimeoutModal({ admin, onClose, onSaved }) {
  const [timeout, setTimeoutVal] = useState(String(admin?.session_timeout_minutes ?? 60))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      await axiosInstance.put(`/api/admin/admin-users/${admin.id}`, {
        session_timeout_minutes: parseInt(timeout, 10) || 60,
      })
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Failed to update timeout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={!!admin} onClose={onClose} title={`Session Timeout — ${admin?.email}`}>
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
        <FormField label="Session Timeout (minutes)" hint="Applies the next time this admin logs in">
          <Input type="number" value={timeout} onChange={e => setTimeoutVal(e.target.value)} min={1} step={5} required />
        </FormField>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

function fmtTimeout(mins) {
  if (mins % 1440 === 0) return `${mins / 1440}d`
  if (mins % 60 === 0) return `${mins / 60}h`
  return `${mins}m`
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pwdAdmin, setPwdAdmin] = useState(null)
  const [timeoutAdmin, setTimeoutAdmin] = useState(null)
  const me = currentAdmin()

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await axiosInstance.get('/api/admin/admin-users')
      setAdmins(res.data?.admins ?? [])
    } catch {
      setError('Failed to load admin users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function toggleActive(admin) {
    try {
      await axiosInstance.put(`/api/admin/admin-users/${admin.id}`, { is_active: !admin.is_active })
      fetchData()
    } catch (ex) {
      alert(ex.response?.data?.error ?? 'Failed to update')
    }
  }

  async function handleDelete(admin) {
    if (!confirm(`Delete admin ${admin.email}? This cannot be undone.`)) return
    try {
      await axiosInstance.delete(`/api/admin/admin-users/${admin.id}`)
      fetchData()
    } catch (ex) {
      alert(ex.response?.data?.error ?? 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Admin Users"
        action={<Btn variant="primary" onClick={() => setAddOpen(true)}>+ Add Admin</Btn>}
      />

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={4} cols={COLS.length} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={COLS.length} /> :
           admins.length === 0 ? <EmptyRow message="No admin users found" cols={COLS.length} /> :
           admins.map(admin => {
             const isSelf = me.id === admin.id
             return (
               <tr key={admin.id} className="hover:bg-gray-50">
                 <td className="px-4 py-3">
                   <div className="font-medium text-gray-900 text-sm">
                     {admin.email} {isSelf && <span className="text-xs text-gray-400">(you)</span>}
                   </div>
                   <div className="text-xs text-gray-400">ID: {admin.id}</div>
                 </td>
                 <td className="px-4 py-3">
                   <Badge variant={admin.is_active ? 'green' : 'gray'}>
                     {admin.is_active ? 'Active' : 'Inactive'}
                   </Badge>
                 </td>
                 <td className="px-4 py-3 text-gray-700 text-sm">
                   {fmtTimeout(admin.session_timeout_minutes)}
                 </td>
                 <td className="px-4 py-3 text-gray-500 text-sm">{fmtDate(admin.created_at)}</td>
                 <td className="px-4 py-3">
                   <div className="flex items-center gap-2 flex-wrap">
                     <Btn size="sm" variant="ghost" onClick={() => setPwdAdmin(admin)}>Password</Btn>
                     <Btn size="sm" variant="ghost" onClick={() => setTimeoutAdmin(admin)}>Timeout</Btn>
                     {!isSelf && (
                       <>
                         <Btn size="sm" variant="ghost" onClick={() => toggleActive(admin)}>
                           {admin.is_active ? 'Deactivate' : 'Activate'}
                         </Btn>
                         <Btn size="sm" variant="ghost" onClick={() => handleDelete(admin)}>Delete</Btn>
                       </>
                     )}
                   </div>
                 </td>
               </tr>
             )
           })}
        </Table>
      </Card>

      <AddAdminModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSaved={fetchData} />
      {pwdAdmin && <ChangePasswordModal admin={pwdAdmin} onClose={() => setPwdAdmin(null)} onSaved={fetchData} />}
      {timeoutAdmin && <EditTimeoutModal admin={timeoutAdmin} onClose={() => setTimeoutAdmin(null)} onSaved={fetchData} />}
    </div>
  )
}
