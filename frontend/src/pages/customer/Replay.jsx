import { useState, useEffect, useCallback } from 'react'
import axiosInstance from '../../api/axiosInstance'
import { useStrategyExecutor } from '../../hooks/useStrategyExecutor'
import ExecutorPanel from '../../components/customer/ExecutorPanel'

// Format a Date as a `datetime-local` value ('YYYY-MM-DDTHH:MM') in local time.
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Convert browser local time (from datetime-local input) to IST.
// The input string is in browser's local timezone, but backend expects IST.
// We adjust the time to compensate for the timezone difference.
function browserLocalToIST(datetimeLocalStr) {
  if (!datetimeLocalStr) return ''

  // Parse the datetime-local string (e.g., "2026-06-15T09:15")
  // This is interpreted as browser local time
  const [datePart, timePart] = datetimeLocalStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)

  // Create a Date object in browser local time
  const d = new Date(year, month - 1, day, hours, minutes, 0)

  // Get browser's UTC offset in minutes (negative means behind UTC)
  const browserOffsetMinutes = d.getTimezoneOffset()
  // IST is UTC+5:30 = 330 minutes ahead of UTC, so offset is -330
  const istOffsetMinutes = -330

  // Difference: if browser is UTC-5 (300), and IST is UTC+5:30 (-330),
  // then we need to add (300 - (-330)) = 630 minutes = 10.5 hours
  const timeDiffMinutes = browserOffsetMinutes - istOffsetMinutes

  // Adjust the date by the difference to get what the time should be in IST
  const adjustedD = new Date(d.getTime() + timeDiffMinutes * 60 * 1000)

  // Format back to datetime-local format
  return toLocalInput(adjustedD)
}

function defaultReplayStart() {
  const d = new Date(Date.now() - 7 * 86400000)
  d.setHours(9, 15, 0, 0)
  return toLocalInput(d)
}

export default function Replay() {
  const [strategies, setStrategies]   = useState([])
  const [kiteConnected, setKite]      = useState(false)
  const [activeSession, setSession]   = useState(null)
  const [activeStrategy, setStrategy] = useState(null)
  const [selectedId, setSelectedId]   = useState('')
  const [replayStartDate, setReplayStartDate] = useState(() => {
    const d = new Date(Date.now() - 7 * 86400000)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  })
  const [replayStartTime, setReplayStartTime] = useState('09:15')
  const [loading, setLoading]         = useState(true)
  const [starting, setStarting]       = useState(false)
  const [stopping, setStopping]       = useState(false)
  const [finished, setFinished]       = useState(false)
  const [paused, setPaused]           = useState(false)
  const [lastLtp, setLastLtp]         = useState(null)
  const [error, setError]             = useState('')
  const [notice, setNotice]           = useState('')
  const [resuming, setResuming]       = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [stratRes, dashRes] = await Promise.all([
        axiosInstance.get('/api/customer/strategies'),
        axiosInstance.get('/api/customer/dashboard'),
      ])
      const list = stratRes.data.strategies || []
      setStrategies(list)
      setKite(dashRes.data.kite?.is_connected === true)

      const sess = dashRes.data.active_session || null
      if (sess && sess.mode === 'replay') {
        setSession(sess)
        setStrategy(sess.strategy || null)
        setNotice('')
      } else {
        setSession(null)
        setStrategy(null)
        setNotice(sess ? `A ${sess.mode} session is currently active — stop it before starting a replay.` : '')
      }
      setSelectedId(prev => {
        if (prev) return prev
        const equity = list.find(s => !s.option_config?.enabled) || list[0]
        return equity ? String(equity.id) : ''
      })
    } catch {
      setError('Failed to load strategies.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Replay exited: pause and keep the chart/panel mounted so the run can be studied.
  // Session/strategy stay set; only `paused` flips (not finished yet).
  const handleSessionStop = useCallback((stopData) => {
    // Only pause if we have an exit price (natural exit, not manual stop)
    if (stopData?.exitPrice) {
      setPaused(true)
      setLastLtp(stopData.exitPrice)
    }
  }, [])

  // Tear down to the form — engine start failures have no chart to study.
  const handleError = useCallback((msg) => {
    setError(msg)
    setSession(null)
    setStrategy(null)
    setFinished(false)
    loadData()
  }, [loadData])

  // "New Replay" — discard the finished run and return to the setup form.
  const handleReset = useCallback(() => {
    setSession(null)
    setStrategy(null)
    setFinished(false)
    setPaused(false)
    setLastLtp(null)
    setError('')
    loadData()
  }, [loadData])

  const { phase, ltp, entryPrice, logs, patternDetected, planState, replay } = useStrategyExecutor({
    session: activeSession,
    strategy: activeStrategy,
    mode: 'replay',
    onSessionStop: handleSessionStop,
    onError: handleError,
  })

  const selectedStrategy = strategies.find(s => String(s.id) === String(selectedId)) || null
  const optionBlocked = Boolean(selectedStrategy?.option_config?.enabled)
  const startDisabled = !selectedId || !replayStartDate || !replayStartTime || optionBlocked || !kiteConnected || starting || Boolean(activeSession)

  async function handleStart() {
    if (startDisabled) return
    setStarting(true); setError(''); setNotice('')
    try {
      // User enters date and time in IST
      // Convert to UTC (which is unambiguous) for the backend
      const [hours, minutes] = replayStartTime.split(':').map(Number)
      const [year, month, day] = replayStartDate.split('-').map(Number)

      // Create a date as if it's in IST, then convert to UTC
      // IST = UTC + 5:30, so UTC = IST - 5:30
      const istDate = new Date(year, month - 1, day, hours, minutes, 0)
      const utcDate = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000))

      const p = (n) => String(n).padStart(2, '0')
      const utcTimeString = `${utcDate.getUTCFullYear()}-${p(utcDate.getUTCMonth() + 1)}-${p(utcDate.getUTCDate())}T${p(utcDate.getUTCHours())}:${p(utcDate.getUTCMinutes())}:00Z`

      await axiosInstance.post('/api/customer/session/start', {
        strategy_id: Number(selectedId), mode: 'replay', replay_start: utcTimeString,
      })
      const dashRes = await axiosInstance.get('/api/customer/dashboard')
      const sess = dashRes.data.active_session || null
      setSession(sess)
      setStrategy(sess?.strategy || null)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to start replay.')
    } finally {
      setStarting(false)
    }
  }

  async function handleManualStop() {
    setStopping(true)
    try {
      await axiosInstance.post('/api/customer/session/stop')
      // Keep the panel/chart mounted so the stopped run can still be studied.
      setFinished(true)
    } catch {
      setError('Failed to stop replay.')
    } finally {
      setStopping(false)
    }
  }

  async function handleResume() {
    if (!activeStrategy || !lastLtp) return
    setResuming(true)
    setError('')
    try {
      // Stop current session
      await axiosInstance.post('/api/customer/session/stop')

      // Start new session from the next day at 9:15 AM IST
      // Convert to UTC: 09:15 IST = 03:45 UTC
      const nextDay = new Date()
      nextDay.setDate(nextDay.getDate() + 1)
      nextDay.setHours(9, 15, 0, 0)

      // Convert IST to UTC
      const utcDate = new Date(nextDay.getTime() - (5.5 * 60 * 60 * 1000))

      const p = (n) => String(n).padStart(2, '0')
      const utcTimeString = `${utcDate.getUTCFullYear()}-${p(utcDate.getUTCMonth() + 1)}-${p(utcDate.getUTCDate())}T${p(utcDate.getUTCHours())}:${p(utcDate.getUTCMinutes())}:00Z`

      await axiosInstance.post('/api/customer/session/start', {
        strategy_id: activeStrategy.id,
        mode: 'replay',
        replay_start: utcTimeString,
      })

      // Reset paused state and reload
      setPaused(false)
      setLastLtp(null)
      const dashRes = await axiosInstance.get('/api/customer/dashboard')
      const sess = dashRes.data.active_session || null
      setSession(sess)
      setStrategy(sess?.strategy || null)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to resume replay.')
    } finally {
      setResuming(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Replay</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Re-run a strategy over historical candles as if it were live — pick a past start time and
          watch it step forward one candle every second. Fully separate from Paper &amp; Live;
          nothing here touches your paper balance or order history.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}
      {notice && !activeSession && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">{notice}</div>
      )}
      {!kiteConnected && !activeSession && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          Connect your Kite account to fetch historical data for replay.
        </div>
      )}

      {activeSession && activeStrategy ? (
        <ExecutorPanel
          session={activeSession}
          strategy={activeStrategy}
          phase={phase}
          ltp={ltp}
          entryPrice={entryPrice}
          logs={logs}
          patternDetected={patternDetected}
          planState={planState}
          replay={replay}
          stopLabel="Stop Replay"
          onStop={handleManualStop}
          paused={paused}
          onResume={handleResume}
          resuming={resuming}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Strategy</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {strategies.length === 0 && <option value="">No strategies assigned</option>}
              {strategies.map(st => (
                <option key={st.id} value={st.id} disabled={st.option_config?.enabled}>
                  {st.name} — {st.instrument} ({st.exchange})
                  {st.option_config?.enabled ? ' · options (not supported in Replay)' : ''}
                </option>
              ))}
            </select>
            {optionBlocked && (
              <p className="text-xs text-amber-600 mt-1">
                Option strategies aren&apos;t supported in Replay yet — pick an equity/index strategy.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Replay from (IST - India Standard Time)</label>
              <p className="text-xs text-gray-500 mb-2">
                Enter the date and time in IST. Market opens at 09:15 AM IST.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date (IST)</label>
                <input
                  type="date"
                  value={replayStartDate}
                  onChange={e => setReplayStartDate(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Time (IST)</label>
                <input
                  type="time"
                  value={replayStartTime}
                  onChange={e => setReplayStartTime(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Enter date and time in <strong>IST (India Standard Time)</strong>. This is what the replay will start from exactly.
            </p>
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={startDisabled}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {starting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Starting…
              </>
            ) : 'Start Replay'}
          </button>
        </div>
      )}

      {stopping && <p className="text-xs text-gray-400">Stopping…</p>}
    </div>
  )
}
