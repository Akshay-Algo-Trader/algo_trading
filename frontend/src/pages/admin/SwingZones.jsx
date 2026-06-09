import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow,
  Modal, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

const SIZE_LABELS = { '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }
const PERIOD_OPTIONS = [1, 7, 10, 30, 60, 90]

const EMPTY_FORM = {
  name: '',
  description: '',
  candle_size: '4hour',
  period_days: 30,
  pivot_bars: 5,
}

function AddSwingModal({ isOpen, onClose, onSaved }) {
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

    setSaving(true); setErr('')
    try {
      const res = await axiosInstance.post('/api/admin/swing-zones', {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        candle_size: form.candle_size,
        period_days: parseInt(form.period_days),
        pivot_bars: parseInt(form.pivot_bars),
      })
      onSaved(res.data.swing_zone)
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Failed to create config')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add S&R Config">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Config Name">
            <Input value={form.name} onChange={set('name')} placeholder="e.g. SBIN 4H S&R" autoFocus />
          </FormField>
          <FormField label="Description">
            <Input value={form.description} onChange={set('description')} placeholder="Optional" />
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Candle Size">
            <Select value={form.candle_size} onChange={set('candle_size')}>
              {Object.entries(SIZE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </FormField>
          <FormField label="Lookback Period">
            <Select value={form.period_days} onChange={e => setForm(f => ({ ...f, period_days: parseInt(e.target.value) }))}>
              {PERIOD_OPTIONS.map(d => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
            </Select>
          </FormField>
          <FormField label="Pivot Bars" hint="Bars on each side required to confirm a pivot">
            <Input
              type="number" min="2" max="20"
              value={form.pivot_bars}
              onChange={e => setForm(f => ({ ...f, pivot_bars: parseInt(e.target.value) || 5 }))}
            />
          </FormField>
        </div>

        {err && <p className="text-sm text-red-500">{err}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Config'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

export default function SwingZones() {
  const navigate = useNavigate()
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setError('')
    axiosInstance.get('/api/admin/swing-zones')
      .then(r => { setConfigs(r.data.swing_zones); setLoading(false) })
      .catch(() => { setError('Failed to load configs'); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(cfg) {
    setToggling(cfg.id)
    try {
      const res = await axiosInstance.put(`/api/admin/swing-zones/${cfg.id}`, { is_active: !cfg.is_active })
      setConfigs(cs => cs.map(c => c.id === cfg.id ? res.data.swing_zone : c))
    } catch { /* ignore */ }
    finally { setToggling(null) }
  }

  async function handleDelete(cfg) {
    if (!window.confirm(`Delete "${cfg.name}"? This will also remove all scan history.`)) return
    setDeleting(cfg.id)
    try {
      await axiosInstance.delete(`/api/admin/swing-zones/${cfg.id}`)
      setConfigs(cs => cs.filter(c => c.id !== cfg.id))
    } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support &amp; Resistance"
        action={<Btn variant="primary" onClick={() => setShowAdd(true)}>+ Add Config</Btn>}
      />

      <AddSwingModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={cfg => { setConfigs(cs => [...cs, cfg]); setShowAdd(false) }}
      />

      <Card>
        <Table headers={['Name', 'Candle Size', 'Period', 'Pivot Bars', 'Status', 'Actions']}>
          {loading && <SkeletonTable cols={6} />}
          {!loading && error && <ErrorRow cols={6} message={error} />}
          {!loading && !error && configs.length === 0 && <EmptyRow cols={6} message="No S&R configs yet" />}
          {!loading && !error && configs.map(cfg => (
            <tr key={cfg.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{cfg.name}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{SIZE_LABELS[cfg.candle_size] ?? cfg.candle_size}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{cfg.period_days}d</td>
              <td className="px-4 py-3 text-sm text-gray-600">{cfg.pivot_bars}</td>
              <td className="px-4 py-3">
                <button
                  onClick={() => handleToggle(cfg)}
                  disabled={toggling === cfg.id}
                  className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                    cfg.is_active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {toggling === cfg.id ? '…' : cfg.is_active ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Btn variant="ghost" size="sm" onClick={() => navigate(`/admin/swing-zones/${cfg.id}/scan`)}>Scan</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => navigate(`/admin/swing-zones/${cfg.id}/edit`)}>Edit</Btn>
                  <Btn
                    variant="danger" size="sm"
                    disabled={deleting === cfg.id}
                    onClick={() => handleDelete(cfg)}
                  >
                    {deleting === cfg.id ? '…' : 'Delete'}
                  </Btn>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}
