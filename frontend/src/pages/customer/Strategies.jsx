import { useState, useEffect, useCallback, useRef } from 'react'
import axiosInstance from '../../api/axiosInstance'
import { useTradingStore } from '../../store/tradingStore'
import { useStrategyExecutor } from '../../hooks/useStrategyExecutor'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

// ── Chart helpers ─────────────────────────────────────────────────────────────
const INTERVALS = [
  { value: '1D',  label: '1D' },
  { value: '4H',  label: '4H' },
  { value: '1H',  label: '1H' },
  { value: '30m', label: '30m' },
  { value: '5m',  label: '5m' },
]

function CandleShape(props) {
  const { x, y, width, height, payload, yMin } = props
  if (!payload || !height || height <= 0) return null
  const { open, close, high, low, isUp } = payload
  if (high == null || low == null || open == null || close == null) return null

  const color = isUp ? '#16a34a' : '#dc2626'
  const pxPerUnit = height / (high - yMin)
  const py = price => y + (high - price) * pxPerUnit

  const yH = py(high), yL = py(low), yO = py(open), yC = py(close)
  const bodyTop = Math.min(yO, yC)
  const bodyBot = Math.max(yO, yC)
  const mid = x + width / 2

  return (
    <g>
      <line x1={mid} y1={yH}    x2={mid} y2={bodyTop} stroke={color} strokeWidth={1.5} />
      <line x1={mid} y1={bodyBot} x2={mid} y2={yL}    stroke={color} strokeWidth={1.5} />
      <rect x={x + 1} y={bodyTop} width={Math.max(1, width - 2)} height={Math.max(1, bodyBot - bodyTop)} fill={color} rx={1} />
    </g>
  )
}

function InlineChart({ strategy, onClose }) {
  const [candles, setCandles]     = useState([])
  const [interval, setInterval_]  = useState('1D')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!strategy) return
    let cancelled = false
    setLoading(true)
    setError('')
    axiosInstance.get('/api/customer/market/candles', {
      params: { symbol: strategy.instrument, exchange: strategy.exchange, interval },
    }).then(({ data }) => {
      if (!cancelled) setCandles(data.candles || [])
    }).catch(err => {
      if (!cancelled) setError(err.response?.data?.error || 'Failed to load chart data')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [strategy?.instrument, strategy?.exchange, interval]) // eslint-disable-line

  const chartData = candles.map(c => ({
    ...c,
    isUp: c.close >= c.open,
  }))

  const prices = candles.flatMap(c => [c.high, c.low]).filter(Boolean)
  const yMin = prices.length ? Math.min(...prices) * 0.999 : 0
  const yMax = prices.length ? Math.max(...prices) * 1.001 : 100

  const tickCount = Math.min(candles.length, 8)
  const step = candles.length > tickCount ? Math.floor(candles.length / tickCount) : 1
  const xTicks = chartData.filter((_, i) => i % step === 0).map(d => d.date)

  function TooltipContent({ active, payload }) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    const f = n => n == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
    return (
      <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl space-y-0.5">
        <p className="font-semibold text-gray-300">{d.date}</p>
        <p>O <span className="font-bold">{f(d.open)}</span></p>
        <p>H <span className="font-bold text-green-400">{f(d.high)}</span></p>
        <p>L <span className="font-bold text-red-400">{f(d.low)}</span></p>
        <p>C <span className="font-bold">{f(d.close)}</span></p>
        {d.volume != null && <p className="text-gray-400">Vol {d.volume.toLocaleString('en-IN')}</p>}
      </div>
    )
  }

  if (!strategy) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-gray-900">{strategy.instrument}</h2>
          <p className="text-xs text-gray-500">{strategy.exchange} · {strategy.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {INTERVALS.map(iv => (
              <button
                key={iv.value}
                onClick={() => setInterval_(iv.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  interval === iv.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {loading && (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading chart…</div>
      )}
      {error && (
        <div className="h-64 flex items-center justify-center text-red-500 text-sm">{error}</div>
      )}
      {!loading && !error && candles.length === 0 && (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data available for this interval</div>
      )}
      {!loading && !error && candles.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="date"
              ticks={xTicks}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={v => `₹${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false} tickLine={false} width={58}
            />
            <Tooltip content={<TooltipContent />} cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }} />
            <Bar dataKey="high" shape={<CandleShape yMin={yMin} />} isAnimationActive={false}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={chartData[i].isUp ? '#16a34a' : '#dc2626'} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Phase badge ────────────────────────────────────────────────────────────────
const PHASE_STYLE = {
  idle:        'bg-gray-100 text-gray-500',
  monitoring:  'bg-blue-100 text-blue-700',
  entering:    'bg-yellow-100 text-yellow-700',
  in_position: 'bg-green-100 text-green-700',
  exiting:     'bg-orange-100 text-orange-700',
  exited:      'bg-gray-100 text-gray-500',
}
const PHASE_LABEL = {
  idle:        'Idle',
  monitoring:  'Monitoring',
  entering:    'Entering…',
  in_position: 'In Position',
  exiting:     'Exiting…',
  exited:      'Exited',
}

const LOG_CLS = {
  info:    'text-gray-500',
  success: 'text-green-600 font-medium',
  warn:    'text-amber-600 font-medium',
  error:   'text-red-600 font-medium',
}

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

// ── Execution Engine panel ────────────────────────────────────────────────────
function ExecutorPanel({ strategy, phase, ltp, entryPrice, logs, patternDetected, planState, onStop }) {
  const dir = planState?.direction === 'bearish' ? 'bearish' : 'bullish'
  const pnlPct = entryPrice != null && ltp != null
    ? (dir === 'bearish'
        ? (entryPrice - ltp) / entryPrice * 100
        : (ltp - entryPrice) / entryPrice * 100)
    : null
  const slPrice = planState?.sl ?? (entryPrice != null
    ? entryPrice * (1 + (dir === 'bearish' ? 1 : -1) * strategy.stop_loss_pct / 100)
    : null)
  const tpPrice = planState?.finalTp ?? (entryPrice != null
    ? entryPrice * (1 + (dir === 'bearish' ? -1 : 1) * strategy.take_profit_pct / 100)
    : null)

  // Logs arrive newest-first; show oldest-first (chronological) and keep the
  // view pinned to the latest entry unless the user has scrolled up to read history.
  const logContainerRef = useRef(null)
  const autoScrollRef = useRef(true)

  function handleLogScroll(e) {
    const el = e.currentTarget
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  useEffect(() => {
    const el = logContainerRef.current
    if (el && autoScrollRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs])

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">Execution Engine</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PHASE_STYLE[phase]}`}>
              {PHASE_LABEL[phase]}
            </span>
            {strategy.swing_zone_config && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${patternDetected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {patternDetected ? `Breakout: ${strategy.swing_zone_config.name} ✓` : `Awaiting breakout: ${strategy.swing_zone_config.name}`}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {strategy.name} · {strategy.instrument} ({strategy.exchange}) · refreshes every 3s
          </p>
          {planState?.resolvedContract && (
            <p className="text-xs font-semibold text-orange-600 mt-0.5">
              Option: {planState.resolvedContract.tradingsymbol} ({planState.resolvedContract.exchange}, expiry {planState.resolvedContract.expiry})
            </p>
          )}
        </div>
        <button
          onClick={onStop}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          Stop Session
        </button>
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 font-medium">Live LTP</p>
          <p className="font-bold text-gray-900 mt-0.5">{fmt(ltp)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 font-medium">Entry Price</p>
          <p className="font-bold text-gray-900 mt-0.5">{fmt(entryPrice)}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-xs text-red-400 font-medium">
            Stop Loss
            {(strategy.stop_loss_rules?.trailing_stop_pct || strategy.stop_loss_rules?.break_even_after_pct) ? ' (dynamic)' : ''}
          </p>
          <p className="font-bold text-red-700 mt-0.5">{slPrice != null ? fmt(slPrice) : `${strategy.stop_loss_pct}%`}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs text-green-500 font-medium">Take Profit</p>
          <p className="font-bold text-green-700 mt-0.5">{tpPrice != null ? fmt(tpPrice) : `${strategy.take_profit_pct}%`}</p>
        </div>
      </div>

      {/* Position size — only when multi-leg plan active */}
      {planState && planState.total > 0 && (planState.targets.length > 0 || planState.partialBook) && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2 flex items-center justify-between text-sm">
          <span className="text-indigo-700 font-medium">Open position</span>
          <span className="text-indigo-900 font-semibold font-mono">
            {planState.remaining} / {planState.total} {strategy.instrument}
          </span>
        </div>
      )}

      {/* Target ladder */}
      {planState?.targets?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Target Ladder</p>
          <div className="grid grid-cols-3 gap-2">
            {planState.targets.map(t => (
              <div
                key={t.index}
                className={`rounded-lg p-2.5 border ${t.hit ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
              >
                <p className={`text-xs font-semibold ${t.hit ? 'text-green-700' : 'text-gray-500'}`}>
                  T{t.index + 1} ({t.pct}%) {t.hit && '✓'}
                </p>
                <p className={`font-mono text-sm font-bold mt-0.5 ${t.hit ? 'text-green-800' : 'text-gray-700'}`}>
                  {fmt(t.price)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {planState?.partialBook && (
        <div className={`rounded-lg p-2.5 border flex items-center justify-between ${planState.partialBook.booked ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          <div>
            <p className={`text-xs font-semibold ${planState.partialBook.booked ? 'text-green-700' : 'text-gray-500'}`}>
              Partial Book (50%) at {planState.partialBook.pct}% {planState.partialBook.booked && '✓'}
            </p>
          </div>
          <p className={`font-mono text-sm font-bold ${planState.partialBook.booked ? 'text-green-800' : 'text-gray-700'}`}>
            {fmt(planState.partialBook.price)}
          </p>
        </div>
      )}

      {/* P&L bar */}
      {pnlPct != null && (
        <div className={`rounded-lg px-4 py-2 text-sm font-semibold flex items-center justify-between ${
          pnlPct >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          <span>Unrealised P&L</span>
          <span>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</span>
        </div>
      )}

      {/* Execution log */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Execution Log</p>
        <div
          ref={logContainerRef}
          onScroll={handleLogScroll}
          className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1 font-mono"
        >
          {logs.length === 0 ? (
            <p className="text-xs text-gray-400">Waiting for first price tick…</p>
          ) : [...logs].reverse().map((l, i) => (
            <p key={i} className={`text-xs ${LOG_CLS[l.type] || 'text-gray-500'}`}>
              <span className="text-gray-400 select-none">{l.ts} </span>
              {l.msg}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({ strategy, activeSessionId, onActivate, activating, mode, kiteConnected, onChart, chartActive, selected, onSelect }) {
  const isActivating = activating === strategy.id
  const isThisSessionActive = activeSessionId != null && strategy.id === activeSessionId
  const hasOtherSession = activeSessionId != null && strategy.id !== activeSessionId
  const liveBlocked = mode === 'live' && !kiteConnected

  const borderClass = isThisSessionActive
    ? 'border-blue-400 ring-2 ring-blue-200'
    : selected
      ? 'border-indigo-400 ring-2 ring-indigo-100'
      : 'border-gray-200'

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4 cursor-pointer ${borderClass}`}
      onClick={() => !isThisSessionActive && onSelect(strategy.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
            isThisSessionActive
              ? 'border-blue-500 bg-blue-500'
              : selected
                ? 'border-indigo-500 bg-indigo-500'
                : 'border-gray-300 bg-white'
          }`}>
            {(selected || isThisSessionActive) && (
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{strategy.name}</h3>
            {strategy.description && (
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{strategy.description}</p>
            )}
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
          isThisSessionActive ? 'bg-blue-100 text-blue-700'
          : strategy.is_active ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-500'
        }`}>
          {isThisSessionActive ? 'Running' : strategy.is_active ? 'Available' : 'Inactive'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 font-medium">Instrument</p>
          <p className="font-semibold text-gray-800 mt-0.5">{strategy.instrument || '—'}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 font-medium">Exchange</p>
          <p className="font-semibold text-gray-800 mt-0.5">{strategy.exchange || '—'}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-red-400 font-medium">Stop Loss</p>
          <p className="font-semibold text-red-600 mt-0.5">
            {strategy.stop_loss_pct != null ? `${strategy.stop_loss_pct}%` : '—'}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-green-500 font-medium">Take Profit</p>
          <p className="font-semibold text-green-600 mt-0.5">
            {strategy.take_profit_pct != null ? `${strategy.take_profit_pct}%` : '—'}
          </p>
        </div>
      </div>

      {strategy.swing_zone_config && (
        <div className="rounded-lg px-3 py-2 flex items-center gap-2 bg-gray-50 border border-gray-100">
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-700">{strategy.swing_zone_config.name}</p>
            <p className="text-xs text-gray-500">{strategy.swing_zone_config.candle_size} · {strategy.swing_zone_config.period_days}d</p>
          </div>
        </div>
      )}

      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onChart(strategy)}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
            chartActive
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
          }`}
          title="View candle chart"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          Chart
        </button>
        <button
          onClick={() => onActivate(strategy.id)}
          disabled={isThisSessionActive || hasOtherSession || isActivating || !strategy.is_active || liveBlocked || !selected}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            isThisSessionActive
              ? 'bg-blue-100 text-blue-700 cursor-default'
              : hasOtherSession || !strategy.is_active || liveBlocked || !selected
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
          title={
            liveBlocked       ? 'Kite not connected — contact admin'
            : hasOtherSession ? 'Stop the current active session first'
            : !selected       ? 'Select this strategy first'
            : undefined
          }
        >
          {isActivating      ? 'Activating…'
            : isThisSessionActive ? 'Session Active'
            : hasOtherSession    ? 'Another Strategy Running'
            : liveBlocked        ? 'Kite Not Connected'
            : !selected          ? 'Select to Activate'
            : 'Activate Strategy'}
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Strategies() {
  const { mode } = useTradingStore()
  const [strategies, setStrategies]         = useState([])
  const [activeSession, setActiveSession]   = useState(null)
  const [activeStrategy, setActiveStrategy] = useState(null)
  const [kiteConnected, setKiteConnected]   = useState(false)
  const [loading, setLoading]               = useState(true)
  const [activating, setActivating]         = useState(null)
  const [stopping, setStopping]             = useState(false)
  const [error, setError]                   = useState('')
  const [success, setSuccess]               = useState('')
  const [chartStrategy, setChartStrategy]   = useState(null)
  const [selectedStrategyId, setSelectedStrategyId] = useState(null)
  const [executionError, setExecutionError]         = useState('')

  function handleChart(strategy) {
    setChartStrategy(prev => prev?.id === strategy.id ? null : strategy)
  }

  async function loadData() {
    try {
      const [stratRes, dashRes] = await Promise.all([
        axiosInstance.get('/api/customer/strategies'),
        axiosInstance.get('/api/customer/dashboard'),
      ])
      setStrategies(stratRes.data.strategies || [])
      const sess = dashRes.data.active_session || null
      setActiveSession(sess)
      setActiveStrategy(sess?.strategy || null)
      if (sess?.strategy?.id) setSelectedStrategyId(sess.strategy.id)
      setKiteConnected(dashRes.data.kite?.is_connected === true)
    } catch {
      setError('Failed to load strategies.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line

  const handleExecutionError = useCallback((msg) => {
    setExecutionError(msg)
    setActiveSession(null)
    setActiveStrategy(null)
    setSelectedStrategyId(null)
    loadData()
  }, []) // eslint-disable-line

  const handleSessionStop = useCallback((result) => {
    setActiveSession(null)
    setActiveStrategy(null)
    setSelectedStrategyId(null)
    if (result?.reason === 'error') {
      // handled by handleExecutionError; nothing extra needed here
      return
    }
    if (result?.reason === 'executed') {
      const pnl = result.entryPrice != null && result.exitPrice != null
        ? ((result.exitPrice - result.entryPrice) / result.entryPrice * 100).toFixed(2)
        : null
      setSuccess({
        type: 'executed',
        strategyName: result.strategyName,
        instrument: result.instrument,
        quantity: result.quantity,
        entryPrice: result.entryPrice,
        exitPrice: result.exitPrice,
        pnl,
      })
    } else {
      setSuccess('')
    }
    loadData()
  }, []) // eslint-disable-line

  const { phase, ltp, entryPrice, logs, patternDetected, planState } = useStrategyExecutor({
    session: activeSession,
    strategy: activeStrategy,
    mode,
    onSessionStop: handleSessionStop,
    onError: handleExecutionError,
  })

  async function handleActivate(strategyId) {
    if (mode === 'live' && !kiteConnected) {
      setError('Kite account is not connected. Contact your admin to enable live trading.')
      return
    }
    setActivating(strategyId)
    setError('')
    setSuccess('')
    setExecutionError('')
    try {
      await axiosInstance.post('/api/customer/session/start', { strategy_id: strategyId, mode })
      setSuccess({ type: 'activated', mode })
      const dashRes = await axiosInstance.get('/api/customer/dashboard')
      const sess = dashRes.data.active_session || null
      setActiveSession(sess)
      setActiveStrategy(sess?.strategy || null)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to activate strategy.')
    } finally {
      setActivating(null)
    }
  }

  async function handleManualStop() {
    setStopping(true)
    try {
      await axiosInstance.post('/api/customer/session/stop')
      setSuccess('')
      setActiveSession(null)
      setActiveStrategy(null)
      setSelectedStrategyId(null)
      await loadData()
    } catch {
      setError('Failed to stop session.')
    } finally {
      setStopping(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading strategies…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Strategies</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Select one strategy, then activate it to start the auto-trading engine in{' '}
            <span className={`font-semibold ${mode === 'live' ? 'text-green-600' : 'text-blue-600'}`}>
              {mode}
            </span>{' '}
            mode. Only one strategy can run at a time.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {executionError && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-5 py-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">Execution Failed — Strategy Stopped</p>
            <p className="text-sm text-red-700 mt-1">{executionError}</p>
            <p className="text-xs text-red-500 mt-1">The session has been stopped. Check the execution log for details.</p>
          </div>
          <button onClick={() => setExecutionError('')} className="text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
        </div>
      )}
      {success && (
        success.type === 'executed' ? (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-800">Trade Completed — {success.strategyName}</p>
              <p className="text-sm text-green-700 mt-1">
                {success.quantity}× {success.instrument} &nbsp;·&nbsp;
                Entry ₹{success.entryPrice?.toFixed(2)} &nbsp;→&nbsp; Exit ₹{success.exitPrice?.toFixed(2)}
                {success.pnl != null && (
                  <span className={`ml-2 font-semibold ${parseFloat(success.pnl) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    ({parseFloat(success.pnl) >= 0 ? '+' : ''}{success.pnl}%)
                  </span>
                )}
              </p>
              <p className="text-xs text-green-600 mt-1">Position closed. Check History for the full trade record.</p>
            </div>
            <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-600 flex-shrink-0">✕</button>
          </div>
        ) : success.type === 'activated' ? (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Strategy activated in <span className="font-semibold mx-1">{success.mode}</span> mode — executor is monitoring live prices.
            <button onClick={() => setSuccess('')} className="ml-auto text-blue-400 hover:text-blue-600">✕</button>
          </div>
        ) : null
      )}

      {mode === 'live' && !kiteConnected && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span><strong>Kite not connected.</strong> Live trading unavailable. Contact your admin to link your Kite account.</span>
        </div>
      )}

      {/* Execution engine panel — shown when a session is active */}
      {activeSession && activeStrategy && (
        <ExecutorPanel
          strategy={activeStrategy}
          phase={phase}
          ltp={ltp}
          entryPrice={entryPrice}
          logs={logs}
          patternDetected={patternDetected}
          planState={planState}
          onStop={handleManualStop}
        />
      )}

      {/* Session active but strategy not yet loaded (edge case) */}
      {activeSession && !activeStrategy && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3">
          <span>A session is active. Stop it from the Dashboard before activating another strategy.</span>
          <button
            onClick={handleManualStop}
            disabled={stopping}
            className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {stopping ? 'Stopping…' : 'Stop Session'}
          </button>
        </div>
      )}

      {strategies.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          No strategies have been assigned to your account yet. Contact your admin.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {strategies.map(s => (
              <StrategyCard
                key={s.id}
                strategy={s}
                activeSessionId={activeStrategy?.id}
                onActivate={handleActivate}
                activating={activating}
                mode={mode}
                kiteConnected={kiteConnected}
                onChart={handleChart}
                chartActive={chartStrategy?.id === s.id}
                selected={selectedStrategyId === s.id}
                onSelect={id => !activeStrategy && setSelectedStrategyId(prev => prev === id ? null : id)}
              />
            ))}
          </div>

          {chartStrategy && (
            <InlineChart
              strategy={chartStrategy}
              onClose={() => setChartStrategy(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
