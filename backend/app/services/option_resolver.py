"""
Resolve a tradeable NFO/BFO option contract from a strategy's option_config.

When a strategy has option_config.enabled, the TradingEngine still detects
patterns on the underlying index, but at entry it needs the actual option
contract (tradingsymbol, exchange, instrument_token) so it can place a
BUY CE / BUY PE on Kite. This module owns that resolution.

Resolution is deterministic given (underlying, direction, strike_selection,
expiry, ltp_at_entry, as_of). The Kite NFO/BFO instruments dump is large so
it is cached per-exchange in-process.
"""

import logging
import threading
from datetime import date, datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


_OPTION_META = {
    'NIFTY': {
        'underlying_symbol':   'NIFTY 50',
        'underlying_exchange': 'NSE',
        'nfo_name':            'NIFTY',
        'option_exchange':     'NFO',
        'strike_step':         50,
    },
    'SENSEX': {
        'underlying_symbol':   'SENSEX',
        'underlying_exchange': 'BSE',
        'nfo_name':            'SENSEX',
        'option_exchange':     'BFO',
        'strike_step':         100,
    },
    'BANKNIFTY': {
        'underlying_symbol':   'NIFTY BANK',
        'underlying_exchange': 'NSE',
        'nfo_name':            'BANKNIFTY',
        'option_exchange':     'NFO',
        'strike_step':         100,
    },
}


_CACHE_TTL_SECONDS = 3600
_instruments_cache: dict[str, list] = {}
_instruments_cache_ts: dict[str, datetime] = {}
_instruments_cache_lock = threading.Lock()


def meta_for(underlying: str) -> Optional[dict]:
    return _OPTION_META.get(underlying.upper()) if underlying else None


def _cached_instruments(kite, exchange: str) -> list:
    now = datetime.now(timezone.utc)
    with _instruments_cache_lock:
        ts = _instruments_cache_ts.get(exchange)
        if ts is not None and (now - ts).total_seconds() < _CACHE_TTL_SECONDS:
            return _instruments_cache[exchange]
        try:
            rows = kite.instruments(exchange)
        except Exception as exc:
            logger.warning("Failed to fetch %s instruments from Kite: %s", exchange, exc)
            return _instruments_cache.get(exchange, [])
        _instruments_cache[exchange] = rows
        _instruments_cache_ts[exchange] = now
        logger.info("Option resolver cache refreshed for %s: %d rows", exchange, len(rows))
        return rows


def _pick_expiry(expiries_sorted: list[date], policy: str, as_of: date) -> Optional[date]:
    future = [d for d in expiries_sorted if d >= as_of]
    if not future:
        return None
    if policy == 'current_week':
        return future[0]
    if policy == 'next_week':
        return future[1] if len(future) > 1 else future[0]
    if policy == 'current_month':
        same_month = [d for d in future if d.year == as_of.year and d.month == as_of.month]
        if same_month:
            return same_month[-1]
        next_month = [d for d in future if (d.year, d.month) != (as_of.year, as_of.month)]
        return next_month[0] if next_month else future[-1]
    return future[0]


def resolve_option_contract(
    underlying: str,
    direction: str,
    strike_selection: str,
    expiry: str,
    ltp_at_entry: float,
    kite,
    as_of: Optional[date] = None,
) -> Optional[dict]:
    """
    Return a dict for the resolved contract, or None if no match found.

    Dict shape:
      tradingsymbol, exchange, instrument_token, strike, expiry (ISO),
      option_type ('CE'|'PE'), lot_size
    """
    meta = meta_for(underlying)
    if not meta:
        logger.warning("Unknown underlying %r in option resolver", underlying)
        return None

    step = meta['strike_step']
    atm = round(ltp_at_entry / step) * step
    offset = {'ATM': 0, 'ATM+1': step, 'ATM-1': -step}.get(strike_selection, 0)
    target_strike = atm + offset
    option_type = 'CE' if direction == 'bullish' else 'PE'
    as_of = as_of or date.today()

    rows = _cached_instruments(kite, meta['option_exchange'])
    if not rows:
        return None

    # Filter to the right name + type + strike + future-or-today expiry
    candidates = [
        r for r in rows
        if r.get('name') == meta['nfo_name']
        and r.get('instrument_type') == option_type
        and _coerce_strike(r.get('strike')) == target_strike
        and _coerce_expiry(r.get('expiry')) is not None
        and _coerce_expiry(r.get('expiry')) >= as_of
    ]
    if not candidates:
        logger.info(
            "No %s %s %d contracts on %s for as_of=%s",
            meta['nfo_name'], option_type, target_strike, meta['option_exchange'], as_of,
        )
        return None

    expiries = sorted({_coerce_expiry(r['expiry']) for r in candidates})
    chosen_expiry = _pick_expiry(expiries, expiry, as_of)
    if chosen_expiry is None:
        return None

    match = next((r for r in candidates if _coerce_expiry(r['expiry']) == chosen_expiry), None)
    if not match:
        return None

    return {
        'tradingsymbol':    match['tradingsymbol'],
        'exchange':         meta['option_exchange'],
        'instrument_token': int(match['instrument_token']),
        'strike':           target_strike,
        'expiry':           chosen_expiry.isoformat(),
        'option_type':      option_type,
        'lot_size':         int(match.get('lot_size') or 0),
    }


def _coerce_strike(v) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _coerce_expiry(v) -> Optional[date]:
    if v is None:
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, str):
        try:
            return datetime.strptime(v, '%Y-%m-%d').date()
        except ValueError:
            return None
    return None
