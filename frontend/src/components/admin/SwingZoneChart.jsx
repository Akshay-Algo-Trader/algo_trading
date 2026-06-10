import { useEffect, useRef, useState } from 'react'
import axiosInstance from '../../api/axiosInstance'

async function getLightweightCharts() {
  const mod = await import('lightweight-charts')
  return mod
}

export default function SRChart({ levels, instrument, exchange, candleSize, periodFrom, periodTo }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!instrument || !levels?.length || !periodFrom || !periodTo) return

    let cancelled = false
    setStatus('loading')

    const from = String(periodFrom).slice(0, 10)
    const to = String(periodTo).slice(0, 10)

    const init = async () => {
      try {
        const r = await axiosInstance.get('/api/admin/swing-zones/chart-candles', {
          params: { instrument, exchange, candle_size: candleSize, from_date: from, to_date: to },
        })
        if (cancelled) return

        const candles = r.data?.candles ?? []
        if (!candles.length) {
          setStatus('error')
          setErrMsg('No candle data returned for this period')
          return
        }

        const el = containerRef.current
        if (!el || cancelled) return

        if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

        const { createChart, CrosshairMode, LineStyle, CandlestickSeries } = await getLightweightCharts()
        if (cancelled) return

        const chart = createChart(el, {
          width: el.clientWidth,
          height: 500,
          layout: { background: { color: '#ffffff' }, textColor: '#374151' },
          grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
          crosshair: { mode: CrosshairMode.Normal },
          rightPriceScale: { borderColor: '#e5e7eb' },
          timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
        })
        chartRef.current = chart

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#16a34a',
          downColor: '#dc2626',
          borderUpColor: '#16a34a',
          borderDownColor: '#dc2626',
          wickUpColor: '#16a34a',
          wickDownColor: '#dc2626',
        })
        candleSeries.setData(candles)

        for (const level of levels) {
          const isResistance = level.type === 'RESISTANCE'
          candleSeries.createPriceLine({
            price: level.price,
            color: isResistance ? '#dc2626' : '#16a34a',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `${isResistance ? 'R' : 'S'} ${level.price}`,
          })
        }

        const currentPrice = candles[candles.length - 1]?.close
        if (currentPrice != null) {
          candleSeries.createPriceLine({
            price: currentPrice,
            color: '#2563eb',
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `LTP ${currentPrice}`,
          })
        }

        chart.timeScale().fitContent()
        setStatus('ready')

        const ro = new ResizeObserver(() => {
          if (chartRef.current && el) {
            chartRef.current.applyOptions({ width: el.clientWidth })
          }
        })
        ro.observe(el)
        chartRef.current._ro = ro

      } catch (ex) {
        if (!cancelled) {
          setStatus('error')
          setErrMsg(ex?.response?.data?.error ?? ex?.message ?? 'Failed to load chart')
        }
      }
    }

    init()

    return () => {
      cancelled = true
      if (chartRef.current) {
        chartRef.current._ro?.disconnect()
        chartRef.current.remove()
        chartRef.current = null
      }
      setStatus('idle')
      setErrMsg('')
    }
  }, [levels, instrument, exchange, candleSize, periodFrom, periodTo])

  const resistanceCount = levels?.filter(l => l.type === 'RESISTANCE').length ?? 0
  const supportCount = levels?.filter(l => l.type === 'SUPPORT').length ?? 0

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {instrument} — Support &amp; Resistance ({candleSize})
        </h3>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <svg width="20" height="8" viewBox="0 0 20 8">
              <line x1="0" y1="4" x2="20" y2="4" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            Resistance ({resistanceCount})
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="8" viewBox="0 0 20 8">
              <line x1="0" y1="4" x2="20" y2="4" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            Support ({supportCount})
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="8" viewBox="0 0 20 8">
              <line x1="0" y1="4" x2="20" y2="4" stroke="#2563eb" strokeWidth="1.5" />
            </svg>
            LTP
          </span>
        </div>
      </div>

      <div className="relative" style={{ height: 500 }}>
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10 rounded-lg">
            <svg className="animate-spin w-6 h-6 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm text-gray-400">Loading chart…</span>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500 bg-white z-10 rounded-lg">
            {errMsg}
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: 500 }} />
      </div>
    </div>
  )
}
