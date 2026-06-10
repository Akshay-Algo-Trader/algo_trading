import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'
import InstrumentSearch from '../../components/admin/InstrumentSearch'
import SRChart from '../../components/admin/SwingZoneChart'

const PERIOD_OPTIONS = [1, 7, 10, 30, 60, 90]
const SIZE_LABELS = { '1min': '1 Min', '5min': '5 Min', '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }

function fmt(dt) {
  if (!dt) return '—'
  return String(dt).replace('T', ' ')
}

export default function SwingZoneEdit() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  // Scan state
  const [instrument, setInstrument] = useState('')
  const [exchange, setExchange] = useState('NSE')
  const [startDate, setStartDate] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  )
  const [endDate, setEndDate] = useState(today)

  useEffect(() => {
    if (form?.period_days) {
      setStartDate(new Date(Date.now() - form.period_days * 86400000).toISOString().slice(0, 10))
    }
  }, [form?.period_days])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [summary, setSummary] = useState(null)

  // History state
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
      .then(r => { setForm(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load config'); setLoading(false) })
    loadHistory()
  }, [id, loadHistory])

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name?.trim()) { setSaveError('Name is required'); return }
    setSaving(true); setSaveError(''); setSaved(false)
    try {
      await axiosInstance.put(`/api/admin/swing-zones/${id}`, {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        candle_size: form.candle_size,
        period_days: parseInt(form.period_days),
        pivot_bars: parseInt(form.pivot_bars),
        is_active: form.is_active,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (ex) {
      setSaveError(ex.response?.data?.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleScan(e) {
    e.preventDefault()
    if (!instrument.trim()) { setScanError('Instrument is required'); return }
    setScanning(true); setScanError(''); setScanResult(null); setSummary(null)
    try {
      const res = await axiosInstance.post(`/api/admin/swing-zones/${id}/scan`, {
        instrument: instrument.trim().toUpperCase(),
        exchange,
        start_date: startDate,
        end_date: endDate,
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
        <PageHeader title="Edit Swing Level" />
        <Card className="p-6"><p className="text-sm text-gray-500">Loading…</p></Card>
      </div>
    )
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Edit Swing Level" />
        <Card className="p-6"><p className="text-sm text-red-500">{error}</p></Card>
      </div>
    )
  }

  const levels = scanResult?.levels_detected ?? []
  const resistance = levels.filter(l => l.type === 'RESISTANCE').sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const support = levels.filter(l => l.type === 'SUPPORT').sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit — ${form.name}`}
        action={
          <Btn variant="secondary" onClick={() => navigate('/admin/swing-zones')}>
            ← Back to List
          </Btn>
        }
      />

      {/* Config Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">General</h2>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1">
            <FormField label="Active">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`relative inline-flex h-9 w-16 items-center rounded-full transition-colors focus:outline-none ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${form.is_active ? 'translate-x-9' : 'translate-x-1.5'}`} />
                <span className={`absolute text-xs font-semibold transition-all ${form.is_active ? 'left-2 text-white' : 'right-1.5 text-gray-500'}`}>
                  {form.is_active ? 'On' : 'Off'}
                </span>
              </button>
            </FormField>
            <FormField label="Config Name">
              <Input value={form.name} onChange={set('name')} />
            </FormField>
            <FormField label="Description">
              <Input value={form.description ?? ''} onChange={set('description')} placeholder="Optional" />
            </FormField>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">Detection Settings</h2>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1">
            <FormField label="Candle Size">
              <Select value={form.candle_size} onChange={set('candle_size')}>
                {Object.entries(SIZE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Lookback Period">
              <Select value={form.period_days} onChange={e => setForm(f => ({ ...f, period_days: parseInt(e.target.value) }))}>
                {PERIOD_OPTIONS.map(d => (
                  <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Pivot Bars" hint="Bars on each side required to confirm a pivot point">
              <Input
                type="number" min="2" max="20"
                value={form.pivot_bars}
                onChange={e => setForm(f => ({ ...f, pivot_bars: parseInt(e.target.value) || 5 }))}
              />
            </FormField>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <div>
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            {saved && <p className="text-sm text-green-600">Saved successfully.</p>}
          </div>
          <Btn variant="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Btn>
        </div>
      </form>

      {/* Scan */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">Scan</h2>
        <form onSubmit={handleScan} className="flex items-end gap-3 flex-wrap">
          <div className="w-52">
            <FormField label="Instrument">
              <InstrumentSearch
                value={instrument}
                onSelect={(sym, exch) => { setInstrument(sym); setExchange(exch) }}
              />
            </FormField>
          </div>
          <div className="w-36">
            <FormField label="Exchange">
              <Select value={exchange} onChange={e => setExchange(e.target.value)}>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
                <option value="NFO">NFO</option>
                <option value="NSE_INDICES">NSE Indices</option>
              </Select>
            </FormField>
          </div>
          <div className="w-40">
            <FormField label="Start Date">
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={endDate} />
            </FormField>
          </div>
          <div className="w-40">
            <FormField label="End Date">
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} max={today} />
            </FormField>
          </div>
          <div className="mb-4 ml-4 pl-4 border-l border-gray-200">
            <div className="text-sm mb-1 invisible select-none">.</div>
            <Btn variant="primary" type="submit" disabled={scanning} className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold">
              {scanning ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Scanning…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="7" strokeWidth="2" strokeLinecap="round" />
                    <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
                    <path d="M8 11h6M11 8v6" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Run Scan
                </>
              )}
            </Btn>
          </div>
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

      {levels.length > 0 && (
        <Card className="p-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                Resistance — {resistance.length}
              </p>
              <div className="space-y-1">
                {resistance.map((l, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded bg-red-50 border border-red-100">
                    <span className="text-sm font-semibold text-red-700">{l.price}</span>
                    <span className="text-xs text-gray-500">{String(l.date).slice(0, 16)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">
                Support — {support.length}
              </p>
              <div className="space-y-1">
                {support.map((l, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded bg-green-50 border border-green-100">
                    <span className="text-sm font-semibold text-green-700">{l.price}</span>
                    <span className="text-xs text-gray-500">{String(l.date).slice(0, 16)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

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
