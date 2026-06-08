import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

const EMPTY_FORM = {
  name: '',
  description: '',
}

function AddZoneModal({ isOpen, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isOpen) { setForm(EMPTY_FORM); setErr('') }
  }, [isOpen])

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Name is required'); return }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
    }

    setSaving(true); setErr('')
    try {
      await axiosInstance.post('/api/admin/zones', payload)
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Zone Config" size="lg">
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <FormField label="Config Name" required>
            <Input value={form.name} onChange={set('name')} placeholder="Nifty Zone Config" />
          </FormField>
          <FormField label="Description" className="col-span-2">
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              rows={2}
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create Config'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

const COLS = ['Name', 'Description', 'FVG', 'S&R', 'Swing', 'Confluence', 'Status', 'Actions']

export default function Zones() {
  const navigate = useNavigate()
  const [zones, setZones] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [addOpen, setAddOpen]   = useState(false)
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await axiosInstance.get('/api/admin/zones')
      setZones(r.data?.zones ?? [])
    } catch {
      setError('Failed to load zones')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function deleteZone(z) {
    if (!window.confirm(`Delete zone config "${z.name}"?`)) return
    setDeleting(z.id)
    try {
      await axiosInstance.delete(`/api/admin/zones/${z.id}`)
      fetchData()
    } catch { alert('Delete failed') }
    finally { setDeleting(null) }
  }

  async function toggleStatus(z) {
    setToggling(z.id)
    try {
      await axiosInstance.put(`/api/admin/zones/${z.id}`, { is_active: !z.is_active })
      fetchData()
    } catch { alert('Toggle failed') }
    finally { setToggling(null) }
  }

  function countEnabledFvgTimeframes(fvg) {
    if (!fvg) return 0
    return Object.values(fvg).filter(tf => tf?.enabled).length
  }

  return (
    <div>
      <PageHeader
        title="Zones"
        action={<Btn variant="primary" onClick={() => setAddOpen(true)}>+ New Zone Config</Btn>}
      />

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={4} cols={8} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={8} /> :
           zones.length === 0 ? <EmptyRow message="No zone configs defined" cols={8} /> :
           zones.map(z => (
             <tr key={z.id} className="hover:bg-gray-50">
               <td className="px-4 py-3">
                 <div className="font-medium text-gray-900 text-sm">{z.name}</div>
               </td>
               <td className="px-4 py-3 text-sm text-gray-600">
                 {z.description ? <span className="truncate max-w-xs">{z.description}</span> : <span className="text-gray-400">—</span>}
               </td>
               <td className="px-4 py-3">
                 <Badge variant="blue">
                   {countEnabledFvgTimeframes(z.fvg_settings)} / 4
                 </Badge>
               </td>
               <td className="px-4 py-3">
                 <Badge variant="gray">4H</Badge>
               </td>
               <td className="px-4 py-3">
                 <Badge variant="gray">4H</Badge>
               </td>
               <td className="px-4 py-3">
                 <Badge variant={z.confluence_settings?.enabled ? 'green' : 'gray'}>
                   {z.confluence_settings?.enabled ? 'Enabled' : 'Disabled'}
                 </Badge>
               </td>
               <td className="px-4 py-3">
                 <button
                   onClick={() => toggleStatus(z)}
                   disabled={toggling === z.id}
                   className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${z.is_active ? 'bg-[#eb5202]' : 'bg-gray-300'}`}
                 >
                   <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${z.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
                 </button>
               </td>
               <td className="px-4 py-3">
                 <div className="flex items-center gap-2">
                   <Btn size="sm" variant="ghost" onClick={() => navigate(`/admin/zones/${z.id}/scan`)}>
                     Scan
                   </Btn>
                   <Btn size="sm" variant="ghost" onClick={() => navigate(`/admin/zones/${z.id}/edit`)}>
                     Edit
                   </Btn>
                   <Btn size="sm" variant="danger" onClick={() => deleteZone(z)} disabled={deleting === z.id}>
                     {deleting === z.id ? '…' : 'Delete'}
                   </Btn>
                 </div>
               </td>
             </tr>
           ))
          }
        </Table>
      </Card>

      <AddZoneModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={fetchData}
      />
    </div>
  )
}
