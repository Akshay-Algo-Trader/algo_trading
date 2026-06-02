import { useState, useEffect } from 'react'
import axiosInstance from '../../api/axiosInstance'
import { useTradingStore } from '../../store/tradingStore'

function StrategyCard({ strategy, activeSessionId, onActivate, activating, mode, kiteConnected }) {
  const isActivating = activating === strategy.id
  const hasSession = !!activeSessionId
  const liveBlocked = mode === 'live' && !kiteConnected

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{strategy.name}</h3>
          {strategy.description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{strategy.description}</p>
          )}
        </div>
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${strategy.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {strategy.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 font-medium">Instrument</p>
          <p className="font-semibold text-gray-800 mt-0.5">{strategy.instrument || '—'}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 font-medium">Exchange</p>
          <p className="font-semibold text-gray-800 mt-0.5">{strategy.exchange || '—'}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-red-400 font-medium">Stop Loss</p>
          <p className="font-semibold text-red-600 mt-0.5">
            {strategy.stop_loss_pct != null ? `${strategy.stop_loss_pct}%` : '—'}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-green-500 font-medium">Take Profit</p>
          <p className="font-semibold text-green-600 mt-0.5">
            {strategy.take_profit_pct != null ? `${strategy.take_profit_pct}%` : '—'}
          </p>
        </div>
      </div>

      {/* Entry condition */}
      {strategy.entry_condition && (
        <div>
          <p className="text-xs text-gray-400 font-medium mb-1">Entry Condition</p>
          <pre className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">
            {typeof strategy.entry_condition === 'object'
              ? JSON.stringify(strategy.entry_condition, null, 2)
              : strategy.entry_condition}
          </pre>
        </div>
      )}

      {/* Activate button */}
      <button
        onClick={() => onActivate(strategy.id)}
        disabled={hasSession || isActivating || !strategy.is_active || liveBlocked}
        className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          hasSession || !strategy.is_active || liveBlocked
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
        title={
          liveBlocked ? 'Kite not connected — contact admin'
          : hasSession ? 'Stop the current active session first'
          : undefined
        }
      >
        {isActivating ? 'Activating…'
          : hasSession ? 'Session Already Active'
          : liveBlocked ? '🔒 Kite Not Connected'
          : 'Activate Strategy'}
      </button>
    </div>
  )
}

export default function Strategies() {
  const { mode } = useTradingStore()
  const [strategies, setStrategies] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [kiteConnected, setKiteConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [stratRes, dashRes] = await Promise.all([
          axiosInstance.get('/api/customer/strategies'),
          axiosInstance.get('/api/customer/dashboard'),
        ])
        setStrategies(stratRes.data.strategies || [])
        setActiveSession(dashRes.data.active_session || null)
        setKiteConnected(dashRes.data.kite?.is_connected === true)
      } catch {
        setError('Failed to load strategies.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleActivate(strategyId) {
    if (mode === 'live' && !kiteConnected) {
      setError('Kite account is not connected. Contact your admin to enable live trading.')
      return
    }
    setActivating(strategyId)
    setError('')
    setSuccess('')
    try {
      await axiosInstance.post('/api/customer/session/start', {
        strategy_id: strategyId,
        mode,
      })
      setSuccess(`Strategy activated in ${mode} mode!`)
      // Refresh session state
      const dashRes = await axiosInstance.get('/api/customer/dashboard')
      setActiveSession(dashRes.data.active_session || null)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to activate strategy.')
    } finally {
      setActivating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading strategies…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Strategies</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Assigned strategies — activate one per session in{' '}
            <span className={`font-semibold ${mode === 'live' ? 'text-green-600' : 'text-blue-600'}`}>
              {mode}
            </span>{' '}
            mode.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {mode === 'live' && !kiteConnected && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span><strong>Kite not connected.</strong> Live trading is unavailable. Contact your admin to link your Kite account.</span>
        </div>
      )}

      {activeSession && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          A session is currently active. Stop it from the Dashboard before activating another strategy.
        </div>
      )}

      {strategies.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          No strategies have been assigned to your account yet. Contact your admin.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {strategies.map(s => (
            <StrategyCard
              key={s.id}
              strategy={s}
              activeSessionId={activeSession?.id}
              onActivate={handleActivate}
              activating={activating}
              mode={mode}
              kiteConnected={kiteConnected}
            />
          ))}
        </div>
      )}
    </div>
  )
}
