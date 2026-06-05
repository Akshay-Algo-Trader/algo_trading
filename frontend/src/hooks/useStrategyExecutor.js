import { useState, useEffect, useRef } from 'react'
import axiosInstance from '../api/axiosInstance'

const POLL_MS = 3000  // Poll backend state every 3s — engine drives execution, browser just views

// Map server severity → log className key used by the panel
const SEVERITY_MAP = { info: 'info', success: 'success', warn: 'warn', error: 'error' }

function logsToView(logs) {
  // Server returns newest-first via id desc. Convert ts → HH:MM:SS local time.
  return (logs || []).map(l => {
    const d = new Date(l.ts)
    const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    return {
      ts,
      msg:  l.message,
      type: SEVERITY_MAP[l.severity] || 'info',
    }
  })
}

function planStateFromServer(serverPlanState) {
  if (!serverPlanState) return null
  return {
    sl:             serverPlanState.sl,
    finalTp:        serverPlanState.final_tp,
    targets:        (serverPlanState.targets || []).map(t => ({
      index: t.index, pct: t.pct, price: t.price, hit: Boolean(t.hit),
    })),
    partialBook:    serverPlanState.partial_book
      ? {
          pct:    serverPlanState.partial_book.pct,
          price:  serverPlanState.partial_book.price,
          booked: Boolean(serverPlanState.partial_book.booked),
        }
      : null,
    remaining:      serverPlanState.remaining,
    total:          serverPlanState.total,
    detCandleLow:   serverPlanState.det_candle_low,
    detCandleHigh:  serverPlanState.det_candle_high,
    exitBelowFirstCandle: Boolean(serverPlanState.exit_below_first_candle),
    direction:      serverPlanState.direction,
    resolvedContract: serverPlanState.resolved_contract
      ? {
          tradingsymbol:   serverPlanState.resolved_contract.tradingsymbol,
          exchange:        serverPlanState.resolved_contract.exchange,
          strike:          serverPlanState.resolved_contract.strike,
          expiry:          serverPlanState.resolved_contract.expiry,
          optionType:      serverPlanState.resolved_contract.option_type,
          instrumentToken: serverPlanState.resolved_contract.instrument_token,
        }
      : null,
  }
}

/**
 * Backend-driven executor view.
 *
 * The engine runs as a thread inside the Flask process. This hook just polls
 * /api/customer/session/state and surfaces phase, LTP, logs, and the current
 * trade plan. The browser never decides anything — closing the tab does NOT
 * stop the strategy.
 *
 * `session` and `strategy` are accepted for API compatibility with the old
 * hook but are mostly used as a "should we be polling?" trigger.
 */
export function useStrategyExecutor({ session, strategy, mode: _mode, onSessionStop, onError }) {
  const [phase, setPhase]                     = useState('idle')
  const [ltp, setLtp]                         = useState(null)
  const [entryPrice, setEntryPrice]           = useState(null)
  const [logs, setLogs]                       = useState([])
  const [patternDetected, setPatternDetected] = useState(false)
  const [planState, setPlanState]             = useState(null)

  const onStopRef    = useRef(onSessionStop)
  const onErrorRef   = useRef(onError)
  const lastPhaseRef = useRef(null)
  const stopFiredRef = useRef(false)

  useEffect(() => { onStopRef.current  = onSessionStop }, [onSessionStop])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    // Idle when there's no active session
    if (!session?.id || !strategy?.id) {
      setPhase('idle')
      setLtp(null)
      setEntryPrice(null)
      setLogs([])
      setPatternDetected(false)
      setPlanState(null)
      lastPhaseRef.current = null
      stopFiredRef.current = false
      return
    }

    let cancelled = false
    stopFiredRef.current = false

    async function poll() {
      if (cancelled) return
      try {
        const { data } = await axiosInstance.get('/api/customer/session/state')
        if (cancelled) return

        const s = data.session
        if (!s) {
          setPhase('idle')
          return
        }

        const nextPhase = s.phase || 'idle'
        setPhase(nextPhase)
        setLtp(s.last_ltp ?? null)
        setEntryPrice(s.entry_price ?? null)
        setPatternDetected(Boolean(s.pattern_detected))
        setPlanState(planStateFromServer(s.plan_state))
        setLogs(logsToView(data.logs))

        // Detect phase transition exited / stopped → fire onSessionStop once
        const wasInPlay = ['monitoring', 'entering', 'in_position', 'exiting'].includes(lastPhaseRef.current)
        const isStopped = ['exited', 'idle'].includes(nextPhase) || s.status !== 'active'
        if (wasInPlay && isStopped && !stopFiredRef.current) {
          stopFiredRef.current = true
          if (s.auto_stop_reason && s.auto_stop_reason.startsWith('engine_start_failed')) {
            onErrorRef.current?.(s.auto_stop_reason.replace(/^engine_start_failed:\s*/, ''))
          } else if (s.auto_stop_reason === 'executed') {
            onStopRef.current?.({
              reason:       'executed',
              strategyName: strategy.name,
              instrument:   strategy.instrument,
              quantity:     s.plan_state?.total ?? strategy.quantity,
              entryPrice:   s.entry_price,
              exitPrice:    s.last_ltp,
            })
          } else {
            onStopRef.current?.({ reason: 'stopped' })
          }
        }
        lastPhaseRef.current = nextPhase
      } catch (err) {
        if (cancelled) return
        // Don't tear down on a transient network blip; surface only if it persists
        // (the next poll will retry; the user can also manually stop)
        console.warn('Session state poll failed:', err?.response?.data?.error || err?.message)
      }
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [session?.id, strategy?.id])

  return { phase, ltp, entryPrice, logs, patternDetected, planState }
}
