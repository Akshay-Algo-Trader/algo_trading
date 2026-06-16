import { useEffect, useRef, useState } from 'react'
import ExecutionChart from './ExecutionChart'

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

export function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

/**
 * Live execution panel — the engine's own view of a running session.
 *
 * Shared by the Strategies page (paper/live) and the Replay page. Pass a
 * `replay` status block ({ virtual_time, progress_pct, cursor, total }) to render
 * the replay badge, virtual clock and progress bar; omit it for paper/live.
 */
export default function ExecutorPanel({
  session, strategy, phase, ltp, entryPrice, logs, patternDetected, planState,
  onStop, replay = null, stopLabel = 'Stop Session', paused = false, onResume = null, resuming = false,
}) {
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
  const [entryTime, setEntryTime] = useState(null)
  const [exitTime, setExitTime] = useState(null)
  const enteredRef = useRef(false)

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

  // Track entry and exit times
  useEffect(() => {
    if (phase === 'in_position' && !enteredRef.current) {
      enteredRef.current = true
      setEntryTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    if (phase === 'exited' && entryTime && !exitTime) {
      setExitTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
  }, [phase, entryTime, exitTime])

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 space-y-4 ${replay ? 'border-purple-200' : 'border-blue-200'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">Execution Engine</span>
            {replay && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700">
                REPLAY{replay.virtual_time ? ` · ${replay.virtual_time}` : ''}
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PHASE_STYLE[phase]}`}>
              {PHASE_LABEL[phase]}
            </span>
            {strategy.swing_zone_config && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${patternDetected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {patternDetected ? `Breakout: ${strategy.swing_zone_config.name} ✓` : `Awaiting breakout: ${strategy.swing_zone_config.name}`}
              </span>
            )}
            {entryTime && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">
                Entry @ {entryTime}
              </span>
            )}
            {exitTime && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">
                Exit @ {exitTime}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {strategy.name} · {strategy.instrument} ({strategy.exchange}) · {replay ? 'replaying history, 1 candle / 3s' : 'refreshes every 3s'}
          </p>
          {planState?.resolvedContract && (
            <p className="text-xs font-semibold text-orange-600 mt-0.5">
              Option: {planState.resolvedContract.tradingsymbol} ({planState.resolvedContract.exchange}, expiry {planState.resolvedContract.expiry})
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {paused && onResume && replay && replay.progress_pct < 100 && (
            <button
              onClick={onResume}
              disabled={resuming}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
            >
              {resuming ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Resuming…
                </>
              ) : 'Resume'}
            </button>
          )}
          <button
            onClick={onStop}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            {stopLabel}
          </button>
        </div>
      </div>

      {/* Replay progress */}
      {replay && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Replay progress</span>
            <span className="font-mono">{replay.progress_pct ?? 0}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${replay.progress_pct ?? 0}%` }} />
          </div>
        </div>
      )}

      {/* Live stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 font-medium">{replay ? 'Replay LTP' : 'Live LTP'}</p>
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

      {/* Live execution chart — the engine's own view: levels, breakout, plan */}
      <ExecutionChart
        session={session}
        phase={phase}
        ltp={ltp}
        entryPrice={entryPrice}
        planState={planState}
      />

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
