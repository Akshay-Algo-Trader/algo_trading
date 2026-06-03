import { useState, useEffect, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import { useTradingStore } from '../../store/tradingStore'
import { useStrategyExecutor } from '../../hooks/useStrategyExecutor'

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
function ExecutorPanel({ strategy, phase, ltp, entryPrice, logs, onStop }) {
  const slPrice = entryPrice != null ? entryPrice * (1 - strategy.stop_loss_pct / 100) : null
  const tpPrice = entryPrice != null ? entryPrice * (1 + strategy.take_profit_pct / 100) : null
  const pnlPct  = entryPrice != null && ltp != null ? ((ltp - entryPrice) / entryPrice * 100) : null

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
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {strategy.name} · {strategy.instrument} ({strategy.exchange}) · refreshes every 15s
          </p>
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
          <p className="text-xs text-red-400 font-medium">Stop Loss</p>
          <p className="font-bold text-red-700 mt-0.5">{slPrice != null ? fmt(slPrice) : `${strategy.stop_loss_pct}%`}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs text-green-500 font-medium">Take Profit</p>
          <p className="font-bold text-green-700 mt-0.5">{tpPrice != null ? fmt(tpPrice) : `${strategy.take_profit_pct}%`}</p>
        </div>
      </div>

      {/* P&L bar (only when in position) */}
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
        <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1 font-mono">
          {logs.length === 0 ? (
            <p className="text-xs text-gray-400">Waiting for first price tick…</p>
          ) : logs.map((l, i) => (
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
function StrategyCard({ strategy, activeSessionId, onActivate, activating, mode, kiteConnected }) {
  const isActivating = activating === strategy.id
  const hasSession = !!activeSessionId
  const liveBlocked = mode === 'live' && !kiteConnected

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{strategy.name}</h3>
          {strategy.description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{strategy.description}</p>
          )}
        </div>
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
          strategy.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {strategy.is_active ? 'Active' : 'Inactive'}
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

      {strategy.entry_condition && (
        <div>
          <p className="text-xs text-gray-400 font-medium mb-1">Entry Condition</p>
          <p className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-700 font-mono">
            {strategy.entry_condition.type?.replace(/_/g, ' ')} @ {strategy.entry_condition.value}
          </p>
        </div>
      )}

      <button
        onClick={() => onActivate(strategy.id)}
        disabled={hasSession || isActivating || !strategy.is_active || liveBlocked}
        className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          hasSession || !strategy.is_active || liveBlocked
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
        title={
          liveBlocked  ? 'Kite not connected — contact admin'
          : hasSession ? 'Stop the current active session first'
          : undefined
        }
      >
        {isActivating ? 'Activating…'
          : hasSession ? 'Session Already Active'
          : liveBlocked ? 'Kite Not Connected'
          : 'Activate Strategy'}
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Strategies() {
  const { mode } = useTradingStore()
  const [strategies, setStrategies]       = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [activeStrategy, setActiveStrategy] = useState(null)
  const [kiteConnected, setKiteConnected] = useState(false)
  const [loading, setLoading]             = useState(true)
  const [activating, setActivating]       = useState(null)
  const [stopping, setStopping]           = useState(false)
  const [error, setError]                 = useState('')
  const [success, setSuccess]             = useState('')

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
      setKiteConnected(dashRes.data.kite?.is_connected === true)
    } catch {
      setError('Failed to load strategies.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line

  const handleSessionStop = useCallback(() => {
    setActiveSession(null)
    setActiveStrategy(null)
    setSuccess('')
    loadData()
  }, []) // eslint-disable-line

  const { phase, ltp, entryPrice, logs } = useStrategyExecutor({
    session: activeSession,
    strategy: activeStrategy,
    mode,
    onSessionStop: handleSessionStop,
  })

  async function handleActivate(strategyId) {
    if (mode === 'live' && !kiteConnected) {
      setError('Kite account is not connected. Contact your admin to enable live trading.')
      return
    }
    setActivating(strategyId)
    setError('')
    setSuccess('')
    try {
      await axiosInstance.post('/api/customer/session/start', { strategy_id: strategyId, mode })
      setSuccess(`Strategy activated in ${mode} mode — executor is now monitoring live prices.`)
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
            Activate a strategy to start the auto-trading engine in{' '}
            <span className={`font-semibold ${mode === 'live' ? 'text-green-600' : 'text-blue-600'}`}>
              {mode}
            </span>{' '}
            mode.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {strategies.map(s => (
            <StrategyCard
              key={s.id}
              strategy={s}
              activeSessionId={activeSession?.id}
              onActivate={handleActivate}
              activating={activating}
              mode={mode}
              kiteConnected={kiteConnected}
            />
          ))}
        </div>
      )}
    </div>
  )
}
