import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

const TYPE_LABELS = { bullish: 'Bullish', bearish: 'Bearish', both: 'Both' }
const TYPE_COLORS = { bullish: 'green', bearish: 'red', both: 'blue' }
const SIZE_LABELS = { '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }
const PERIOD_OPTIONS = [1, 7, 10, 30, 60]

const EMPTY_FORM = {
  name: '',
  description: '',
  fvg_type: 'both',
  candle_size: '1hour',
  period_days: 30,
  impulse_multiplier: 1.5,
  min_gap_pct: 0.05,
}

function AddFvgModal({ isOpen, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isOpen) { setForm(EMPTY_FORM); setErr('') }
  }, [isOpen])

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }
  function setNum(k) { return e => setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Name is required'); return }

    setSaving(true); setErr('')
    try {
      await axiosInstance.post('/api/admin/fvg-zones', {
        ...form,
        name: form.name.trim(),
        description: form.description.trim() || null,
        period_days: parseInt(form.period_days),
        impulse_multiplier: parseFloat(form.impulse_multiplier),
        min_gap_pct: parseFloat(form.min_gap_pct),
      })
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New FVG Zone Config" size="lg">
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <FormField label="Config Name">
            <Input value={form.name} onChange={set('name')} placeholder="e.g. NIFTY 4H Bullish FVG" />
          </FormField>
          <FormField label="Description">
            <Input value={form.description} onChange={set('description')} placeholder="Optional" />
          </FormField>

          <FormField label="FVG Type">
            <Select value={form.fvg_type} onChange={set('fvg_type')}>
              <option value="bullish">Bullish</option>
              <option value="bearish">Bearish</option>
              <option value="both">Both</option>
            </Select>
          </FormField>
          <FormField label="Candle Size">
            <Select value={form.candle_size} onChange={set('candle_size')}>
              <option value="15min">15 Min</option>
              <option value="30min">30 Min</option>
              <option value="1hour">1 Hour</option>
              <option value="4hour">4 Hour</option>
            </Select>
          </FormField>

          <FormField label="Period (days)">
            <Select value={form.period_days} onChange={e => setForm(f => ({ ...f, period_days: parseInt(e.target.value) }))}>
              {PERIOD_OPTIONS.map(d => (
                <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Impulse Multiplier" hint="Candle 2 body ÷ avg(candle1, candle3) must exceed this">
            <Input type="number" step="0.1" min="1" max="10" value={form.impulse_multiplier} onChange={setNum('impulse_multiplier')} />
          </FormField>

          <FormField label="Min Gap %" hint="Minimum FVG gap as % of price">
            <Input type="number" step="0.01" min="0" max="5" value={form.min_gap_pct} onChange={setNum('min_gap_pct')} />
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

const COLS = ['Name', 'Type', 'Candle Size', 'Period', 'Impulse ×', 'Min Gap %', 'Status', 'Actions']

export default function FvgZones() {
  const navigate = useNavigate()
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await axiosInstance.get('/api/admin/fvg-zones')
      setConfigs(r.data?.fvg_zones ?? [])
    } catch {
      setError('Failed to load FVG zone configs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function toggleStatus(c) {
    setToggling(c.id)
    try {
      await axiosInstance.put(`/api/admin/fvg-zones/${c.id}`, { is_active: !c.is_active })
      fetchData()
    } catch { alert('Toggle failed') }
    finally { setToggling(null) }
  }

  async function deleteConfig(c) {
    if (!window.confirm(`Delete FVG zone config "${c.name}"?`)) return
    setDeleting(c.id)
    try {
      await axiosInstance.delete(`/api/admin/fvg-zones/${c.id}`)
      fetchData()
    } catch { alert('Delete failed') }
    finally { setDeleting(null) }
  }

  return (
    <div>
      <PageHeader
        title="FVG Zones"
        action={<Btn variant="primary" onClick={() => setAddOpen(true)}>+ New FVG Config</Btn>}
      />

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={4} cols={8} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={8} /> :
           configs.length === 0 ? <EmptyRow message="No FVG zone configs defined" cols={8} /> :
           configs.map(c => (
             <tr key={c.id} className="hover:bg-gray-50">
               <td className="px-4 py-3">
                 <div className="font-medium text-gray-900 text-sm">{c.name}</div>
                 {c.description && <div className="text-xs text-gray-400 truncate max-w-[160px]">{c.description}</div>}
               </td>
               <td className="px-4 py-3">
                 <Badge variant={TYPE_COLORS[c.fvg_type] ?? 'gray'}>
                   {TYPE_LABELS[c.fvg_type] ?? c.fvg_type}
                 </Badge>
               </td>
               <td className="px-4 py-3 text-sm text-gray-700">
                 {SIZE_LABELS[c.candle_size] ?? c.candle_size}
               </td>
               <td className="px-4 py-3 text-sm text-gray-700">
                 {c.period_days}d
               </td>
               <td className="px-4 py-3 text-sm text-gray-700">
                 {c.impulse_multiplier}×
               </td>
               <td className="px-4 py-3 text-sm text-gray-700">
                 {c.min_gap_pct}%
               </td>
               <td className="px-4 py-3">
                 <button
                   onClick={() => toggleStatus(c)}
                   disabled={toggling === c.id}
                   className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${c.is_active ? 'bg-[#eb5202]' : 'bg-gray-300'}`}
                 >
                   <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${c.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
                 </button>
               </td>
               <td className="px-4 py-3">
                 <div className="flex items-center gap-2">
                   <Btn size="sm" variant="ghost" onClick={() => navigate(`/admin/fvg-zones/${c.id}/scan`)}>
                     Scan
                   </Btn>
                   <Btn size="sm" variant="ghost" onClick={() => navigate(`/admin/fvg-zones/${c.id}/edit`)}>
                     Edit
                   </Btn>
                   <Btn size="sm" variant="danger" onClick={() => deleteConfig(c)} disabled={deleting === c.id}>
                     {deleting === c.id ? '…' : 'Delete'}
                   </Btn>
                 </div>
               </td>
             </tr>
           ))
          }
        </Table>
      </Card>

      <AddFvgModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSaved={fetchData} />
    </div>
  )
}
