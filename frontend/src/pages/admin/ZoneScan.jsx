import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Btn, PageHeader, Badge,
  Table, SkeletonTable, EmptyRow, ErrorRow,
} from '../../components/admin/TableHelpers'

const SCAN_OPTIONS = [5, 10, 30]

export default function ZoneScan() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [zone, setZone] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Scan form
  const [instrument, setInstrument] = useState('')
  const [exchange, setExchange] = useState('NSE')
  const [timeframe, setTimeframe] = useState('day')
  const [scanDays, setScanDays] = useState(30)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')

  // Results
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Load zone config
  useEffect(() => {
    axiosInstance.get(`/api/admin/zones/${id}`)
      .then(r => {
        setZone(r.data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.response?.data?.error ?? 'Failed to load zone')
        setLoading(false)
      })
  }, [id])

  // Load scan history
  const fetchHistory = useCallback(async () => {
    if (!zone) return
    setHistoryLoading(true)
    try {
      const r = await axiosInstance.get(`/api/admin/zones/${id}/scan-history`)
      setHistory(r.data?.scan_results ?? [])
    } catch {
      // Silently fail for history
    } finally {
      setHistoryLoading(false)
    }
  }, [zone, id])

  useEffect(() => {
    if (zone && !historyLoading && history.length === 0) {
      fetchHistory()
    }
  }, [zone, fetchHistory, historyLoading, history.length])

  async function handleScan(e) {
    e.preventDefault()
    if (!instrument.trim()) {
      setScanError('Instrument is required')
      return
    }

    const payload = {
      instrument: instrument.trim().toUpperCase(),
      exchange: exchange || 'NSE',
      timeframe: timeframe || 'day',
      scan_days: scanDays,
    }

    setScanning(true)
    setScanError('')
    try {
      const r = await axiosInstance.post(`/api/admin/zones/${id}/scan`, payload)
      setResult(r.data.scan_result)
      fetchHistory()
    } catch (ex) {
      setScanError(ex.response?.data?.error ?? 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  function zoneTypeColor(type) {
    if (type.startsWith('FVG')) return 'blue'
    if (type === 'SR') return 'green'
    if (type.startsWith('SWING')) return 'purple'
    return 'gray'
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Zone Scan" />
        <Card><SkeletonTable rows={3} cols={4} /></Card>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Zone Scan" />
        <Card><ErrorRow message={error} cols={4} /></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Zone Scan - ${zone?.name}`} />

      {/* Scan Form */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Backtest Scan</h2>
        <form onSubmit={handleScan}>
          {scanError && <p className="text-sm text-red-500 mb-3">{scanError}</p>}

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <FormField label="Instrument" required>
              <Input
                value={instrument}
                onChange={e => setInstrument(e.target.value.toUpperCase())}
                placeholder="e.g., NIFTY, BANKNIFTY, SBIN"
                disabled={scanning}
              />
            </FormField>
            <FormField label="Exchange">
              <select
                value={exchange}
                onChange={e => setExchange(e.target.value)}
                disabled={scanning}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </select>
            </FormField>

            <FormField label="Timeframe">
              <select
                value={timeframe}
                onChange={e => setTimeframe(e.target.value)}
                disabled={scanning}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="day">Daily</option>
                <option value="60">Hourly</option>
                <option value="15">15min</option>
              </select>
            </FormField>

            <FormField label="Scan Period">
              <div className="flex gap-2">
                {SCAN_OPTIONS.map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setScanDays(days)}
                    disabled={scanning}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      scanDays === days
                        ? 'bg-[#eb5202] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </FormField>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Btn
              variant="secondary"
              type="button"
              onClick={() => navigate(`/admin/zones/${id}/edit`)}
              disabled={scanning}
            >
              Back to Config
            </Btn>
            <Btn variant="primary" type="submit" disabled={scanning}>
              {scanning ? 'Scanning…' : 'Start Scan'}
            </Btn>
          </div>
        </form>
      </Card>

      {/* Scan Results */}
      {result && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scan Results</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-600">Total Zones</p>
              <p className="text-2xl font-bold text-gray-900">{result.total_zones}</p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-600">Scan Period</p>
              <p className="text-sm font-semibold text-gray-900">
                {result.period.from} to {result.period.to}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-600">Instrument</p>
              <p className="text-sm font-semibold text-gray-900">
                {result.instrument} ({result.exchange})
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-600">Scanned</p>
              <p className="text-xs text-gray-700">
                {new Date(result.scanned_at).toLocaleString()}
              </p>
            </div>
          </div>

          {result.zones_detected.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Type</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Date Identified</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-700">High</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-700">Low</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {result.zones_detected.map((zone, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Badge variant={zoneTypeColor(zone.type)}>
                          {zone.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {zone.date}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {zone.high?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {zone.low?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {zone.gap_pct !== undefined && `Gap: ${zone.gap_pct}%`}
                        {zone.touches !== undefined && `Touches: ${zone.touches}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4">No zones detected in this period.</p>
          )}
        </Card>
      )}

      {/* Scan History */}
      {history.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Scans</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Instrument</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Period</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold text-gray-700">Zones Found</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-700">Scanned</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr
                    key={h.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/admin/zones/${id}/scan/${h.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-sm text-gray-900">
                      {h.instrument} ({h.exchange})
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {h.period.from} to {h.period.to}
                    </td>
                    <td className="px-4 py-3 text-sm text-center font-semibold">
                      {h.total_zones}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(h.scanned_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
