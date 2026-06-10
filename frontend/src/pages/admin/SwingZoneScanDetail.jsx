import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import { Card, Btn, PageHeader } from '../../components/admin/TableHelpers'
import SRChart, { NearbyLevels, StrongLevels, findNearestLevels, findStrongLevels, strongClusterOthers } from '../../components/admin/SwingZoneChart'

const SIZE_LABELS = { '1min': '1 Min', '5min': '5 Min', '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }

function fmt(dt) {
  if (!dt) return '—'
  return String(dt).replace('T', ' ')
}

export default function SwingZoneScanDetail() {
  const { id, resultId } = useParams()
  const navigate = useNavigate()

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPrice, setCurrentPrice] = useState(null)

  useEffect(() => {
    axiosInstance.get(`/api/admin/swing-zones/${id}/scan/${resultId}`)
      .then(r => { setResult(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load scan result'); setLoading(false) })
  }, [id, resultId])

  useEffect(() => {
    if (!result?.instrument) return
    axiosInstance.get('/api/admin/instruments/price', {
      params: { symbol: result.instrument, exchange: result.exchange },
    })
      .then(r => setCurrentPrice(r.data?.ltp ?? null))
      .catch(() => setCurrentPrice(null))
  }, [result?.instrument, result?.exchange])

  if (loading) {
    return (
      <div>
        <PageHeader title="S&R Scan Detail" />
        <Card className="p-6"><p className="text-sm text-gray-500">Loading…</p></Card>
      </div>
    )
  }
  if (error) {
    return (
      <div>
        <PageHeader title="S&R Scan Detail" />
        <Card className="p-6"><p className="text-sm text-red-500">{error}</p></Card>
      </div>
    )
  }

  const levels = result.levels_detected ?? []
  const resistance = levels.filter(l => l.type === 'RESISTANCE').sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const support = levels.filter(l => l.type === 'SUPPORT').sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const { nearestResistance, nearestSupport } = findNearestLevels(levels, currentPrice)
  const { strongResistance, strongSupport } = findStrongLevels(levels, result.strong_level_pct)

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Scan Detail — ${result.instrument}`}
        action={
          <Btn variant="secondary" onClick={() => navigate(`/admin/swing-zones/${id}/scan`)}>
            ← Back to Scan
          </Btn>
        }
      />

      {/* Summary */}
      <Card className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            ['Instrument', result.instrument],
            ['Exchange', result.exchange],
            ['Candle Size', SIZE_LABELS[result.candle_size] ?? result.candle_size],
            ['Period', `${result.period_days}d`],
            ['Total Levels', result.total_levels],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[
            ['Period From', result.period?.from],
            ['Period To', result.period?.to],
            ['Scanned At', fmt(result.scanned_at)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xs font-medium text-gray-700 mt-0.5">{value || '—'}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Levels table */}
      {levels.length > 0 && (
        <Card className="p-6">
          <NearbyLevels levels={levels} currentPrice={currentPrice} />
          <StrongLevels levels={levels} pct={result.strong_level_pct} />
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                Resistance — {resistance.length}
              </p>
              <div className="space-y-1">
                {resistance.map((l, i) => {
                  const isNearest = l === nearestResistance
                  const strongOthers = strongClusterOthers(strongResistance, l.price)
                  return (
                    <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded border ${isNearest ? 'bg-red-100 border-red-300 ring-1 ring-red-300' : 'bg-red-50 border-red-100'}`}>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-red-700">{l.price}</span>
                        {isNearest && <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 bg-white px-1.5 py-0.5 rounded">Nearest</span>}
                        {strongOthers && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 bg-white px-1.5 py-0.5 rounded">
                            Strong{strongOthers.length > 0 && ` (${strongOthers.join(', ')})`}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-500">{String(l.date).slice(0, 16)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">
                Support — {support.length}
              </p>
              <div className="space-y-1">
                {support.map((l, i) => {
                  const isNearest = l === nearestSupport
                  const strongOthers = strongClusterOthers(strongSupport, l.price)
                  return (
                    <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded border ${isNearest ? 'bg-green-100 border-green-300 ring-1 ring-green-300' : 'bg-green-50 border-green-100'}`}>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-green-700">{l.price}</span>
                        {isNearest && <span className="text-[10px] font-bold uppercase tracking-wide text-green-600 bg-white px-1.5 py-0.5 rounded">Nearest</span>}
                        {strongOthers && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-green-600 bg-white px-1.5 py-0.5 rounded">
                            Strong{strongOthers.length > 0 && ` (${strongOthers.join(', ')})`}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-500">{String(l.date).slice(0, 16)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Chart */}
      {levels.length > 0 && (
        <Card className="p-6">
          <SRChart
            levels={levels}
            instrument={result.instrument}
            exchange={result.exchange}
            candleSize={result.candle_size}
            periodFrom={result.period.from}
            periodTo={result.period.to}
          />
        </Card>
      )}
    </div>
  )
}
