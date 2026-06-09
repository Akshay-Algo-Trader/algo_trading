import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Btn, PageHeader, Badge,
  SkeletonTable, EmptyRow, ErrorRow,
} from '../../components/admin/TableHelpers'

export default function ZoneScanDetail() {
  const { id, resultId } = useParams()
  const navigate = useNavigate()

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    axiosInstance.get(`/api/admin/zones/${id}/scan/${resultId}`)
      .then(r => {
        setResult(r.data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.response?.data?.error ?? 'Failed to load scan result')
        setLoading(false)
      })
  }, [id, resultId])

  function zoneTypeColor(type) {
    if (type.startsWith('FVG')) return 'blue'
    if (type === 'SR') return 'green'
    if (type.startsWith('SWING')) return 'purple'
    return 'gray'
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Scan Details" />
        <Card><SkeletonTable rows={3} cols={5} /></Card>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Scan Details" />
        <Card><ErrorRow message={error} cols={5} /></Card>
      </div>
    )
  }

  const zonesByType = {}
  result.zones_detected.forEach(zone => {
    const type = zone.type
    if (!zonesByType[type]) {
      zonesByType[type] = []
    }
    zonesByType[type].push(zone)
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Scan Details - ${result.instrument}`}
        action={
          <Btn variant="secondary" onClick={() => navigate(`/admin/zones/${id}/scan`)}>
            Back to Scans
          </Btn>
        }
      />

      {/* Summary */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-600">Instrument</p>
            <p className="text-sm font-semibold text-gray-900">
              {result.instrument} ({result.exchange})
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-600">Scan Period</p>
            <p className="text-sm font-semibold text-gray-900">{result.scan_days} days</p>
            <p className="text-xs text-gray-600">
              {result.period.from} → {result.period.to}
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-600">Total Zones</p>
            <p className="text-2xl font-bold text-gray-900">{result.total_zones}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-600">Scanned</p>
            <p className="text-xs text-gray-700">
              {new Date(result.scanned_at).toLocaleString()}
            </p>
          </div>
        </div>
      </Card>

      {/* Zone Breakdown */}
      {Object.keys(zonesByType).length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Zones by Type</h2>
          <div className="space-y-6">
            {Object.entries(zonesByType).map(([type, zones]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={zoneTypeColor(type)}>
                    {type}
                  </Badge>
                  <span className="text-sm text-gray-600">
                    {zones.length} zone{zones.length !== 1 ? 's' : ''} identified
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Zone Start</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Zone End</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-700">High Price</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-700">Low Price</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Zone Width</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.map((zone, idx) => {
                        const width = zone.high - zone.low
                        const widthPct = ((width / zone.low) * 100).toFixed(2)
                        return (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {zone.start_date}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {zone.end_date}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900">
                              {zone.high?.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900">
                              {zone.low?.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {width.toFixed(2)} ({widthPct}%)
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {zone.gap_pct !== undefined && (
                                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  Gap: {zone.gap_pct}%
                                </span>
                              )}
                              {zone.touches !== undefined && (
                                <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded ml-1">
                                  Touches: {zone.touches}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result.zones_detected.length === 0 && (
        <Card>
          <EmptyRow message="No zones were detected during this scan period." cols={1} />
        </Card>
      )}
    </div>
  )
}
