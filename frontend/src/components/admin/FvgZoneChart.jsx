import { useEffect, useRef, useState, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import axiosInstance from '../../api/axiosInstance'

// Lazy-load lightweight-charts to avoid SSR issues
async function getLightweightCharts() {
  const mod = await import('lightweight-charts')
  return mod
}

function toUnix(dtStr) {
  if (!dtStr) return null
  return Math.floor(new Date(dtStr.replace(' ', 'T')).getTime() / 1000)
}

function shiftDate(dtStr, days) {
  const d = new Date((dtStr ?? '').slice(0, 10))
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const ZONE_COLORS = {
  FVG_BULLISH: { line: '#16a34a', fill: 'rgba(22,163,74,0.12)', fillDark: 'rgba(22,163,74,0.06)' },
  FVG_BEARISH: { line: '#dc2626', fill: 'rgba(220,38,38,0.12)', fillDark: 'rgba(220,38,38,0.06)' },
}

export default function FvgZoneChart({ isOpen, onClose, zone, instrument, exchange, candleSize }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const [status,  setStatus]  = useState('idle')   // idle | loading | ready | error
  const [errMsg,  setErrMsg]  = useState('')

  useEffect(() => {
    if (!isOpen || !zone) return

    let cancelled = false

    // Defer past the current tick so Headless UI portal + Transition finish
    // mounting the Dialog.Panel before we try to access containerRef.current.
    const tid = setTimeout(async () => {
      if (cancelled) return

      const el = containerRef.current
      if (!el) {
        setStatus('error')
        setErrMsg('Chart container could not mount. Please close and reopen.')
        return
      }

      setStatus('loading')

      try {
        const fromDate = shiftDate(zone.c1_date || zone.zone_start_datetime, -5)
        const toDate   = shiftDate(zone.c3_date || zone.zone_end_datetime,    5)

        const r = await axiosInstance.get('/api/admin/fvg-zones/chart-candles', {
          params: { instrument, exchange, candle_size: candleSize, from_date: fromDate, to_date: toDate },
        })
        if (cancelled) return

        const candles = r.data?.candles ?? []
        if (!candles.length) {
          setStatus('error'); setErrMsg('No candle data returned for this range')
          return
        }

        // Destroy any previous chart
        if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

        const { createChart, CrosshairMode, LineStyle, CandlestickSeries, BaselineSeries, createSeriesMarkers } = await getLightweightCharts()
        if (cancelled) return

        const colors = ZONE_COLORS[zone.type] ?? ZONE_COLORS['FVG_BULLISH']
        const isBull  = zone.type === 'FVG_BULLISH'

        const chart = createChart(el, {
          width:  el.clientWidth,
          height: 400,
          layout: { background: { color: '#ffffff' }, textColor: '#374151' },
          grid:   { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
          crosshair: { mode: CrosshairMode.Normal },
          rightPriceScale: { borderColor: '#e5e7eb' },
          timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
        })
        chartRef.current = chart

        // ── Candlestick series (v5 API: addSeries + class) ──────────────────
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor:        '#16a34a',
          downColor:      '#dc2626',
          borderUpColor:  '#16a34a',
          borderDownColor:'#dc2626',
          wickUpColor:    '#16a34a',
          wickDownColor:  '#dc2626',
        })
        candleSeries.setData(candles)

        // ── Zone fill band (baseline series: fills between zone.low and zone.high) ─
        const bandSeries = chart.addSeries(BaselineSeries, {
          baseValue:          { type: 'price', price: zone.low },
          topFillColor1:      colors.fill,
          topFillColor2:      colors.fillDark,
          bottomFillColor1:   'transparent',
          bottomFillColor2:   'transparent',
          topLineColor:       'transparent',
          bottomLineColor:    'transparent',
          lineWidth:          0,
          priceLineVisible:   false,
          lastValueVisible:   false,
          crosshairMarkerVisible: false,
        })
        // Constant value = zone.high across all candles → fills zone.low → zone.high
        bandSeries.setData(candles.map(c => ({ time: c.time, value: zone.high })))

        // ── Zone boundary price lines ────────────────────────────────────────
        candleSeries.createPriceLine({
          price: zone.high,
          color: colors.line,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Zone High  ${zone.high}`,
        })
        candleSeries.createPriceLine({
          price: zone.low,
          color: colors.line,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Zone Low  ${zone.low}`,
        })

        // ── C1 / C2 / C3 markers ────────────────────────────────────────────
        const c1Ts = toUnix(zone.c1_date)
        const c2Ts = toUnix(zone.c2_date)
        const c3Ts = toUnix(zone.c3_date)

        const markers = []
        if (c1Ts) markers.push({
          time:     c1Ts,
          position: isBull ? 'belowBar' : 'aboveBar',
          color:    colors.line,
          shape:    isBull ? 'arrowUp' : 'arrowDown',
          text:     'C1',
          size:     1,
        })
        if (c2Ts) markers.push({
          time:     c2Ts,
          position: isBull ? 'belowBar' : 'aboveBar',
          color:    '#f59e0b',
          shape:    isBull ? 'arrowUp' : 'arrowDown',
          text:     'C2',
          size:     1,
        })
        if (c3Ts) markers.push({
          time:     c3Ts,
          position: isBull ? 'belowBar' : 'aboveBar',
          color:    colors.line,
          shape:    isBull ? 'arrowUp' : 'arrowDown',
          text:     'C3',
          size:     1,
        })
        if (markers.length) {
          createSeriesMarkers(candleSeries, markers.sort((a, b) => a.time - b.time))
        }

        // Zoom to the zone (C1→C3) using logical bar indices so weekend/overnight
        // gaps don't create empty horizontal space (setVisibleRange uses wall-clock time).
        const zoneStartTs = toUnix(zone.c1_date || zone.zone_start_datetime)
        const zoneEndTs   = toUnix(zone.c3_date  || zone.zone_end_datetime)

        let c1Idx = candles.findIndex(c => c.time >= zoneStartTs)
        let c3Idx = candles.findIndex(c => c.time >= zoneEndTs)
        if (c1Idx === -1) c1Idx = Math.floor(candles.length * 0.6)
        if (c3Idx === -1) c3Idx = candles.length - 1

        const pad = Math.max(4, c3Idx - c1Idx + 4)
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, c1Idx - pad),
          to:   Math.min(candles.length - 1, c3Idx + pad),
        })
        setStatus('ready')

        // Resize on container width change
        const ro = new ResizeObserver(() => {
          if (chartRef.current && el) {
            chartRef.current.applyOptions({ width: el.clientWidth })
          }
        })
        ro.observe(el)
        // Store cleanup on chartRef so we can call it on unmount
        chartRef.current._ro = ro

      } catch (ex) {
        if (!cancelled) {
          setStatus('error')
          setErrMsg(ex?.response?.data?.error ?? ex?.message ?? 'Failed to load chart')
        }
      }
    }, 50)  // 50 ms — past one animation frame, after the Headless UI portal commits

    return () => {
      cancelled = true
      clearTimeout(tid)
      if (chartRef.current) {
        chartRef.current._ro?.disconnect()
        chartRef.current.remove()
        chartRef.current = null
      }
      setStatus('idle')
      setErrMsg('')
    }
  }, [isOpen, zone, instrument, exchange, candleSize])

  const colors = zone ? (ZONE_COLORS[zone.type] ?? ZONE_COLORS['FVG_BULLISH']) : ZONE_COLORS['FVG_BULLISH']

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
              leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                  <div>
                    <Dialog.Title className="text-base font-semibold text-gray-900">
                      FVG Zone Chart —{' '}
                      <span style={{ color: colors.line }}>
                        {zone?.type === 'FVG_BULLISH' ? 'Bullish' : 'Bearish'} FVG
                      </span>
                    </Dialog.Title>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {instrument} · {exchange} · {candleSize}
                      &nbsp;·&nbsp;Zone {zone?.low?.toFixed(2)} – {zone?.high?.toFixed(2)}
                    </p>
                  </div>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                {/* Zone info strip */}
                {zone && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-600">
                    <span>
                      <span className="font-semibold text-gray-700">C1</span>
                      &nbsp;{zone.c1_date}
                    </span>
                    <span className="text-gray-300">→</span>
                    <span>
                      <span className="font-semibold text-amber-600">C2 Impulse</span>
                      &nbsp;{zone.c2_date}
                    </span>
                    <span className="text-gray-300">→</span>
                    <span>
                      <span className="font-semibold text-gray-700">C3</span>
                      &nbsp;{zone.c3_date}
                    </span>
                    <span className="ml-auto text-gray-500">
                      Gap&nbsp;<b className="text-gray-700">{zone.gap_pct?.toFixed(3)}%</b>
                      &nbsp;·&nbsp;Impulse body&nbsp;<b className="text-gray-700">{zone.impulse_body?.toFixed(2)}</b>
                    </span>
                  </div>
                )}

                {/* Chart container — always in layout (has real clientWidth) so chart
                    initialises with correct dimensions. Loading/error overlaid on top. */}
                <div className="px-4 pt-4 pb-2" style={{ position: 'relative' }}>
                  {status === 'loading' && (
                    <div
                      className="flex items-center justify-center"
                      style={{ position: 'absolute', inset: 0, zIndex: 10, background: '#fff' }}
                    >
                      <svg className="animate-spin w-6 h-6 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      <span className="text-sm text-gray-400">Loading chart data…</span>
                    </div>
                  )}
                  {status === 'error' && (
                    <div
                      className="flex items-center justify-center text-sm text-red-500"
                      style={{ position: 'absolute', inset: 0, zIndex: 10, background: '#fff' }}
                    >
                      {errMsg}
                    </div>
                  )}
                  {/* Always rendered — never display:none — so el.clientWidth is always correct */}
                  <div ref={containerRef} style={{ width: '100%', height: 400 }} />
                </div>

                {/* Legend */}
                <div className="flex items-center gap-5 px-5 pb-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <svg width="24" height="10" viewBox="0 0 24 10">
                      <line x1="0" y1="5" x2="24" y2="5" stroke={colors.line} strokeWidth="2" strokeDasharray="4 3" />
                    </svg>
                    Zone boundary
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-sm" style={{ background: colors.fill }} />
                    FVG zone fill
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span style={{ color: colors.line }} className="font-bold text-sm">▲</span>
                    C1 / C3
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-amber-500 font-bold text-sm">▲</span>
                    C2 Impulse
                  </span>
                </div>

              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
