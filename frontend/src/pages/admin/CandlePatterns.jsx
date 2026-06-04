import { useEffect, useState, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

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
  timeframes_raw: '1D,4H,1H,30M,15M,5M,3M',
  entry_conditions_raw: '',
  stop_loss_rules_raw: '',
  target_rules_raw: '',
  indicator_settings_raw: '',
  trade_filters_raw: '',
}

function PatternModal({ isOpen, onClose, onSaved, pattern }) {
  const isEdit = Boolean(pattern)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (pattern) {
      setForm({
        name:                   pattern.name ?? '',
        description:            pattern.description ?? '',
        pattern_type:           pattern.pattern_type ?? 'bullish_breakout',
        direction:              pattern.direction ?? 'bullish',
        market:                 pattern.market ?? '',
        timeframes_raw:         (pattern.timeframes ?? []).join(','),
        entry_conditions_raw:   pattern.entry_conditions
                                  ? JSON.stringify(pattern.entry_conditions, null, 2)
                                  : '',
        stop_loss_rules_raw:    pattern.stop_loss_rules
                                  ? JSON.stringify(pattern.stop_loss_rules, null, 2)
                                  : '',
        target_rules_raw:       pattern.target_rules
                                  ? JSON.stringify(pattern.target_rules, null, 2)
                                  : '',
        indicator_settings_raw: pattern.indicator_settings
                                  ? JSON.stringify(pattern.indicator_settings, null, 2)
                                  : '',
        trade_filters_raw:      pattern.trade_filters
                                  ? JSON.stringify(pattern.trade_filters, null, 2)
                                  : '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErr('')
  }, [pattern, isOpen])

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  function parseJsonField(raw, fieldName) {
    if (!raw.trim()) return null
    try {
      return JSON.parse(raw)
    } catch {
      throw new Error(`${fieldName}: invalid JSON`)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (!form.pattern_type) { setErr('Pattern type is required'); return }

    let payload
    try {
      payload = {
        name:               form.name.trim(),
        description:        form.description.trim() || null,
        pattern_type:       form.pattern_type,
        direction:          form.direction,
        market:             form.market.trim() || null,
        timeframes:         form.timeframes_raw ? form.timeframes_raw.split(',').map(s => s.trim()).filter(Boolean) : null,
        entry_conditions:   parseJsonField(form.entry_conditions_raw, 'Entry Conditions'),
        stop_loss_rules:    parseJsonField(form.stop_loss_rules_raw, 'Stop Loss Rules'),
        target_rules:       parseJsonField(form.target_rules_raw, 'Target Rules'),
        indicator_settings: parseJsonField(form.indicator_settings_raw, 'Indicator Settings'),
        trade_filters:      parseJsonField(form.trade_filters_raw, 'Trade Filters'),
      }
    } catch (ex) {
      setErr(ex.message)
      return
    }

    setSaving(true); setErr('')
    try {
      if (isEdit) {
        await axiosInstance.put(`/api/admin/candle-patterns/${pattern.id}`, payload)
      } else {
        await axiosInstance.post('/api/admin/candle-patterns', payload)
      }
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Pattern' : 'New Candle Pattern'} size="lg">
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}

        <div className="grid grid-cols-2 gap-x-4">
          <FormField label="Pattern Name">
            <Input value={form.name} onChange={set('name')} placeholder="Breakout A – Bullish" required />
          </FormField>
          <FormField label="Market">
            <Input value={form.market} onChange={set('market')} placeholder="Nifty/Sensex" />
          </FormField>
          <FormField label="Pattern Type">
            <Select value={form.pattern_type} onChange={set('pattern_type')}>
              {PATTERN_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Direction">
            <Select value={form.direction} onChange={set('direction')}>
              {DIRECTIONS.map(d => (
                <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Description" className="col-span-2">
            <Input value={form.description} onChange={set('description')} placeholder="Optional description" />
          </FormField>
          <FormField label="Timeframes (comma-separated)" className="col-span-2">
            <Input value={form.timeframes_raw} onChange={set('timeframes_raw')} placeholder="1D,4H,1H,30M,15M,5M,3M" />
          </FormField>
        </div>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 mt-3">
          Entry Conditions <span className="font-normal normal-case">(JSON)</span>
        </p>
        <textarea
          value={form.entry_conditions_raw}
          onChange={set('entry_conditions_raw')}
          rows={4}
          placeholder='[{"type": "price_breakout_above", "description": "..."}]'
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Stop Loss Rules <span className="font-normal normal-case">(JSON)</span>
        </p>
        <textarea
          value={form.stop_loss_rules_raw}
          onChange={set('stop_loss_rules_raw')}
          rows={3}
          placeholder='{"candle_size_max_pct": 0.2, "exit_below_first_candle_low": true}'
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Target Rules <span className="font-normal normal-case">(JSON)</span>
        </p>
        <textarea
          value={form.target_rules_raw}
          onChange={set('target_rules_raw')}
          rows={3}
          placeholder='{"pct_target_1": 0.3, "pct_target_2": 0.45}'
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Indicator Settings <span className="font-normal normal-case">(JSON)</span>
        </p>
        <textarea
          value={form.indicator_settings_raw}
          onChange={set('indicator_settings_raw')}
          rows={3}
          placeholder='{"cpr": {"ascending": true}, "rsi_range": [57, 70]}'
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Trade Filters <span className="font-normal normal-case">(JSON)</span>
        </p>
        <textarea
          value={form.trade_filters_raw}
          onChange={set('trade_filters_raw')}
          rows={3}
          placeholder='{"avoid_after_consecutive_losses": 2, "avoid_after_consecutive_trend_days": 3}'
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />

        <div className="flex justify-end gap-2 mt-2">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Pattern'}
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

const COLS = ['Name', 'Type', 'Direction', 'Market', 'Timeframes', 'Status', 'Actions']

export default function CandlePatterns() {
  const [patterns, setPatterns]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [addOpen, setAddOpen]     = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [toggling, setToggling]   = useState(null)
  const [deleting, setDeleting]   = useState(null)

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
          {loading ? <SkeletonTable rows={4} cols={7} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={7} /> :
           patterns.length === 0 ? <EmptyRow message="No candle patterns defined" cols={7} /> :
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
               <td className="px-4 py-3 text-xs text-gray-500">
                 {p.timeframes?.join(', ') || '—'}
               </td>
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
                   <Btn size="sm" variant="ghost" onClick={() => setEditTarget(p)}>Edit</Btn>
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

      <PatternModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={fetchData}
        pattern={null}
      />
      <PatternModal
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        onSaved={fetchData}
        pattern={editTarget}
      />
    </div>
  )
}
