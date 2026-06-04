import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

function usePatterns() {
  const [patterns, setPatterns] = useState([])
  useEffect(() => {
    axiosInstance.get('/api/admin/candle-patterns')
      .then(r => setPatterns(r.data?.patterns ?? []))
      .catch(() => {})
  }, [])
  return patterns
}

function InstrumentSearch({ value, onChange }) {
  const [query, setQuery] = useState(value || '')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setQuery(value || '') }, [value])

  function fetchOptions(q) {
    setLoading(true)
    axiosInstance.get(`/api/admin/instruments?q=${encodeURIComponent(q)}`)
      .then(r => setOptions(r.data?.instruments ?? []))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }

  function handleInput(e) {
    const q = e.target.value.toUpperCase()
    setQuery(q)
    onChange({ symbol: q, exchange: null })
    setOpen(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchOptions(q), 220)
  }

  function handleFocus() {
    setOpen(true)
    if (options.length === 0) fetchOptions(query)
  }

  function select(opt) {
    setQuery(opt.symbol)
    onChange({ symbol: opt.symbol, exchange: opt.exchange })
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={handleFocus}
        placeholder="Search symbol or company…"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {loading && <li className="px-3 py-2 text-xs text-gray-400">Searching…</li>}
          {!loading && options.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-400">No instruments found</li>
          )}
          {options.map(opt => {
            const isIndex = opt.symbol.startsWith('NIFTY') || opt.symbol === 'SENSEX' || opt.symbol === 'BANKEX' || opt.symbol.startsWith('BSE')
            const isMCX   = opt.exchange === 'MCX'
            const badgeCls = isIndex ? 'bg-purple-100 text-purple-600'
                           : isMCX   ? 'bg-yellow-100 text-yellow-700'
                           :            'bg-gray-100 text-gray-500'
            return (
              <li
                key={`${opt.exchange}:${opt.symbol}`}
                onMouseDown={() => select(opt)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer"
              >
                <span className="font-mono font-semibold text-xs text-gray-800">{opt.symbol}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${badgeCls}`}>
                  {isIndex ? 'INDEX' : opt.exchange}
                </span>
                <span className="text-xs text-gray-400 truncate">{opt.name}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const CONDITION_TYPES = ['price_above', 'price_below', 'price_cross_up', 'price_cross_down']
const EXCHANGES = ['NSE', 'BSE', 'MCX']
const ORDER_TYPES = ['MARKET', 'LIMIT']

const EMPTY_FORM = {
  name: '', description: '', instrument: '', exchange: 'NSE',
  order_type: 'MARKET', quantity: '', stop_loss_pct: '', take_profit_pct: '',
  entry_type: 'price_above', entry_value: '',
  exit_type: 'price_below', exit_value: '',
  candle_pattern_id: '',
}

// ─── Strategy form modal ───────────────────────────────────────────────────────
function StrategyModal({ isOpen, onClose, onSaved, strategy }) {
  const isEdit = Boolean(strategy)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const patterns = usePatterns()

  useEffect(() => {
    if (strategy) {
      setForm({
        name:              strategy.name ?? '',
        description:       strategy.description ?? '',
        instrument:        strategy.instrument ?? '',
        exchange:          strategy.exchange ?? 'NSE',
        order_type:        strategy.order_type ?? 'MARKET',
        quantity:          String(strategy.quantity ?? ''),
        stop_loss_pct:     String(strategy.stop_loss_pct ?? ''),
        take_profit_pct:   String(strategy.take_profit_pct ?? ''),
        entry_type:        strategy.entry_condition?.type ?? 'price_above',
        entry_value:       String(strategy.entry_condition?.value ?? ''),
        exit_type:         strategy.exit_condition?.type ?? 'price_below',
        exit_value:        String(strategy.exit_condition?.value ?? ''),
        candle_pattern_id: strategy.candle_pattern_id ? String(strategy.candle_pattern_id) : '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErr('')
  }, [strategy, isOpen])

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    const required = ['name', 'instrument', 'quantity', 'stop_loss_pct', 'take_profit_pct', 'entry_value']
    const missing = required.filter(k => !form[k])
    if (missing.length) { setErr(`Required: ${missing.join(', ')}`); return }

    setSaving(true); setErr('')
    const payload = {
      name:            form.name,
      description:     form.description,
      instrument:      form.instrument.toUpperCase(),
      exchange:        form.exchange,
      order_type:      form.order_type,
      quantity:        parseInt(form.quantity),
      stop_loss_pct:   parseFloat(form.stop_loss_pct),
      take_profit_pct: parseFloat(form.take_profit_pct),
      entry_condition:  { type: form.entry_type, value: parseFloat(form.entry_value) },
      exit_condition:   form.exit_value ? { type: form.exit_type, value: parseFloat(form.exit_value) } : null,
      candle_pattern_id: form.candle_pattern_id ? parseInt(form.candle_pattern_id) : null,
    }
    try {
      if (isEdit) {
        await axiosInstance.put(`/api/admin/strategies/${strategy.id}`, payload)
      } else {
        await axiosInstance.post('/api/admin/strategies', payload)
      }
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Strategy' : 'New Strategy'} size="lg">
      <form onSubmit={handleSubmit}>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
        <div className="grid grid-cols-2 gap-x-4">
          <FormField label="Strategy Name">
            <Input value={form.name} onChange={set('name')} placeholder="MA Crossover" required />
          </FormField>
          <FormField label="Instrument">
            <InstrumentSearch
              value={form.instrument}
              onChange={({ symbol, exchange }) =>
                setForm(f => ({
                  ...f,
                  instrument: symbol,
                  ...(exchange ? { exchange } : {}),
                }))
              }
            />
          </FormField>
          <FormField label="Exchange">
            <Select value={form.exchange} onChange={set('exchange')}>
              {EXCHANGES.map(e => <option key={e}>{e}</option>)}
            </Select>
          </FormField>
          <FormField label="Order Type">
            <Select value={form.order_type} onChange={set('order_type')}>
              {ORDER_TYPES.map(t => <option key={t}>{t}</option>)}
            </Select>
          </FormField>
          <FormField label="Quantity (lots)">
            <Input type="number" min={1} value={form.quantity} onChange={set('quantity')} required />
          </FormField>
          <FormField label="Description">
            <Input value={form.description} onChange={set('description')} placeholder="Optional" />
          </FormField>
          <FormField label="Candle Pattern">
            <Select value={form.candle_pattern_id} onChange={set('candle_pattern_id')}>
              <option value="">— None —</option>
              {patterns.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.direction})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Stop Loss %">
            <Input type="number" step="0.01" min={0} value={form.stop_loss_pct} onChange={set('stop_loss_pct')} required />
          </FormField>
          <FormField label="Take Profit %">
            <Input type="number" step="0.01" min={0} value={form.take_profit_pct} onChange={set('take_profit_pct')} required />
          </FormField>
        </div>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-1">Entry Condition</p>
        <div className="grid grid-cols-2 gap-x-4 mb-2">
          <FormField label="Type">
            <Select value={form.entry_type} onChange={set('entry_type')}>
              {CONDITION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
          </FormField>
          <FormField label="Value" hint="Price threshold (e.g. 19500)">
            <Input type="number" step="0.01" value={form.entry_value} onChange={set('entry_value')} required />
          </FormField>
        </div>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Exit Condition (optional)</p>
        <div className="grid grid-cols-2 gap-x-4">
          <FormField label="Type">
            <Select value={form.exit_type} onChange={set('exit_type')}>
              {CONDITION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
          </FormField>
          <FormField label="Value">
            <Input type="number" step="0.01" value={form.exit_value} onChange={set('exit_value')} placeholder="Leave blank to use SL/TP only" />
          </FormField>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Strategy'}</Btn>
        </div>
      </form>
    </Modal>
  )
}


// ─── Page ─────────────────────────────────────────────────────────────────────
const COLS = ['Name', 'Instrument', 'Pattern', 'Order Type', 'Entry Condition', 'SL%', 'TP%', 'Status', 'Actions']

export default function Strategies() {
  const navigate = useNavigate()
  const [strategies, setStrategies] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [addOpen, setAddOpen]       = useState(false)
  const [toggling, setToggling]     = useState(null)
  const [deleting, setDeleting]     = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await axiosInstance.get('/api/admin/strategies')
      setStrategies(r.data?.strategies ?? r.data ?? [])
    } catch { setError('Failed to load strategies') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function deleteStrategy(s) {
    if (!window.confirm(`Delete strategy "${s.name}"? This cannot be undone.`)) return
    setDeleting(s.id)
    try {
      await axiosInstance.delete(`/api/admin/strategies/${s.id}`)
      fetchData()
    } catch { alert('Delete failed') }
    finally { setDeleting(null) }
  }

  async function toggleStatus(s) {
    setToggling(s.id)
    try {
      await axiosInstance.put(`/api/admin/strategies/${s.id}`, { is_active: !s.is_active })
      fetchData()
    } catch { alert('Toggle failed') }
    finally { setToggling(null) }
  }

  return (
    <div>
      <PageHeader
        title="Strategies"
        action={<Btn variant="primary" onClick={() => setAddOpen(true)}>+ New Strategy</Btn>}
      />

      <Card>
        <Table headers={COLS}>
          {loading ? <SkeletonTable rows={5} cols={9} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={9} /> :
           strategies.length === 0 ? <EmptyRow message="No strategies defined" cols={9} /> :
           strategies.map(s => (
             <tr key={s.id} className="hover:bg-gray-50">
               <td className="px-4 py-3">
                 <div className="font-medium text-gray-900 text-sm">{s.name}</div>
                 {s.description && <div className="text-xs text-gray-400">{s.description}</div>}
               </td>
               <td className="px-4 py-3 text-sm">
                 <span className="font-medium">{s.instrument}</span>
                 <span className="text-gray-400 ml-1 text-xs">({s.exchange})</span>
               </td>
               <td className="px-4 py-3">
                 {s.candle_pattern ? (
                   <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${s.candle_pattern.direction === 'bullish' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                     {s.candle_pattern.name}
                   </span>
                 ) : <span className="text-xs text-gray-400">—</span>}
               </td>
               <td className="px-4 py-3"><Badge variant="gray">{s.order_type}</Badge></td>
               <td className="px-4 py-3 text-xs text-gray-600">
                 {s.entry_condition?.type?.replace(/_/g, ' ')} @ {s.entry_condition?.value}
               </td>
               <td className="px-4 py-3 text-sm text-red-600 font-medium">{s.stop_loss_pct}%</td>
               <td className="px-4 py-3 text-sm text-green-600 font-medium">{s.take_profit_pct}%</td>
               <td className="px-4 py-3">
                 <button
                   onClick={() => toggleStatus(s)}
                   disabled={toggling === s.id}
                   className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${s.is_active ? 'bg-[#eb5202]' : 'bg-gray-300'}`}
                 >
                   <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${s.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
                 </button>
               </td>
               <td className="px-4 py-3">
                 <div className="flex items-center gap-2">
                   <Btn size="sm" variant="ghost" onClick={() => navigate(`/admin/strategies/${s.id}/edit`)}>Edit</Btn>
                   <Btn size="sm" variant="danger" onClick={() => deleteStrategy(s)} disabled={deleting === s.id}>
                     {deleting === s.id ? '…' : 'Delete'}
                   </Btn>
                 </div>
               </td>
             </tr>
           ))
          }
        </Table>
      </Card>

      <StrategyModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSaved={fetchData} strategy={null} />
    </div>
  )
}
