import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, FormField, Input, Select, Btn, PageHeader,
} from '../../components/admin/TableHelpers'

const PATTERN_TYPES = [
  'bullish_breakout',
  'bearish_breakout',
  'bullish_reversal',
  'bearish_reversal',
  'range_breakout',
  'momentum',
  'custom',
]

const DIRECTIONS = ['bullish', 'bearish']

const CANDLE_FREQUENCIES = [
  { value: 'day', label: 'Daily' },
  { value: '240', label: '4 Hours' },
  { value: '60', label: '1 Hour' },
  { value: '15', label: '15 Minutes' },
  { value: '5', label: '5 Minutes' },
]

export default function CandlePatternEdit() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    name: '',
    description: '',
    pattern_type: 'bullish_breakout',
    direction: 'bullish',
    market: '',
    candle_frequency: 'day',
  })

  useEffect(() => {
    Promise.all([
      axiosInstance.get('/api/admin/candle-patterns'),
    ]).then(([r]) => {
      const pattern = (r.data?.patterns ?? []).find(x => String(x.id) === String(id))
      if (!pattern) { navigate('/admin/candle-patterns'); return }
      setForm({
        name:        pattern.name ?? '',
        description: pattern.description ?? '',
        pattern_type: pattern.pattern_type ?? 'bullish_breakout',
        direction:    pattern.direction ?? 'bullish',
        market:       pattern.market ?? '',
        candle_frequency: pattern.candle_frequency ?? 'day',
      })
      setLoading(false)
    }).catch(() => { navigate('/admin/candle-patterns') })
  }, [id, navigate])

  function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr('')

    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      pattern_type: form.pattern_type,
      direction: form.direction,
      market: form.market.trim(),
      candle_frequency: form.candle_frequency,
    }

    axiosInstance.put(`/api/admin/candle-patterns/${id}`, data)
      .then(() => {
        setSaved(true)
        setTimeout(() => navigate('/admin/candle-patterns'), 1000)
      })
      .catch(ex => {
        setErr(ex.response?.data?.error || 'Failed to save')
        setSaving(false)
      })
  }

  if (loading) return <PageHeader title="Loading..." />

  return (
    <>
      <PageHeader title={`Edit Pattern: ${form.name}`} />
      <Card className="max-w-2xl">
        {err && <div className="mb-4 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-sm">{err}</div>}
        {saved && <div className="mb-4 p-2 bg-green-100 border border-green-300 rounded text-green-700 text-sm">Saved! Redirecting...</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Pattern Name" required>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Breakout A"
            />
          </FormField>

          <FormField label="Pattern Type" required>
            <Select
              value={form.pattern_type}
              onChange={e => setForm({ ...form, pattern_type: e.target.value })}
            >
              {PATTERN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormField>

          <FormField label="Direction" required>
            <Select
              value={form.direction}
              onChange={e => setForm({ ...form, direction: e.target.value })}
            >
              {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </FormField>

          <FormField label="Market">
            <Input
              value={form.market}
              onChange={e => setForm({ ...form, market: e.target.value })}
              placeholder="e.g., Nifty, Sensex"
            />
          </FormField>

          <FormField label="Candle Frequency" required>
            <Select
              value={form.candle_frequency}
              onChange={e => setForm({ ...form, candle_frequency: e.target.value })}
            >
              {CANDLE_FREQUENCIES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Description">
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of the pattern..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              rows={3}
            />
          </FormField>

          <div className="flex gap-2 pt-4">
            <Btn onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Btn>
            <Btn onClick={() => navigate('/admin/candle-patterns')} secondary>Cancel</Btn>
          </div>
        </form>
      </Card>
    </>
  )
}
