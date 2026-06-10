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

// Closest resistance above, and closest support below, the current price —
// the levels most relevant for an immediate trade decision.
export function findNearestLevels(levels, currentPrice) {
  let nearestResistance = null
  let nearestSupport = null
  if (currentPrice == null) return { nearestResistance, nearestSupport }

  for (const l of levels ?? []) {
    if (l.type === 'RESISTANCE' && l.price > currentPrice) {
      if (!nearestResistance || l.price < nearestResistance.price) nearestResistance = l
    }
    if (l.type === 'SUPPORT' && l.price < currentPrice) {
      if (!nearestSupport || l.price > nearestSupport.price) nearestSupport = l
    }
  }
  return { nearestResistance, nearestSupport }
}

export function NearbyLevels({ levels, currentPrice }) {
  if (currentPrice == null) return null
  const { nearestResistance, nearestSupport } = findNearestLevels(levels, currentPrice)

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Current Price (LTP)</p>
        <p className="text-lg font-bold text-blue-900 mt-1">{currentPrice}</p>
      </div>
      <div className="rounded-lg border border-red-100 bg-red-50 p-3">
        <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Nearest Resistance</p>
        {nearestResistance ? (
          <>
            <p className="text-lg font-bold text-red-700 mt-1">{nearestResistance.price}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              +{(nearestResistance.price - currentPrice).toFixed(2)} ({(((nearestResistance.price - currentPrice) / currentPrice) * 100).toFixed(2)}%)
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-400 mt-1">None above LTP</p>
        )}
      </div>
      <div className="rounded-lg border border-green-100 bg-green-50 p-3">
        <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Nearest Support</p>
        {nearestSupport ? (
          <>
            <p className="text-lg font-bold text-green-700 mt-1">{nearestSupport.price}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              -{(currentPrice - nearestSupport.price).toFixed(2)} ({(((currentPrice - nearestSupport.price) / currentPrice) * 100).toFixed(2)}%)
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-400 mt-1">None below LTP</p>
        )}
      </div>
    </div>
  )
}

export const STRONG_LEVEL_PCT_OPTIONS = [0.1, 0.5, 1.0, 1.5, 2.0]

// Groups levels of one type into clusters of consecutive prices (sorted)
// where each neighbour is within `pct`% of the previous one. Clusters with
// 2+ members are "strong" — represented by the MAX price for resistance
// (the highest ceiling of the cluster) and the MIN price for support
// (the lowest floor of the cluster).
export function findStrongLevels(levels, pct) {
  if (!pct) return { strongResistance: [], strongSupport: [] }

  function clusters(type, pickStrong) {
    const sorted = (levels ?? [])
      .filter(l => l.type === type)
      .slice()
      .sort((a, b) => a.price - b.price)

    const groups = []
    let current = []
    for (const l of sorted) {
      if (current.length) {
        const prev = current[current.length - 1]
        const diffPct = ((l.price - prev.price) / prev.price) * 100
        if (diffPct > pct) {
          groups.push(current)
          current = []
        }
      }
      current.push(l)
    }
    if (current.length) groups.push(current)

    return groups
      .filter(g => g.length >= 2)
      .map(g => ({ price: pickStrong(g.map(l => l.price)), members: g }))
  }

  return {
    strongResistance: clusters('RESISTANCE', prices => Math.max(...prices)),
    strongSupport: clusters('SUPPORT', prices => Math.min(...prices)),
  }
}

// For a strong cluster's representative price, returns the prices of the
// other levels grouped into that cluster (or null if `price` isn't a
// strong-cluster representative).
export function strongClusterOthers(strongClusters, price) {
  const cluster = strongClusters.find(c => c.price === price)
  if (!cluster) return null
  return cluster.members.filter(m => m.price !== price).map(m => m.price)
}

// Most recently formed level (by date) across both types — whether it's a
// resistance (recent swing high) or support (recent swing low) hints at the
// current bias for a buy vs sell side trade.
export function findLastLevel(levels) {
  if (!levels?.length) return null
  return levels.reduce((latest, l) =>
    (!latest || String(l.date) > String(latest.date)) ? l : latest
  , null)
}

export function StrongLevels({ levels, pct }) {
  const { strongResistance, strongSupport } = findStrongLevels(levels, pct)
  const lastLevel = findLastLevel(levels)
  if (!strongResistance.length && !strongSupport.length && !lastLevel) return null

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Strong Levels — clusters within {pct}%
      </p>
      <div className="flex flex-wrap gap-2">
        {strongResistance.map((c, i) => (
          <span key={`r${i}`} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
            R {c.price}
            <span className="text-red-400 font-normal">({c.members.length} levels)</span>
          </span>
        ))}
        {strongSupport.map((c, i) => (
          <span key={`s${i}`} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
            S {c.price}
            <span className="text-green-400 font-normal">({c.members.length} levels)</span>
          </span>
        ))}
        {lastLevel && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-dashed ${lastLevel.type === 'RESISTANCE' ? 'bg-red-50 text-red-700 border-red-300' : 'bg-green-50 text-green-700 border-green-300'}`}>
            Last Level: {lastLevel.type === 'RESISTANCE' ? 'R' : 'S'} {lastLevel.price}
            <span className="text-gray-400 font-normal">{String(lastLevel.date).slice(0, 16)}</span>
          </span>
        )}
      </div>
    </div>
  )
}
