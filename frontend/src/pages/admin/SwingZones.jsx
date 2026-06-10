import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import {
  Card, Table, SkeletonTable, EmptyRow, ErrorRow,
  Btn, PageHeader,
} from '../../components/admin/TableHelpers'

const SIZE_LABELS = { '1min': '1 Min', '5min': '5 Min', '15min': '15 Min', '30min': '30 Min', '1hour': '1 Hour', '4hour': '4 Hour' }

export default function SwingZones() {
  const navigate = useNavigate()
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setError('')
    axiosInstance.get('/api/admin/swing-zones')
      .then(r => { setConfigs(r.data.swing_zones); setLoading(false) })
      .catch(() => { setError('Failed to load configs'); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(cfg) {
    setToggling(cfg.id)
    try {
      const res = await axiosInstance.put(`/api/admin/swing-zones/${cfg.id}`, { is_active: !cfg.is_active })
      setConfigs(cs => cs.map(c => c.id === cfg.id ? res.data.swing_zone : c))
    } catch { /* ignore */ }
    finally { setToggling(null) }
  }

  async function handleDelete(cfg) {
    if (!window.confirm(`Delete "${cfg.name}"? This will also remove all scan history.`)) return
    setDeleting(cfg.id)
    try {
      await axiosInstance.delete(`/api/admin/swing-zones/${cfg.id}`)
      setConfigs(cs => cs.filter(c => c.id !== cfg.id))
    } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Swing Levels"
        action={<Btn variant="primary" onClick={() => navigate('/admin/swing-zones/new')}>+ Add New Swing Level</Btn>}
      />

      <Card>
        <Table headers={['Name', 'Candle Size', 'Period', 'Pivot Bars', 'Status', 'Actions']}>
          {loading && <SkeletonTable cols={6} />}
          {!loading && error && <ErrorRow cols={6} message={error} />}
          {!loading && !error && configs.length === 0 && <EmptyRow cols={6} message="No S&R configs yet" />}
          {!loading && !error && configs.map(cfg => (
            <tr key={cfg.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{cfg.name}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{SIZE_LABELS[cfg.candle_size] ?? cfg.candle_size}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{cfg.period_days}d</td>
              <td className="px-4 py-3 text-sm text-gray-600">{cfg.pivot_bars}</td>
              <td className="px-4 py-3">
                <button
                  onClick={() => handleToggle(cfg)}
                  disabled={toggling === cfg.id}
                  className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                    cfg.is_active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {toggling === cfg.id ? '…' : cfg.is_active ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Btn variant="ghost" size="sm" onClick={() => navigate(`/admin/swing-zones/${cfg.id}/edit`)}>Edit</Btn>
                  <Btn
                    variant="danger" size="sm"
                    disabled={deleting === cfg.id}
                    onClick={() => handleDelete(cfg)}
                  >
                    {deleting === cfg.id ? '…' : 'Delete'}
                  </Btn>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}
