import { useState, useEffect } from 'react'
import axiosInstance from '../../api/axiosInstance'
import { useTradingStore } from '../../store/tradingStore'

function OrderModal({ stock, mode, onClose, onSuccess }) {
  const [qty, setQty] = useState(1)
  const [orderType, setOrderType] = useState('MARKET')
  const [price, setPrice] = useState(stock.ltp ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const tick = stock.tick_size || 0.05
  const fillPrice = orderType === 'MARKET' ? (stock.ltp ?? 0) : parseFloat(price) || 0
  const estimated = fillPrice * qty

  function snapPrice(raw) {
    const n = parseFloat(raw)
    if (!n || !tick) return raw
    return (Math.round(n / tick) * tick).toFixed(
      tick < 1 ? String(tick).split('.')[1]?.length ?? 2 : 0
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (qty <= 0) { setError('Quantity must be at least 1'); return }
    if (orderType === 'LIMIT' && fillPrice <= 0) { setError('Enter a valid price'); return }
    setLoading(true)
    try {
      await axiosInstance.post('/api/customer/market/order', {
        symbol: stock.symbol,
        exchange: stock.exchange,
        transaction_type: 'SELL',
        order_type: orderType,
        quantity: qty,
        price: orderType === 'MARKET' ? (stock.ltp ?? 0) : fillPrice,
        mode,
      })
      onSuccess(`SELL order placed for ${qty} × ${stock.symbol}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Order failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">SELL</span>
              <span className="font-bold text-gray-900">{stock.symbol}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{stock.name || stock.symbol} · {stock.exchange}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900">{fmt(stock.ltp)}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Order Type</label>
            <div className="flex gap-2">
              {['MARKET', 'LIMIT'].map(t => (
                <button key={t} type="button" onClick={() => setOrderType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    orderType === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity</label>
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 font-bold text-lg leading-none">−</button>
              <input type="number" min="1" value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 text-center py-2.5 text-sm font-semibold focus:outline-none" />
              <button type="button" onClick={() => setQty(q => q + 1)}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 font-bold text-lg leading-none">+</button>
            </div>
          </div>

          {orderType === 'LIMIT' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Limit Price (₹)
                <span className="ml-1 text-gray-400 font-normal">tick: {tick}</span>
              </label>
              <input type="number" min={tick} step={tick} value={price}
                onChange={e => setPrice(e.target.value)}
                onBlur={e => setPrice(snapPrice(e.target.value))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          <div className="bg-gray-50 rounded-lg px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-500">Estimated Proceeds</span>
            <span className="font-bold text-gray-900">{fmt(estimated)}</span>
          </div>

          <div className={`text-xs text-center py-1.5 rounded-lg font-medium ${
            mode === 'live' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
          }`}>
            {mode === 'live' ? 'Live Order — real funds' : 'Paper Order — simulated'}
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition-colors disabled:opacity-50 bg-red-600 hover:bg-red-700">
            {loading ? 'Placing…' : `SELL ${stock.symbol}`}
          </button>
        </form>
      </div>
    </div>
  )
}

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

function PnlCell({ value }) {
  if (value == null) return <span className="text-gray-400">—</span>
  const pos = value >= 0
  return (
    <span className={`font-semibold ${pos ? 'text-green-600' : 'text-red-600'}`}>
      {pos ? '+' : ''}{fmt(value)}
    </span>
  )
}

function EmptyState({ message }) {
  return (
    <div className="py-12 text-center text-gray-400 text-sm">{message}</div>
  )
}

export default function Portfolio() {
  const { mode } = useTradingStore()
  const [positions, setPositions] = useState(null)
  const [virtualAccount, setVirtualAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sellModal, setSellModal] = useState(null)
  const [toast, setToast] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [posRes, dashRes] = await Promise.all([
          axiosInstance.get('/api/customer/positions'),
          axiosInstance.get('/api/customer/dashboard'),
        ])
        setPositions(posRes.data)
        setVirtualAccount(dashRes.data.virtual_account || null)
      } catch {
        setError('Failed to load portfolio data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [mode])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading portfolio…
      </div>
    )
  }

  const paperPositions = positions?.paper_positions || []
  const liveHoldings = positions?.live_holdings || []
  const isLive = mode === 'live'

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl flex items-center gap-3">
          <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {sellModal && (
        <OrderModal
          stock={sellModal}
          mode={mode}
          onClose={() => setSellModal(null)}
          onSuccess={msg => { setSellModal(null); showToast(msg) }}
        />
      )}

      <div>
        <h1 className="text-xl font-bold text-gray-900">Portfolio</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isLive ? 'Live holdings from your Kite account' : 'Simulated paper trading positions'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* ── Paper Mode ── */}
      {!isLive && (
        <div className="space-y-4">
          {/* Balance card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Virtual Cash</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(virtualAccount?.balance)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Initial Balance</p>
              <p className="text-2xl font-bold text-gray-700 mt-1">{fmt(virtualAccount?.initial_balance)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Realised P&amp;L</p>
              <PnlCell value={virtualAccount?.total_realised_pnl} />
            </div>
          </div>

          {/* Positions table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 text-sm">
                Open Positions
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Paper</span>
              </h2>
            </div>
            {paperPositions.length === 0 ? (
              <EmptyState message="No open simulated positions." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {['Symbol', 'Exchange', 'Qty', 'Avg Price', 'LTP', 'Unrealised P&L', 'Action'].map(h => (
                        <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paperPositions.map((p, i) => {
                      const unrealised = p.unrealised_pnl ??
                        (p.ltp != null && p.avg_price != null
                          ? (p.ltp - p.avg_price) * (p.quantity ?? 0)
                          : null)
                      return (
                        <tr key={p.id ?? i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 font-medium text-gray-900">{p.symbol || p.tradingsymbol || '—'}</td>
                          <td className="px-5 py-3 text-gray-600">{p.exchange || '—'}</td>
                          <td className="px-5 py-3 text-gray-700">{p.quantity ?? '—'}</td>
                          <td className="px-5 py-3 text-gray-700">{fmt(p.avg_price)}</td>
                          <td className="px-5 py-3 text-gray-700">{fmt(p.ltp)}</td>
                          <td className="px-5 py-3"><PnlCell value={unrealised} /></td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => setSellModal({ symbol: p.symbol || p.tradingsymbol, exchange: p.exchange, ltp: p.ltp })}
                              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                              SELL
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Live Mode ── */}
      {isLive && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">
              Kite Holdings
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Live</span>
            </h2>
          </div>
          {liveHoldings.length === 0 ? (
            <EmptyState message="No live holdings found. Connect your Kite account or start a live session." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Symbol', 'Exchange', 'Qty', 'Avg Price', 'LTP', 'Current Value', 'P&L', 'Action'].map(h => (
                      <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {liveHoldings.map((h, i) => {
                    const pnl = h.pnl ?? (h.last_price != null && h.average_price != null
                      ? (h.last_price - h.average_price) * (h.quantity ?? 0)
                      : null)
                    return (
                      <tr key={h.tradingsymbol ?? i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">{h.tradingsymbol || h.symbol || '—'}</td>
                        <td className="px-5 py-3 text-gray-600">{h.exchange || '—'}</td>
                        <td className="px-5 py-3 text-gray-700">{h.quantity ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-700">{fmt(h.average_price)}</td>
                        <td className="px-5 py-3 text-gray-700">{fmt(h.last_price)}</td>
                        <td className="px-5 py-3 text-gray-700">{fmt(h.value ?? (h.last_price != null ? h.last_price * (h.quantity ?? 0) : null))}</td>
                        <td className="px-5 py-3"><PnlCell value={pnl} /></td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => setSellModal({ symbol: h.tradingsymbol || h.symbol, exchange: h.exchange, ltp: h.last_price })}
                            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors"
                          >
                            SELL
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
