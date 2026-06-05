import { useState } from 'react'
import axiosInstance from '../api/axiosInstance'
import { BACKTEST_DURATIONS } from './BacktestPanel'

export const SCAN_UNIVERSES = [
  { value: 'NIFTY50',   label: 'NIFTY 50 stocks',  hint: '50 NSE equities' },
  { value: 'SENSEX',    label: 'SENSEX 30',        hint: '30 BSE equities' },
  { value: 'BANKNIFTY', label: 'BANKNIFTY',        hint: '12 NSE bank stocks' },
  { value: 'INDICES',   label: 'Major Indices',    hint: 'NIFTY/SENSEX index list' },
  { value: 'ALL',       label: 'All of the above', hint: '~110 instruments (slow)' },
]

function MatchBar({ count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function PatternScanPanel({
  patterns,          // list of {id, name, direction, ...}
  patternId,         // selected pattern id (controlled)
  onPatternChange,   // (id) => void  — set to null to hide the picker
  lockedPattern,     // when set, used INSTEAD of the dropdown (for the modal use-case)
}) {
  const [universe, setUniverse] = useState('NIFTY50')
  const [days,     setDays]     = useState(90)
  const [applyFilters, setApplyFilters] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState('')

  const activePatternId = lockedPattern?.id ?? patternId

  async function handleRun() {
    if (!activePatternId) { setError('Pick a pattern first'); return }
    setLoading(true); setResult(null); setError('')
    try {
      const { data } = await axiosInstance.post('/api/admin/pattern-scan', {
        pattern_id: Number(activePatternId),
        universe,
        days,
        apply_indicator_filters: applyFilters,
      })
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Pattern scan failed')
    } finally {
      setLoading(false)
    }
  }

  const results = result?.results || []
  const errors  = result?.errors  || []
  const maxCount = results.reduce((m, r) => Math.max(m, r.match_count), 0)
  const monthsCovered = (days / 30).toFixed(1)

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        {!lockedPattern && onPatternChange && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pattern</label>
            <select
              value={patternId || ''}
              onChange={e => onPatternChange(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
            >
              {(!patterns || patterns.length === 0) && <option value="">No patterns available</option>}
              {(patterns || []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.direction})
                </option>
              ))}
            </select>
          </div>
        )}

        {lockedPattern && (
          <div className="text-sm text-gray-700">
            <span className="font-semibold">{lockedPattern.name}</span>
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-semibold ${lockedPattern.direction === 'bearish' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {(lockedPattern.direction || 'bullish').toUpperCase()}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Universe</label>
            <select
              value={universe}
              onChange={e => setUniverse(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#eb5202]"
            >
              {SCAN_UNIVERSES.map(u => (
                <option key={u.value} value={u.value}>
                  {u.label} — {u.hint}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Window</label>
            <div className="flex gap-1.5">
              {BACKTEST_DURATIONS.map(d => (
                <button
                  key={d.days}
                  type="button"
                  onClick={() => setDays(d.days)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${days === d.days ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >{d.label}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none mb-1">
            <input
              type="checkbox"
              checked={applyFilters}
              onChange={e => setApplyFilters(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            Apply pattern's indicator filters
          </label>
          <button
            type="button"
            onClick={handleRun}
            disabled={!activePatternId || loading}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors ml-auto"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Scanning…
              </>
            ) : (
              'Run Scan'
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          The scan fetches daily candles from Kite for every instrument in the universe and walks them forward. Larger universes take longer (Kite rate limit ≈ 3 req/sec).
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {loading && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <svg className="w-8 h-8 animate-spin mx-auto text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-sm text-gray-500 mt-3">Scanning universe…</p>
        </div>
      )}

      {!loading && result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">Instruments Scanned</p>
              <p className="text-2xl font-bold text-gray-900">{result.instruments_scanned}</p>
              <p className="text-xs text-gray-500 mt-0.5">over {monthsCovered} months</p>
            </div>
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">Instruments with Matches</p>
              <p className="text-2xl font-bold text-gray-900">{results.filter(r => r.match_count > 0).length}</p>
              <p className="text-xs text-gray-500 mt-0.5">{results.filter(r => r.match_count === 0).length} had zero</p>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">Top Match Count</p>
              <p className="text-2xl font-bold text-gray-900">{maxCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {results[0] ? `${results[0].symbol} (${results[0].exchange})` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">Total Matches</p>
              <p className="text-2xl font-bold text-gray-900">
                {results.reduce((s, r) => s + r.match_count, 0)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">across all instruments</p>
            </div>
          </div>

          {/* Results table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">
                Match counts by instrument
              </h3>
              <span className="text-xs text-gray-500">{result.period.from} → {result.period.to}</span>
            </div>
            {results.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No instruments matched the pattern in this window.</div>
            ) : (
              <div className="max-h-[450px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">#</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Symbol</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Exchange</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Matches</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-40">Frequency</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">~Per Month</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Recent Sample</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.map((r, i) => {
                      const perMonth = r.days_covered > 0 ? (r.match_count * 21 / r.days_covered) : 0
                      const sample = r.matches.slice(-3).map(m => m.date).join(', ')
                      return (
                        <tr key={`${r.exchange}:${r.symbol}`} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-400 font-mono text-xs">{i + 1}</td>
                          <td className="px-4 py-2 font-mono font-semibold text-xs text-gray-900">{r.symbol}</td>
                          <td className="px-4 py-2">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{r.exchange}</span>
                          </td>
                          <td className="px-4 py-2 font-bold text-blue-700">{r.match_count}</td>
                          <td className="px-4 py-2"><MatchBar count={r.match_count} max={maxCount} /></td>
                          <td className="px-4 py-2 text-xs text-gray-600">{perMonth.toFixed(1)}</td>
                          <td className="px-4 py-2 text-xs text-gray-500 font-mono truncate max-w-[260px]">
                            {sample || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-4 py-3">
              {errors.length} instrument{errors.length === 1 ? '' : 's'} couldn't be scanned (instrument not found or Kite error): {errors.slice(0, 5).map(e => `${e.exchange}:${e.symbol}`).join(', ')}{errors.length > 5 ? ` …+${errors.length - 5}` : ''}
            </div>
          )}
        </>
      )}

      {!loading && !result && !error && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <p className="text-sm font-semibold text-gray-700">Pick a universe, window, and click Run Scan</p>
          <p className="text-xs text-gray-400 mt-1">Results are sorted by match count — top of list = best instrument for this pattern.</p>
        </div>
      )}
    </div>
  )
}
