import { useEffect, useRef, useState } from 'react'
import axiosInstance from '../../api/axiosInstance'
import {
  classifyByLtp, findStrongLevels, findNearestLevels,
} from '../admin/SwingZoneChart'

const REFRESH_MS = 60_000 // candles/levels refetch — engine refreshes its own cache every 5 min

async function getLightweightCharts() {
  const mod = await import('lightweight-charts')
  return mod
}

// Markers must sit on an existing bar — snap to the latest candle at/before t.
function snapToCandle(times, t) {
  if (!times.length || t == null) return null
  let snapped = times[0]
  for (const ct of times) {
    if (ct <= t) snapped = ct
    else break
  }
  return snapped
}

/**
 * Live execution chart — mirrors the engine's own view while a strategy runs:
 * the swing-config candles it evaluates, every strong/nearest/max-min level,
 * the breakout line + point, the trade plan (entry, dynamic SL, target ladder,
 * final TP, partial book), order markers, and the live LTP.
 *
 * The chart instance is created ONCE per session and data is streamed into it
 * (series.setData / series.update), so the user's zoom and pan are never
 * reset by a refresh. Candles/levels/orders refetch every 60s; the LTP tick,
 * developing candle and overlay lines update from the 3s session-state poll.
 */
export default function ExecutionChart({ session, phase, ltp, entryPrice, planState }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const priceLinesRef = useRef([])
  const markersApiRef = useRef(null)
  const candleTimesRef = useRef([])
  const lastCandleRef = useRef(null) // developing candle, extended by live LTP ticks
  const firstFitRef = useRef(true)   // fitContent only on the first data load

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [errMsg, setErrMsg] = useState('')
  const [chartEpoch, setChartEpoch] = useState(0) // bumped once the chart instance exists

  const targetsHit = (planState?.targets ?? []).filter(t => t.hit).length

  // ── Create the chart instance once per session ────────────────────────────
  useEffect(() => {
    if (!session?.id) return
    let cancelled = false
    firstFitRef.current = true

    const init = async () => {
      const { createChart, CrosshairMode, CandlestickSeries, createSeriesMarkers } = await getLightweightCharts()
      const el = containerRef.current
      if (!el || cancelled) return

      const chart = createChart(el, {
        width: el.clientWidth,
        height: 460,
        layout: { background: { color: '#ffffff' }, textColor: '#374151' },
        grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#e5e7eb' },
        timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
      })
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#16a34a',
        downColor: '#dc2626',
        borderUpColor: '#16a34a',
        borderDownColor: '#dc2626',
        wickUpColor: '#16a34a',
        wickDownColor: '#dc2626',
        priceLineVisible: false,
        lastValueVisible: false,
      })

      chartRef.current = chart
      seriesRef.current = series
      markersApiRef.current = createSeriesMarkers(series, [])
      priceLinesRef.current = []

      const ro = new ResizeObserver(() => {
        if (chartRef.current && el) chartRef.current.applyOptions({ width: el.clientWidth })
      })
      ro.observe(el)
      chart._ro = ro

      setChartEpoch(n => n + 1)
    }

    init()
    return () => {
      cancelled = true
      if (chartRef.current) {
        chartRef.current._ro?.disconnect()
        chartRef.current.remove()
      }
      chartRef.current = null
      seriesRef.current = null
      markersApiRef.current = null
      priceLinesRef.current = []
      lastCandleRef.current = null
      candleTimesRef.current = []
    }
  }, [session?.id])

  // ── Fetch the engine's chart view; refresh periodically and whenever the
  //    trade story advances (entry, target hit, exit) so order markers appear.
  useEffect(() => {
    if (!session?.id) return
    let cancelled = false

    const load = async () => {
      try {
        const r = await axiosInstance.get('/api/customer/session/chart')
        if (cancelled) return
        if (!r.data?.chart?.candles?.length) {
          setStatus('error')
          setErrMsg('No candle data available yet — the engine may still be warming up')
          return
        }
        setData(r.data.chart)
        setStatus('ready')
      } catch (ex) {
        if (!cancelled) {
          setStatus('error')
          setErrMsg(ex?.response?.data?.error ?? ex?.message ?? 'Failed to load execution chart')
        }
      }
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [session?.id, phase, targetsHit, planState?.remaining]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stream candle data into the existing series — preserves zoom/pan ──────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || !data?.candles?.length) return
    series.setData(data.candles)
    candleTimesRef.current = data.candles.map(c => c.time)
    lastCandleRef.current = { ...data.candles[data.candles.length - 1] }
    if (firstFitRef.current) {
      chartRef.current?.timeScale().fitContent()
      firstFitRef.current = false
    }
  }, [data, chartEpoch])

  // ── Live tick: extend the developing candle with each LTP update ──────────
  useEffect(() => {
    const series = seriesRef.current
    const lc = lastCandleRef.current
    // After an option swap the live ltp is the premium — never paint it onto
    // the underlying's candles.
    if (!series || !lc || ltp == null || (data && !data.plan_overlay)) return
    lc.high = Math.max(lc.high, ltp)
    lc.low = Math.min(lc.low, ltp)
    lc.close = ltp
    series.update({ ...lc })
  }, [ltp, data, chartEpoch])

  // ── Overlay: level lines, breakout, trade plan, LTP, markers ─────────────
  // Cheap to redraw — runs on every 3s state poll so the SL trail, break-even
  // lift, target hits and LTP track the engine in real time.
  useEffect(() => {
    const series = seriesRef.current
    if (!series || !data) return

    const draw = async () => {
      const { LineStyle } = await getLightweightCharts()
      if (!seriesRef.current) return

      // Clear previous overlay
      for (const pl of priceLinesRef.current) {
        try { series.removePriceLine(pl) } catch { /* chart rebuilt */ }
      }
      priceLinesRef.current = []

      const lastClose = data.candles[data.candles.length - 1]?.close
      // After an option swap the live ltp prop is the premium — keep the
      // underlying's own reference price for level classification instead.
      const chartLtp = data.plan_overlay ? (ltp ?? data.ltp ?? lastClose) : (data.ltp ?? lastClose)

      const addLine = opts => {
        priceLinesRef.current.push(series.createPriceLine(opts))
      }

      // ── S&R levels: strong clusters, nearest each side, outer bounds ─────
      const classified = classifyByLtp(data.levels ?? [], chartLtp)
      const { strongResistance, strongSupport } = findStrongLevels(classified, data.config?.strong_level_pct)
      const { nearestResistance, nearestSupport } = findNearestLevels(classified, chartLtp)

      const merged = new Map()
      const tagLine = (price, type, tag) => {
        const e = merged.get(price)
        if (e) e.tags.push(tag)
        else merged.set(price, { price, type, tags: [tag] })
      }
      strongResistance.forEach(c => tagLine(c.price, 'RESISTANCE', 'Strong'))
      strongSupport.forEach(c => tagLine(c.price, 'SUPPORT', 'Strong'))
      if (nearestResistance) tagLine(nearestResistance.price, 'RESISTANCE', 'Nearest')
      if (nearestSupport) tagLine(nearestSupport.price, 'SUPPORT', 'Nearest')
      const allR = classified.filter(l => l.type === 'RESISTANCE')
      const allS = classified.filter(l => l.type === 'SUPPORT')
      if (allR.length) tagLine(Math.max(...allR.map(l => l.price)), 'RESISTANCE', 'Max')
      if (allS.length) tagLine(Math.min(...allS.map(l => l.price)), 'SUPPORT', 'Min')

      for (const line of merged.values()) {
        const isR = line.type === 'RESISTANCE'
        const isStrong = line.tags.includes('Strong')
        addLine({
          price: line.price,
          color: isR ? '#dc2626' : '#16a34a',
          lineWidth: isStrong ? 2 : 1,
          lineStyle: isStrong ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${line.tags.join(' + ')} ${isR ? 'R' : 'S'} ${line.price}`,
        })
      }

      // ── Breakout line — the strong level the engine entered through ──────
      const breakout = planState?.breakout ?? data.breakout
      if (breakout?.level_price != null) {
        addLine({
          price: breakout.level_price,
          color: '#ea580c',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `Breakout ${breakout.direction === 'bearish' ? '▼' : '▲'} ${breakout.level_price}`,
        })
      }

      // ── Trade plan: entry, dynamic SL, targets, final TP, partial book ───
      if (data.plan_overlay && planState) {
        if (entryPrice != null) {
          addLine({
            price: entryPrice, color: '#0f172a', lineWidth: 1,
            lineStyle: LineStyle.Solid, axisLabelVisible: true,
            title: `Entry ${entryPrice}`,
          })
        }
        if (planState.sl != null) {
          addLine({
            price: planState.sl, color: '#b91c1c', lineWidth: 2,
            lineStyle: LineStyle.LargeDashed, axisLabelVisible: true,
            title: `SL ${planState.sl}`,
          })
        }
        for (const t of planState.targets ?? []) {
          addLine({
            price: t.price, color: t.hit ? '#15803d' : '#65a30d', lineWidth: t.hit ? 2 : 1,
            lineStyle: t.hit ? LineStyle.Solid : LineStyle.Dashed, axisLabelVisible: true,
            title: `T${t.index + 1} (${t.pct}%)${t.hit ? ' ✓' : ''}`,
          })
        }
        if (planState.partialBook) {
          addLine({
            price: planState.partialBook.price, color: '#7c3aed', lineWidth: 1,
            lineStyle: LineStyle.Dashed, axisLabelVisible: true,
            title: `Partial 50%${planState.partialBook.booked ? ' ✓' : ''}`,
          })
        }
        if (planState.finalTp != null && !(planState.targets ?? []).length) {
          addLine({
            price: planState.finalTp, color: '#15803d', lineWidth: 2,
            lineStyle: LineStyle.LargeDashed, axisLabelVisible: true,
            title: `TP ${planState.finalTp}`,
          })
        }
      }

      // ── Live LTP ─────────────────────────────────────────────────────────
      if (data.plan_overlay && chartLtp != null) {
        addLine({
          price: chartLtp, color: '#2563eb', lineWidth: 1,
          lineStyle: LineStyle.Solid, axisLabelVisible: true,
          title: `LTP ${chartLtp}`,
        })
      }

      // ── Markers: breakout point + order fills ────────────────────────────
      const times = candleTimesRef.current
      const markers = []
      if (breakout?.time != null) {
        const t = snapToCandle(times, breakout.time)
        if (t != null) {
          markers.push({
            time: t,
            position: breakout.direction === 'bearish' ? 'aboveBar' : 'belowBar',
            color: '#ea580c',
            shape: breakout.direction === 'bearish' ? 'arrowDown' : 'arrowUp',
            text: `Breakout ${breakout.level_price}`,
          })
        }
      }
      for (const o of data.orders ?? []) {
        const t = snapToCandle(times, o.time)
        if (t == null) continue
        const isBuy = o.side === 'BUY'
        markers.push({
          time: t,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? '#16a34a' : '#dc2626',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: `${o.side} ${o.qty}${o.price != null ? ` @ ${o.price}` : ''}`,
        })
      }
      markers.sort((a, b) => a.time - b.time)
      markersApiRef.current?.setMarkers(markers)
    }

    draw()
  }, [data, ltp, entryPrice, planState, phase, chartEpoch])

  if (!session?.id) return null

  const cfg = data?.config

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Live Execution Chart
          {data && (
            <span className="ml-2 normal-case font-normal text-gray-500">
              {data.symbol} ({data.exchange}) · {cfg?.candle_size} · pivot {cfg?.pivot_bars} · strong {cfg?.strong_level_pct}%
            </span>
          )}
        </p>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-red-600" /> Resistance</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-green-600" /> Support</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-orange-600" /> Breakout</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-red-800 border-dashed" /> SL</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-lime-600 border-dashed" /> Targets</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-blue-600" /> LTP</span>
        </div>
      </div>

      {data?.option_mode && (
        <p className="text-[11px] text-orange-600 mb-2">
          Option strategy — levels &amp; breakout shown on the underlying ({data.symbol}).
          {!data.plan_overlay && ' Entry/SL/target lines are in option-premium space and are shown in the cards above.'}
        </p>
      )}

      <div className="relative" style={{ height: 460 }}>
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10 rounded-lg text-sm text-gray-400">
            Loading execution chart…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10 rounded-lg text-sm text-red-500 text-center px-6">
            {errMsg}
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: 460 }} />
      </div>
    </div>
  )
}
