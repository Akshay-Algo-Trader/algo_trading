import { useState, useRef, useEffect } from 'react'
import axiosInstance from '../../api/axiosInstance'

export default function InstrumentSearch({ value, onSelect, placeholder = 'e.g. SBIN, NIFTY50' }) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [noResults, setNoResults] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const timerRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function search(q) {
    clearTimeout(timerRef.current)
    if (q.length < 2) { setSuggestions([]); setOpen(false); setNoResults(false); return }
    timerRef.current = setTimeout(async () => {
      setBusy(true)
      try {
        const res = await axiosInstance.get(`/api/admin/instruments?q=${encodeURIComponent(q)}`)
        const list = res.data.instruments?.slice(0, 20) || []
        setSuggestions(list)
        setNoResults(list.length === 0)
        setOpen(true)
      } catch { setSuggestions([]); setNoResults(false) }
      finally { setBusy(false) }
    }, 300)
  }

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    setSyncMsg('')
    search(q)
  }

  function handleSelect(item) {
    setQuery(item.symbol)
    setSuggestions([])
    setOpen(false)
    setNoResults(false)
    onSelect(item.symbol, item.exchange)
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await axiosInstance.post('/api/admin/instruments/sync')
      setSyncMsg(res.data.message)
      setOpen(false)
      setNoResults(false)
      // Re-run search with current query after sync
      if (query.length >= 2) search(query)
    } catch (ex) {
      setSyncMsg(ex.response?.data?.error ?? 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
      {busy && (
        <span className="absolute right-3 top-2.5 text-xs text-gray-400">…</span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg text-sm">
          {suggestions.map((item, i) => (
            <li
              key={i}
              onMouseDown={() => handleSelect(item)}
              className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-orange-50"
            >
              <span className="font-medium text-gray-900 shrink-0">{item.symbol}</span>
              <span className="text-xs text-gray-400 truncate">{item.exchange} · {item.name}</span>
            </li>
          ))}
        </ul>
      )}
      {open && noResults && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg p-3 text-sm">
          <p className="text-gray-500 mb-2">No instruments found for "{query}".</p>
          <button
            type="button"
            onMouseDown={handleSync}
            disabled={syncing}
            className="text-xs font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
          >
            {syncing ? 'Syncing from Kite…' : 'Sync instruments from Kite'}
          </button>
        </div>
      )}
      {syncMsg && (
        <p className="mt-1 text-xs text-green-600">{syncMsg}</p>
      )}
    </div>
  )
}
