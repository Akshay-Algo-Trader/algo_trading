import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

const PERIOD_OPTIONS = [1, 7, 10, 30, 60]

export default function FvgZoneEdit() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    axiosInstance.get(`/api/admin/fvg-zones/${id}`)
      .then(r => {
        setForm(r.data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load config')
        setLoading(false)
      })
  }, [id])

  function set(k) {
    return e => setForm(f => ({ ...f, [k]: e.target.value }))
  }
  function setNum(k) {
    return e => setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name?.trim()) { setSaveError('Name is required'); return }

    setSaving(true); setSaveError(''); setSaved(false)
    try {
      await axiosInstance.put(`/api/admin/fvg-zones/${id}`, {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        fvg_type: form.fvg_type,
        candle_size: form.candle_size,
        period_days: parseInt(form.period_days),
        impulse_multiplier: parseFloat(form.impulse_multiplier),
        min_gap_pct: parseFloat(form.min_gap_pct),
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

  if (loading) {
    return (
      <div>
        <PageHeader title="Edit FVG Zone Config" />
        <Card className="p-6"><p className="text-sm text-gray-500">Loading…</p></Card>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Edit FVG Zone Config" />
        <Card className="p-6"><p className="text-sm text-red-500">{error}</p></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit FVG Zone — ${form.name}`}
        action={
          <Btn variant="secondary" onClick={() => navigate('/admin/fvg-zones')}>
            ← Back to List
          </Btn>
        }
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* General */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">General</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <FormField label="Config Name">
              <Input value={form.name} onChange={set('name')} />
            </FormField>
            <FormField label="Description">
              <Input value={form.description ?? ''} onChange={set('description')} placeholder="Optional" />
            </FormField>
          </div>
        </Card>

        {/* Detection Settings */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">Detection Settings</h2>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1">
            <FormField label="FVG Type">
              <Select value={form.fvg_type} onChange={set('fvg_type')}>
                <option value="bullish">Bullish — gap up (price left room below)</option>
                <option value="bearish">Bearish — gap down (price left room above)</option>
                <option value="both">Both</option>
              </Select>
            </FormField>

            <FormField label="Candle Size">
              <Select value={form.candle_size} onChange={set('candle_size')}>
                <option value="15min">15 Min</option>
                <option value="30min">30 Min</option>
                <option value="1hour">1 Hour</option>
                <option value="4hour">4 Hour</option>
              </Select>
            </FormField>

            <FormField label="Lookback Period">
              <Select value={form.period_days} onChange={e => setForm(f => ({ ...f, period_days: parseInt(e.target.value) }))}>
                {PERIOD_OPTIONS.map(d => (
                  <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
                ))}
              </Select>
            </FormField>
          </div>
        </Card>

        {/* Quality Rules */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 uppercase tracking-wide">Quality Rules</h2>
          <p className="text-xs text-gray-400 mb-4">These thresholds enforce the three FVG quality rules.</p>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1">
            <FormField
              label="Impulse Multiplier"
              hint="Candle 2 body must be ≥ this × avg(candle 1 body, candle 3 body). Filters weak candles."
            >
              <Input
                type="number" step="0.1" min="1" max="10"
                value={form.impulse_multiplier}
                onChange={setNum('impulse_multiplier')}
              />
            </FormField>

            <FormField
              label="Min Gap %"
              hint="Minimum gap between candle 1 high and candle 3 low as % of price. Filters micro gaps."
            >
              <Input
                type="number" step="0.01" min="0" max="5"
                value={form.min_gap_pct}
                onChange={setNum('min_gap_pct')}
              />
            </FormField>

            <FormField label="Active">
              <Select value={String(form.is_active)} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </FormField>
          </div>

          {/* Rules reminder */}
          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-blue-700">Enforced rules (always active)</p>
            <p className="text-xs text-blue-600">1. <b>No overlap</b> — candle 1 high and candle 3 low must not touch. Any overlap disqualifies the pattern.</p>
            <p className="text-xs text-blue-600">2. <b>Strong impulse</b> — candle 2 body ≥ <b>Impulse Multiplier</b> × avg outer bodies (tunable above).</p>
            <p className="text-xs text-blue-600">3. <b>Clean structure</b> — candle 2 body must exceed the local ATR (14-period). Filters sideways/choppy noise.</p>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <div>
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            {saved && <p className="text-sm text-green-600">Saved successfully.</p>}
          </div>
          <div className="flex gap-3">
            <Btn variant="secondary" type="button" onClick={() => navigate(`/admin/fvg-zones/${id}/scan`)}>
              Go to Scan
            </Btn>
            <Btn variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Btn>
          </div>
        </div>
      </form>
    </div>
  )
}
