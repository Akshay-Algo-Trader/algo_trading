import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader, Badge,
  SkeletonTable, EmptyRow,
} from '../../components/admin/TableHelpers'
import FvgZoneChart from '../../components/admin/FvgZoneChart'

const TYPE_COLORS = { FVG_BULLISH: 'green', FVG_BEARISH: 'red' }
const SIZE_LABELS = { '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }

function fmt(dt) {
  if (!dt) return '—'
  return dt.replace('T', ' ')
}

function ConfigCard({ cfg }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {[
        ['Type', cfg.fvg_type === 'both' ? 'Both' : cfg.fvg_type === 'bullish' ? 'Bullish' : 'Bearish'],
        ['Candle Size', SIZE_LABELS[cfg.candle_size] ?? cfg.candle_size],
        ['Period', `${cfg.period_days} day${cfg.period_days > 1 ? 's' : ''}`],
        ['Impulse ×', `${cfg.impulse_multiplier}×`],
      ].map(([label, value]) => (
        <div key={label} className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  )
}

// Small icon-style chart button
function ChartBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="View chart"
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
      Chart
    </button>
  )
}

export default function FvgZoneScan() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [instrument, setInstrument] = useState('')
  const [exchange, setExchange] = useState('NSE')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')

  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [histLoading, setHistLoading] = useState(false)

  // Chart modal state
  const [chartZone, setChartZone] = useState(null)

  useEffect(() => {
    axiosInstance.get(`/api/admin/fvg-zones/${id}`)
      .then(r => { setCfg(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load config'); setLoading(false) })
  }, [id])

  const fetchHistory = useCallback(async () => {
    if (!cfg) return
    setHistLoading(true)
    try {
      const r = await axiosInstance.get(`/api/admin/fvg-zones/${id}/scan-history`)
      setHistory(r.data?.scan_results ?? [])
    } catch { /* silent */ }
    finally { setHistLoading(false) }
  }, [cfg, id])

  useEffect(() => {
    if (cfg && history.length === 0 && !histLoading) fetchHistory()
  }, [cfg, history.length, histLoading, fetchHistory])

  async function handleScan(e) {
    e.preventDefault()
    if (!instrument.trim()) { setScanError('Instrument is required'); return }

    setScanning(true); setScanError('')
    try {
      const r = await axiosInstance.post(`/api/admin/fvg-zones/${id}/scan`, {
        instrument: instrument.trim().toUpperCase(),
        exchange,
      })
      setResult(r.data.scan_result)
      fetchHistory()
    } catch (ex) {
      setScanError(ex.response?.data?.error ?? 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="FVG Zone Scan" />
        <Card className="p-6"><table><tbody><SkeletonTable rows={3} cols={4} /></tbody></table></Card>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <PageHeader title="FVG Zone Scan" />
        <Card className="p-6"><p className="text-sm text-red-500">{error}</p></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`FVG Scan — ${cfg?.name}`}
        action={
          <Btn variant="secondary" onClick={() => navigate(`/admin/fvg-zones/${id}/edit`)}>
            Edit Config
          </Btn>
        }
      />

      {/* Config summary + scan form */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Config Settings</h2>
        <ConfigCard cfg={cfg} />

        <h2 className="text-sm font-semibold text-gray-700 mb-3">Backtest Scan</h2>
        <form onSubmit={handleScan}>
          {scanError && <p className="text-sm text-red-500 mb-3">{scanError}</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <FormField label="Instrument">
              <Input
                value={instrument}
                onChange={e => setInstrument(e.target.value.toUpperCase())}
                placeholder="e.g. NIFTY, BANKNIFTY, SBIN"
                disabled={scanning}
              />
            </FormField>
            <FormField label="Exchange">
              <Select value={exchange} onChange={e => setExchange(e.target.value)} disabled={scanning}>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </Select>
            </FormField>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Candle size and lookback period come from the config above.
          </p>
          <div className="flex justify-end">
            <Btn variant="primary" type="submit" disabled={scanning}>
              {scanning ? 'Scanning…' : 'Run Backtest'}
            </Btn>
          </div>
        </form>
      </Card>

      {/* Results */}
      {result && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scan Results</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-500">Total Zones</p>
              <p className="text-2xl font-bold text-gray-900">{result.total_zones}</p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-500">Bullish FVG</p>
              <p className="text-2xl font-bold text-green-600">
                {result.zones_detected.filter(z => z.type === 'FVG_BULLISH').length}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-500">Bearish FVG</p>
              <p className="text-2xl font-bold text-red-600">
                {result.zones_detected.filter(z => z.type === 'FVG_BEARISH').length}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-500">Instrument</p>
              <p className="text-sm font-semibold text-gray-900">{result.instrument} ({result.exchange})</p>
              <p className="text-xs text-gray-400">{result.candle_size} · {result.period_days}d</p>
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-3">
            Period: <b>{result.period.from}</b> → <b>{result.period.to}</b>
            &nbsp;·&nbsp;Scanned at {new Date(result.scanned_at).toLocaleString()}
          </p>

          {result.zones_detected.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Type', 'Zone Start (C1)', 'Impulse (C2)', 'Zone End (C3)', 'Zone High', 'Zone Low', 'Gap %', 'Impulse Body', ''].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.zones_detected.map((z, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Badge variant={TYPE_COLORS[z.type] ?? 'gray'}>
                          {z.type === 'FVG_BULLISH' ? 'Bullish' : 'Bearish'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-700 font-medium whitespace-nowrap">
                        {fmt(z.c1_date)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {fmt(z.c2_date)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-700 font-medium whitespace-nowrap">
                        {fmt(z.c3_date)}
                      </td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 text-right">
                        {z.high?.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 text-right">
                        {z.low?.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 text-right">
                        {z.gap_pct?.toFixed(3)}%
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 text-right">
                        {z.impulse_body?.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5">
                        <ChartBtn onClick={() => setChartZone(z)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-6 text-center">No FVG zones detected in this period.</p>
          )}
        </Card>
      )}

      {/* Scan History */}
      {(history.length > 0 || histLoading) && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scan History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Instrument', 'Candle Size', 'Period', 'Zones Found', 'Scan Date'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {histLoading
                  ? <EmptyRow message="Loading history…" cols={5} />
                  : history.map(h => (
                    <tr
                      key={h.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/admin/fvg-zones/${id}/scan/${h.id}`)}
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {h.instrument} ({h.exchange})
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {SIZE_LABELS[h.candle_size] ?? h.candle_size}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {h.period.from} → {h.period.to}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-center">{h.total_zones}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {new Date(h.scanned_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Chart modal */}
      <FvgZoneChart
        isOpen={!!chartZone}
        onClose={() => setChartZone(null)}
        zone={chartZone}
        instrument={result?.instrument ?? instrument}
        exchange={result?.exchange ?? exchange}
        candleSize={result?.candle_size ?? cfg?.candle_size}
      />
    </div>
  )
}
