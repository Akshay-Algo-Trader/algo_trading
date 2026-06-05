import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader,
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

// ─── Pattern Config Constants ──────────────────────────────────────────────────
const DETECTION_CONDITION_TYPES = [
  { value: 'bullish_candle', label: 'Bullish Candle' },
  { value: 'bearish_candle', label: 'Bearish Candle' },
  { value: 'gap_up', label: 'Gap Up' },
  { value: 'gap_down', label: 'Gap Down' },
  { value: 'bullish_engulfing', label: 'Bullish Engulfing' },
  { value: 'bearish_engulfing', label: 'Bearish Engulfing' },
  { value: 'hammer', label: 'Hammer' },
  { value: 'shooting_star', label: 'Shooting Star' },
  { value: 'doji', label: 'Doji' },
  { value: 'inside_bar', label: 'Inside Bar' },
  { value: 'outside_bar', label: 'Outside Bar' },
  { value: 'consolidation_breakout', label: 'Consolidation Breakout' },
  { value: 'consolidation_breakdown', label: 'Consolidation Breakdown' },
]

const ALL_TIMEFRAMES = ['1D', '4H', '1H', '30M', '15M', '5M', '3M']
const EMPTY_CONDITION_ROW = { type: DETECTION_CONDITION_TYPES[0].value, value: '' }

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

// ─── UI Components ────────────────────────────────────────────────────────────

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

function TimeframeMultiSelect({ selected, onChange, onSelectTimeframe }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_TIMEFRAMES.map(tf => (
        <button
          key={tf}
          type="button"
          onClick={() => {
            const newSelected = selected.includes(tf)
              ? selected.filter(x => x !== tf)
              : [...selected, tf]
            onChange(newSelected)
            onSelectTimeframe?.(tf)
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selected.includes(tf)
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  )
}

function IndicatorSettingsPanel({ settings, onChange }) {
  function patch(key, field, value) {
    onChange({ ...settings, [key]: { ...settings[key], [field]: value } })
  }
  function toggle(key) { patch(key, 'enabled', !settings[key].enabled) }
  const inputClass = 'w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

  return (
    <div className="space-y-2">
      {['rsi', 'ema', 'sma', 'cpr', 'volume'].map(key => (
        <div key={key} className="border border-gray-200 rounded-lg px-3 py-2">
          <div className="flex items-center gap-3">
            <Toggle on={settings[key].enabled} onToggle={() => toggle(key)} />
            <span className="text-sm font-medium text-gray-800">{key.toUpperCase()}</span>
          </div>
          {settings[key].enabled && (
            <div className="flex flex-wrap items-center gap-4 mt-3 pl-11 text-xs">
              {key === 'rsi' && (
                <>
                  <label className="flex items-center gap-1">Period <input type="number" value={settings.rsi.period} onChange={e => patch('rsi', 'period', parseInt(e.target.value))} className={inputClass} min={2} max={100} /></label>
                  <label className="flex items-center gap-1">Min <input type="number" value={settings.rsi.min} onChange={e => patch('rsi', 'min', parseInt(e.target.value))} className={inputClass} min={0} max={100} /></label>
                  <label className="flex items-center gap-1">Max <input type="number" value={settings.rsi.max} onChange={e => patch('rsi', 'max', parseInt(e.target.value))} className={inputClass} min={0} max={100} /></label>
                </>
              )}
              {(key === 'ema' || key === 'sma') && (
                <>
                  <label className="flex items-center gap-1">Period <input type="number" value={settings[key].period} onChange={e => patch(key, 'period', parseInt(e.target.value))} className={inputClass} min={2} max={500} /></label>
                  <label className="flex items-center gap-1">
                    Condition
                    <select value={settings[key].condition} onChange={e => patch(key, 'condition', e.target.value)} className={inputClass + ' w-32'}>
                      <option value="price_above">Price Above</option>
                      <option value="price_below">Price Below</option>
                    </select>
                  </label>
                </>
              )}
              {key === 'cpr' && (
                <>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={settings.cpr.ascending} onChange={e => patch('cpr', 'ascending', e.target.checked)} />
                    Ascending
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={settings.cpr.narrow} onChange={e => patch('cpr', 'narrow', e.target.checked)} />
                    Narrow
                  </label>
                </>
              )}
              {key === 'volume' && (
                <>
                  <label className="flex items-center gap-1">Period <input type="number" value={settings.volume.period} onChange={e => patch('volume', 'period', parseInt(e.target.value))} className={inputClass} min={2} max={100} /></label>
                  <label className="flex items-center gap-1">Min Mult <input type="number" value={settings.volume.min_multiplier} onChange={e => patch('volume', 'min_multiplier', parseFloat(e.target.value))} className={inputClass} min={0.1} step={0.1} /></label>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TradeFiltersPanel({ filters, onChange }) {
  function patch(key, field, value) {
    onChange({ ...filters, [key]: { ...filters[key], [field]: value } })
  }
  function toggle(key) { patch(key, 'enabled', !filters[key].enabled) }

  return (
    <div className="space-y-2 text-sm">
      {/* Time Window */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <Toggle on={filters.time_window.enabled} onToggle={() => toggle('time_window')} />
          <span className="font-medium text-gray-800">Time Window</span>
        </div>
        {filters.time_window.enabled && (
          <div className="flex gap-3 mt-3 pl-11">
            <label className="flex items-center gap-1">From <input type="time" value={filters.time_window.from} onChange={e => patch('time_window', 'from', e.target.value)} className="px-2 py-1 border border-gray-300 rounded" /></label>
            <label className="flex items-center gap-1">To <input type="time" value={filters.time_window.to} onChange={e => patch('time_window', 'to', e.target.value)} className="px-2 py-1 border border-gray-300 rounded" /></label>
          </div>
        )}
      </div>

      {/* Day Filter */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <Toggle on={filters.day_filter.enabled} onToggle={() => toggle('day_filter')} />
          <span className="font-medium text-gray-800">Day Filter</span>
        </div>
        {filters.day_filter.enabled && (
          <div className="flex gap-1 mt-3 pl-11 flex-wrap">
            {DAY_LABELS.map((lbl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const days = filters.day_filter.days
                  const newDays = days.includes(i) ? days.filter(d => d !== i) : [...days, i]
                  patch('day_filter', 'days', newDays)
                }}
                className={`px-2 py-1 rounded text-xs font-medium ${filters.day_filter.days.includes(i) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Trend Day Filter */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <Toggle on={filters.trend_day_filter.enabled} onToggle={() => toggle('trend_day_filter')} />
          <span className="font-medium text-gray-800">Trend Day Filter</span>
        </div>
        {filters.trend_day_filter.enabled && (
          <div className="flex gap-3 mt-3 pl-11">
            <label className="flex items-center gap-1">Max Consecutive <input type="number" value={filters.trend_day_filter.max_consecutive} onChange={e => patch('trend_day_filter', 'max_consecutive', parseInt(e.target.value))} className="w-16 px-2 py-1 border border-gray-300 rounded" min={1} max={10} /></label>
          </div>
        )}
      </div>

      {/* Loss Limit */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <Toggle on={filters.loss_limit.enabled} onToggle={() => toggle('loss_limit')} />
          <span className="font-medium text-gray-800">Loss Limit</span>
        </div>
        {filters.loss_limit.enabled && (
          <div className="flex gap-3 mt-3 pl-11">
            <label className="flex items-center gap-1">Max Losses <input type="number" value={filters.loss_limit.max_consecutive_losses} onChange={e => patch('loss_limit', 'max_consecutive_losses', parseInt(e.target.value))} className="w-16 px-2 py-1 border border-gray-300 rounded" min={1} max={10} /></label>
          </div>
        )}
      </div>

      {/* Daily Trade Limit */}
      <div className="border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-3">
          <Toggle on={filters.daily_trade_limit.enabled} onToggle={() => toggle('daily_trade_limit')} />
          <span className="font-medium text-gray-800">Daily Trade Limit</span>
        </div>
        {filters.daily_trade_limit.enabled && (
          <div className="flex gap-3 mt-3 pl-11">
            <label className="flex items-center gap-1">Max Trades <input type="number" value={filters.daily_trade_limit.max_trades} onChange={e => patch('daily_trade_limit', 'max_trades', parseInt(e.target.value))} className="w-16 px-2 py-1 border border-gray-300 rounded" min={1} max={50} /></label>
          </div>
        )}
      </div>
    </div>
  )
}

function CandlestickChart({ instrument, exchange, timeframe }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!instrument || !timeframe || !containerRef.current) return

    setLoading(true)
    setError('')

    axiosInstance.get('/api/admin/candles', {
      params: { instrument, exchange, timeframe }
    })
      .then(r => {
        const candles = r.data?.candles ?? []
        if (!candles.length) { setError('No chart data'); return }

        // Use lightweight-charts
        if (chartRef.current) {
          chartRef.current.remove()
        }
        const { createChart } = require('lightweight-charts')
        const chart = createChart(containerRef.current, { width: containerRef.current.clientWidth, height: 300, timeScale: { timeVisible: true } })
        const candleSeries = chart.addCandlestickSeries()
        candleSeries.setData(candles.map(c => ({
          time: Math.floor(c.time),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })))
        chart.timeScale().fitContent()
        chartRef.current = chart
      })
      .catch(() => setError('Failed to load chart'))
      .finally(() => setLoading(false))
  }, [instrument, exchange, timeframe])

  return (
    <div>
      {loading && <p className="text-xs text-gray-400">Loading chart...</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div ref={containerRef} style={{ width: '100%', height: 300 }} />
    </div>
  )
}

// ─── Instrument search ────────────────────────────────────────────────────────
function InstrumentSearch({ value, onChange }) {
  const [query, setQuery]     = useState(value || '')
  const [options, setOptions] = useState([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef  = useRef(null)

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
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202] focus:border-transparent"
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
            const badgeLabel = isIndex ? 'INDEX' : opt.exchange
            return (
              <li
                key={`${opt.exchange}:${opt.symbol}`}
                onMouseDown={() => select(opt)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer"
              >
                <span className="font-mono font-semibold text-xs text-gray-800">{opt.symbol}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${badgeCls}`}>{badgeLabel}</span>
                <span className="text-xs text-gray-400 truncate">{opt.name}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Customer multiselect dropdown ────────────────────────────────────────────
function CustomerMultiSelect({ users, selected, onChange }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef(null)
  const inputRef   = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(user) {
    const next = new Set(selected)
    next.has(user.id) ? next.delete(user.id) : next.add(user.id)
    onChange(next)
  }

  function remove(id) {
    const next = new Set(selected)
    next.delete(id)
    onChange(next)
  }

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const selectedUsers = users.filter(u => selected.has(u.id))

  return (
    <div ref={wrapperRef} className="relative">
      <div
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        className={`min-h-[38px] w-full border rounded-md px-3 py-1.5 flex flex-wrap gap-1.5 cursor-text transition-shadow ${
          open ? 'border-[#eb5202] ring-2 ring-[#eb5202]/20' : 'border-gray-300'
        }`}
      >
        {selectedUsers.map(u => (
          <span key={u.id} className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full">
            {u.name || u.email}
            <button
              type="button"
              onMouseDown={e => { e.stopPropagation(); remove(u.id) }}
              className="hover:text-orange-900 leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={selectedUsers.length === 0 ? 'Search and select customers…' : ''}
          className="flex-1 min-w-[140px] text-sm outline-none bg-transparent placeholder-gray-400 py-0.5"
        />
      </div>

      {open && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {users.length === 0 && (
            <li className="px-3 py-3 text-xs text-gray-400 text-center">No customers found</li>
          )}
          {users.length > 0 && filtered.length === 0 && (
            <li className="px-3 py-3 text-xs text-gray-400 text-center">No matches for "{search}"</li>
          )}
          {filtered.map(u => (
            <li
              key={u.id}
              onMouseDown={() => toggle(u)}
              className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                selected.has(u.id) ? 'bg-orange-50' : 'hover:bg-gray-50'
              }`}
            >
              <input type="checkbox" readOnly checked={selected.has(u.id)} className="accent-[#eb5202]" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{u.email}</p>
                {u.name && <p className="text-xs text-gray-400 truncate">{u.name}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CONDITION_TYPES = ['price_above', 'price_below', 'price_cross_up', 'price_cross_down']
const EXCHANGES   = ['NSE', 'BSE', 'MCX']
const ORDER_TYPES = ['MARKET', 'LIMIT']

const UNDERLYINGS         = ['NIFTY', 'SENSEX', 'BANKNIFTY']
const STRIKE_SELECTIONS   = ['ATM', 'ATM+1', 'ATM-1']
const EXPIRY_POLICIES     = [
  { value: 'current_week',  label: 'Current weekly' },
  { value: 'next_week',     label: 'Next weekly' },
  { value: 'current_month', label: 'Current month' },
]
const UNDERLYING_DISPLAY = {
  NIFTY:     { symbol: 'NIFTY 50',   exchange: 'NSE' },
  SENSEX:    { symbol: 'SENSEX',     exchange: 'BSE' },
  BANKNIFTY: { symbol: 'NIFTY BANK', exchange: 'NSE' },
}

const SL_RULE_PARAMS = [
  {
    key: 'candle_size_max_pct',
    label: 'Max Candle Size %',
    type: 'number',
    hint: "Skip this trade if today's candle is too large (which would force a very wide stop loss). Value: maximum allowed candle height as a % of the stock price. Example: 2 = skip the trade if the candle moved more than 2% from its highest to lowest point that day.",
  },
  {
    key: 'exit_below_first_candle_low',
    label: 'Exit if Price Falls Below Entry Candle Low',
    type: 'bool',
    hint: "Select true to automatically exit the trade if the price falls below the lowest point of the candle that triggered the trade entry. This means the original setup has failed and it is safer to exit. Select false to rely only on the Stop Loss % instead.",
  },
  {
    key: 'trailing_stop_pct',
    label: 'Trailing Stop %',
    type: 'number',
    hint: "A stop loss that automatically moves up as the price rises, locking in profits. Value: the % gap it keeps below the highest price reached since entry. Example: 2 = if the stock rises to ₹110, the stop moves to ₹107.8 (2% below ₹110) and never moves back down.",
  },
  {
    key: 'atr_multiplier',
    label: 'Volatility-Based Stop (ATR Multiplier)',
    type: 'number',
    hint: "Sets the stop loss distance based on how much the stock typically moves each day — more volatile stocks get a wider stop automatically. Value: multiplier applied to the stock's average daily movement. Example: 2 = stop is placed 2× the stock's typical daily range below the entry price.",
  },
  {
    key: 'break_even_after_pct',
    label: 'Move Stop to Break-Even After %',
    type: 'number',
    hint: "Once the trade is in profit by this %, automatically move the stop loss to the exact entry price — so you cannot lose money on this trade even if it reverses. Example: 1.5 = once the stock is 1.5% above your entry, your stop loss moves to your entry price.",
  },
]

const TARGET_RULE_PARAMS = [
  {
    key: 'pct_target_1',
    label: 'First Profit Target %',
    type: 'number',
    hint: "The first price level at which to sell part of the position and take some profit. Value: % gain from the entry price. Example: 1.5 = sell a portion of the trade when the stock is 1.5% above your entry price.",
  },
  {
    key: 'pct_target_2',
    label: 'Second Profit Target %',
    type: 'number',
    hint: "A higher price level to take additional profits from the remaining position. Value: % gain from the entry price. Example: 3 = sell another portion when the stock is 3% above your entry price (must be higher than Target 1).",
  },
  {
    key: 'pct_target_3',
    label: 'Third Profit Target %',
    type: 'number',
    hint: "The final (highest) price level to exit the remaining position. Value: % gain from the entry price. Example: 5 = sell the last remaining quantity when the stock is 5% above your entry price.",
  },
  {
    key: 'risk_reward_ratio',
    label: 'Risk to Reward Ratio',
    type: 'number',
    hint: "Automatically calculates your profit target based on your stop loss. Value: how many times the risk you want as reward. Example: 2 = if your stop loss is 1% below entry (your risk), the target is set at 2% above entry. A ratio of 2 or higher is generally considered good practice.",
  },
  {
    key: 'book_partial_at_pct',
    label: 'Sell Partial Position At %',
    type: 'number',
    hint: "Sell a portion of your holding once this % profit is reached, and keep the rest running for more gains. Example: 1 = when the stock is 1% above your entry, sell part of your position to secure some profit while staying invested for further upside.",
  },
]

const SL_PARAM_MAP    = Object.fromEntries(SL_RULE_PARAMS.map(p => [p.key, p]))
const TARGET_PARAM_MAP = Object.fromEntries(TARGET_RULE_PARAMS.map(p => [p.key, p]))

function rulesObjToRows(obj, paramMap) {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).map(([k, v]) => ({ param: k, value: String(v) }))
    .filter(r => r.param in paramMap)
}

function rowsToRulesObj(rows) {
  const out = {}
  for (const r of rows) {
    if (!r.param || r.value === '') continue
    const meta = SL_PARAM_MAP[r.param] ?? TARGET_PARAM_MAP[r.param]
    out[r.param] = meta?.type === 'bool'
      ? r.value === 'true'
      : parseFloat(r.value)
  }
  return Object.keys(out).length ? out : null
}

function RulesEditor({ rows, onChange, paramDefs, addLabel }) {
  const paramMap = Object.fromEntries(paramDefs.map(p => [p.key, p]))
  const usedKeys = new Set(rows.map(r => r.param))

  function setRow(idx, key, val) {
    onChange(rows.map((r, i) => i === idx ? { ...r, [key]: val } : r))
  }
  function addRow() {
    const next = paramDefs.find(p => !usedKeys.has(p.key))
    if (!next) return
    onChange([...rows, { param: next.key, value: '' }])
  }
  function removeRow(idx) {
    onChange(rows.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const meta = paramMap[row.param]
          return (
            <div key={idx} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <select
                  value={row.param}
                  onChange={e => setRow(idx, 'param', e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
                >
                  {paramDefs.map(p => (
                    <option key={p.key} value={p.key} disabled={usedKeys.has(p.key) && p.key !== row.param}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {meta?.type === 'bool' ? (
                  <select
                    value={row.value}
                    onChange={e => setRow(idx, 'value', e.target.value)}
                    className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
                  >
                    <option value="">—</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type="number"
                    value={row.value}
                    onChange={e => setRow(idx, 'value', e.target.value)}
                    placeholder="Value"
                    className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="text-red-400 hover:text-red-600 text-lg leading-none"
                  title="Remove"
                >×</button>
              </div>
              {meta?.hint && (
                <p className="text-xs text-gray-400 pl-1">{meta.hint}</p>
              )}
            </div>
          )
        })}
      </div>
      {rows.length < paramDefs.length && (
        <button type="button" onClick={addRow} className="mt-2 text-xs text-[#eb5202] hover:underline">
          + {addLabel}
        </button>
      )}
    </div>
  )
}

// ─── Current price badge ─────────────────────────────────────────────────────
function PriceBadge({ ltp, loading }) {
  if (loading) return <span className="text-xs text-gray-400 ml-1">Fetching price…</span>
  if (ltp == null) return null
  return (
    <span className="text-xs font-semibold text-blue-600 ml-1">
      LTP: ₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

function PctPriceHint({ ltp, pct, type }) {
  if (!ltp || !pct || isNaN(parseFloat(pct))) return null
  const p   = parseFloat(pct)
  const val = type === 'tp'
    ? ltp * (1 + p / 100)
    : ltp * (1 - p / 100)
  const color = type === 'tp' ? 'text-green-600' : 'text-red-500'
  return (
    <p className={`text-xs mt-0.5 ${color}`}>
      = ₹{val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at current price
    </p>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StrategyEdit() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const formRef  = useRef(null)
  const patterns = usePatterns()

  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState('')
  const [saved, setSaved]             = useState(false)
  const [allUsers, setAllUsers]       = useState([])
  const [selectedUsers, setSelectedUsers] = useState(new Set())
  const [currentPrice, setCurrentPrice]   = useState(null)
  const [priceLoading, setPriceLoading]   = useState(false)
  const priceDebounceRef = useRef(null)

  const [form, setForm] = useState({
    name: '', description: '', instrument: '', exchange: 'NSE',
    order_type: 'MARKET', quantity: '', stop_loss_pct: '', take_profit_pct: '',
    entry_type: 'price_above', entry_value: '',
    exit_type: 'price_below', exit_value: '',
    candle_pattern_id: '',
    is_active: true,
    option_enabled: false,
    option_underlying: 'NIFTY',
    option_strike_selection: 'ATM',
    option_expiry: 'current_week',
    timeframes: [...ALL_TIMEFRAMES],
    entry_conditions_rows: [{ ...EMPTY_CONDITION_ROW }],
    indicator_settings: { ...EMPTY_INDICATOR_SETTINGS },
    trade_filters: { ...EMPTY_TRADE_FILTERS },
  })
  const [slRulesRows, setSlRulesRows]         = useState([])
  const [targetRulesRows, setTargetRulesRows] = useState([])
  const [activeChartTimeframe, setActiveChartTimeframe] = useState(null)

  function fetchPrice(symbol, exchange) {
    if (!symbol) { setCurrentPrice(null); return }
    clearTimeout(priceDebounceRef.current)
    priceDebounceRef.current = setTimeout(() => {
      setPriceLoading(true)
      axiosInstance.get(`/api/admin/instruments/price?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`)
        .then(r => setCurrentPrice(r.data?.ltp ?? null))
        .catch(() => setCurrentPrice(null))
        .finally(() => setPriceLoading(false))
    }, 300)
  }

  useEffect(() => {
    Promise.all([
      axiosInstance.get('/api/admin/strategies'),
      axiosInstance.get('/api/admin/users?role=customer'),
    ]).then(([sr, ur]) => {
      const s = (sr.data?.strategies ?? []).find(x => String(x.id) === String(id))
      if (!s) { navigate('/admin/strategies'); return }
      const instrument = s.instrument ?? ''
      const exchange   = s.exchange ?? 'NSE'
      const rawConds = s.entry_conditions
      const condRows = Array.isArray(rawConds) && rawConds.length > 0
        ? rawConds.map(c => ({ type: c.type ?? DETECTION_CONDITION_TYPES[0].value, value: String(c.value ?? '') }))
        : [{ ...EMPTY_CONDITION_ROW }]
      setForm({
        name:            s.name ?? '',
        description:     s.description ?? '',
        instrument,
        exchange,
        order_type:      s.order_type ?? 'MARKET',
        quantity:        String(s.quantity ?? ''),
        stop_loss_pct:   String(s.stop_loss_pct ?? ''),
        take_profit_pct: String(s.take_profit_pct ?? ''),
        entry_type:        s.entry_condition?.type ?? 'price_above',
        entry_value:       String(s.entry_condition?.value ?? ''),
        exit_type:         s.exit_condition?.type ?? 'price_below',
        exit_value:        String(s.exit_condition?.value ?? ''),
        candle_pattern_id: s.candle_pattern_id ? String(s.candle_pattern_id) : '',
        is_active:         s.is_active ?? true,
        option_enabled:           !!s.option_config?.enabled,
        option_underlying:        s.option_config?.underlying        ?? 'NIFTY',
        option_strike_selection:  s.option_config?.strike_selection  ?? 'ATM',
        option_expiry:            s.option_config?.expiry            ?? 'current_week',
        timeframes:         Array.isArray(s.timeframes) && s.timeframes.length > 0 ? s.timeframes : [...ALL_TIMEFRAMES],
        entry_conditions_rows: condRows,
        indicator_settings: mergeIndicatorSettings(s.indicator_settings),
        trade_filters:      mergeTradeFilters(s.trade_filters),
      })
      setSlRulesRows(rulesObjToRows(s.stop_loss_rules, SL_PARAM_MAP))
      setTargetRulesRows(rulesObjToRows(s.target_rules, TARGET_PARAM_MAP))
      setAllUsers(ur.data?.users ?? ur.data ?? [])
      setSelectedUsers(new Set(s.assigned_user_ids ?? []))
      if (s.option_config?.enabled) {
        const meta = UNDERLYING_DISPLAY[s.option_config.underlying] ?? UNDERLYING_DISPLAY.NIFTY
        fetchPrice(meta.symbol, meta.exchange)
      } else if (instrument) {
        fetchPrice(instrument, exchange)
      }
    }).catch(() => navigate('/admin/strategies'))
      .finally(() => setLoading(false))
  }, [id, navigate])

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
    // When options are enabled the instrument field is hidden and auto-filled
    // from the underlying selection, so don't require it from the user.
    const required = form.option_enabled
      ? ['name', 'quantity', 'stop_loss_pct', 'take_profit_pct', 'entry_value']
      : ['name', 'instrument', 'quantity', 'stop_loss_pct', 'take_profit_pct', 'entry_value']
    const missing = required.filter(k => !form[k])
    if (missing.length) { setErr(`Required: ${missing.join(', ')}`); return }

    setSaving(true); setErr(''); setSaved(false)
    const optMeta = UNDERLYING_DISPLAY[form.option_underlying] ?? UNDERLYING_DISPLAY.NIFTY
    const effectiveInstrument = form.option_enabled ? optMeta.symbol  : form.instrument.toUpperCase()
    const effectiveExchange   = form.option_enabled ? optMeta.exchange : form.exchange
    try {
      const validCondRows = form.entry_conditions_rows.filter(r => r.type && r.value !== '')
      await axiosInstance.put(`/api/admin/strategies/${id}`, {
        name:            form.name,
        description:     form.description,
        instrument:      effectiveInstrument,
        exchange:        effectiveExchange,
        order_type:      form.order_type,
        quantity:        parseInt(form.quantity),
        stop_loss_pct:   parseFloat(form.stop_loss_pct),
        take_profit_pct: parseFloat(form.take_profit_pct),
        stop_loss_rules:   rowsToRulesObj(slRulesRows),
        target_rules:      rowsToRulesObj(targetRulesRows),
        entry_condition:   { type: form.entry_type, value: parseFloat(form.entry_value) },
        exit_condition:    form.exit_value ? { type: form.exit_type, value: parseFloat(form.exit_value) } : null,
        timeframes:        form.timeframes.length > 0 ? form.timeframes : null,
        entry_conditions:  validCondRows.map(r => ({ type: r.type, value: parseFloat(r.value) })),
        indicator_settings: form.indicator_settings,
        trade_filters:     form.trade_filters,
        candle_pattern_id: form.candle_pattern_id ? parseInt(form.candle_pattern_id) : null,
        option_config: form.option_enabled
          ? { enabled: true, underlying: form.option_underlying,
              strike_selection: form.option_strike_selection, expiry: form.option_expiry }
          : null,
        is_active:         form.is_active,
      })
      await axiosInstance.post(`/api/admin/strategies/${id}/assign-bulk`, {
        user_ids: [...selectedUsers],
      })
      setSaved(true)
    } catch (ex) {
      setErr(ex.response?.data?.message ?? ex.response?.data?.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-sm text-gray-400">Loading…</div>
  }

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/admin/strategies')}
              className="text-gray-400 hover:text-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span>Edit Strategy</span>
          </div>
        }
        action={
          <div className="flex items-center gap-2">
            {saved && <span className="text-sm text-green-600">Saved.</span>}
            {err   && <span className="text-sm text-red-500">{err}</span>}
            <Btn variant="secondary" type="button" onClick={() => navigate('/admin/strategies')}>Cancel</Btn>
            <Btn variant="primary" disabled={saving} onClick={() => formRef.current?.requestSubmit()}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Btn>
          </div>
        }
      />

      <Card className="p-6">
        <form ref={formRef} onSubmit={handleSubmit}>

          {/* Active toggle */}
          <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_active ? 'bg-[#eb5202]' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm font-medium text-gray-700">{form.is_active ? 'Active' : 'Inactive'}</span>
          </div>

          {/* Options trading section */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Options Trading</p>
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <button
                type="button"
                onClick={() => {
                  setForm(f => {
                    const next = !f.option_enabled
                    if (next) {
                      const meta = UNDERLYING_DISPLAY[f.option_underlying] ?? UNDERLYING_DISPLAY.NIFTY
                      fetchPrice(meta.symbol, meta.exchange)
                    } else if (f.instrument) {
                      fetchPrice(f.instrument, f.exchange)
                    } else {
                      setCurrentPrice(null)
                    }
                    return { ...f, option_enabled: next }
                  })
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.option_enabled ? 'bg-[#eb5202]' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.option_enabled ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-medium text-gray-700">
                {form.option_enabled ? 'Trade as options' : 'Trade underlying (equity / index / MCX)'}
              </span>
            </div>
            {form.option_enabled && (
              <div className="grid grid-cols-3 gap-x-4">
                <FormField label={<span className="flex items-center gap-1">Underlying <PriceBadge ltp={currentPrice} loading={priceLoading} /></span>}>
                  <Select
                    value={form.option_underlying}
                    onChange={e => {
                      const u = e.target.value
                      setForm(f => ({ ...f, option_underlying: u }))
                      const meta = UNDERLYING_DISPLAY[u] ?? UNDERLYING_DISPLAY.NIFTY
                      fetchPrice(meta.symbol, meta.exchange)
                    }}
                  >
                    {UNDERLYINGS.map(u => <option key={u}>{u}</option>)}
                  </Select>
                </FormField>
                <FormField label="Strike">
                  <Select value={form.option_strike_selection} onChange={set('option_strike_selection')}>
                    {STRIKE_SELECTIONS.map(s => <option key={s}>{s}</option>)}
                  </Select>
                </FormField>
                <FormField label="Expiry">
                  <Select value={form.option_expiry} onChange={set('option_expiry')}>
                    {EXPIRY_POLICIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </FormField>
                <p className="col-span-3 text-xs text-gray-500 -mt-1">
                  Bullish patterns BUY CE, bearish patterns BUY PE. The contract is resolved at entry from the live NFO/BFO chain.
                </p>
              </div>
            )}
          </div>

          {/* Main fields */}
          <div className="grid grid-cols-2 gap-x-6">
            <FormField label="Strategy Name">
              <Input value={form.name} onChange={set('name')} placeholder="MA Crossover" required />
            </FormField>

            {!form.option_enabled && (
              <FormField label={<span className="flex items-center gap-1">Instrument <PriceBadge ltp={currentPrice} loading={priceLoading} /></span>}>
                <InstrumentSearch
                  value={form.instrument}
                  onChange={({ symbol, exchange }) => {
                    setForm(f => ({ ...f, instrument: symbol, ...(exchange ? { exchange } : {}) }))
                    if (symbol && symbol.length > 1) fetchPrice(symbol, exchange || form.exchange)
                    else setCurrentPrice(null)
                  }}
                />
              </FormField>
            )}

            {!form.option_enabled && (
              <FormField label="Exchange">
                <Select value={form.exchange} onChange={e => {
                  setForm(f => ({ ...f, exchange: e.target.value }))
                  if (form.instrument) fetchPrice(form.instrument, e.target.value)
                }}>
                  {EXCHANGES.map(e => <option key={e}>{e}</option>)}
                </Select>
              </FormField>
            )}

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

            {/* Pattern Execution Config */}
            <div className="col-span-2 mt-2 pt-2 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pattern Execution Config</p>

              {/* Timeframes */}
              <FormField label="Timeframes">
                <TimeframeMultiSelect
                  selected={form.timeframes}
                  onChange={tfs => setForm(f => ({ ...f, timeframes: tfs }))}
                  onSelectTimeframe={setActiveChartTimeframe}
                />
              </FormField>

              {/* Detection Conditions */}
              <div className="mb-3">
                <p className="text-xs text-gray-600 mb-2">Detection Conditions</p>
                <div className="space-y-2">
                  {form.entry_conditions_rows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
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
                        className="text-red-400 hover:text-red-600 disabled:opacity-30 text-lg"
                      >×</button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addCondRow}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >+ Add condition</button>
              </div>

              {/* Chart */}
              {form.instrument && activeChartTimeframe && (
                <div className="mb-3">
                  <p className="text-xs text-gray-600 mb-2">Chart Preview — {activeChartTimeframe} (last 10 days)</p>
                  <CandlestickChart
                    instrument={form.instrument.toUpperCase()}
                    exchange={form.exchange}
                    timeframe={activeChartTimeframe}
                  />
                </div>
              )}

              {/* Indicator Settings */}
              <div className="mb-3">
                <p className="text-xs text-gray-600 mb-2">Indicator Settings</p>
                <IndicatorSettingsPanel
                  settings={form.indicator_settings}
                  onChange={s => setForm(f => ({ ...f, indicator_settings: s }))}
                />
              </div>

              {/* Trade Filters */}
              <div className="mb-3">
                <p className="text-xs text-gray-600 mb-2">Trade Filters</p>
                <TradeFiltersPanel
                  filters={form.trade_filters}
                  onChange={f => setForm(prev => ({ ...prev, trade_filters: f }))}
                />
              </div>
            </div>

            <FormField label="Stop Loss %">
              <Input type="number" step="0.01" min={0} value={form.stop_loss_pct} onChange={set('stop_loss_pct')} required />
              <PctPriceHint ltp={currentPrice} pct={form.stop_loss_pct} type="sl" />
            </FormField>

            <FormField label="Take Profit %">
              <Input type="number" step="0.01" min={0} value={form.take_profit_pct} onChange={set('take_profit_pct')} required />
              <PctPriceHint ltp={currentPrice} pct={form.take_profit_pct} type="tp" />
            </FormField>
          </div>

          {/* Stop Loss Rules */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-1">
            Stop Loss Rules
            <span className="font-normal normal-case ml-1 text-gray-400">— optional advanced rules (override or supplement Stop Loss %)</span>
          </p>
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <RulesEditor
              rows={slRulesRows}
              onChange={setSlRulesRows}
              paramDefs={SL_RULE_PARAMS}
              addLabel="Add stop loss rule"
            />
            {slRulesRows.length === 0 && (
              <p className="text-xs text-gray-400 mb-1">No rules configured — using Stop Loss % only.</p>
            )}
          </div>

          {/* Target Rules */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Target Rules
            <span className="font-normal normal-case ml-1 text-gray-400">— optional advanced rules (override or supplement Take Profit %)</span>
          </p>
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <RulesEditor
              rows={targetRulesRows}
              onChange={setTargetRulesRows}
              paramDefs={TARGET_RULE_PARAMS}
              addLabel="Add target rule"
            />
            {targetRulesRows.length === 0 && (
              <p className="text-xs text-gray-400 mb-1">No rules configured — using Take Profit % only.</p>
            )}
          </div>

          {/* Conditions */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-1">Entry Condition</p>
          <div className="grid grid-cols-2 gap-x-6 mb-2">
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
          <div className="grid grid-cols-2 gap-x-6 mb-6">
            <FormField label="Type">
              <Select value={form.exit_type} onChange={set('exit_type')}>
                {CONDITION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </Select>
            </FormField>
            <FormField label="Value">
              <Input type="number" step="0.01" value={form.exit_value} onChange={set('exit_value')} placeholder="Leave blank to use SL/TP only" />
            </FormField>
          </div>

          {/* Assign customers */}
          <div className="border-t border-gray-100 pt-5">
            <FormField label="Assign Customers">
              <CustomerMultiSelect
                users={allUsers}
                selected={selectedUsers}
                onChange={setSelectedUsers}
              />
              <p className="mt-1.5 text-xs text-gray-400">
                {selectedUsers.size} customer{selectedUsers.size !== 1 ? 's' : ''} selected
              </p>
            </FormField>
          </div>

        </form>
      </Card>
    </div>
  )
}
