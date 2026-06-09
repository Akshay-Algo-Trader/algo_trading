import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

const PERIOD_OPTIONS = [1, 7, 10, 30, 60, 90]
const SIZE_LABELS = { '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }

export default function SwingZoneEdit() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    axiosInstance.get(`/api/admin/swing-zones/${id}`)
      .then(r => { setForm(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load config'); setLoading(false) })
  }, [id])

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

  if (loading) {
    return (
      <div>
        <PageHeader title="Edit S&R Config" />
        <Card className="p-6"><p className="text-sm text-gray-500">Loading…</p></Card>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Edit S&R Config" />
        <Card className="p-6"><p className="text-sm text-red-500">{error}</p></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit S&R Config — ${form.name}`}
        action={
          <Btn variant="secondary" onClick={() => navigate('/admin/swing-zones')}>
            ← Back to List
          </Btn>
        }
      />

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
          <div className="flex gap-3">
            <Btn variant="secondary" type="button" onClick={() => navigate(`/admin/swing-zones/${id}/scan`)}>
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
