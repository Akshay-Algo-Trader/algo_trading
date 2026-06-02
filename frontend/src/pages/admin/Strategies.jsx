import { useEffect, useState, useCallback, useRef } from 'react'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow, Badge,
  Modal, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

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
            const isIndex = opt.name && (
              opt.symbol.startsWith('NIFTY') ||
              opt.symbol === 'SENSEX' ||
              opt.symbol === 'BANKEX' ||
              opt.symbol.startsWith('BSE')
            )
            return (
              <li
                key={`${opt.exchange}:${opt.symbol}`}
                onMouseDown={() => select(opt)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer"
              >
                <span className="font-mono font-semibold text-xs text-gray-800">{opt.symbol}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${isIndex ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
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
const EXCHANGES = ['NSE', 'BSE']
const ORDER_TYPES = ['MARKET', 'LIMIT']

const EMPTY_FORM = {
  name: '', description: '', instrument: '', exchange: 'NSE',
  order_type: 'MARKET', quantity: '', stop_loss_pct: '', take_profit_pct: '',
  entry_type: 'price_above', entry_value: '',
  exit_type: 'price_below', exit_value: '',
}

// ─── Strategy form modal ───────────────────────────────────────────────────────
function StrategyModal({ isOpen, onClose, onSaved, strategy }) {
  const isEdit = Boolean(strategy)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (strategy) {
      setForm({
        name:            strategy.name ?? '',
        description:     strategy.description ?? '',
        instrument:      strategy.instrument ?? '',
        exchange:        strategy.exchange ?? 'NSE',
        order_type:      strategy.order_type ?? 'MARKET',
        quantity:        String(strategy.quantity ?? ''),
        stop_loss_pct:   String(strategy.stop_loss_pct ?? ''),
        take_profit_pct: String(strategy.take_profit_pct ?? ''),
        entry_type:      strategy.entry_condition?.type ?? 'price_above',
        entry_value:     String(strategy.entry_condition?.value ?? ''),
        exit_type:       strategy.exit_condition?.type ?? 'price_below',
        exit_value:      String(strategy.exit_condition?.value ?? ''),
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
      entry_condition: { type: form.entry_type, value: parseFloat(form.entry_value) },
      exit_condition:  form.exit_value ? { type: form.exit_type, value: parseFloat(form.exit_value) } : null,
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

// ─── Assign modal ──────────────────────────────────────────────────────────────
function AssignModal({ isOpen, onClose, onSaved, strategy }) {
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!isOpen) return
    axiosInstance.get('/api/admin/users?role=customer')
      .then(r => { setUsers(r.data?.users ?? r.data ?? []) })
      .catch(() => setUsers([]))
    setSelected(new Set(strategy?.assigned_user_ids ?? []))
    setSearch('')
    setErr('')
  }, [isOpen, strategy])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(visible) {
    const allSelected = visible.every(u => selected.has(u.id))
    setSelected(prev => {
      const next = new Set(prev)
      visible.forEach(u => allSelected ? next.delete(u.id) : next.add(u.id))
      return next
    })
  }

  async function handleAssign() {
    if (selected.size === 0) { setErr('Select at least one customer'); return }
    setSaving(true); setErr('')
    try {
      await axiosInstance.post(`/api/admin/strategies/${strategy.id}/assign-bulk`, {
        user_ids: [...selected],
      })
      onSaved(); onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Assign failed')
    } finally {
      setSaving(false)
    }
  }

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase())
  )
  const allChecked = filtered.length > 0 && filtered.every(u => selected.has(u.id))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Assign "${strategy?.name ?? ''}"`}>
      {err && <p className="text-sm text-red-500 mb-3">{err}</p>}

      {/* Search */}
      <div className="mb-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customers…"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Select all row */}
      {filtered.length > 0 && (
        <label className="flex items-center gap-2.5 px-3 py-2 mb-1 bg-gray-50 rounded-lg cursor-pointer text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() => toggleAll(filtered)}
            className="accent-[#eb5202]"
          />
          Select all ({filtered.length})
        </label>
      )}

      {/* Customer list */}
      <div className="max-h-56 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-2">
        {users.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No customers found</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No matches for "{search}"</p>
        ) : filtered.map(u => (
          <label key={u.id}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              selected.has(u.id) ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50 border border-transparent'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(u.id)}
              onChange={() => toggle(u.id)}
              className="accent-[#eb5202]"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{u.email}</p>
              {u.name && <p className="text-xs text-gray-400 truncate">{u.name}</p>}
            </div>
          </label>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-2">{selected.size} customer{selected.size !== 1 ? 's' : ''} selected</p>

      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={handleAssign} disabled={saving || selected.size === 0}>
          {saving ? 'Assigning…' : `Assign to ${selected.size || '…'}`}
        </Btn>
      </div>
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const COLS = ['Name', 'Instrument', 'Order Type', 'Entry Condition', 'SL%', 'TP%', 'Status', 'Actions']

export default function Strategies() {
  const [strategies, setStrategies] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [addOpen, setAddOpen]       = useState(false)
  const [editStrategy, setEdit]     = useState(null)
  const [assignStrategy, setAssign] = useState(null)
  const [toggling, setToggling]     = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await axiosInstance.get('/api/admin/strategies')
      setStrategies(r.data?.strategies ?? r.data ?? [])
    } catch { setError('Failed to load strategies') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function toggleStatus(s) {
    setToggling(s.id)
    try {
      await axiosInstance.patch(`/api/admin/strategies/${s.id}`, { is_active: !s.is_active })
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
          {loading ? <SkeletonTable rows={5} cols={8} /> :
           error   ? <ErrorRow message={error} onRetry={fetchData} cols={8} /> :
           strategies.length === 0 ? <EmptyRow message="No strategies defined" cols={8} /> :
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
                   <Btn size="sm" variant="ghost" onClick={() => setEdit(s)}>Edit</Btn>
                   <Btn size="sm" variant="ghost" onClick={() => setAssign(s)}>Assign</Btn>
                 </div>
               </td>
             </tr>
           ))
          }
        </Table>
      </Card>

      <StrategyModal isOpen={addOpen}    onClose={() => setAddOpen(false)} onSaved={fetchData} strategy={null} />
      <StrategyModal isOpen={!!editStrategy} onClose={() => setEdit(null)} onSaved={fetchData} strategy={editStrategy} />
      <AssignModal   isOpen={!!assignStrategy} onClose={() => setAssign(null)} onSaved={fetchData} strategy={assignStrategy} />
    </div>
  )
}
