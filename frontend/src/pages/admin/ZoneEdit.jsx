import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

const DEFAULT_FVG_TF = {
  enabled: false,
  lookback_candles: 100,
  min_gap_pct: 0.1,
  max_gap_pct: 2.0,
  gap_fill_tolerance_pct: 0.1,
}

const DEFAULT_FVG_SETTINGS = {
  '4H': { ...DEFAULT_FVG_TF, lookback_candles: 50, min_gap_pct: 0.2, max_gap_pct: 3.0, gap_fill_tolerance_pct: 0.15 },
  '1H': { ...DEFAULT_FVG_TF },
  '30M': { ...DEFAULT_FVG_TF },
  '15M': { ...DEFAULT_FVG_TF },
}

const DEFAULT_SR_SETTINGS = {
  lookback_candles: 200,
  touch_count_min: 3,
  price_tolerance_pct: 0.25,
  zone_width_pct: 0.5,
}

const DEFAULT_SWING_SETTINGS = {
  lookback_candles: 100,
  swing_left_bars: 5,
  swing_right_bars: 5,
  min_swing_pct: 0.5,
}

const DEFAULT_CONFLUENCE_SETTINGS = {
  enabled: false,
  timeframes: ['1H', '30M', '15M'],
  overlap_min_pct: 0.03,
  overlap_max_pct: 0.23,
  require_all_timeframes: false,
}

function Toggle({ on, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${on ? 'bg-[#eb5202]' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  )
}

function FvgTimeframeRow({ tf, settings, onChange }) {
  function patch(field, value) {
    onChange({ ...settings, [field]: value })
  }

  return (
    <div className="border border-gray-200 rounded-lg px-3 py-2">
      <div className="flex items-center gap-3">
        <Toggle on={settings.enabled} onToggle={() => patch('enabled', !settings.enabled)} />
        <span className="text-sm font-medium text-gray-800 w-16">{tf}</span>
      </div>
      {settings.enabled && (
        <div className="grid grid-cols-2 gap-3 mt-3 pl-11">
          <div>
            <FormField label="Lookback Candles">
              <Input type="number" value={settings.lookback_candles} onChange={e => patch('lookback_candles', parseInt(e.target.value))} min={10} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Historical candles to analyze. Higher = broader detection</p>
          </div>
          <div>
            <FormField label="Min Gap %">
              <Input type="number" value={settings.min_gap_pct} onChange={e => patch('min_gap_pct', parseFloat(e.target.value))} step={0.01} min={0} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Minimum gap size. Filters tiny gaps</p>
          </div>
          <div>
            <FormField label="Max Gap %">
              <Input type="number" value={settings.max_gap_pct} onChange={e => patch('max_gap_pct', parseFloat(e.target.value))} step={0.01} min={0} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Maximum gap size. Filters anomalies</p>
          </div>
          <div>
            <FormField label="Gap Fill Tolerance %">
              <Input type="number" value={settings.gap_fill_tolerance_pct} onChange={e => patch('gap_fill_tolerance_pct', parseFloat(e.target.value))} step={0.01} min={0} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Tolerance when measuring gap fill</p>
          </div>
        </div>
      )}
    </div>
  )
}

function TimeframeMultiSelect({ selected, onChange, available = ['1H', '30M', '15M'] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {available.map(tf => (
        <button
          key={tf}
          type="button"
          onClick={() => {
            const newSelected = selected.includes(tf)
              ? selected.filter(x => x !== tf)
              : [...selected, tf]
            onChange(newSelected)
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selected.includes(tf)
              ? 'bg-[#eb5202] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  )
}

export default function ZoneEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    description: '',
    fvg_settings: DEFAULT_FVG_SETTINGS,
    sr_settings: DEFAULT_SR_SETTINGS,
    swing_settings: DEFAULT_SWING_SETTINGS,
    confluence_settings: DEFAULT_CONFLUENCE_SETTINGS,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    axiosInstance.get(`/api/admin/zones/${id}`)
      .then(r => {
        setForm(r.data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.response?.data?.error ?? 'Failed to load zone')
        setLoading(false)
      })
  }, [id])

  function set(k) {
    return e => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  function setFvgTf(tf, settings) {
    setForm(f => ({
      ...f,
      fvg_settings: { ...f.fvg_settings, [tf]: settings }
    }))
  }

  function setSrField(k, v) {
    setForm(f => ({ ...f, sr_settings: { ...f.sr_settings, [k]: v } }))
  }

  function setSwingField(k, v) {
    setForm(f => ({ ...f, swing_settings: { ...f.swing_settings, [k]: v } }))
  }

  function setConfluenceField(k, v) {
    setForm(f => ({ ...f, confluence_settings: { ...f.confluence_settings, [k]: v } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      fvg_settings: form.fvg_settings,
      sr_settings: form.sr_settings,
      swing_settings: form.swing_settings,
      confluence_settings: form.confluence_settings,
    }

    setSaving(true); setError('')
    try {
      await axiosInstance.put(`/api/admin/zones/${id}`, payload)
      setSaved(true)
      setTimeout(() => navigate('/admin/zones'), 1000)
    } catch (ex) {
      setError(ex.response?.data?.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading…</div>

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title={`Edit Zone Config: ${form.name}`}
        action={
          <div className="flex gap-2">
            <Btn variant="secondary" type="button" onClick={() => navigate(`/admin/zones/${id}/scan`)}>
              Backtest Scan
            </Btn>
            <Btn variant="secondary" type="button" onClick={() => navigate('/admin/zones')}>
              Cancel
            </Btn>
            <Btn variant="primary" type="submit" disabled={saving || saved}>
              {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Config'}
            </Btn>
          </div>
        }
      />

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      {/* General */}
      <Card>
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-800">General</h3>
          <FormField label="Config Name" required>
            <Input value={form.name} onChange={set('name')} />
            <p className="text-xs text-gray-500 mt-1">Identifier for this zone configuration. Example: "FVG Config", "NIFTY Zone Setup"</p>
          </FormField>
          <FormField label="Description">
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
              rows={2}
            />
            <p className="text-xs text-gray-500 mt-1">Document the purpose and strategy. Example: "Detects FVGs on 1H/4H for intraday breakouts"</p>
          </FormField>
        </div>
      </Card>

      {/* FVG — Fair Value Gap */}
      <Card>
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-800">FVG — Fair Value Gap</h3>
          {['4H', '1H', '30M', '15M'].map(tf => (
            <FvgTimeframeRow
              key={tf}
              tf={tf}
              settings={form.fvg_settings[tf]}
              onChange={settings => setFvgTf(tf, settings)}
            />
          ))}
        </div>
      </Card>

      {/* Support & Resistance */}
      <Card>
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-800">Support & Resistance (4H)</h3>
          <div>
            <FormField label="Lookback Candles">
              <Input type="number" value={form.sr_settings.lookback_candles} onChange={e => setSrField('lookback_candles', parseInt(e.target.value))} min={10} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">How many candles back to analyze. Higher = finds older, stronger levels</p>
          </div>
          <div>
            <FormField label="Min Touch Count">
              <Input type="number" value={form.sr_settings.touch_count_min} onChange={e => setSrField('touch_count_min', parseInt(e.target.value))} min={1} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Minimum times price must touch a level to be considered S&R. Higher = stronger level</p>
          </div>
          <div>
            <FormField label="Price Tolerance %">
              <Input type="number" value={form.sr_settings.price_tolerance_pct} onChange={e => setSrField('price_tolerance_pct', parseFloat(e.target.value))} step={0.01} min={0} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Range around level where touches are counted as same level. Example: 0.25% on 10,000 = 9,975-10,025</p>
          </div>
          <div>
            <FormField label="Zone Width %">
              <Input type="number" value={form.sr_settings.zone_width_pct} onChange={e => setSrField('zone_width_pct', parseFloat(e.target.value))} step={0.01} min={0} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Creates a zone around the identified level. Higher = wider zone</p>
          </div>
        </div>
      </Card>

      {/* Swing High / Swing Low */}
      <Card>
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-800">Swing High / Swing Low (4H)</h3>
          <div>
            <FormField label="Lookback Candles">
              <Input type="number" value={form.swing_settings.lookback_candles} onChange={e => setSwingField('lookback_candles', parseInt(e.target.value))} min={10} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Historical candles to analyze for swing patterns</p>
          </div>
          <div>
            <FormField label="Left Bars">
              <Input type="number" value={form.swing_settings.swing_left_bars} onChange={e => setSwingField('swing_left_bars', parseInt(e.target.value))} min={1} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Number of candles to left that must be lower (swing high) or higher (swing low). Higher = stricter pattern</p>
          </div>
          <div>
            <FormField label="Right Bars">
              <Input type="number" value={form.swing_settings.swing_right_bars} onChange={e => setSwingField('swing_right_bars', parseInt(e.target.value))} min={1} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Number of candles to right that must be lower/higher. Higher = stricter pattern</p>
          </div>
          <div>
            <FormField label="Min Swing %">
              <Input type="number" value={form.swing_settings.min_swing_pct} onChange={e => setSwingField('min_swing_pct', parseFloat(e.target.value))} step={0.01} min={0} />
            </FormField>
            <p className="text-xs text-gray-500 mt-1">Minimum price movement for valid swing. Filters tiny swings, keeps significant ones</p>
          </div>
        </div>
      </Card>

      {/* FVG Confluence Zone */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Toggle
              on={form.confluence_settings.enabled}
              onToggle={() => setConfluenceField('enabled', !form.confluence_settings.enabled)}
            />
            <div>
              <h3 className="font-semibold text-gray-800">FVG Confluence Zone</h3>
              <p className="text-xs text-gray-500 mt-1">Detect zones where FVGs overlap across multiple timeframes (stronger signals)</p>
            </div>
          </div>

          {form.confluence_settings.enabled && (
            <div className="space-y-3">
              <div>
                <FormField label="Timeframes">
                  <TimeframeMultiSelect
                    selected={form.confluence_settings.timeframes}
                    onChange={tf => setConfluenceField('timeframes', tf)}
                    available={['1H', '30M', '15M']}
                  />
                </FormField>
                <p className="text-xs text-gray-500 mt-1">Select which timeframes to check for overlaps. Click to toggle</p>
              </div>
              <div>
                <FormField label="Min Overlap %">
                  <Input
                    type="number"
                    value={form.confluence_settings.overlap_min_pct}
                    onChange={e => setConfluenceField('overlap_min_pct', parseFloat(e.target.value))}
                    step={0.01}
                    min={0}
                    max={1}
                  />
                </FormField>
                <p className="text-xs text-gray-500 mt-1">Minimum overlap for confluence. Example: 0.03 = at least 3% overlap required</p>
              </div>
              <div>
                <FormField label="Max Overlap %">
                  <Input
                    type="number"
                    value={form.confluence_settings.overlap_max_pct}
                    onChange={e => setConfluenceField('overlap_max_pct', parseFloat(e.target.value))}
                    step={0.01}
                    min={0}
                    max={1}
                  />
                </FormField>
                <p className="text-xs text-gray-500 mt-1">Maximum overlap allowed. Prevents counting zones too far apart</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="pt-2">
                  <Toggle
                    on={form.confluence_settings.require_all_timeframes}
                    onToggle={() => setConfluenceField('require_all_timeframes', !form.confluence_settings.require_all_timeframes)}
                  />
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-700">Require All Timeframes</span>
                  <p className="text-xs text-gray-500 mt-1">
                    {form.confluence_settings.require_all_timeframes
                      ? 'ON: ALL selected timeframes must have FVG overlap'
                      : 'OFF: ANY timeframe with FVG overlap counts'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </form>
  )
}
