import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader,
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
    hint: 'A candle where price closed HIGHER than it opened. Value 0–100: % of candle height the rise must cover. Enter 0 to accept any upward candle.',
  },
  {
    value: 'bearish_candle',
    label: 'Bearish Candle',
    hint: 'A candle where price closed LOWER than it opened. Value 0–100: % of candle height the drop must cover. Enter 0 to accept any downward candle.',
  },
  {
    value: 'gap_up',
    label: 'Gap Up',
    hint: "Today's open is higher than yesterday's close. Value: minimum jump as % of yesterday's close. Example: 0.5 = at least 0.5% gap.",
  },
  {
    value: 'gap_down',
    label: 'Gap Down',
    hint: "Today's open is lower than yesterday's close. Value: minimum drop as % of yesterday's close. Example: 0.5 = at least 0.5% gap.",
  },
  {
    value: 'bullish_engulfing',
    label: 'Bullish Engulfing',
    hint: "Yesterday was a down-day and today's up-candle completely covers it. No value needed — enter 0.",
  },
  {
    value: 'bearish_engulfing',
    label: 'Bearish Engulfing',
    hint: "Yesterday was an up-day and today's down-candle completely covers it. No value needed — enter 0.",
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
    hint: "Today's range fits inside yesterday's range — consolidation signal. No value needed — enter 0.",
  },
  {
    value: 'outside_bar',
    label: 'Outside Bar',
    hint: "Today's range is wider than yesterday's. No value needed — enter 0.",
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

// ─── Indicator Settings ────────────────────────────────────────────────────────

const EMPTY_INDICATOR_SETTINGS = {
  rsi:    { enabled: false, period: 14, min: 40, max: 70 },
  ema:    { enabled: false, period: 20, condition: 'price_above' },
  sma:    { enabled: false, period: 50, condition: 'price_above' },
  cpr:    { enabled: false, ascending: true, narrow: false },
  volume: { enabled: false, period: 20, min_multiplier: 1.5 },
}

function mergeIndicatorSettings(raw) {
  return {
    rsi:    { ...EMPTY_INDICATOR_SETTINGS.rsi,    ...(raw?.rsi    || {}) },
    ema:    { ...EMPTY_INDICATOR_SETTINGS.ema,    ...(raw?.ema    || {}) },
    sma:    { ...EMPTY_INDICATOR_SETTINGS.sma,    ...(raw?.sma    || {}) },
    cpr:    { ...EMPTY_INDICATOR_SETTINGS.cpr,    ...(raw?.cpr    || {}) },
    volume: { ...EMPTY_INDICATOR_SETTINGS.volume, ...(raw?.volume || {}) },
  }
}

// ─── Trade Filters ────────────────────────────────────────────────────────────

const EMPTY_TRADE_FILTERS = {
  time_window:       { enabled: false, from: '09:15', to: '14:00' },
  day_filter:        { enabled: false, days: [1, 2, 3, 4, 5] },
  trend_day_filter:  { enabled: false, max_consecutive: 3 },
  loss_limit:        { enabled: false, max_consecutive_losses: 2 },
  daily_trade_limit: { enabled: false, max_trades: 5 },
}

function mergeTradeFilters(raw) {
  return {
    time_window:       { ...EMPTY_TRADE_FILTERS.time_window,       ...(raw?.time_window       || {}) },
    day_filter:        { ...EMPTY_TRADE_FILTERS.day_filter,        ...(raw?.day_filter        || {}) },
    trend_day_filter:  { ...EMPTY_TRADE_FILTERS.trend_day_filter,  ...(raw?.trend_day_filter  || {}) },
    loss_limit:        { ...EMPTY_TRADE_FILTERS.loss_limit,        ...(raw?.loss_limit        || {}) },
    daily_trade_limit: { ...EMPTY_TRADE_FILTERS.daily_trade_limit, ...(raw?.daily_trade_limit || {}) },
  }
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Toggle({ on, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  )
}

function NumInput({ value, onChange, width = 'w-16', ...rest }) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`${width} px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400`}
      {...rest}
    />
  )
}

const INDICATOR_META = {
  rsi:    { label: 'RSI', desc: 'Relative Strength Index — entry only when RSI is within a set range on the daily candle.' },
  ema:    { label: 'EMA', desc: 'Exponential Moving Average — entry only when price is above or below the EMA line.' },
  sma:    { label: 'SMA', desc: 'Simple Moving Average — entry only when price is above or below the SMA line.' },
  cpr:    { label: 'CPR', desc: 'Central Pivot Range — entry only when today\'s CPR matches the selected structure (ascending / narrow).' },
  volume: { label: 'Volume', desc: 'Volume filter — entry only when today\'s volume exceeds a multiple of the N-day average.' },
}

function IndicatorSettingsPanel({ settings, onChange }) {
  function patch(key, field, value) {
    onChange({ ...settings, [key]: { ...settings[key], [field]: value } })
  }

  function toggle(key) {
    patch(key, 'enabled', !settings[key].enabled)
  }

  const inputClass = 'w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
  const labelClass = 'text-xs text-gray-500 flex items-center gap-1.5'

  return (
    <div className="space-y-2">

      {/* RSI */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={settings.rsi.enabled} onToggle={() => toggle('rsi')} />
          <div>
            <span className="text-sm font-medium text-gray-800">RSI</span>
            <span className="ml-2 text-xs text-gray-400">{INDICATOR_META.rsi.desc}</span>
          </div>
        </div>
        {settings.rsi.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pl-11">
            <label className={labelClass}>
              Period
              <input type="number" value={settings.rsi.period} min={2} max={100}
                onChange={e => patch('rsi', 'period', parseInt(e.target.value) || 14)}
                className={inputClass} />
            </label>
            <label className={labelClass}>
              Min RSI
              <input type="number" value={settings.rsi.min} min={0} max={100}
                onChange={e => patch('rsi', 'min', parseFloat(e.target.value) ?? 40)}
                className={inputClass} />
            </label>
            <label className={labelClass}>
              Max RSI
              <input type="number" value={settings.rsi.max} min={0} max={100}
                onChange={e => patch('rsi', 'max', parseFloat(e.target.value) ?? 70)}
                className={inputClass} />
            </label>
            <p className="text-xs text-blue-500 w-full">Entry fires only when RSI({settings.rsi.period}) is between {settings.rsi.min} and {settings.rsi.max}.</p>
          </div>
        )}
      </div>

      {/* EMA */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={settings.ema.enabled} onToggle={() => toggle('ema')} />
          <div>
            <span className="text-sm font-medium text-gray-800">EMA</span>
            <span className="ml-2 text-xs text-gray-400">{INDICATOR_META.ema.desc}</span>
          </div>
        </div>
        {settings.ema.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pl-11">
            <label className={labelClass}>
              Period
              <input type="number" value={settings.ema.period} min={2} max={500}
                onChange={e => patch('ema', 'period', parseInt(e.target.value) || 20)}
                className={inputClass} />
            </label>
            <label className={labelClass}>
              Condition
              <select value={settings.ema.condition}
                onChange={e => patch('ema', 'condition', e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="price_above">Price Above EMA</option>
                <option value="price_below">Price Below EMA</option>
              </select>
            </label>
            <p className="text-xs text-blue-500 w-full">Entry fires only when price is {settings.ema.condition === 'price_above' ? 'above' : 'below'} EMA({settings.ema.period}).</p>
          </div>
        )}
      </div>

      {/* SMA */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={settings.sma.enabled} onToggle={() => toggle('sma')} />
          <div>
            <span className="text-sm font-medium text-gray-800">SMA</span>
            <span className="ml-2 text-xs text-gray-400">{INDICATOR_META.sma.desc}</span>
          </div>
        </div>
        {settings.sma.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pl-11">
            <label className={labelClass}>
              Period
              <input type="number" value={settings.sma.period} min={2} max={500}
                onChange={e => patch('sma', 'period', parseInt(e.target.value) || 50)}
                className={inputClass} />
            </label>
            <label className={labelClass}>
              Condition
              <select value={settings.sma.condition}
                onChange={e => patch('sma', 'condition', e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="price_above">Price Above SMA</option>
                <option value="price_below">Price Below SMA</option>
              </select>
            </label>
            <p className="text-xs text-blue-500 w-full">Entry fires only when price is {settings.sma.condition === 'price_above' ? 'above' : 'below'} SMA({settings.sma.period}).</p>
          </div>
        )}
      </div>

      {/* CPR */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={settings.cpr.enabled} onToggle={() => toggle('cpr')} />
          <div>
            <span className="text-sm font-medium text-gray-800">CPR</span>
            <span className="ml-2 text-xs text-gray-400">{INDICATOR_META.cpr.desc}</span>
          </div>
        </div>
        {settings.cpr.enabled && (
          <div className="flex flex-wrap items-center gap-6 mt-3 pl-11">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={settings.cpr.ascending}
                onChange={e => patch('cpr', 'ascending', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
              Ascending CPR
              <span className="text-xs text-gray-400">(today's pivot {'>'} yesterday's — uptrend confirmation)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={settings.cpr.narrow}
                onChange={e => patch('cpr', 'narrow', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
              Narrow CPR
              <span className="text-xs text-gray-400">(tight range {'<'} 0.5% of price — consolidation day)</span>
            </label>
          </div>
        )}
      </div>

      {/* Volume */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={settings.volume.enabled} onToggle={() => toggle('volume')} />
          <div>
            <span className="text-sm font-medium text-gray-800">Volume</span>
            <span className="ml-2 text-xs text-gray-400">{INDICATOR_META.volume.desc}</span>
          </div>
        </div>
        {settings.volume.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pl-11">
            <label className={labelClass}>
              Avg Period (days)
              <input type="number" value={settings.volume.period} min={2} max={100}
                onChange={e => patch('volume', 'period', parseInt(e.target.value) || 20)}
                className={inputClass} />
            </label>
            <label className={labelClass}>
              Min Multiplier
              <input type="number" value={settings.volume.min_multiplier} min={0.1} max={20} step={0.1}
                onChange={e => patch('volume', 'min_multiplier', parseFloat(e.target.value) || 1.5)}
                className={inputClass} />
            </label>
            <p className="text-xs text-blue-500 w-full">Entry fires only when today's volume ≥ {settings.volume.min_multiplier}× the {settings.volume.period}-day average.</p>
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
  function toggle(key) {
    patch(key, 'enabled', !filters[key].enabled)
  }
  const inputClass = 'w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
  const labelClass = 'text-xs text-gray-500 flex items-center gap-1.5'
  const timeClass  = 'px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

  return (
    <div className="space-y-2">

      {/* Time Window */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={filters.time_window.enabled} onToggle={() => toggle('time_window')} />
          <div>
            <span className="text-sm font-medium text-gray-800">Time Window</span>
            <span className="ml-2 text-xs text-gray-400">Only allow entries between specific times (IST). Blocks early/late trades.</span>
          </div>
        </div>
        {filters.time_window.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pl-11">
            <label className={labelClass}>
              From
              <input type="time" value={filters.time_window.from}
                onChange={e => patch('time_window', 'from', e.target.value)}
                className={timeClass} />
            </label>
            <label className={labelClass}>
              To
              <input type="time" value={filters.time_window.to}
                onChange={e => patch('time_window', 'to', e.target.value)}
                className={timeClass} />
            </label>
            <p className="text-xs text-blue-500 w-full">Entry only fires between {filters.time_window.from} and {filters.time_window.to}.</p>
          </div>
        )}
      </div>

      {/* Day of Week */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={filters.day_filter.enabled} onToggle={() => toggle('day_filter')} />
          <div>
            <span className="text-sm font-medium text-gray-800">Day of Week</span>
            <span className="ml-2 text-xs text-gray-400">Only trade on selected days — skip volatile or thin sessions.</span>
          </div>
        </div>
        {filters.day_filter.enabled && (
          <div className="flex flex-wrap items-center gap-3 mt-3 pl-11">
            {DAY_LABELS.map((day, i) => (
              <label key={i} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                <input type="checkbox"
                  checked={filters.day_filter.days.includes(i)}
                  onChange={e => {
                    const days = e.target.checked
                      ? [...filters.day_filter.days, i].sort((a, b) => a - b)
                      : filters.day_filter.days.filter(d => d !== i)
                    patch('day_filter', 'days', days)
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                {day}
              </label>
            ))}
            <p className="text-xs text-blue-500 w-full mt-1">
              Entry allowed on: {filters.day_filter.days.length > 0 ? filters.day_filter.days.map(d => DAY_LABELS[d]).join(', ') : 'none selected'}
            </p>
          </div>
        )}
      </div>

      {/* Trend Day Filter */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={filters.trend_day_filter.enabled} onToggle={() => toggle('trend_day_filter')} />
          <div>
            <span className="text-sm font-medium text-gray-800">Trend Day Filter</span>
            <span className="ml-2 text-xs text-gray-400">Block entry if last N daily candles are all the same direction — avoids exhaustion entries.</span>
          </div>
        </div>
        {filters.trend_day_filter.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pl-11">
            <label className={labelClass}>
              Max Consecutive Days
              <input type="number" value={filters.trend_day_filter.max_consecutive} min={2} max={20}
                onChange={e => patch('trend_day_filter', 'max_consecutive', parseInt(e.target.value) || 3)}
                className={inputClass} />
            </label>
            <p className="text-xs text-blue-500 w-full">
              Entry blocked when the last {filters.trend_day_filter.max_consecutive} closed candles are all bullish or all bearish.
            </p>
          </div>
        )}
      </div>

      {/* Consecutive Loss Limit */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={filters.loss_limit.enabled} onToggle={() => toggle('loss_limit')} />
          <div>
            <span className="text-sm font-medium text-gray-800">Consecutive Loss Limit</span>
            <span className="ml-2 text-xs text-gray-400">Stop accepting new entries after X back-to-back losing trades in this session.</span>
          </div>
        </div>
        {filters.loss_limit.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pl-11">
            <label className={labelClass}>
              Max Losses
              <input type="number" value={filters.loss_limit.max_consecutive_losses} min={1} max={10}
                onChange={e => patch('loss_limit', 'max_consecutive_losses', parseInt(e.target.value) || 2)}
                className={inputClass} />
            </label>
            <p className="text-xs text-blue-500 w-full">
              Entry blocked after {filters.loss_limit.max_consecutive_losses} consecutive losing trades this session.
            </p>
          </div>
        )}
      </div>

      {/* Daily Trade Limit */}
      <div className="border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle on={filters.daily_trade_limit.enabled} onToggle={() => toggle('daily_trade_limit')} />
          <div>
            <span className="text-sm font-medium text-gray-800">Daily Trade Limit</span>
            <span className="ml-2 text-xs text-gray-400">Maximum number of completed trades allowed per session.</span>
          </div>
        </div>
        {filters.daily_trade_limit.enabled && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pl-11">
            <label className={labelClass}>
              Max Trades
              <input type="number" value={filters.daily_trade_limit.max_trades} min={1} max={50}
                onChange={e => patch('daily_trade_limit', 'max_trades', parseInt(e.target.value) || 5)}
                className={inputClass} />
            </label>
            <p className="text-xs text-blue-500 w-full">
              No new entries after {filters.daily_trade_limit.max_trades} completed trades in this session.
            </p>
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

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

export default function CandlePatternEdit() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [form, setForm] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const fetchPattern = useCallback(async () => {
    setLoadError(null)
    try {
      const r = await axiosInstance.get(`/api/admin/candle-patterns/${id}`)
      const pattern = r.data
      const rawConds = pattern.entry_conditions
      let rows
      if (Array.isArray(rawConds) && rawConds.length > 0) {
        rows = rawConds.map(c => ({ type: c.type ?? DETECTION_CONDITION_TYPES[0].value, value: String(c.value ?? '') }))
      } else {
        rows = [{ ...EMPTY_CONDITION_ROW }]
      }
      setForm({
        name:               pattern.name ?? '',
        description:        pattern.description ?? '',
        pattern_type:       pattern.pattern_type ?? 'bullish_breakout',
        direction:          pattern.direction ?? 'bullish',
        market:             pattern.market ?? '',
        timeframes:         Array.isArray(pattern.timeframes) && pattern.timeframes.length > 0
                              ? pattern.timeframes
                              : [...ALL_TIMEFRAMES],
        entry_conditions_rows: rows,
        indicator_settings: mergeIndicatorSettings(pattern.indicator_settings),
        trade_filters:      mergeTradeFilters(pattern.trade_filters),
      })
    } catch {
      setLoadError('Failed to load pattern')
    }
  }, [id])

  useEffect(() => { fetchPattern() }, [fetchPattern])

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
      setErr(ex.message)
      return
    }

    setSaving(true); setErr('')
    try {
      await axiosInstance.put(`/api/admin/candle-patterns/${id}`, payload)
      navigate('/admin/candle-patterns')
    } catch (ex) {
      setErr(ex.response?.data?.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="Edit Candle Pattern" />
        <p className="text-sm text-red-500 mt-4">{loadError}</p>
      </div>
    )
  }

  if (!form) {
    return (
      <div>
        <PageHeader title="Edit Candle Pattern" />
        <p className="text-sm text-gray-400 mt-4">Loading…</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={`Edit Pattern — ${form.name}`}
        action={
          <Btn variant="secondary" onClick={() => navigate('/admin/candle-patterns')}>
            ← Back to Patterns
          </Btn>
        }
      />

      <Card>
        <div className="px-6 py-5">
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

            {/* Detection Conditions */}
            <div className="mt-4 mb-4 w-1/2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Candle Pattern Detection Conditions
                <span className="font-normal normal-case ml-1 text-blue-600">
                  — ALL must pass before entry fires
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

            {/* Indicator Settings */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Indicator Settings
                <span className="font-normal normal-case ml-1 text-blue-600">
                  — enable any indicators that must confirm before entry fires
                </span>
              </p>
              <IndicatorSettingsPanel
                settings={form.indicator_settings}
                onChange={s => setForm(f => ({ ...f, indicator_settings: s }))}
              />
            </div>

            {/* Trade Filters */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Trade Filters
                <span className="font-normal normal-case ml-1 text-blue-600">
                  — gates that block entry even after pattern confirms
                </span>
              </p>
              <TradeFiltersPanel
                filters={form.trade_filters}
                onChange={f => setForm(prev => ({ ...prev, trade_filters: f }))}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Btn variant="secondary" type="button" onClick={() => navigate('/admin/candle-patterns')}>
                Cancel
              </Btn>
              <Btn variant="primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Btn>
            </div>
          </form>
        </div>
      </Card>
    </div>
  )
}
