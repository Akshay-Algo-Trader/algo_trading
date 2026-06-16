import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import axiosInstance from '../../api/axiosInstance'
import BacktestPanel, { BacktestControls, defaultDateRange } from '../../components/BacktestPanel'
import { PageHeader } from '../../components/admin/TableHelpers'

function StrategyBacktestTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialId = searchParams.get('strategy') || ''

  const [strategies, setStrategies] = useState([])
  const [selectedId, setSelectedId] = useState(initialId)
  const [startDate,  setStartDate]  = useState(defaultDateRange().startDate)
  const [endDate,    setEndDate]    = useState(defaultDateRange().endDate)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState('')

  useEffect(() => {
    axiosInstance.get('/api/admin/strategies')
      .then(r => {
        const list = r.data?.strategies || []
        setStrategies(list)
        if (!selectedId && list.length > 0) setSelectedId(String(list[0].id))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleRun() {
    if (!selectedId) return
    setLoading(true); setResult(null); setError('')
    try {
      const { data } = await axiosInstance.post('/api/admin/backtest', {
        strategy_id: Number(selectedId),
        start_date: startDate,
        end_date: endDate,
      })
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Backtest failed')
    } finally {
      setLoading(false)
    }
  }

  function handleStrategyChange(id) {
    setSelectedId(id)
    setResult(null); setError('')
    setSearchParams(id ? { strategy: id } : {})
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-4 mb-6">
        <div className="flex-1 min-w-[260px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Strategy</label>
          <select
            value={selectedId}
            onChange={e => handleStrategyChange(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
          >
            {strategies.length === 0 && <option value="">No strategies available</option>}
            {strategies.map(st => (
              <option key={st.id} value={st.id}>
                {st.name} — {st.instrument} ({st.exchange})
                {st.option_config?.enabled ? ` · options ${st.option_config.underlying}` : ''}
              </option>
            ))}
          </select>
        </div>
        <BacktestControls
          startDate={startDate}
          endDate={endDate}
          onChangeStart={setStartDate}
          onChangeEnd={setEndDate}
          onRun={handleRun}
          loading={loading}
          disabled={!selectedId}
        />
      </div>

      <BacktestPanel
        result={result}
        loading={loading}
        error={error}
        emptyHint="Pick a strategy, choose a date range, and click Run Backtest"
      />
    </div>
  )
}

export default function AdminBacktest() {
  return (
    <div>
      <PageHeader title="Backtest" />
      <p className="-mt-3 mb-5 text-sm text-gray-500">
        Replay strategies against historical data to validate performance.
      </p>

      <StrategyBacktestTab />
    </div>
  )
}
