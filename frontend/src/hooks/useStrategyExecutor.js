import { useState, useEffect, useRef } from 'react'
import axiosInstance from '../api/axiosInstance'

const POLL_MS = 15000

function checkCondition(cond, ltp, prevLtp) {
  if (!cond || ltp == null) return false
  const { type, value } = cond
  if (type === 'price_above')      return ltp > value
  if (type === 'price_below')      return ltp < value
  if (type === 'price_cross_up')   return prevLtp != null && prevLtp <= value && ltp > value
  if (type === 'price_cross_down') return prevLtp != null && prevLtp >= value && ltp < value
  return false
}

// Determine transaction type for entry and exit based on candle pattern direction.
// Bullish patterns: BUY to enter, SELL to exit.
// Bearish patterns: SELL to enter, BUY to exit.
function tradeDirection(pattern) {
  if (pattern?.direction === 'bearish') return { entry: 'SELL', exit: 'BUY' }
  return { entry: 'BUY', exit: 'SELL' }
}

// For bearish patterns the P&L direction is inverted (profit when price falls).
function calcPnlPct(pattern, entryPrice, ltp) {
  if (entryPrice == null || ltp == null) return null
  const dir = pattern?.direction === 'bearish' ? -1 : 1
  return ((ltp - entryPrice) / entryPrice * 100 * dir)
}

function slHit(pattern, entryPrice, ltp, slPct) {
  if (entryPrice == null || ltp == null) return false
  if (pattern?.direction === 'bearish') {
    // short: stop loss when price rises above entry
    return ltp >= entryPrice * (1 + slPct / 100)
  }
  return ltp <= entryPrice * (1 - slPct / 100)
}

function tpHit(pattern, entryPrice, ltp, tpPct) {
  if (entryPrice == null || ltp == null) return false
  if (pattern?.direction === 'bearish') {
    // short: take profit when price falls below entry
    return ltp <= entryPrice * (1 - tpPct / 100)
  }
  return ltp >= entryPrice * (1 + tpPct / 100)
}

// phase: 'idle' | 'monitoring' | 'entering' | 'in_position' | 'exiting' | 'exited'
export function useStrategyExecutor({ session, strategy, mode, onSessionStop }) {
  const [phase, setPhase]           = useState('idle')
  const [ltp, setLtp]               = useState(null)
  const [entryPrice, setEntryPrice] = useState(null)
  const [logs, setLogs]             = useState([])

  const phaseRef      = useRef('idle')
  const entryPriceRef = useRef(null)
  const prevLtpRef    = useRef(null)
  const inFlightRef   = useRef(false)
  const modeRef       = useRef(mode)
  const onStopRef     = useRef(onSessionStop)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { onStopRef.current = onSessionStop }, [onSessionStop])

  function patchPhase(p) {
    phaseRef.current = p
    setPhase(p)
  }

  function addLog(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString('en-IN', { hour12: false })
    setLogs(prev => [{ ts, msg, type }, ...prev].slice(0, 40))
  }

  useEffect(() => {
    if (!session?.id || !strategy?.id) {
      patchPhase('idle')
      return
    }

    patchPhase('monitoring')
    prevLtpRef.current  = null
    entryPriceRef.current = null
    inFlightRef.current = false
    setEntryPrice(null)
    setLtp(null)
    setLogs([])

    const pattern = strategy.candle_pattern ?? null
    const dir     = tradeDirection(pattern)

    addLog(
      `Executor started — watching ${strategy.instrument} on ${strategy.exchange}` +
      (pattern ? ` | Pattern: ${pattern.name} (${pattern.direction})` : '')
    )

    let cancelled = false

    async function tick() {
      if (cancelled || inFlightRef.current) return
      const ph = phaseRef.current
      if (ph === 'idle' || ph === 'exited') return

      let currentLtp
      try {
        const { data } = await axiosInstance.get('/api/customer/market/price', {
          params: { symbol: strategy.instrument, exchange: strategy.exchange },
        })
        currentLtp = data.ltp
      } catch {
        if (!cancelled) addLog('Price fetch failed', 'error')
        return
      }

      if (cancelled) return
      if (currentLtp == null) {
        addLog('Price unavailable — Kite may not be connected', 'warn')
        return
      }

      setLtp(currentLtp)
      const prevLtp = prevLtpRef.current
      const ep      = entryPriceRef.current

      if (ph === 'monitoring') {
        const hit = checkCondition(strategy.entry_condition, currentLtp, prevLtp)
        addLog(
          `LTP ₹${currentLtp} | Entry: ${strategy.entry_condition?.type} @ ${strategy.entry_condition?.value}` +
          (pattern ? ` | ${pattern.direction} pattern` : '') +
          (hit ? ' → TRIGGERED' : ''),
          hit ? 'success' : 'info'
        )

        if (hit) {
          inFlightRef.current = true
          patchPhase('entering')
          const entryOrderPrice = strategy.order_type === 'LIMIT'
            ? strategy.entry_condition.value
            : currentLtp
          try {
            await axiosInstance.post('/api/customer/market/order', {
              symbol:           strategy.instrument,
              exchange:         strategy.exchange,
              transaction_type: dir.entry,
              order_type:       strategy.order_type,
              quantity:         strategy.quantity,
              price:            entryOrderPrice,
              product:          strategy.exchange === 'MCX' ? 'NRML' : 'MIS',
              mode:             modeRef.current,
            })
            if (!cancelled) {
              entryPriceRef.current = currentLtp
              setEntryPrice(currentLtp)
              patchPhase('in_position')
              addLog(`${dir.entry} ${strategy.quantity}×${strategy.instrument} @ ₹${currentLtp}`, 'success')
            }
          } catch (err) {
            if (!cancelled) {
              addLog(`${dir.entry} failed: ${err.response?.data?.error || err.message}`, 'error')
              patchPhase('monitoring')
            }
          } finally {
            inFlightRef.current = false
          }
        }
      } else if (ph === 'in_position' && ep != null) {
        const pnlPct = calcPnlPct(pattern, ep, currentLtp)

        let exitReason = null
        if (slHit(pattern, ep, currentLtp, strategy.stop_loss_pct))
          exitReason = `Stop Loss hit (₹${currentLtp})`
        else if (tpHit(pattern, ep, currentLtp, strategy.take_profit_pct))
          exitReason = `Take Profit hit (₹${currentLtp})`
        else if (checkCondition(strategy.exit_condition, currentLtp, prevLtp))
          exitReason = `Exit condition: ${strategy.exit_condition.type} @ ${currentLtp}`

        if (exitReason) {
          addLog(exitReason, 'warn')
          inFlightRef.current = true
          patchPhase('exiting')
          try {
            await axiosInstance.post('/api/customer/market/order', {
              symbol:           strategy.instrument,
              exchange:         strategy.exchange,
              transaction_type: dir.exit,
              order_type:       'MARKET',
              quantity:         strategy.quantity,
              price:            currentLtp,
              product:          strategy.exchange === 'MCX' ? 'NRML' : 'MIS',
              mode:             modeRef.current,
            })
            if (!cancelled) {
              addLog(`${dir.exit} ${strategy.quantity}×${strategy.instrument} @ ₹${currentLtp}`, 'success')
              patchPhase('exited')
              try { await axiosInstance.post('/api/customer/session/stop') } catch {}
              onStopRef.current?.({
                reason:       'executed',
                strategyName: strategy.name,
                instrument:   strategy.instrument,
                quantity:     strategy.quantity,
                entryPrice:   ep,
                exitPrice:    currentLtp,
              })
            }
          } catch (err) {
            if (!cancelled) {
              addLog(`${dir.exit} failed: ${err.response?.data?.error || err.message}`, 'error')
              patchPhase('in_position')
            }
          } finally {
            inFlightRef.current = false
          }
        } else {
          const slPrice = pattern?.direction === 'bearish'
            ? ep * (1 + strategy.stop_loss_pct / 100)
            : ep * (1 - strategy.stop_loss_pct / 100)
          const tpPrice = pattern?.direction === 'bearish'
            ? ep * (1 - strategy.take_profit_pct / 100)
            : ep * (1 + strategy.take_profit_pct / 100)
          addLog(
            `In position (${dir.entry}) — LTP ₹${currentLtp} | P&L ${pnlPct >= 0 ? '+' : ''}${pnlPct?.toFixed(2)}% | SL ₹${slPrice.toFixed(2)} | TP ₹${tpPrice.toFixed(2)}`,
            'info'
          )
        }
      }

      prevLtpRef.current = currentLtp
    }

    tick()
    const interval = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session?.id, strategy?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return { phase, ltp, entryPrice, logs }
}
