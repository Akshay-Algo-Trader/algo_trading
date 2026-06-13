import { useEffect, useRef } from 'react'

async function getLightweightCharts() {
  return import('lightweight-charts')
}

/**
 * Backtest visualisation — renders the OHLC candles of the analysed period with:
 *   • the breakout S&R levels that triggered entries (dashed red/green lines),
 *   • an entry marker (blue arrow) for every simulated trade, and
 *   • an exit marker (green/red circle) carrying the booked P&L %.
 *
 * All data is precomputed server-side in the `chart` payload; this component
 * only paints it, so there is no fetching or recomputation here.
 */
export default function BacktestChart({ chart }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!chart?.candles?.length) return
    let cancelled = false

    const init = async () => {
      const { createChart, CrosshairMode, LineStyle, CandlestickSeries, createSeriesMarkers } =
        await getLightweightCharts()
      const el = containerRef.current
      if (!el || cancelled) return
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

      const c = createChart(el, {
        width: el.clientWidth,
        height: 480,
        layout: { background: { color: '#ffffff' }, textColor: '#374151' },
        grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#e5e7eb' },
        timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
      })
      chartRef.current = c

      const series = c.addSeries(CandlestickSeries, {
        upColor: '#16a34a',
        downColor: '#dc2626',
        borderUpColor: '#16a34a',
        borderDownColor: '#dc2626',
        wickUpColor: '#16a34a',
        wickDownColor: '#dc2626',
        priceLineVisible: false,
        lastValueVisible: false,
      })
      series.setData(chart.candles)

      // S&R structure — strong clusters (solid), plus nearest and max/min bounds
      // (dashed). Same level set the live SRChart draws, so the backtest chart
      // shows the context price was reacting to, not just the broken levels.
      const srPrices = new Set()
      for (const line of chart.sr_lines ?? []) {
        const isR = line.type === 'RESISTANCE'
        srPrices.add(Math.round(line.price * 100))
        series.createPriceLine({
          price: line.price,
          color: isR ? '#dc2626' : '#16a34a',
          lineWidth: line.strong ? 2 : 1,
          lineStyle: line.strong ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${(line.tags ?? []).join(' + ')} ${isR ? 'R' : 'S'} ${line.price}`,
        })
      }

      // Breakout levels that actually triggered an entry — only those not already
      // shown as part of the S&R structure above (avoids drawing two lines at one
      // price). These are old/intermediate levels broken earlier in the period.
      for (const line of chart.level_lines ?? []) {
        if (srPrices.has(Math.round(line.price * 100))) continue
        const isR = line.type === 'RESISTANCE'
        series.createPriceLine({
          price: line.price,
          color: isR ? '#dc2626' : '#16a34a',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Broken ${isR ? 'R' : 'S'} ${line.price}`,
        })
      }

      // Reference close at period end — shows which side of price each level sits
      // (the live chart's LTP line equivalent).
      if (chart.ref_price != null) {
        series.createPriceLine({
          price: chart.ref_price,
          color: '#2563eb',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `Last close ${chart.ref_price}`,
        })
      }

      // Entry / exit markers (already sorted & snapped to bars server-side)
      const markers = (chart.markers ?? []).slice().sort((a, b) => a.time - b.time)
      createSeriesMarkers(series, markers)

      c.timeScale().fitContent()

      const ro = new ResizeObserver(() => {
        if (chartRef.current && el) chartRef.current.applyOptions({ width: el.clientWidth })
      })
      ro.observe(el)
      chartRef.current._ro = ro
    }

    init()
    return () => {
      cancelled = true
      if (chartRef.current) {
        chartRef.current._ro?.disconnect()
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [chart])

  if (!chart?.candles?.length) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">
        No candle data available to chart for this period.
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
          {chart.symbol} ({chart.exchange}) — {chart.candle_size}
          {chart.pnl_pct != null && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chart.pnl >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              P&L {chart.pnl >= 0 ? '+' : ''}₹{Number(chart.pnl).toLocaleString()} ({chart.pnl_pct >= 0 ? '+' : ''}{chart.pnl_pct}%)
            </span>
          )}
          {chart.options_mode && (
            <span className="text-xs font-normal text-orange-600">
              option strategy — entries/exits priced in option premium; levels shown on the underlying
            </span>
          )}
        </h3>
        <div className="flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
          {(chart.sr_lines?.length ?? 0) > 0 && (
            <>
              <span className="flex items-center gap-1">
                <svg width="20" height="8" viewBox="0 0 20 8"><line x1="0" y1="4" x2="20" y2="4" stroke="#dc2626" strokeWidth="2" /></svg>
                Strong resistance
              </span>
              <span className="flex items-center gap-1">
                <svg width="20" height="8" viewBox="0 0 20 8"><line x1="0" y1="4" x2="20" y2="4" stroke="#16a34a" strokeWidth="2" /></svg>
                Strong support
              </span>
              <span className="flex items-center gap-1">
                <svg width="20" height="8" viewBox="0 0 20 8"><line x1="0" y1="4" x2="20" y2="4" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                Nearest / max-min
              </span>
            </>
          )}
          {(chart.level_lines?.length ?? 0) > 0 && (
            <>
              <span className="flex items-center gap-1">
                <svg width="20" height="8" viewBox="0 0 20 8"><line x1="0" y1="4" x2="20" y2="4" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                Resistance broken
              </span>
              <span className="flex items-center gap-1">
                <svg width="20" height="8" viewBox="0 0 20 8"><line x1="0" y1="4" x2="20" y2="4" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                Support broken
              </span>
            </>
          )}
          {chart.ref_price != null && (
            <span className="flex items-center gap-1">
              <svg width="20" height="8" viewBox="0 0 20 8"><line x1="0" y1="4" x2="20" y2="4" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="2 2" /></svg>
              Last close
            </span>
          )}
          <span className="flex items-center gap-1"><span className="text-blue-600 font-bold">▲</span> Entry</span>
          <span className="flex items-center gap-1"><span className="text-green-600 font-bold">●</span> Exit (win)</span>
          <span className="flex items-center gap-1"><span className="text-red-600 font-bold">●</span> Exit (loss)</span>
        </div>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: 480 }} />
    </div>
  )
}
