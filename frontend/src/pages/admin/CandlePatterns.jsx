import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'
import PatternScanPanel from '../../components/PatternScanPanel'

const PATTERN_TYPES = [
  'bullish_breakout',
  'bearish_breakout',
  'bullish_reversal',
  'bearish_reversal',
  'range_breakout',
  'momentum',
  'custom',
]

const DIRECTIONS = ['bullish', 'bearish']

const EMPTY_FORM = {
  name: '',
  description: '',
  pattern_type: 'bullish_breakout',
  direction: 'bullish',
  market: '',
}

function AddPatternModal({ isOpen, onClose, onSaved }) {
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
    if (!form.pattern_type) { setErr('Pattern type is required'); return }

    const payload = {
      name:        form.name.trim(),
      description: form.description.trim() || null,
      pattern_type: form.pattern_type,
      direction:   form.direction,
      market:      form.market.trim() || null,
    }

    setSaving(true); setErr('')
    try {
      await axiosInstance.post('/api/admin/candle-patterns', payload)
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Candle Pattern" size="lg">
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <FormField label="Pattern Name" required>
            <Input value={form.name} onChange={set('name')} placeholder="Breakout A – Bullish" />
          </FormField>
          <FormField label="Market">
            <Input value={form.market} onChange={set('market')} placeholder="Nifty/Sensex" />
          </FormField>
          <FormField label="Pattern Type" required>
            <Select value={form.pattern_type} onChange={set('pattern_type')}>
              {PATTERN_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Direction" required>
            <Select value={form.direction} onChange={set('direction')}>
              {DIRECTIONS.map(d => (
                <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
              ))}
            </Select>
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
            {saving ? 'Saving…' : 'Create Pattern'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

const DIRECTION_BADGE = {
  bullish: 'bg-green-100 text-green-700',
  bearish: 'bg-red-100 text-red-700',
}

const COLS = ['Name', 'Type', 'Direction', 'Market', 'Status', 'Actions']

export default function CandlePatterns() {
  const navigate = useNavigate()
  const [patterns, setPatterns] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [addOpen, setAddOpen]   = useState(false)
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [scanFor,  setScanFor]  = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await axiosInstance.get('/api/admin/candle-patterns')
      setPatterns(r.data?.patterns ?? [])
    } catch {
      setError('Failed to load candle patterns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function deletePattern(p) {
    if (!window.confirm(`Delete pattern "${p.name}"? Linked strategies will be unlinked.`)) return
    setDeleting(p.id)
    try {
      await axiosInstance.delete(`/api/admin/candle-patterns/${p.id}`)
      fetchData()
    } catch { alert('Delete failed') }
    finally { setDeleting(null) }
  }

  async function toggleStatus(p) {
    setToggling(p.id)
    try {
      await axiosInstance.put(`/api/admin/candle-patterns/${p.id}`, { is_active: !p.is_active })
      fetchData()
    } catch { alert('Toggle failed') }
    finally { setToggling(null) }
  }

  return (
    <div>
      <PageHeader
        title="Candle Patterns"
        action={<Btn variant="primary" onClick={() => setAddOpen(true)}>+ New Pattern</Btn>}
      />

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={4} cols={6} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={6} /> :
           patterns.length === 0 ? <EmptyRow message="No candle patterns defined" cols={6} /> :
           patterns.map(p => (
             <tr key={p.id} className="hover:bg-gray-50">
               <td className="px-4 py-3">
                 <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                 {p.description && <div className="text-xs text-gray-400 truncate max-w-xs">{p.description}</div>}
               </td>
               <td className="px-4 py-3">
                 <Badge variant="gray">
                   {p.pattern_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                 </Badge>
               </td>
               <td className="px-4 py-3">
                 <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${DIRECTION_BADGE[p.direction] ?? 'bg-gray-100 text-gray-500'}`}>
                   {p.direction?.charAt(0).toUpperCase() + p.direction?.slice(1)}
                 </span>
               </td>
               <td className="px-4 py-3 text-sm text-gray-700">{p.market || '—'}</td>
               <td className="px-4 py-3">
                 <button
                   onClick={() => toggleStatus(p)}
                   disabled={toggling === p.id}
                   className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.is_active ? 'bg-[#eb5202]' : 'bg-gray-300'}`}
                 >
                   <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${p.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
                 </button>
               </td>
               <td className="px-4 py-3">
                 <div className="flex items-center gap-2">
                   <Btn size="sm" variant="ghost" onClick={() => setScanFor(p)}>Scan</Btn>
                   <Btn size="sm" variant="ghost" onClick={() => navigate(`/admin/candle-patterns/${p.id}/edit`)}>
                     Edit
                   </Btn>
                   <Btn size="sm" variant="danger" onClick={() => deletePattern(p)} disabled={deleting === p.id}>
                     {deleting === p.id ? '…' : 'Delete'}
                   </Btn>
                 </div>
               </td>
             </tr>
           ))
          }
        </Table>
      </Card>

      <AddPatternModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={fetchData}
      />

      <Modal
        isOpen={Boolean(scanFor)}
        onClose={() => setScanFor(null)}
        title={`Pattern Scan — ${scanFor?.name || ''}`}
        size="6xl"
      >
        {scanFor && (
          <PatternScanPanel lockedPattern={scanFor} />
        )}
      </Modal>
    </div>
  )
}
