import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

const EXCHANGES = [
  { value: 'NSE', label: 'NSE' },
  { value: 'BSE', label: 'BSE' },
  { value: 'NFO', label: 'NFO' },
  { value: 'NSE_INDICES', label: 'NSE Indices' },
  { value: 'MCX', label: 'MCX' },
]

const SIZE_LABELS = { '1min': '1 Min', '5min': '5 Min', '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function fmt(dt) {
  if (!dt) return '—'
  return String(dt).replace('T', ' ').slice(0, 19)
}

export default function SwingLevelScanner() {
  const navigate = useNavigate()

  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)

  const [configId, setConfigId] = useState('')
  const [exchange, setExchange] = useState('NSE')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState(isoDate(new Date()))
  const [strict, setStrict] = useState(false)

  const [run, setRun] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      axiosInstance.get('/api/admin/swing-zones'),
      axiosInstance.get('/api/admin/swing-scanner/latest'),
    ])
      .then(([cfgRes, runRes]) => {
        setConfigs(cfgRes.data.swing_zones ?? [])
        if (runRes.data.run) setRun(runRes.data.run)
      })
      .catch(() => setError('Failed to load swing level configs'))
      .finally(() => setLoading(false))
  }, [])

  // Default the date range to the selected config's period
  useEffect(() => {
    const cfg = configs.find(c => String(c.id) === String(configId))
    if (!cfg) return
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - cfg.period_days)
    setStartDate(isoDate(start))
    setEndDate(isoDate(end))
  }, [configId, configs])

  // Poll progress while a scan is running
  useEffect(() => {
    if (!run || run.status !== 'running') return
    const timer = setInterval(() => {
      axiosInstance.get(`/api/admin/swing-scanner/${run.id}`)
        .then(r => setRun(r.data.run))
        .catch(() => {})
    }, 2500)
    return () => clearInterval(timer)
  }, [run?.id, run?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRun(e) {
    e.preventDefault()
    if (!configId) { setError('Select a swing level config'); return }
    setStarting(true); setError('')
    try {
      const res = await axiosInstance.post('/api/admin/swing-scanner/run', {
        swing_config_id: parseInt(configId),
        exchange,
        start_date: startDate,
        end_date: endDate,
        strict,
      })
      setRun(res.data.run)
    } catch (ex) {
      setError(ex.response?.data?.error ?? 'Failed to start scan')
    } finally {
      setStarting(false)
    }
  }

  function handleCancel() {
    if (!run) return
    axiosInstance.post(`/api/admin/swing-scanner/${run.id}/cancel`).catch(() => {})
  }

  const selectedCfg = configs.find(c => String(c.id) === String(configId))
  const running = run?.status === 'running'
  const progressPct = run?.total ? Math.round((run.done / run.total) * 100) : 0
  const matches = run?.matches ?? []

  if (loading) {
    return (
      <div>
        <PageHeader title="Scan Swing Levels" />
        <Card className="p-6"><p className="text-sm text-gray-500">Loading…</p></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Scan Swing Levels" />

      {/* Scan form */}
      <Card className="p-6">
        <p className="text-sm text-gray-500 mb-4">
          Scans every instrument in the selected exchange and lists those whose
          <span className="font-semibold text-gray-700"> nearest level is part of a strong level cluster</span> —
          the nearest and strong lines sit on the same price band on the chart.
        </p>
        <form onSubmit={handleRun} className="flex flex-wrap items-end gap-4">
          <div className="w-64">
            <FormField label="Swing Level Config">
              <Select value={configId} onChange={e => setConfigId(e.target.value)}>
                <option value="">Select config…</option>
                {configs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({SIZE_LABELS[c.candle_size] ?? c.candle_size}, {c.strong_level_pct}%)
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="w-36">
            <FormField label="Exchange">
              <Select value={exchange} onChange={e => setExchange(e.target.value)}>
                {EXCHANGES.map(ex => <option key={ex.value} value={ex.value}>{ex.label}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="w-40">
            <FormField label="Start Date">
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </FormField>
          </div>
          <div className="w-40">
            <FormField label="End Date">
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </FormField>
          </div>
          <Btn variant="primary" type="submit" disabled={starting || running}>
            {starting ? 'Starting…' : running ? 'Scan Running…' : 'Run Scan'}
          </Btn>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={strict}
              onChange={e => setStrict(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            Find strict strong + near line
          </label>
        </form>

        {selectedCfg && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Candle Size', SIZE_LABELS[selectedCfg.candle_size] ?? selectedCfg.candle_size],
              ['Pivot Bars', selectedCfg.pivot_bars],
              ['Strong Level %', `${selectedCfg.strong_level_pct}%`],
              ['Default Period', `${selectedCfg.period_days} days`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </Card>

      {/* Progress / status */}
      {run && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Scan #{run.id} — {run.config?.name} · {EXCHANGES.find(e => e.value === run.exchange)?.label ?? run.exchange}
              <span className={`ml-3 text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                running ? 'bg-blue-100 text-blue-700'
                  : run.status === 'completed' ? 'bg-green-100 text-green-700'
                  : run.status === 'error' ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {run.status}
              </span>
              {run.strict && (
                <span className="ml-2 text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                  Strict
                </span>
              )}
            </h3>
            {running && (
              <Btn variant="secondary" onClick={handleCancel}>Cancel Scan</Btn>
            )}
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2.5 mb-3">
            <div
              className={`h-2.5 rounded-full transition-all ${running ? 'bg-blue-500' : 'bg-green-500'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ['Scanned', `${run.done} / ${run.total}`],
              ['Matches', matches.length],
              ['Errors', run.errors],
              ['Period', `${run.period?.from} → ${run.period?.to}`],
              ['Started', fmt(run.started_at)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {run.error && <p className="mt-3 text-sm text-red-500">{run.error}</p>}
        </Card>
      )}

      {/* Matches table */}
      {run && (
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Instruments with Strong + Nearest on the same line — {matches.length}
          </h3>
          {matches.length === 0 ? (
            <p className="text-sm text-gray-400">
              {running ? 'No matches yet — scan in progress…' : 'No matching instruments found.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    {['Instrument', 'LTP', 'Side', 'Nearest Level', 'Strong Level', 'Distance', 'Cluster', 'Total Levels'].map(h => (
                      <th key={h} className="px-3 py-2 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {matches.map((m, i) => (
                    <tr
                      key={`${m.instrument}-${i}`}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(
                        `/admin/swing-zones/${run.config.id}/edit?instrument=${encodeURIComponent(m.instrument)}&exchange=${run.exchange}`
                        + `&start_date=${run.period?.from ?? ''}&end_date=${run.period?.to ?? ''}`
                      )}
                    >
                      <td className="px-3 py-2 font-medium text-gray-900">{m.instrument}</td>
                      <td className="px-3 py-2 text-gray-700">{m.ltp}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {m.levels.map((l, j) => (
                            <span
                              key={j}
                              className={`inline-block w-fit text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                l.side === 'RESISTANCE' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {l.side === 'RESISTANCE' ? 'Resistance' : 'Support'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {m.levels.map((l, j) => (
                            <span key={j} className={`font-semibold ${l.side === 'RESISTANCE' ? 'text-red-700' : 'text-green-700'}`}>
                              {l.price}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {m.levels.map((l, j) => (
                            <span key={j} className={`font-semibold ${l.side === 'RESISTANCE' ? 'text-red-700' : 'text-green-700'}`}>
                              {l.strong_price}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {m.levels.map((l, j) => (
                            <span key={j} className="text-gray-600">{l.distance_pct != null ? `${l.distance_pct}%` : '—'}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {m.levels.map((l, j) => (
                            <span key={j} className="text-gray-600">{l.cluster_size} levels</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{m.total_levels}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
