import { useState, useEffect } from 'react'
import axiosInstance from '../../api/axiosInstance'
import BacktestPanel, { BacktestControls, defaultDateRange } from '../../components/BacktestPanel'

export default function Backtest() {
  const [strategies, setStrategies] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [startDate,  setStartDate]  = useState(defaultDateRange().startDate)
  const [endDate,    setEndDate]    = useState(defaultDateRange().endDate)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState('')

  useEffect(() => {
    axiosInstance.get('/api/customer/strategies')
      .then(r => {
        const list = r.data?.strategies || []
        setStrategies(list)
        if (list.length > 0) setSelectedId(String(list[0].id))
      })
      .catch(() => {})
  }, [])

  async function handleRun() {
    if (!selectedId) return
    setLoading(true)
    setResult(null)
    setError('')
    try {
      const { data } = await axiosInstance.post('/api/customer/backtest', {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Strategy Backtest</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Simulate your strategy against historical Kite data to evaluate performance.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Strategy</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {strategies.length === 0 && <option value="">No strategies assigned</option>}
            {strategies.map(st => (
              <option key={st.id} value={st.id}>
                {st.name} — {st.instrument} ({st.exchange})
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
        emptyHint="Select a strategy and date range, then run backtest"
      />
    </div>
  )
}
