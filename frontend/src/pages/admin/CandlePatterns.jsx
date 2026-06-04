import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

const DETECTION_CONDITION_TYPES = [
  {
    value: 'bullish_candle',
    label: 'Bullish Candle',
    hint: 'A candle where price closed HIGHER than it opened (price went up that day). Value 0–100: how much of the candle\'s full height (top to bottom) the price rise must cover. Example: 50 = the rise must fill at least half the candle height. Enter 0 to accept any upward candle.',
  },
  {
    value: 'bearish_candle',
    label: 'Bearish Candle',
    hint: 'A candle where price closed LOWER than it opened (price went down that day). Value 0–100: how much of the candle\'s full height the price drop must cover. Example: 50 = the drop must fill at least half the candle height. Enter 0 to accept any downward candle.',
  },
  {
    value: 'gap_up',
    label: 'Gap Up',
    hint: 'Today\'s opening price is higher than yesterday\'s closing price. Value: minimum jump size as a % of yesterday\'s closing price. Example: 0.5 = opening must be at least 0.5% above yesterday\'s close.',
  },
  {
    value: 'gap_down',
    label: 'Gap Down',
    hint: 'Today\'s opening price is lower than yesterday\'s closing price. Value: minimum drop size as a % of yesterday\'s closing price.',
  },
  {
    value: 'bullish_engulfing',
    label: 'Bullish Engulfing',
    hint: 'Yesterday was a down-day and today\'s up-candle completely covers it. No value needed — enter 0.',
  },
  {
    value: 'bearish_engulfing',
    label: 'Bearish Engulfing',
    hint: 'Yesterday was an up-day and today\'s down-candle completely covers it. No value needed — enter 0.',
  },
  {
    value: 'hammer',
    label: 'Hammer',
    hint: 'Small body at top, long lower tail. Value 0–100: minimum % of candle height the lower tail must be.',
  },
  {
    value: 'shooting_star',
    label: 'Shooting Star',
    hint: 'Small body at bottom, long upper tail. Value 0–100: minimum % of candle height the upper tail must be.',
  },
  {
    value: 'doji',
    label: 'Doji',
    hint: 'Open and close are nearly identical. Value 0–100: maximum body size as % of total candle height.',
  },
  {
    value: 'inside_bar',
    label: 'Inside Bar',
    hint: 'Today\'s entire range fits inside yesterday\'s range. No value needed — enter 0.',
  },
  {
    value: 'outside_bar',
    label: 'Outside Bar',
    hint: 'Today\'s range is wider than yesterday\'s. No value needed — enter 0.',
  },
  {
    value: 'consolidation_breakout',
    label: 'Consolidation Breakout',
    hint: 'Price broke above a sideways range. Value: number of quiet days required before the breakout.',
  },
  {
    value: 'consolidation_breakdown',
    label: 'Consolidation Breakdown',
    hint: 'Price broke below a sideways range. Value: number of quiet days required before the breakdown.',
  },
]

const COND_HINT = Object.fromEntries(DETECTION_CONDITION_TYPES.map(t => [t.value, t.hint]))

const ALL_TIMEFRAMES = ['1D', '4H', '1H', '30M', '15M', '5M', '3M']
const EMPTY_CONDITION_ROW = { type: DETECTION_CONDITION_TYPES[0].value, value: '' }

const EMPTY_INDICATOR_SETTINGS = {
  rsi:    { enabled: false, period: 14, min: 40, max: 70 },
  ema:    { enabled: false, period: 20, condition: 'price_above' },
  sma:    { enabled: false, period: 50, condition: 'price_above' },
  cpr:    { enabled: false, ascending: true, narrow: false },
  volume: { enabled: false, period: 20, min_multiplier: 1.5 },
}

const EMPTY_TRADE_FILTERS = {
  time_window:       { enabled: false, from: '09:15', to: '14:00' },
  day_filter:        { enabled: false, days: [1, 2, 3, 4, 5] },
  trend_day_filter:  { enabled: false, max_consecutive: 3 },
  loss_limit:        { enabled: false, max_consecutive_losses: 2 },
  daily_trade_limit: { enabled: false, max_trades: 5 },
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const EMPTY_FORM = {
  name: '',
  description: '',
  pattern_type: 'bullish_breakout',
  direction: 'bullish',
  market: '',
  timeframes: [...ALL_TIMEFRAMES],
  entry_conditions_rows: [{ ...EMPTY_CONDITION_ROW }],
  indicator_settings: { ...EMPTY_INDICATOR_SETTINGS },
  trade_filters: { ...EMPTY_TRADE_FILTERS },
}

function IndicatorToggle({ on, onToggle }) {
  return (
    <button type="button" onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  )
}

function IndicatorSettingsPanel({ settings, onChange }) {
  function patch(key, field, value) {
    onChange({ ...settings, [key]: { ...settings[key], [field]: value } })
  }
  function toggle(key) { patch(key, 'enabled', !settings[key].enabled) }
  const inputClass = 'w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
  const labelClass = 'text-xs text-gray-500 flex items-center gap-1.5'
  return (
    <div className="space-y-2">
      {/* RSI */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={settings.rsi.enabled} onToggle={() => toggle('rsi')} />
          <span className="text-sm font-medium text-gray-800">RSI</span>
          <span className="text-xs text-gray-400">Entry only when RSI is within a set range</span>
        </div>
        {settings.rsi.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-2 pl-11">
            <label className={labelClass}>Period <input type="number" value={settings.rsi.period} min={2} max={100}
              onChange={e => patch('rsi', 'period', parseInt(e.target.value) || 14)} className={inputClass} /></label>
            <label className={labelClass}>Min <input type="number" value={settings.rsi.min} min={0} max={100}
              onChange={e => patch('rsi', 'min', parseFloat(e.target.value) ?? 40)} className={inputClass} /></label>
            <label className={labelClass}>Max <input type="number" value={settings.rsi.max} min={0} max={100}
              onChange={e => patch('rsi', 'max', parseFloat(e.target.value) ?? 70)} className={inputClass} /></label>
          </div>
        )}
      </div>
      {/* EMA */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={settings.ema.enabled} onToggle={() => toggle('ema')} />
          <span className="text-sm font-medium text-gray-800">EMA</span>
          <span className="text-xs text-gray-400">Entry only when price is above/below the EMA line</span>
        </div>
        {settings.ema.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-2 pl-11">
            <label className={labelClass}>Period <input type="number" value={settings.ema.period} min={2} max={500}
              onChange={e => patch('ema', 'period', parseInt(e.target.value) || 20)} className={inputClass} /></label>
            <label className={labelClass}>Condition
              <select value={settings.ema.condition} onChange={e => patch('ema', 'condition', e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="price_above">Price Above EMA</option>
                <option value="price_below">Price Below EMA</option>
              </select>
            </label>
          </div>
        )}
      </div>
      {/* SMA */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={settings.sma.enabled} onToggle={() => toggle('sma')} />
          <span className="text-sm font-medium text-gray-800">SMA</span>
          <span className="text-xs text-gray-400">Entry only when price is above/below the SMA line</span>
        </div>
        {settings.sma.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-2 pl-11">
            <label className={labelClass}>Period <input type="number" value={settings.sma.period} min={2} max={500}
              onChange={e => patch('sma', 'period', parseInt(e.target.value) || 50)} className={inputClass} /></label>
            <label className={labelClass}>Condition
              <select value={settings.sma.condition} onChange={e => patch('sma', 'condition', e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="price_above">Price Above SMA</option>
                <option value="price_below">Price Below SMA</option>
              </select>
            </label>
          </div>
        )}
      </div>
      {/* CPR */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={settings.cpr.enabled} onToggle={() => toggle('cpr')} />
          <span className="text-sm font-medium text-gray-800">CPR</span>
          <span className="text-xs text-gray-400">Central Pivot Range structure confirmation</span>
        </div>
        {settings.cpr.enabled && (
          <div className="flex flex-wrap items-center gap-5 mt-2 pl-11">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={settings.cpr.ascending}
                onChange={e => patch('cpr', 'ascending', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              Ascending CPR <span className="text-xs text-gray-400">(uptrend)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={settings.cpr.narrow}
                onChange={e => patch('cpr', 'narrow', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              Narrow CPR <span className="text-xs text-gray-400">({'<'}0.5%)</span>
            </label>
          </div>
        )}
      </div>
      {/* Volume */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={settings.volume.enabled} onToggle={() => toggle('volume')} />
          <span className="text-sm font-medium text-gray-800">Volume</span>
          <span className="text-xs text-gray-400">Entry only when today's volume exceeds N× the average</span>
        </div>
        {settings.volume.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-2 pl-11">
            <label className={labelClass}>Avg Period <input type="number" value={settings.volume.period} min={2} max={100}
              onChange={e => patch('volume', 'period', parseInt(e.target.value) || 20)} className={inputClass} /></label>
            <label className={labelClass}>Min Multiplier <input type="number" value={settings.volume.min_multiplier} min={0.1} max={20} step={0.1}
              onChange={e => patch('volume', 'min_multiplier', parseFloat(e.target.value) || 1.5)} className={inputClass} /></label>
          </div>
        )}
      </div>
    </div>
  )
}

function TradeFiltersPanel({ filters, onChange }) {
  function patch(key, field, value) {
    onChange({ ...filters, [key]: { ...filters[key], [field]: value } })
  }
  function toggle(key) { patch(key, 'enabled', !filters[key].enabled) }
  const inputClass = 'w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
  const labelClass = 'text-xs text-gray-500 flex items-center gap-1.5'
  const timeClass  = 'px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
  return (
    <div className="space-y-2">
      {/* Time Window */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={filters.time_window.enabled} onToggle={() => toggle('time_window')} />
          <span className="text-sm font-medium text-gray-800">Time Window</span>
          <span className="text-xs text-gray-400">Only allow entries between specific times (IST)</span>
        </div>
        {filters.time_window.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-2 pl-11">
            <label className={labelClass}>From <input type="time" value={filters.time_window.from}
              onChange={e => patch('time_window', 'from', e.target.value)} className={timeClass} /></label>
            <label className={labelClass}>To <input type="time" value={filters.time_window.to}
              onChange={e => patch('time_window', 'to', e.target.value)} className={timeClass} /></label>
          </div>
        )}
      </div>
      {/* Day of Week */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={filters.day_filter.enabled} onToggle={() => toggle('day_filter')} />
          <span className="text-sm font-medium text-gray-800">Day of Week</span>
          <span className="text-xs text-gray-400">Only trade on selected days</span>
        </div>
        {filters.day_filter.enabled && (
          <div className="flex flex-wrap items-center gap-2 mt-2 pl-11">
            {DAY_LABELS.map((day, i) => (
              <label key={i} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                <input type="checkbox" checked={filters.day_filter.days.includes(i)}
                  onChange={e => {
                    const days = e.target.checked
                      ? [...filters.day_filter.days, i].sort((a, b) => a - b)
                      : filters.day_filter.days.filter(d => d !== i)
                    patch('day_filter', 'days', days)
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                {day}
              </label>
            ))}
          </div>
        )}
      </div>
      {/* Trend Day Filter */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={filters.trend_day_filter.enabled} onToggle={() => toggle('trend_day_filter')} />
          <span className="text-sm font-medium text-gray-800">Trend Day Filter</span>
          <span className="text-xs text-gray-400">Block entry after N consecutive same-direction days</span>
        </div>
        {filters.trend_day_filter.enabled && (
          <div className="flex items-center gap-4 mt-2 pl-11">
            <label className={labelClass}>Max Consecutive Days
              <input type="number" value={filters.trend_day_filter.max_consecutive} min={2} max={20}
                onChange={e => patch('trend_day_filter', 'max_consecutive', parseInt(e.target.value) || 3)}
                className={inputClass} /></label>
          </div>
        )}
      </div>
      {/* Loss Limit */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={filters.loss_limit.enabled} onToggle={() => toggle('loss_limit')} />
          <span className="text-sm font-medium text-gray-800">Consecutive Loss Limit</span>
          <span className="text-xs text-gray-400">Stop entering after X back-to-back losses this session</span>
        </div>
        {filters.loss_limit.enabled && (
          <div className="flex items-center gap-4 mt-2 pl-11">
            <label className={labelClass}>Max Losses
              <input type="number" value={filters.loss_limit.max_consecutive_losses} min={1} max={10}
                onChange={e => patch('loss_limit', 'max_consecutive_losses', parseInt(e.target.value) || 2)}
                className={inputClass} /></label>
          </div>
        )}
      </div>
      {/* Daily Trade Limit */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <IndicatorToggle on={filters.daily_trade_limit.enabled} onToggle={() => toggle('daily_trade_limit')} />
          <span className="text-sm font-medium text-gray-800">Daily Trade Limit</span>
          <span className="text-xs text-gray-400">Maximum completed trades allowed per session</span>
        </div>
        {filters.daily_trade_limit.enabled && (
          <div className="flex items-center gap-4 mt-2 pl-11">
            <label className={labelClass}>Max Trades
              <input type="number" value={filters.daily_trade_limit.max_trades} min={1} max={50}
                onChange={e => patch('daily_trade_limit', 'max_trades', parseInt(e.target.value) || 5)}
                className={inputClass} /></label>
          </div>
        )}
      </div>
    </div>
  )
}

function TimeframeMultiSelect({ selected, onChange }) {
  function toggle(tf) {
    onChange(
      selected.includes(tf)
        ? selected.filter(t => t !== tf)
        : [...ALL_TIMEFRAMES.filter(t => selected.includes(t) || t === tf)]
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_TIMEFRAMES.map(tf => {
        const active = selected.includes(tf)
        return (
          <button
            key={tf}
            type="button"
            onClick={() => toggle(tf)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              active
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'
            }`}
          >
            {tf}
          </button>
        )
      })}
    </div>
  )
}

function AddPatternModal({ isOpen, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isOpen) { setForm(EMPTY_FORM); setErr('') }
  }, [isOpen])

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  function setCondRow(idx, key, val) {
    setForm(f => {
      const rows = f.entry_conditions_rows.map((r, i) => i === idx ? { ...r, [key]: val } : r)
      return { ...f, entry_conditions_rows: rows }
    })
  }

  function addCondRow() {
    setForm(f => ({ ...f, entry_conditions_rows: [...f.entry_conditions_rows, { ...EMPTY_CONDITION_ROW }] }))
  }

  function removeCondRow(idx) {
    setForm(f => ({
      ...f,
      entry_conditions_rows: f.entry_conditions_rows.length > 1
        ? f.entry_conditions_rows.filter((_, i) => i !== idx)
        : f.entry_conditions_rows,
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (!form.pattern_type) { setErr('Pattern type is required'); return }

    let payload
    try {
      const validRows = form.entry_conditions_rows.filter(r => r.type && r.value !== '')
      if (validRows.length === 0) { setErr('At least one detection condition is required'); return }
      for (const r of validRows) {
        if (isNaN(parseFloat(r.value))) { setErr(`Condition value "${r.value}" must be a number`); return }
      }
      payload = {
        name:               form.name.trim(),
        description:        form.description.trim() || null,
        pattern_type:       form.pattern_type,
        direction:          form.direction,
        market:             form.market.trim() || null,
        timeframes:         form.timeframes.length > 0 ? form.timeframes : null,
        entry_conditions:   validRows.map(r => ({ type: r.type, value: parseFloat(r.value) })),
        indicator_settings: form.indicator_settings,
        trade_filters:      form.trade_filters,
      }
    } catch (ex) {
      setErr(ex.message); return
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
          <FormField label="Timeframes" className="col-span-2">
            <TimeframeMultiSelect
              selected={form.timeframes}
              onChange={tfs => setForm(f => ({ ...f, timeframes: tfs }))}
            />
          </FormField>
        </div>

        <div className="mt-3 mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Candle Pattern Detection Conditions
            <span className="font-normal normal-case ml-1 text-blue-600">
              — checked against daily OHLC candles; ALL must pass before entry fires
            </span>
          </p>
          <div className="space-y-2">
            {form.entry_conditions_rows.map((row, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <select
                    value={row.type}
                    onChange={e => setCondRow(idx, 'type', e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {DETECTION_CONDITION_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={row.value}
                    onChange={e => setCondRow(idx, 'value', e.target.value)}
                    placeholder="Value"
                    className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeCondRow(idx)}
                    disabled={form.entry_conditions_rows.length === 1}
                    className="text-red-400 hover:text-red-600 disabled:opacity-30 text-lg leading-none"
                    title="Remove"
                  >×</button>
                </div>
                {COND_HINT[row.type] && (
                  <p className="text-xs text-gray-400 pl-1">{COND_HINT[row.type]}</p>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addCondRow}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >+ Add condition</button>
        </div>

        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Indicator Settings
            <span className="font-normal normal-case ml-1 text-blue-600">— enable any that must confirm before entry fires</span>
          </p>
          <IndicatorSettingsPanel
            settings={form.indicator_settings}
            onChange={s => setForm(f => ({ ...f, indicator_settings: s }))}
          />
        </div>

        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Trade Filters
            <span className="font-normal normal-case ml-1 text-blue-600">— gates that block entry even after pattern confirms</span>
          </p>
          <TradeFiltersPanel
            filters={form.trade_filters}
            onChange={f => setForm(prev => ({ ...prev, trade_filters: f }))}
          />
        </div>

        <div className="flex justify-end gap-2 mt-2">
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

const COLS = ['Name', 'Type', 'Direction', 'Market', 'Timeframes', 'Status', 'Actions']

export default function CandlePatterns() {
  const navigate = useNavigate()
  const [patterns, setPatterns] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [addOpen, setAddOpen]   = useState(false)
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)

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
    </div>
  )
}
