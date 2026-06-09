import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import { Card, PageHeader, Btn, Badge } from '../../components/admin/TableHelpers'
import FvgZoneChart from '../../components/admin/FvgZoneChart'

const TYPE_COLORS = { FVG_BULLISH: 'green', FVG_BEARISH: 'red' }
const SIZE_LABELS = { '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }

function fmt(dt) {
  if (!dt) return '—'
  return dt.replace('T', ' ')
}

export default function FvgZoneScanDetail() {
  const { id, resultId } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartZone, setChartZone] = useState(null)

  useEffect(() => {
    axiosInstance.get(`/api/admin/fvg-zones/${id}/scan/${resultId}`)
      .then(r => { setResult(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load scan result'); setLoading(false) })
  }, [id, resultId])

  if (loading) {
    return (
      <div>
        <PageHeader title="FVG Scan Result" />
        <Card className="p-6"><p className="text-sm text-gray-500">Loading…</p></Card>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <PageHeader title="FVG Scan Result" />
        <Card className="p-6"><p className="text-sm text-red-500">{error}</p></Card>
      </div>
    )
  }

  const bullish = result.zones_detected.filter(z => z.type === 'FVG_BULLISH')
  const bearish = result.zones_detected.filter(z => z.type === 'FVG_BEARISH')

  return (
    <div className="space-y-6">
      <PageHeader
        title="FVG Scan Result"
        action={
          <Btn variant="secondary" onClick={() => navigate(`/admin/fvg-zones/${id}/scan`)}>
            ← Back to Scan
          </Btn>
        }
      />

      {/* Summary */}
      <Card className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['Instrument', `${result.instrument} (${result.exchange})`],
            ['Candle Size', SIZE_LABELS[result.candle_size] ?? result.candle_size],
            ['Period', `${result.period_days}d`],
            ['Total Zones', result.total_zones],
            ['Scanned', new Date(result.scanned_at).toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="border rounded-lg p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          From <b>{result.period.from}</b> to <b>{result.period.to}</b>
        </p>
      </Card>

      {/* Zone table */}
      {result.zones_detected.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-400">No FVG zones were detected in this scan.</p>
        </Card>
      ) : (
        <>
          {[
            { label: 'Bullish FVG Zones', zones: bullish, color: 'green' },
            { label: 'Bearish FVG Zones', zones: bearish, color: 'red' },
          ].filter(g => g.zones.length > 0).map(group => (
            <Card key={group.label} className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                {group.label}
                <span className={`ml-2 text-xs font-normal text-${group.color}-600`}>
                  ({group.zones.length} zones)
                </span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {[
                        'Zone Start (C1 datetime)',
                        'Impulse (C2 datetime)',
                        'Zone End (C3 datetime)',
                        'Zone High',
                        'Zone Low',
                        'Zone Width',
                        'Gap %',
                        'Impulse Body',
                        '',
                      ].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.zones.map((z, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs font-medium text-gray-800 whitespace-nowrap">
                          {fmt(z.zone_start_datetime)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {fmt(z.c2_date)}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-gray-800 whitespace-nowrap">
                          {fmt(z.zone_end_datetime)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                          {z.high?.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                          {z.low?.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">
                          {(z.high - z.low)?.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 text-right">
                          {z.gap_pct?.toFixed(3)}%
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 text-right">
                          {z.impulse_body?.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setChartZone(z)}
                            title="View chart"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                            </svg>
                            Chart
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </>
      )}

      <FvgZoneChart
        isOpen={!!chartZone}
        onClose={() => setChartZone(null)}
        zone={chartZone}
        instrument={result.instrument}
        exchange={result.exchange}
        candleSize={result.candle_size}
      />
    </div>
  )
}
