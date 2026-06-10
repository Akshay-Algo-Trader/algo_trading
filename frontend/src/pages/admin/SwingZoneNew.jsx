import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'
import InstrumentSearch from '../../components/admin/InstrumentSearch'
import SRChart, { StrongLevels, findStrongLevels, strongClusterOthers, STRONG_LEVEL_PCT_OPTIONS } from '../../components/admin/SwingZoneChart'

const PERIOD_OPTIONS = [1, 7, 10, 30, 60, 90]
const SIZE_LABELS = { '1min': '1 Min', '5min': '5 Min', '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }

const EMPTY_FORM = {
  name: '',
  description: '',
  candle_size: '4hour',
  period_days: 30,
  pivot_bars: 5,
  strong_level_pct: 0.5,
}

export default function SwingZoneNew() {
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_FORM)
  const [configId, setConfigId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const [instrument, setInstrument] = useState('')
  const [exchange, setExchange] = useState('NSE')
  const [startDate, setStartDate] = useState(() =>
    new Date(Date.now() - EMPTY_FORM.period_days * 86400000).toISOString().slice(0, 10)
  )
  const [endDate, setEndDate] = useState(today)

  useEffect(() => {
    setStartDate(new Date(Date.now() - form.period_days * 86400000).toISOString().slice(0, 10))
  }, [form.period_days])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [summary, setSummary] = useState(null)

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function handleScan(e) {
    e.preventDefault()
    if (!form.name.trim()) { setScanError('Config name is required before scanning'); return }
    if (!instrument.trim()) { setScanError('Instrument is required'); return }
    setScanning(true); setScanError(''); setScanResult(null); setSummary(null)
    try {
      let id = configId
      const payload = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        candle_size: form.candle_size,
        period_days: parseInt(form.period_days),
        pivot_bars: parseInt(form.pivot_bars),
        strong_level_pct: parseFloat(form.strong_level_pct),
      }
      if (!id) {
        const r = await axiosInstance.post('/api/admin/swing-zones', payload)
        id = r.data.swing_zone.id
        setConfigId(id)
      } else {
        await axiosInstance.put(`/api/admin/swing-zones/${id}`, payload)
      }
      const res = await axiosInstance.post(`/api/admin/swing-zones/${id}/scan`, {
        instrument: instrument.trim().toUpperCase(),
        exchange,
        start_date: startDate,
        end_date: endDate,
      })
      setScanResult(res.data.scan_result)
      setSummary(res.data.summary)
    } catch (ex) {
      setScanError(ex.response?.data?.error ?? 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { setSaveError('Name is required'); return }
    setSaving(true); setSaveError('')
    try {
      if (!configId) {
        await axiosInstance.post('/api/admin/swing-zones', {
          name: form.name.trim(),
          description: form.description?.trim() || null,
          candle_size: form.candle_size,
          period_days: parseInt(form.period_days),
          pivot_bars: parseInt(form.pivot_bars),
          strong_level_pct: parseFloat(form.strong_level_pct),
        })
      }
      navigate('/admin/swing-zones')
    } catch (ex) {
      setSaveError(ex.response?.data?.error ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const levels = scanResult?.levels_detected ?? []
  const resistance = levels.filter(l => l.type === 'RESISTANCE').sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const support = levels.filter(l => l.type === 'SUPPORT').sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const { strongResistance, strongSupport } = findStrongLevels(levels, form.strong_level_pct)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add New Swing Level"
        action={<Btn variant="secondary" onClick={() => navigate('/admin/swing-zones')}>← Back</Btn>}
      />

      {/* Config */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">Config</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
          <FormField label="Config Name">
            <Input value={form.name} onChange={set('name')} placeholder="e.g. SBIN 4H S&R" autoFocus />
          </FormField>
          <FormField label="Description">
            <Input value={form.description} onChange={set('description')} placeholder="Optional" />
          </FormField>
        </div>
        <div className="grid grid-cols-4 gap-x-6 gap-y-1">
          <FormField label="Candle Size">
            <Select value={form.candle_size} onChange={set('candle_size')}>
              {Object.entries(SIZE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </FormField>
          <FormField label="Lookback Period">
            <Select value={form.period_days} onChange={e => setForm(f => ({ ...f, period_days: parseInt(e.target.value) }))}>
              {PERIOD_OPTIONS.map(d => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
            </Select>
          </FormField>
          <FormField label="Pivot Bars" hint="Bars on each side to confirm a pivot">
            <Input
              type="number" min="2" max="20"
              value={form.pivot_bars}
              onChange={e => setForm(f => ({ ...f, pivot_bars: parseInt(e.target.value) || 5 }))}
            />
          </FormField>
          <FormField label="Strong Level %" hint="Levels within this % of each other form a strong cluster">
            <Select value={form.strong_level_pct} onChange={e => setForm(f => ({ ...f, strong_level_pct: parseFloat(e.target.value) }))}>
              {STRONG_LEVEL_PCT_OPTIONS.map(p => <option key={p} value={p}>{p}%</option>)}
            </Select>
          </FormField>
        </div>
      </Card>

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

      {levels.length > 0 && (
        <Card className="p-6">
          <StrongLevels levels={levels} pct={form.strong_level_pct} />
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                Resistance — {resistance.length}
              </p>
              <div className="space-y-1">
                {resistance.map((l, i) => {
                  const strongOthers = strongClusterOthers(strongResistance, l.price)
                  return (
                    <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded border ${strongOthers ? 'bg-red-100 border-red-300 ring-1 ring-red-300' : 'bg-red-50 border-red-100'}`}>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-red-700">{l.price}</span>
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
                  const strongOthers = strongClusterOthers(strongSupport, l.price)
                  return (
                    <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded border ${strongOthers ? 'bg-green-100 border-green-300 ring-1 ring-green-300' : 'bg-green-50 border-green-100'}`}>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-green-700">{l.price}</span>
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

      <div className="flex items-center justify-between pb-4">
        <div>{saveError && <p className="text-sm text-red-500">{saveError}</p>}</div>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Config'}
        </Btn>
      </div>
    </div>
  )
}
