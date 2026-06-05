import { useState } from 'react'

export const BACKTEST_DURATIONS = [
  { label: '1 Month',  days: 30  },
  { label: '3 Months', days: 90  },
  { label: '6 Months', days: 180 },
  { label: '1 Year',   days: 365 },
]

const EXIT_LABELS = {
  stop_loss:             { text: 'Stop Loss',       cls: 'bg-red-100 text-red-700'    },
  take_profit:           { text: 'Take Profit',     cls: 'bg-green-100 text-green-700' },
  take_profit_t1:        { text: 'Target 1',        cls: 'bg-green-100 text-green-700' },
  take_profit_t2:        { text: 'Target 2',        cls: 'bg-green-100 text-green-700' },
  take_profit_t3:        { text: 'Target 3',        cls: 'bg-green-100 text-green-700' },
  multi_target:          { text: 'Multi-Target',    cls: 'bg-emerald-100 text-emerald-700' },
  partial_book:          { text: 'Partial Book',    cls: 'bg-teal-100 text-teal-700'   },
  partial_then_sl:       { text: 'Partial → SL',    cls: 'bg-orange-100 text-orange-700' },
  first_candle_violated: { text: 'Structure Stop',  cls: 'bg-red-100 text-red-700'    },
  end_of_period:         { text: 'Period End',      cls: 'bg-gray-100 text-gray-600'  },
  exit_condition:        { text: 'Exit Cond.',      cls: 'bg-blue-100 text-blue-700'  },
}

const PAGE_SIZE = 10

function Pagination({ page, totalPages, total, pageSize, onPage }) {
  if (totalPages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)
  function pages() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4)       return [1, 2, 3, 4, 5, '…', totalPages]
    if (page >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
  }
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <span className="text-xs text-gray-500">Showing {from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {pages().map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1.5 text-xs text-gray-400">…</span>
          ) : (
            <button key={p} onClick={() => onPage(p)}
              className={`min-w-[30px] h-[30px] rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {p}
            </button>
          )
        )}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color = 'gray' }) {
  const colors = {
    green:  'border-green-200 bg-green-50',
    red:    'border-red-200 bg-red-50',
    blue:   'border-blue-200 bg-blue-50',
    gray:   'border-gray-200 bg-white',
    purple: 'border-purple-200 bg-purple-50',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.gray}`}>
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function PnlBadge({ pct }) {
  const pos = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold text-xs px-2 py-0.5 rounded-full ${pos ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {pos ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  )
}

export default function BacktestPanel({ result, error, loading, emptyHint = 'Select a strategy and duration, then run backtest.' }) {
  const [activeTab, setActiveTab] = useState('trades')
  const [tradePage, setTradePage] = useState(1)
  const [detPage,   setDetPage]   = useState(1)

  function switchTab(tab) {
    setActiveTab(tab)
    setTradePage(1)
    setDetPage(1)
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
        <svg className="w-8 h-8 animate-spin mx-auto text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <p className="text-sm text-gray-500 mt-3">Running backtest…</p>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-700">{emptyHint}</p>
        <p className="text-xs text-gray-400 mt-1">Historical data is fetched from Kite. Kite connection required.</p>
      </div>
    )
  }

  const s = result.summary
  const trades     = result.trades             || []
  const detections = result.pattern_detections || []
  const skipped    = result.skipped_dates      || []
  const tradePages = Math.ceil(trades.length / PAGE_SIZE)
  const detPages   = Math.ceil(detections.length / PAGE_SIZE)
  const tradeSlice = trades.slice((tradePage - 1) * PAGE_SIZE, tradePage * PAGE_SIZE)
  const detSlice   = detections.slice((detPage - 1) * PAGE_SIZE, detPage * PAGE_SIZE)

  return (
    <div className="space-y-5">
      {/* Period info */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-800">{result.strategy.name}</span>
          <span className="text-xs text-gray-500 ml-2">
            {result.period.from} → {result.period.to} ({result.candles_analyzed} trading days)
          </span>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${result.strategy.candle_pattern?.direction === 'bearish' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {(result.strategy.candle_pattern?.direction || 'bullish').toUpperCase()}
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Patterns Identified" value={s.total_patterns_identified} sub={`across ${result.candles_analyzed} days`} color="purple" />
        <StatCard label="Trades Executed"     value={s.total_trades_executed}     sub={`${s.winning_trades}W / ${s.losing_trades}L`} color="blue" />
        <StatCard label="Strategy Accuracy"   value={`${s.accuracy_pct}%`}        sub={`TP: ${s.take_profit_triggered}  ·  SL: ${s.stop_loss_triggered}`} color={s.accuracy_pct >= 50 ? 'green' : 'red'} />
        <StatCard label="Total P&L"           value={`₹${s.total_pnl >= 0 ? '+' : ''}${s.total_pnl.toLocaleString()}`} sub={`Avg ${s.avg_pnl_pct >= 0 ? '+' : ''}${s.avg_pnl_pct}% per trade`} color={s.total_pnl >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <StatCard label="Stop Loss Hit"   value={s.stop_loss_triggered}   color="red"   />
        <StatCard label="Take Profit Hit" value={s.take_profit_triggered} color="green" />
        <StatCard label="Winning Trades"  value={s.winning_trades}        color="green" />
        <StatCard label="Losing Trades"   value={s.losing_trades}         color="red"   />
        <StatCard label="SL %"            value={`${result.strategy.stop_loss_pct}%`}   />
        <StatCard label="TP %"            value={`${result.strategy.take_profit_pct}%`} />
      </div>

      {skipped.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-4 py-3">
          {skipped.length} detection day{skipped.length === 1 ? '' : 's'} skipped — no historical option contract was resolvable for these dates (Kite NFO retention window): {skipped.slice(0, 6).join(', ')}{skipped.length > 6 ? ` …+${skipped.length - 6}` : ''}
        </div>
      )}

      {/* Tabs + tables */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'trades',     label: `Trades (${trades.length})` },
            { id: 'detections', label: `Pattern Detections (${detections.length})` },
          ].map(tab => (
            <button key={tab.id} onClick={() => switchTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'trades' && (
          trades.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No trades executed — pattern conditions were never met in this period.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['#', 'Pattern Date', 'Entry Date', 'Entry Price', 'Exit Date', 'Exit Price', 'Exit Reason', 'P&L %', 'P&L (₹)'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tradeSlice.map((t, i) => {
                      const globalIdx = (tradePage - 1) * PAGE_SIZE + i
                      const ex = EXIT_LABELS[t.exit_reason] || { text: t.exit_reason, cls: 'bg-gray-100 text-gray-600' }
                      return (
                        <tr key={globalIdx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs">{globalIdx + 1}</td>
                          <td className="px-4 py-3 text-gray-600 font-mono text-xs">{t.detection_date}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-800">{t.entry_date}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold">₹{t.entry_price.toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-800">{t.exit_date}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold">₹{t.exit_price.toLocaleString()}</td>
                          <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ex.cls}`}>{ex.text}</span></td>
                          <td className="px-4 py-3"><PnlBadge pct={t.pnl_pct} /></td>
                          <td className={`px-4 py-3 font-semibold text-xs font-mono ${t.pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {t.pnl >= 0 ? '+' : ''}₹{t.pnl.toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={tradePage} totalPages={tradePages} total={trades.length} pageSize={PAGE_SIZE} onPage={setTradePage} />
            </>
          )
        )}

        {activeTab === 'detections' && (
          detections.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Pattern was not detected in this period.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['#', 'Date', 'Pattern', 'Open', 'High', 'Low', 'Close', 'Volume'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detSlice.map((d, i) => {
                      const globalIdx = (detPage - 1) * PAGE_SIZE + i
                      const c    = d.candle
                      const bull = c.close >= c.open
                      return (
                        <tr key={globalIdx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs">{globalIdx + 1}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">{d.date}</td>
                          <td className="px-4 py-3"><span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{d.pattern_name}</span></td>
                          <td className="px-4 py-3 font-mono text-xs">₹{c.open.toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono text-xs text-green-700 font-semibold">₹{c.high.toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono text-xs text-red-600 font-semibold">₹{c.low.toLocaleString()}</td>
                          <td className={`px-4 py-3 font-mono text-xs font-bold ${bull ? 'text-green-700' : 'text-red-600'}`}>₹{c.close.toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.volume.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={detPage} totalPages={detPages} total={detections.length} pageSize={PAGE_SIZE} onPage={setDetPage} />
            </>
          )
        )}
      </div>
    </div>
  )
}

// Reusable run-controls row (duration tabs + Run button).
export function BacktestControls({ days, onChangeDays, onRun, loading, disabled }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Duration</label>
        <div className="flex gap-1.5">
          {BACKTEST_DURATIONS.map(d => (
            <button
              key={d.days}
              type="button"
              onClick={() => onChangeDays(d.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${days === d.days ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={disabled || loading}
        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Running…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-6.518-3.76A1 1 0 007 8.232v7.536a1 1 0 001.234.97l6.518-1.882a1 1 0 00.748-.97v-1.748a1 1 0 00-.748-.97z" />
            </svg>
            Run Backtest
          </>
        )}
      </button>
    </div>
  )
}
