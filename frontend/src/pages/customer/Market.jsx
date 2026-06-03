import { useState, useEffect, useCallback, useRef } from 'react'
import axiosInstance from '../../api/axiosInstance'
import { useTradingStore } from '../../store/tradingStore'

const INDEX_OPTIONS = [
  { value: 'NIFTY50',   label: 'NIFTY 50' },
  { value: 'SENSEX',    label: 'SENSEX' },
  { value: 'BANKNIFTY', label: 'BANK NIFTY' },
  { value: 'COMMODITY', label: 'COMMODITY' },
]

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(n)
}

function ChangeCell({ change, changePct }) {
  if (change == null) return <span className="text-gray-400 text-sm">—</span>
  const pos = change >= 0
  return (
    <span className={`text-sm font-medium ${pos ? 'text-green-600' : 'text-red-600'}`}>
      {pos ? '+' : ''}{change.toFixed(2)}{' '}
      <span className="text-xs">({pos ? '+' : ''}{changePct?.toFixed(2)}%)</span>
    </span>
  )
}

const MARKET_OPEN_START = { h: 9, m: 15 }
const MARKET_OPEN_END   = { h: 15, m: 30 }

function isMarketOpen() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false
  const istOffset = 5.5 * 60 * 60 * 1000
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000)
  const mins = ist.getHours() * 60 + ist.getMinutes()
  return mins >= MARKET_OPEN_START.h * 60 + MARKET_OPEN_START.m &&
         mins <= MARKET_OPEN_END.h * 60 + MARKET_OPEN_END.m
}

function OrderModal({ stock, side, mode, onClose, onSuccess }) {
  const [qty, setQty] = useState(1)
  const [orderType, setOrderType] = useState('MARKET')
  const [tradingType, setTradingType] = useState('intraday')
  const [price, setPrice] = useState(stock.ltp ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isBuy = side === 'BUY'
  const tick = stock.tick_size || 0.05
  const fillPrice = orderType === 'MARKET' ? (stock.ltp ?? 0) : parseFloat(price) || 0
  const estimated = fillPrice * qty
  const marketOpen = isMarketOpen()
  const isAMO = tradingType === 'longterm' && !marketOpen

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
    if (tradingType === 'intraday' && !marketOpen) {
      setError('Intraday orders can only be placed during market hours (9:15 AM – 3:30 PM IST).')
      return
    }
    setLoading(true)
    try {
      await axiosInstance.post('/api/customer/market/order', {
        symbol: stock.symbol,
        exchange: stock.exchange,
        transaction_type: side,
        order_type: orderType,
        quantity: qty,
        price: orderType === 'MARKET' ? (stock.ltp ?? 0) : fillPrice,
        product: tradingType === 'intraday' ? 'MIS' : (stock.exchange === 'MCX' ? 'NRML' : 'CNC'),
        mode,
      })
      onSuccess(`${side} order placed for ${qty} × ${stock.symbol}`)
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
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${isBuy ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {side}
              </span>
              <span className="font-bold text-gray-900">{stock.symbol}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{stock.name} · {stock.exchange}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900">{fmt(stock.ltp)}</p>
            {stock.change != null && (
              <p className={`text-xs ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stock.change >= 0 ? '+' : ''}{stock.change_pct?.toFixed(2)}%
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Trading Type</label>
            <div className="flex gap-3">
              {[
                { value: 'intraday', label: 'Intraday', sub: 'MIS · Square off by 3:20 PM' },
                {
                  value: 'longterm',
                  label: 'Long Term',
                  sub: stock.exchange === 'MCX' ? 'NRML · Carry forward position' : 'CNC · Delivery to demat',
                },
              ].map(opt => (
                <label
                  key={opt.value}
                  className={`flex-1 flex items-start gap-2.5 cursor-pointer rounded-xl border-2 p-3 transition-colors ${
                    tradingType === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio" name="tradingType" value={opt.value}
                    checked={tradingType === opt.value}
                    onChange={() => setTradingType(opt.value)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <p className={`text-sm font-semibold leading-tight ${tradingType === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                  </div>
                </label>
              ))}
            </div>
            {isAMO && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Market is closed — order will be queued as AMO and executed at next market open.
              </p>
            )}
            {tradingType === 'intraday' && !marketOpen && (
              <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Intraday orders require market hours (9:15 AM – 3:30 PM IST, Mon–Fri).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Order Type</label>
            <div className="flex gap-2">
              {['MARKET', 'LIMIT'].map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setOrderType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    orderType === t
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
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
              <input
                type="number" min="1" value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 text-center py-2.5 text-sm font-semibold focus:outline-none"
              />
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
              <input
                type="number" min={tick} step={tick} value={price}
                onChange={e => setPrice(e.target.value)}
                onBlur={e => setPrice(snapPrice(e.target.value))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="bg-gray-50 rounded-lg px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-500">
              {isBuy ? 'Estimated Cost' : 'Estimated Proceeds'}
            </span>
            <span className="font-bold text-gray-900">{fmt(estimated)}</span>
          </div>

          <div className={`text-xs text-center py-1.5 rounded-lg font-medium ${
            mode === 'live' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
          }`}>
            {mode === 'live' ? 'Live Order — real funds' : 'Paper Order — simulated'}
          </div>

          <button
            type="submit" disabled={loading}
            className={`w-full py-3 rounded-xl text-white font-bold text-sm transition-colors disabled:opacity-50 ${
              isBuy ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {loading ? 'Placing…' : `${side} ${stock.symbol}${isAMO ? ' (AMO)' : ''}`}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Market() {
  const { mode } = useTradingStore()
  const [selectedIndex, setSelectedIndex] = useState('NIFTY50')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [orderModal, setOrderModal] = useState(null)
  const [toast, setToast] = useState('')
  const timerRef = useRef(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const { data } = await axiosInstance.get('/api/customer/market/stocks', {
        params: { index: selectedIndex, page },
      })
      setStocks(data.stocks || [])
      setTotal(data.total || 0)
      setTotalPages(data.total_pages || 1)
      setError('')
    } catch {
      setError('Failed to load market data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedIndex, page])

  useEffect(() => {
    load()
    timerRef.current = setInterval(() => load(true), 15000)
    return () => clearInterval(timerRef.current)
  }, [load])

  function handleIndexChange(newIndex) {
    setSelectedIndex(newIndex)
    setPage(1)
    setSearch('')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const filtered = stocks.filter(s =>
    s.symbol.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const indexLabel = INDEX_OPTIONS.find(o => o.value === selectedIndex)?.label || selectedIndex
  const pageStart = (page - 1) * 50 + 1
  const pageEnd = Math.min(page * 50, total)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading {indexLabel} stocks…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-fade-in">
          <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {orderModal && (
        <OrderModal
          stock={orderModal.stock}
          side={orderModal.side}
          mode={mode}
          onClose={() => setOrderModal(null)}
          onSuccess={msg => { setOrderModal(null); showToast(msg) }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Index dropdown */}
          <select
            value={selectedIndex}
            onChange={e => handleIndexChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
          >
            {INDEX_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{indexLabel}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Live prices · {mode === 'live' ? 'Live trading active' : 'Paper trading mode'}
              {refreshing && <span className="ml-2 text-blue-500">Refreshing…</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search symbol or name…"
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            />
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
          {error} — prices may be unavailable (Kite not connected or market closed).
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left border-b border-gray-200">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Symbol</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">LTP</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Change</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((stock, idx) => {
                const pos = stock.change == null ? null : stock.change >= 0
                const rowNum = pageStart + stocks.indexOf(stock)
                return (
                  <tr key={`${stock.exchange}:${stock.symbol}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 text-gray-400 text-xs">{rowNum}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900 leading-tight">{stock.name}</p>
                      <p className="text-xs text-gray-400">{stock.exchange}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs">
                        {stock.symbol}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`font-bold text-sm ${
                        pos === null ? 'text-gray-700' : pos ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {stock.ltp != null ? fmt(stock.ltp) : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <ChangeCell change={stock.change} changePct={stock.change_pct} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => setOrderModal({ stock, side: 'BUY' })}
                          className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          BUY
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && stocks.length > 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">
                    No stocks match "{search}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs text-gray-500">
            Showing {pageStart}–{pageEnd} of {total} instruments
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-600 font-medium px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Prices auto-refresh every 15 seconds · Last traded price via Kite
      </p>
    </div>
  )
}
