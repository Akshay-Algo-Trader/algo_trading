import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'
import SRChart from '../../components/admin/SwingZoneChart'

const SIZE_LABELS = { '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }
const PERIOD_OPTIONS = [1, 7, 10, 30, 60, 90]

function fmt(dt) {
  if (!dt) return '—'
  return String(dt).replace('T', ' ')
}

export default function SwingZoneScan() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [instrument, setInstrument] = useState('')
  const [exchange, setExchange] = useState('NSE')
  const [periodDays, setPeriodDays] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [summary, setSummary] = useState(null)

  const [history, setHistory] = useState([])
  const [histLoading, setHistLoading] = useState(false)

  const loadHistory = useCallback(() => {
    setHistLoading(true)
    axiosInstance.get(`/api/admin/swing-zones/${id}/scan-history`)
      .then(r => { setHistory(r.data.scan_results); setHistLoading(false) })
      .catch(() => setHistLoading(false))
  }, [id])

  useEffect(() => {
    axiosInstance.get(`/api/admin/swing-zones/${id}`)
      .then(r => { setCfg(r.data); setPeriodDays(r.data.period_days); setLoading(false) })
      .catch(() => { setError('Failed to load config'); setLoading(false) })
    loadHistory()
  }, [id, loadHistory])

  async function handleScan(e) {
    e.preventDefault()
    if (!instrument.trim()) { setScanError('Instrument is required'); return }
    setScanning(true); setScanError(''); setScanResult(null); setSummary(null)
    try {
      const res = await axiosInstance.post(`/api/admin/swing-zones/${id}/scan`, {
        instrument: instrument.trim().toUpperCase(),
        exchange,
        period_days: periodDays,
      })
      setScanResult(res.data.scan_result)
      setSummary(res.data.summary)
      loadHistory()
    } catch (ex) {
      setScanError(ex.response?.data?.error ?? 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="S&R Scan" />
        <Card className="p-6"><p className="text-sm text-gray-500">Loading…</p></Card>
      </div>
    )
  }
  if (error) {
    return (
      <div>
        <PageHeader title="S&R Scan" />
        <Card className="p-6"><p className="text-sm text-red-500">{error}</p></Card>
      </div>
    )
  }

  const levels = scanResult?.levels_detected ?? []
  const resistance = levels.filter(l => l.type === 'RESISTANCE')
  const support = levels.filter(l => l.type === 'SUPPORT')

  return (
    <div className="space-y-6">
      <PageHeader
        title={`S&R Scan — ${cfg.name}`}
        action={
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={() => navigate(`/admin/swing-zones/${id}/edit`)}>Edit Config</Btn>
            <Btn variant="secondary" onClick={() => navigate('/admin/swing-zones')}>← Back</Btn>
          </div>
        }
      />

      {/* Config + Scan form */}
      <Card className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          {[
            ['Candle Size', SIZE_LABELS[cfg.candle_size] ?? cfg.candle_size],
            ['Period', `${cfg.period_days} day${cfg.period_days > 1 ? 's' : ''}`],
            ['Pivot Bars', cfg.pivot_bars],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleScan} className="flex items-end gap-4">
          <div className="w-48">
            <FormField label="Instrument">
              <Input
                value={instrument}
                onChange={e => setInstrument(e.target.value.toUpperCase())}
                placeholder="e.g. SBIN"
              />
            </FormField>
          </div>
          <div className="w-36">
            <FormField label="Exchange">
              <Select value={exchange} onChange={e => setExchange(e.target.value)}>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
                <option value="NFO">NFO</option>
              </Select>
            </FormField>
          </div>
          <div className="w-36">
            <FormField label="Period">
              <Select value={periodDays ?? ''} onChange={e => setPeriodDays(parseInt(e.target.value))}>
                {PERIOD_OPTIONS.map(d => (
                  <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
                ))}
              </Select>
            </FormField>
          </div>
          <Btn variant="primary" type="submit" disabled={scanning}>
            {scanning ? 'Scanning…' : 'Run Scan'}
          </Btn>
        </form>

        {scanError && <p className="mt-3 text-sm text-red-500">{scanError}</p>}

        {summary && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Total Levels', summary.total_levels],
              ['Resistance', summary.resistance],
              ['Support', summary.support],
              ['Period', `${summary.period.from?.slice(0, 10)} → ${summary.period.to?.slice(0, 10)}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Chart */}
      {scanResult && levels.length > 0 && (
        <Card className="p-6">
          <SRChart
            levels={levels}
            instrument={scanResult.instrument}
            exchange={scanResult.exchange}
            candleSize={scanResult.candle_size}
            periodFrom={scanResult.period.from}
            periodTo={scanResult.period.to}
          />
        </Card>
      )}

      {/* Levels table */}
      {levels.length > 0 && (
        <Card className="p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Resistance */}
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                Resistance — {resistance.length}
              </p>
              <div className="space-y-1">
                {resistance.map((l, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded bg-red-50 border border-red-100">
                    <span className="text-sm font-semibold text-red-700">{l.price}</span>
                    <span className="text-xs text-gray-500">{String(l.date).slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Support */}
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">
                Support — {support.length}
              </p>
              <div className="space-y-1">
                {support.map((l, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded bg-green-50 border border-green-100">
                    <span className="text-sm font-semibold text-green-700">{l.price}</span>
                    <span className="text-xs text-gray-500">{String(l.date).slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Scan history */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Scan History</h3>
        {histLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-400">No scans yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  {['Instrument', 'Exchange', 'Candle Size', 'Period', 'Levels', 'Scanned At'].map(h => (
                    <th key={h} className="px-3 py-2 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map(r => (
                  <tr
                    key={r.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/admin/swing-zones/${id}/scan/${r.id}`)}
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">{r.instrument}</td>
                    <td className="px-3 py-2 text-gray-600">{r.exchange}</td>
                    <td className="px-3 py-2 text-gray-600">{SIZE_LABELS[r.candle_size] ?? r.candle_size}</td>
                    <td className="px-3 py-2 text-gray-600">{r.period_days}d</td>
                    <td className="px-3 py-2 text-gray-600">{r.total_levels}</td>
                    <td className="px-3 py-2 text-gray-500">{fmt(r.scanned_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
