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

const COND_LABEL = {
  bullish_candle:          'Bullish Candle',
  bearish_candle:          'Bearish Candle',
  gap_up:                  'Gap Up',
  gap_down:                'Gap Down',
  bullish_engulfing:       'Bullish Engulfing',
  bearish_engulfing:       'Bearish Engulfing',
  hammer:                  'Hammer',
  shooting_star:           'Shooting Star',
  doji:                    'Doji',
  inside_bar:              'Inside Bar',
  outside_bar:             'Outside Bar',
  consolidation_breakout:  'Consolidation Breakout',
  consolidation_breakdown: 'Consolidation Breakdown',
}

// Evaluate a single candle-pattern condition against the last N daily OHLC candles.
// candles[last] = today's developing candle, candles[last-1] = yesterday, etc.
function checkCandleCondition(cond, candles) {
  if (!candles || candles.length < 2) return false
  const today = candles[candles.length - 1]
  const prev  = candles[candles.length - 2]
  const { type, value } = cond
  const v = Number(value) || 0

  switch (type) {
    case 'bullish_candle': {
      if (today.close <= today.open) return false
      const range = today.high - today.low
      if (range <= 0) return true
      return (today.close - today.open) / range * 100 >= v
    }
    case 'bearish_candle': {
      if (today.close >= today.open) return false
      const range = today.high - today.low
      if (range <= 0) return true
      return (today.open - today.close) / range * 100 >= v
    }
    case 'gap_up': {
      if (prev.close <= 0) return false
      return (today.open - prev.close) / prev.close * 100 >= v
    }
    case 'gap_down': {
      if (prev.close <= 0) return false
      return (prev.close - today.open) / prev.close * 100 >= v
    }
    case 'bullish_engulfing': {
      // prev bearish, today bullish, today body fully engulfs prev body
      return prev.close < prev.open &&
             today.close > today.open &&
             today.open <= prev.close &&
             today.close >= prev.open
    }
    case 'bearish_engulfing': {
      return prev.close > prev.open &&
             today.close < today.open &&
             today.open >= prev.close &&
             today.close <= prev.open
    }
    case 'hammer': {
      const range = today.high - today.low
      if (range <= 0) return false
      const lowerWick = Math.min(today.open, today.close) - today.low
      return lowerWick / range * 100 >= (v || 60)
    }
    case 'shooting_star': {
      const range = today.high - today.low
      if (range <= 0) return false
      const upperWick = today.high - Math.max(today.open, today.close)
      return upperWick / range * 100 >= (v || 60)
    }
    case 'doji': {
      const range = today.high - today.low
      if (range <= 0) return false
      return Math.abs(today.close - today.open) / range * 100 <= (v || 5)
    }
    case 'inside_bar':
      return today.high <= prev.high && today.low >= prev.low
    case 'outside_bar':
      return today.high > prev.high && today.low < prev.low
    case 'consolidation_breakout': {
      const n = Math.max(2, Math.floor(v || 3))
      if (candles.length < n + 1) return false
      const prevN  = candles.slice(-(n + 1), -1)
      const maxH   = Math.max(...prevN.map(c => c.high))
      const minH   = Math.min(...prevN.map(c => c.high))
      const rangePct = minH > 0 ? (maxH - minH) / minH * 100 : 999
      return rangePct <= 0.4 && today.high > maxH
    }
    case 'consolidation_breakdown': {
      const n = Math.max(2, Math.floor(v || 3))
      if (candles.length < n + 1) return false
      const prevN  = candles.slice(-(n + 1), -1)
      const maxL   = Math.max(...prevN.map(c => c.low))
      const minL   = Math.min(...prevN.map(c => c.low))
      const rangePct = minL > 0 ? (maxL - minL) / minL * 100 : 999
      return rangePct <= 0.4 && today.low < minL
    }
    default:
      return false
  }
}

// ─── Indicator calculations ───────────────────────────────────────────────────

function calcRSI(candles, period) {
  if (candles.length < period + 1) return null
  const closes = candles.map(c => c.close)
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses += Math.abs(d)
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
  }
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

function calcEMA(candles, period) {
  if (candles.length < period) return null
  const closes = candles.map(c => c.close)
  const k = 2 / (period + 1)
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k)
  return ema
}

function calcSMA(candles, period) {
  if (candles.length < period) return null
  const slice = candles.slice(-period)
  return slice.reduce((a, c) => a + c.close, 0) / period
}

function calcCPRPivot(candle) {
  return (candle.high + candle.low + candle.close) / 3
}

function calcCPRWidth(candle) {
  const pivot = calcCPRPivot(candle)
  const bc = (candle.high + candle.low) / 2
  return Math.abs(2 * pivot - bc - bc)
}

// How many candles each indicator + trend filter needs
function requiredCandleDays(indicatorSettings, tradeFilters) {
  let needed = 10
  if (indicatorSettings) {
    if (indicatorSettings.rsi?.enabled)    needed = Math.max(needed, (indicatorSettings.rsi.period    || 14) + 5)
    if (indicatorSettings.ema?.enabled)    needed = Math.max(needed, (indicatorSettings.ema.period    || 20) + 5)
    if (indicatorSettings.sma?.enabled)    needed = Math.max(needed, (indicatorSettings.sma.period    || 50) + 5)
    if (indicatorSettings.volume?.enabled) needed = Math.max(needed, (indicatorSettings.volume.period || 20) + 5)
  }
  if (tradeFilters?.trend_day_filter?.enabled) {
    needed = Math.max(needed, (tradeFilters.trend_day_filter.max_consecutive || 3) + 5)
  }
  return Math.min(needed, 200)
}

// ─── Trade Filters ────────────────────────────────────────────────────────────

const _DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Returns { passed, results: [{name, met, detail}] }
// sessionTrades: array of { pnlPct } for completed trades in this session
function checkTradeFilters(filters, candles, sessionTrades) {
  if (!filters) return { passed: true, results: [] }
  const results = []
  const now = new Date()

  if (filters.time_window?.enabled) {
    const [fH, fM] = (filters.time_window.from || '09:15').split(':').map(Number)
    const [tH, tM] = (filters.time_window.to   || '14:00').split(':').map(Number)
    const nowMins  = now.getHours() * 60 + now.getMinutes()
    const fromMins = fH * 60 + fM
    const toMins   = tH * 60 + tM
    const met = nowMins >= fromMins && nowMins <= toMins
    const pad = n => String(n).padStart(2, '0')
    results.push({ name: 'Time Window', met, detail: `${pad(now.getHours())}:${pad(now.getMinutes())} in [${filters.time_window.from}–${filters.time_window.to}]` })
  }

  if (filters.day_filter?.enabled) {
    const allowed = filters.day_filter.days || [1, 2, 3, 4, 5]
    const today   = now.getDay()
    const met = allowed.includes(today)
    results.push({ name: 'Day Filter', met, detail: `Today is ${_DAY_NAMES[today]}, allowed: ${allowed.map(d => _DAY_NAMES[d]).join(', ')}` })
  }

  if (filters.trend_day_filter?.enabled && candles && candles.length >= 2) {
    const max    = filters.trend_day_filter.max_consecutive || 3
    const recent = candles.slice(-(max + 1), -1)
    if (recent.length >= max) {
      const allBullish = recent.every(c => c.close > c.open)
      const allBearish = recent.every(c => c.close < c.open)
      const met = !allBullish && !allBearish
      results.push({ name: 'Trend Filter', met, detail: met ? `No ${max}-day trend exhaustion` : `${allBullish ? 'Bullish' : 'Bearish'} for ${max}+ days` })
    }
  }

  if (filters.loss_limit?.enabled && sessionTrades) {
    const maxLosses = filters.loss_limit.max_consecutive_losses || 2
    let consecutive = 0
    for (let i = sessionTrades.length - 1; i >= 0; i--) {
      if (sessionTrades[i].pnlPct < 0) consecutive++
      else break
    }
    const met = consecutive < maxLosses
    results.push({ name: 'Loss Limit', met, detail: `${consecutive}/${maxLosses} consecutive loss${consecutive !== 1 ? 'es' : ''}` })
  }

  if (filters.daily_trade_limit?.enabled && sessionTrades) {
    const max = filters.daily_trade_limit.max_trades || 5
    const met = sessionTrades.length < max
    results.push({ name: 'Trade Limit', met, detail: `${sessionTrades.length}/${max} trades` })
  }

  return { passed: results.length === 0 || results.every(r => r.met), results }
}

// Returns { passed, results: [{name, met, detail}] }
function checkIndicatorSettings(settings, candles) {
  if (!settings) return { passed: true, results: [] }
  const results = []
  const last = candles[candles.length - 1]

  if (settings.rsi?.enabled) {
    const period = settings.rsi.period || 14
    const rsi    = calcRSI(candles, period)
    if (rsi === null) {
      results.push({ name: `RSI(${period})`, met: false, detail: 'not enough data' })
    } else {
      const min = settings.rsi.min ?? 0
      const max = settings.rsi.max ?? 100
      const met = rsi >= min && rsi <= max
      results.push({ name: `RSI(${period})`, met, detail: `${rsi.toFixed(1)} range [${min}–${max}]` })
    }
  }

  if (settings.ema?.enabled) {
    const period = settings.ema.period || 20
    const ema    = calcEMA(candles, period)
    if (ema === null) {
      results.push({ name: `EMA(${period})`, met: false, detail: 'not enough data' })
    } else {
      const cond = settings.ema.condition || 'price_above'
      const met  = cond === 'price_above' ? last.close > ema : last.close < ema
      results.push({ name: `EMA(${period})`, met, detail: `price ₹${last.close} ${cond === 'price_above' ? '>' : '<'} EMA ₹${ema.toFixed(2)}` })
    }
  }

  if (settings.sma?.enabled) {
    const period = settings.sma.period || 50
    const sma    = calcSMA(candles, period)
    if (sma === null) {
      results.push({ name: `SMA(${period})`, met: false, detail: 'not enough data' })
    } else {
      const cond = settings.sma.condition || 'price_above'
      const met  = cond === 'price_above' ? last.close > sma : last.close < sma
      results.push({ name: `SMA(${period})`, met, detail: `price ₹${last.close} ${cond === 'price_above' ? '>' : '<'} SMA ₹${sma.toFixed(2)}` })
    }
  }

  if (settings.cpr?.enabled) {
    if (candles.length < 3) {
      results.push({ name: 'CPR', met: false, detail: 'not enough data' })
    } else {
      const prevYest = candles[candles.length - 3]
      const yest     = candles[candles.length - 2]
      // Today's CPR is derived from yesterday's OHLC; yesterday's CPR from day before
      const todayPivot = calcCPRPivot(yest)
      const yestPivot  = calcCPRPivot(prevYest)
      let met = true; const details = []
      if (settings.cpr.ascending) {
        const asc = todayPivot > yestPivot
        if (!asc) met = false
        details.push(`ascending:${asc ? '✓' : '✗'}`)
      }
      if (settings.cpr.narrow) {
        const w = last.close > 0 ? calcCPRWidth(yest) / last.close * 100 : 999
        const narrow = w < 0.5
        if (!narrow) met = false
        details.push(`narrow:${narrow ? '✓' : '✗'}(${w.toFixed(2)}%)`)
      }
      results.push({ name: 'CPR', met, detail: details.join(' ') || 'ok' })
    }
  }

  if (settings.volume?.enabled) {
    const period = settings.volume.period || 20
    const mult   = settings.volume.min_multiplier || 1.5
    if (candles.length < period + 1) {
      results.push({ name: 'Volume', met: false, detail: 'not enough data' })
    } else {
      const recent = candles.slice(-(period + 1), -1)
      const avg    = recent.reduce((a, c) => a + c.volume, 0) / recent.length
      const met    = last.volume >= avg * mult
      results.push({ name: 'Volume', met, detail: `${last.volume} vs ${mult}×avg ${Math.round(avg)}` })
    }
  }

  return { passed: results.length === 0 || results.every(r => r.met), results }
}

// ─── Pattern detection ────────────────────────────────────────────────────────

// Returns { detected, results } where results is per-condition [{cond, met}].
function checkPatternDetected(pattern, candles) {
  const conds = pattern?.entry_conditions
  if (!Array.isArray(conds) || conds.length === 0) return { detected: false, results: [] }
  const results = conds.map(c => ({ cond: c, met: checkCandleCondition(c, candles) }))
  return { detected: results.every(r => r.met), results }
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
export function useStrategyExecutor({ session, strategy, mode, onSessionStop, onError }) {
  const [phase, setPhase]                   = useState('idle')
  const [ltp, setLtp]                       = useState(null)
  const [entryPrice, setEntryPrice]         = useState(null)
  const [logs, setLogs]                     = useState([])
  const [patternDetected, setPatternDetected] = useState(false)

  const phaseRef           = useRef('idle')
  const entryPriceRef      = useRef(null)
  const prevLtpRef         = useRef(null)
  const inFlightRef        = useRef(false)
  const fatalRef           = useRef(false)
  const patternDetectedRef = useRef(false)
  const candleCacheRef     = useRef(null)
  const sessionTradesRef   = useRef([])
  const modeRef            = useRef(mode)
  const onStopRef          = useRef(onSessionStop)
  const onErrorRef         = useRef(onError)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { onStopRef.current = onSessionStop }, [onSessionStop])
  useEffect(() => { onErrorRef.current = onError }, [onError])

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
    prevLtpRef.current         = null
    entryPriceRef.current      = null
    inFlightRef.current        = false
    fatalRef.current           = false
    patternDetectedRef.current = false
    candleCacheRef.current     = null
    sessionTradesRef.current   = []
    setEntryPrice(null)
    setLtp(null)
    setLogs([])
    setPatternDetected(false)

    const pattern          = strategy.candle_pattern ?? null
    const dir              = tradeDirection(pattern)
    const indicatorCfg     = pattern?.indicator_settings ?? null
    const tradeCfg         = pattern?.trade_filters ?? null
    const candleDaysNeeded = requiredCandleDays(indicatorCfg, tradeCfg)

    addLog(
      `Executor started — watching ${strategy.instrument} on ${strategy.exchange}` +
      (pattern ? ` | Pattern: ${pattern.name} (${pattern.direction})` : '')
    )

    let cancelled = false

    function fatal(msg) {
      if (cancelled || fatalRef.current) return
      fatalRef.current = true
      addLog(`FATAL: ${msg} — execution stopped`, 'error')
      patchPhase('idle')
      axiosInstance.post('/api/customer/session/stop').catch(() => {})
      onErrorRef.current?.(msg)
      onStopRef.current?.({ reason: 'error', message: msg })
    }

    async function tick() {
      if (cancelled || inFlightRef.current || fatalRef.current) return
      const ph = phaseRef.current
      if (ph === 'idle' || ph === 'exited') return

      let currentLtp
      try {
        const { data } = await axiosInstance.get('/api/customer/market/price', {
          params: { symbol: strategy.instrument, exchange: strategy.exchange },
        })
        currentLtp = data.ltp
      } catch (err) {
        if (!cancelled) fatal(err.response?.data?.error || 'Price fetch failed')
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
        // ── Step 1: Candle pattern + indicator detection ──────────────────────────
        const hasPattern     = Boolean(pattern && Array.isArray(pattern.entry_conditions) && pattern.entry_conditions.length > 0)
        const hasIndicators  = Boolean(indicatorCfg && Object.values(indicatorCfg).some(v => v?.enabled))
        const hasTrendFilter = Boolean(tradeCfg?.trend_day_filter?.enabled)
        const needCandles    = hasPattern || hasIndicators || hasTrendFilter

        if (needCandles && !patternDetectedRef.current) {
          // Fetch daily OHLC candles; cache for 5 minutes
          let candles = []
          const now = Date.now()
          if (candleCacheRef.current && (now - candleCacheRef.current.fetchedAt) < 5 * 60 * 1000) {
            candles = candleCacheRef.current.data
          } else {
            try {
              const { data } = await axiosInstance.get('/api/customer/market/daily-candles', {
                params: { symbol: strategy.instrument, exchange: strategy.exchange, days: candleDaysNeeded },
              })
              candles = data.candles || []
              candleCacheRef.current = { data: candles, fetchedAt: now }
            } catch {
              if (!cancelled) addLog(`LTP ₹${currentLtp} | Candle data unavailable — retrying next tick`, 'warn')
            }
          }

          if (candles.length >= 2) {
            const { detected: condsMet, results: condResults } = hasPattern
              ? checkPatternDetected(pattern, candles)
              : { detected: true, results: [] }

            const { passed: indsMet, results: indResults } = checkIndicatorSettings(indicatorCfg, candles)

            if (condsMet && indsMet) {
              patternDetectedRef.current = true
              setPatternDetected(true)
              const indSummary = indResults.length > 0
                ? ' | Indicators: ' + indResults.map(r => `${r.name} ✓`).join(', ')
                : ''
              addLog(
                `Pattern${hasPattern ? ` "${pattern.name}"` : ''} confirmed @ LTP ₹${currentLtp}${indSummary}`,
                'success'
              )
            } else {
              const condSummary = condResults
                .map(r => `${COND_LABEL[r.cond.type] ?? r.cond.type}: ${r.met ? '✓' : '✗'}`)
                .join(' | ')
              const indSummary = indResults
                .map(r => `${r.name} (${r.detail}): ${r.met ? '✓' : '✗'}`)
                .join(' | ')
              const parts = [
                hasPattern && condSummary ? `Candle: ${condSummary}` : null,
                hasIndicators && indSummary ? `Indicators: ${indSummary}` : null,
              ].filter(Boolean).join(' || ')
              addLog(`LTP ₹${currentLtp} | ${parts}`, 'info')
            }
          }
        }

        // ── Step 2: Trade filters + entry condition ───────────────────────────────
        const patternReady = !needCandles || patternDetectedRef.current
        if (patternReady) {
          // Check trade filters each tick (time, day, trend, loss, trade count)
          const cachedCandles = candleCacheRef.current?.data || []
          const { passed: filtersPassed, results: filterResults } = checkTradeFilters(tradeCfg, cachedCandles, sessionTradesRef.current)
          if (!filtersPassed) {
            const blocked = filterResults.filter(r => !r.met).map(r => `${r.name}: ${r.detail}`).join(' | ')
            addLog(`LTP ₹${currentLtp} | Trade filter blocked — ${blocked}`, 'warn')
            prevLtpRef.current = currentLtp
            return
          }

          const hit = checkCondition(strategy.entry_condition, currentLtp, prevLtp)
          addLog(
            `LTP ₹${currentLtp} | Entry: ${strategy.entry_condition?.type} @ ${strategy.entry_condition?.value}` +
            (hasPattern ? ' | Pattern confirmed ✓' : '') +
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
              if (!cancelled) fatal(`${dir.entry} order failed: ${err.response?.data?.error || err.message}`)
            } finally {
              inFlightRef.current = false
            }
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
              sessionTradesRef.current = [...sessionTradesRef.current, { pnlPct: calcPnlPct(pattern, ep, currentLtp) ?? 0 }]
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
            if (!cancelled) fatal(`${dir.exit} order failed: ${err.response?.data?.error || err.message}`)
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

  return { phase, ltp, entryPrice, logs, patternDetected }
}
