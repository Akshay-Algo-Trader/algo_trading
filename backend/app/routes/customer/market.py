import logging
from datetime import datetime, timezone, timedelta, date as _date
from threading import Lock

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

import math

from app.extensions import db
from app.models import KiteConfig, TradingSession, SessionStatus
from app.models.instrument import Instrument
from app.models.live_order import LiveOrder, TransactionType, OrderStatus, OrderType
from app.models.paper_order import PaperOrder, PaperOrderType, PaperOrderStatus, PaperOrderCategory
from app.models.virtual_account import VirtualAccount
from app.routes.decorators import customer_required
from app.services.encryption import decrypt
from app.services.kite_service import kite_service

logger = logging.getLogger(__name__)

# MCX instruments are a large dataset (~100k rows). Cache nearest-expiry contracts
# in memory and refresh at most once per hour to avoid Kite rate-limit errors.
_mcx_cache: list | None = None
_mcx_cache_ts: datetime | None = None
_mcx_cache_lock = Lock()
_MCX_CACHE_TTL_SECONDS = 3600

# Per-exchange symbol→token cache used by the candle endpoint when the DB is empty.
# Maps exchange → {symbol: instrument_token}, refreshed at most once per hour.
_token_cache: dict[str, dict] = {}
_token_cache_ts: dict[str, datetime] = {}
_token_cache_lock = Lock()
_TOKEN_CACHE_TTL = 3600


def _resolve_token(symbol: str, exchange: str, kite) -> int | None:
    """Return instrument_token for symbol:exchange. DB first, then Kite instruments API."""
    inst = Instrument.query.filter_by(tradingsymbol=symbol, exchange=exchange).first()
    if inst and inst.instrument_token:
        return inst.instrument_token

    now = datetime.now(timezone.utc)
    with _token_cache_lock:
        ts = _token_cache_ts.get(exchange)
        if ts is None or (now - ts).total_seconds() > _TOKEN_CACHE_TTL:
            try:
                rows = kite.instruments(exchange)
                _token_cache[exchange] = {r['tradingsymbol']: r['instrument_token'] for r in rows}
                _token_cache_ts[exchange] = now
                logger.info("Token cache refreshed for %s: %d symbols", exchange, len(_token_cache[exchange]))
            except Exception as exc:
                logger.warning("Failed to fetch instruments for %s: %s", exchange, exc)
        return _token_cache.get(exchange, {}).get(symbol)


def _get_mcx_instruments(kite_cfg) -> list | None:
    """Return nearest-expiry MCX FUT contracts, cached for up to 1 hour."""
    global _mcx_cache, _mcx_cache_ts
    now = datetime.now(timezone.utc)

    with _mcx_cache_lock:
        if (
            _mcx_cache is not None
            and _mcx_cache_ts is not None
            and (now - _mcx_cache_ts).total_seconds() < _MCX_CACHE_TTL_SECONDS
        ):
            return list(_mcx_cache)

        try:
            from kiteconnect import KiteConnect
            kc = KiteConnect(api_key=decrypt(kite_cfg.api_key_encrypted))
            kc.set_access_token(decrypt(kite_cfg.access_token_encrypted))
            raw = kc.instruments('MCX')

            today = _date.today()
            best = {}
            for r in raw:
                if r.get('instrument_type') != 'FUT':
                    continue
                expiry = r.get('expiry')
                if expiry and expiry < today:
                    continue
                name = r.get('name') or r.get('tradingsymbol', '')
                prev = best.get(name)
                if prev is None:
                    best[name] = r
                elif expiry and prev.get('expiry') and expiry < prev['expiry']:
                    best[name] = r

            if not best:
                return None

            result = sorted([{
                'symbol': r['tradingsymbol'],
                'name': r.get('name') or r['tradingsymbol'],
                'exchange': 'MCX',
                'ltp': None, 'prev_close': None, 'change': None, 'change_pct': None,
                'tick_size': float(r.get('tick_size') or 1.0),
            } for r in best.values()], key=lambda x: x['name'])

            _mcx_cache = result
            _mcx_cache_ts = now
            logger.info("MCX instruments cache refreshed: %d contracts", len(result))
            return list(result)

        except Exception as exc:
            logger.warning("Failed to fetch MCX instruments from Kite: %s", exc)
            if _mcx_cache is not None:
                logger.info("Using stale MCX instruments cache")
                return list(_mcx_cache)
            return None


_MCX_COMMODITY_META = [
    # (base_symbol, display_name, tick_size, expiry_months)
    # expiry_months: MCX contracts expire on the last Thursday of the month.
    # Most commodities have monthly expiry; some have specific cycles.
    ('GOLD',       'Gold',           1.0,  [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('GOLDM',      'Gold Mini',      1.0,  [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('GOLDPETAL',  'Gold Petal',     1.0,  [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('SILVER',     'Silver',         1.0,  [3,5,7,9,12]),
    ('SILVERM',    'Silver Mini',    1.0,  [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('SILVERMIC',  'Silver Micro',   1.0,  [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('CRUDEOIL',   'Crude Oil',      1.0,  [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('CRUDEOILM',  'Crude Oil Mini', 1.0,  [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('NATURALGAS', 'Natural Gas',    0.10, [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('COPPER',     'Copper',         0.05, [2,4,6,8,10,12]),
    ('ALUMINIUM',  'Aluminium',      0.05, [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('ZINC',       'Zinc',           0.05, [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('LEAD',       'Lead',           0.05, [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('NICKEL',     'Nickel',         0.10, [1,2,3,4,5,6,7,8,9,10,11,12]),
    ('MENTHAOIL',  'Mentha Oil',     0.10, [1,2,3,4,5,6,7,8,9,10,11,12]),
]

_MONTH_CODES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']


def _mcx_static_fallback() -> list:
    """
    Build MCX stock list using likely active contract symbols derived from today's date.
    MCX futures are named {BASE}{YY}{MON}FUT — e.g. GOLD26JUNFUT.
    We try the current month; if the expiry cycle doesn't include it we advance to the next
    valid month. This gives real tradeable symbols so OHLC lookups actually return prices.
    """
    today = _date.today()
    result = []
    for base, name, tick, months in _MCX_COMMODITY_META:
        # Find the nearest expiry month >= today's month
        target_month = None
        target_year = today.year
        for m in sorted(months):
            if m >= today.month:
                target_month = m
                break
        if target_month is None:
            # Wrap to first month of next year
            target_month = sorted(months)[0]
            target_year += 1
        symbol = f"{base}{str(target_year)[2:]}{_MONTH_CODES[target_month - 1]}FUT"
        result.append({
            'symbol': symbol,
            'name': name,
            'exchange': 'MCX',
            'ltp': None, 'prev_close': None, 'change': None, 'change_pct': None,
            'tick_size': tick,
        })
    return result


def _snap_to_tick(price: float, tick: float) -> float:
    """Round price to the nearest valid tick-size multiple."""
    if not tick or tick <= 0:
        return round(price, 2)
    snapped = round(round(price / tick) * tick, 10)
    # Trim floating-point noise: keep only as many decimals as tick has
    decimals = len(str(tick).rstrip('0').split('.')[-1]) if '.' in str(tick) else 0
    return round(snapped, decimals)


def _tick_size(symbol: str, exchange: str) -> float:
    """Look up tick_size from instruments table; default to 0.05 for NSE equities."""
    inst = Instrument.query.filter_by(tradingsymbol=symbol, exchange=exchange).first()
    if inst and inst.tick_size and inst.tick_size > 0:
        return inst.tick_size
    return 0.05  # NSE equity default

customer_market_bp = Blueprint('customer_market', __name__)

PAGE_SIZE = 50

# Index constituent symbols — these are maintained as a curated list because
# Kite Connect does not expose index membership via its API. Prices and
# instrument metadata are always fetched live from Kite.
_NIFTY50_SYMBOLS = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
    "BAJAJ-AUTO", "BAJAJFINSV", "BAJFINANCE", "BHARTIARTL", "BPCL",
    "BRITANNIA", "CIPLA", "COALINDIA", "DIVISLAB", "DRREDDY",
    "EICHERMOT", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE",
    "HEROMOTOCO", "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDUSINDBK",
    "INFY", "ITC", "JSWSTEEL", "KOTAKBANK", "LT",
    "M&M", "MARUTI", "NESTLEIND", "NTPC", "ONGC",
    "POWERGRID", "RELIANCE", "SBILIFE", "SBIN", "SUNPHARMA",
    "TATACONSUM", "TATAMOTORS", "TATASTEEL", "TCS", "TECHM",
    "TITAN", "ULTRACEMCO", "UPL", "WIPRO", "SHRIRAMFIN",
]

_SENSEX_SYMBOLS = [
    "ADANIENT", "ASIANPAINT", "AXISBANK", "BAJAJFINSV", "BAJFINANCE",
    "BHARTIARTL", "DRREDDY", "HCLTECH", "HDFCBANK", "HINDUNILVR",
    "ICICIBANK", "INDUSINDBK", "INFY", "ITC", "JSWSTEEL",
    "KOTAKBANK", "LT", "M&M", "MARUTI", "NESTLEIND",
    "NTPC", "POWERGRID", "RELIANCE", "SBIN", "SUNPHARMA",
    "TATAMOTORS", "TCS", "TITAN", "ULTRACEMCO", "WIPRO",
]

_BANKNIFTY_SYMBOLS = [
    "AUBANK", "AXISBANK", "BANDHANBNK", "FEDERALBNK", "HDFCBANK",
    "ICICIBANK", "IDFCFIRSTB", "INDUSINDBK", "KOTAKBANK", "PNB",
    "RBLBANK", "SBIN",
]

# Fallback display names used when the instrument is not yet in the local DB
_STOCK_NAMES = {
    "ADANIENT": "Adani Enterprises", "ADANIPORTS": "Adani Ports & SEZ",
    "APOLLOHOSP": "Apollo Hospitals", "ASIANPAINT": "Asian Paints",
    "AXISBANK": "Axis Bank", "BAJAJ-AUTO": "Bajaj Auto",
    "BAJAJFINSV": "Bajaj Finserv", "BAJFINANCE": "Bajaj Finance",
    "BHARTIARTL": "Bharti Airtel", "BPCL": "BPCL",
    "BRITANNIA": "Britannia Industries", "CIPLA": "Cipla",
    "COALINDIA": "Coal India", "DIVISLAB": "Divi's Laboratories",
    "DRREDDY": "Dr Reddy's Laboratories", "EICHERMOT": "Eicher Motors",
    "GRASIM": "Grasim Industries", "HCLTECH": "HCL Technologies",
    "HDFCBANK": "HDFC Bank", "HDFCLIFE": "HDFC Life Insurance",
    "HEROMOTOCO": "Hero MotoCorp", "HINDALCO": "Hindalco Industries",
    "HINDUNILVR": "Hindustan Unilever", "ICICIBANK": "ICICI Bank",
    "INDUSINDBK": "IndusInd Bank", "INFY": "Infosys",
    "ITC": "ITC", "JSWSTEEL": "JSW Steel",
    "KOTAKBANK": "Kotak Mahindra Bank", "LT": "Larsen & Toubro",
    "M&M": "Mahindra & Mahindra", "MARUTI": "Maruti Suzuki India",
    "NESTLEIND": "Nestle India", "NTPC": "NTPC",
    "ONGC": "Oil & Natural Gas Corp", "POWERGRID": "Power Grid Corporation",
    "RELIANCE": "Reliance Industries", "SBILIFE": "SBI Life Insurance",
    "SBIN": "State Bank of India", "SUNPHARMA": "Sun Pharmaceutical",
    "TATACONSUM": "Tata Consumer Products", "TATAMOTORS": "Tata Motors",
    "TATASTEEL": "Tata Steel", "TCS": "Tata Consultancy Services",
    "TECHM": "Tech Mahindra", "TITAN": "Titan Company",
    "ULTRACEMCO": "UltraTech Cement", "UPL": "UPL",
    "WIPRO": "Wipro", "SHRIRAMFIN": "Shriram Finance",
    "AUBANK": "AU Small Finance Bank", "BANDHANBNK": "Bandhan Bank",
    "FEDERALBNK": "Federal Bank", "IDFCFIRSTB": "IDFC First Bank",
    "PNB": "Punjab National Bank", "RBLBANK": "RBL Bank",
}

_INDEX_CONFIG = {
    'NIFTY50':   {'exchange': 'NSE', 'symbols': _NIFTY50_SYMBOLS},
    'SENSEX':    {'exchange': 'BSE', 'symbols': _SENSEX_SYMBOLS},
    'BANKNIFTY': {'exchange': 'NSE', 'symbols': _BANKNIFTY_SYMBOLS},
    'COMMODITY': {'exchange': 'MCX', 'symbols': None},
}


def _enrich_with_ltp(stocks: list, user_id: int) -> None:
    """Mutate stocks list in-place with live LTP/OHLC data from Kite."""
    if not stocks:
        return
    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (config and config.is_connected and config.access_token_encrypted):
        return
    try:
        from kiteconnect import KiteConnect
        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))
        keys = [f"{s['exchange']}:{s['symbol']}" for s in stocks]
        ohlc_data = kite.ohlc(keys)
        for stock in stocks:
            d = ohlc_data.get(f"{stock['exchange']}:{stock['symbol']}", {})
            ltp = d.get('last_price')
            prev = d.get('ohlc', {}).get('close')
            if ltp is not None:
                stock['ltp'] = ltp
            if prev is not None:
                stock['prev_close'] = prev
            if ltp is not None and prev and prev > 0:
                stock['change'] = round(ltp - prev, 2)
                stock['change_pct'] = round((ltp - prev) / prev * 100, 2)
    except Exception as exc:
        logger.warning("LTP enrichment failed for user %s: %s", user_id, exc)


@customer_market_bp.get('/api/customer/market/stocks')
@customer_required
def market_stocks():
    user_id = int(get_jwt_identity())
    index = request.args.get('index', 'NIFTY50').upper().replace(' ', '')
    try:
        page = max(1, int(request.args.get('page', 1) or 1))
    except (ValueError, TypeError):
        page = 1

    if index not in _INDEX_CONFIG:
        return jsonify({'error': f'Unknown index: {index}. Valid: {list(_INDEX_CONFIG)}'}), 400

    idx_cfg = _INDEX_CONFIG[index]
    exchange = idx_cfg['exchange']
    symbol_list = idx_cfg['symbols']

    if symbol_list is not None:
        # Equity index: paginate the curated symbol list; names/tick from Kite instruments table
        total = len(symbol_list)
        total_pages = max(1, math.ceil(total / PAGE_SIZE))
        page_symbols = symbol_list[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]

        stocks = []
        for sym in page_symbols:
            inst = Instrument.query.filter_by(tradingsymbol=sym, exchange=exchange).first()
            tick = float(inst.tick_size) if inst and inst.tick_size else 0.05
            name = (inst.name if inst and inst.name else _STOCK_NAMES.get(sym, sym))
            stocks.append({
                'symbol': sym, 'name': name, 'exchange': exchange,
                'ltp': None, 'prev_close': None, 'change': None, 'change_pct': None,
                'tick_size': tick,
            })
    else:
        # COMMODITY: always try live Kite fetch first so we get active (non-expired) contracts.
        # The DB may contain stale/expired futures (no expiry column to filter on), so Kite
        # is the authoritative source; DB is only used when Kite is unavailable.
        kite_cfg = KiteConfig.query.filter_by(user_id=user_id).first()
        all_stocks = None

        if kite_cfg and kite_cfg.is_connected and kite_cfg.access_token_encrypted:
            all_stocks = _get_mcx_instruments(kite_cfg)

        if not all_stocks:
            # DB fallback — may include expired contracts but better than nothing
            db_rows = (Instrument.query
                       .filter_by(exchange='MCX', instrument_type='FUT')
                       .order_by(Instrument.name, Instrument.tradingsymbol)
                       .all())
            if db_rows:
                all_stocks = [{
                    'symbol': i.tradingsymbol,
                    'name': i.name or i.tradingsymbol,
                    'exchange': 'MCX',
                    'ltp': None, 'prev_close': None, 'change': None, 'change_pct': None,
                    'tick_size': float(i.tick_size) if i.tick_size else 1.0,
                } for i in db_rows]

        if not all_stocks:
            # Date-derived fallback: construct real tradeable symbols (e.g. GOLD26JUNFUT)
            # from today's date so OHLC lookups can still return prices even when the
            # instruments endpoint is unavailable.
            all_stocks = _mcx_static_fallback()

        total = len(all_stocks)
        total_pages = max(1, math.ceil(total / PAGE_SIZE))
        stocks = all_stocks[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]

    _enrich_with_ltp(stocks, user_id)

    return jsonify({
        'stocks': stocks,
        'total': total,
        'page': page,
        'total_pages': total_pages,
        'index': index,
    }), 200


# Legacy endpoint kept for backward compatibility
@customer_market_bp.get('/api/customer/market/nifty50')
@customer_required
def nifty50():
    user_id = int(get_jwt_identity())
    stocks = []
    for sym in _NIFTY50_SYMBOLS:
        tick = _tick_size(sym, 'NSE')
        stocks.append({
            'symbol': sym, 'name': _STOCK_NAMES.get(sym, sym), 'exchange': 'NSE',
            'ltp': None, 'prev_close': None, 'change': None, 'change_pct': None,
            'tick_size': tick,
        })
    _enrich_with_ltp(stocks, user_id)
    return jsonify({'stocks': stocks}), 200


@customer_market_bp.get('/api/customer/market/price')
@customer_required
def get_instrument_price():
    user_id = int(get_jwt_identity())
    symbol = request.args.get('symbol', '').strip().upper()
    exchange = request.args.get('exchange', 'NSE').strip().upper()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    stock = {
        'symbol': symbol, 'exchange': exchange,
        'ltp': None, 'prev_close': None, 'change': None, 'change_pct': None,
        'tick_size': 0.05,
    }
    _enrich_with_ltp([stock], user_id)
    return jsonify({'symbol': symbol, 'exchange': exchange, 'ltp': stock['ltp']}), 200


# duration → (kite interval, lookback in minutes; None = full day session)
_DURATION_MAP = {
    '1D':  ('5minute', None),
    '4H':  ('minute',  240),
    '3H':  ('minute',  180),
    '2H':  ('minute',  120),
    '1H':  ('minute',  60),
    '30m': ('minute',  30),
    '5m':  ('minute',  5),
}
_IST = timezone(timedelta(hours=5, minutes=30))
_MARKET_OPEN_MINS  = 9 * 60 + 15   # 09:15 IST in minutes since midnight
_MARKET_CLOSE_MINS = 15 * 60 + 30  # 15:30 IST


def _last_market_close(now_ist: datetime) -> datetime:
    """Return the most recent market close datetime (15:30 IST of last trading weekday)."""
    now_mins = now_ist.hour * 60 + now_ist.minute
    candidate = now_ist.date()

    if now_ist.weekday() >= 5:
        # Weekend: go back to Friday
        days_back = now_ist.weekday() - 4
        candidate = candidate - timedelta(days=days_back)
    elif now_mins < _MARKET_OPEN_MINS:
        # Weekday before market opens: use previous trading day
        candidate -= timedelta(days=1)
        while candidate.weekday() >= 5:
            candidate -= timedelta(days=1)
    # else: weekday during or after market hours → use today

    return datetime(candidate.year, candidate.month, candidate.day, 15, 30, 0, tzinfo=_IST)


def _candle_window(now_ist: datetime, lookback_mins) -> tuple:
    """Return (from_date, to_date) for the candle request."""
    now_mins = now_ist.hour * 60 + now_ist.minute
    market_open = (
        now_ist.weekday() < 5
        and _MARKET_OPEN_MINS <= now_mins <= _MARKET_CLOSE_MINS
    )
    to_date = now_ist if market_open else _last_market_close(now_ist)

    if lookback_mins is None:
        from_date = to_date.replace(hour=9, minute=15, second=0, microsecond=0)
    else:
        from_date = to_date - timedelta(minutes=lookback_mins)

    return from_date, to_date


@customer_market_bp.get('/api/customer/market/candles')
@customer_required
def get_candles():
    user_id  = int(get_jwt_identity())
    symbol   = request.args.get('symbol', '').strip().upper()
    exchange = request.args.get('exchange', 'NSE').strip().upper()
    duration = request.args.get('interval', '1D')  # 1D | 1H | 30m | 5m

    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    if duration not in _DURATION_MAP:
        return jsonify({'error': f'interval must be one of {list(_DURATION_MAP)}'}), 400

    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (config and config.is_connected and config.access_token_encrypted):
        return jsonify({'error': 'Kite not connected'}), 400

    try:
        from kiteconnect import KiteConnect
        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))

        token = _resolve_token(symbol, exchange, kite)
        if not token:
            return jsonify({'error': f'{exchange}:{symbol} not found — try refreshing instruments'}), 404

        kite_interval, lookback_mins = _DURATION_MAP[duration]
        now_ist = datetime.now(_IST)
        from_date, to_date = _candle_window(now_ist, lookback_mins)

        raw = kite.historical_data(
            token,
            from_date.strftime('%Y-%m-%d %H:%M:%S'),
            to_date.strftime('%Y-%m-%d %H:%M:%S'),
            kite_interval,
        )
        candles = [{
            'date': c['date'].strftime('%H:%M'),
            'open': c['open'], 'high': c['high'],
            'low': c['low'],   'close': c['close'],
            'volume': c['volume'],
        } for c in raw]
        return jsonify({'symbol': symbol, 'exchange': exchange,
                        'interval': duration, 'candles': candles}), 200
    except Exception as exc:
        logger.warning("Candle fetch failed for %s:%s: %s", exchange, symbol, exc)
        return jsonify({'error': str(exc)}), 500


@customer_market_bp.get('/api/customer/market/daily-candles')
@customer_required
def get_daily_candles():
    """Return the last N completed + today's developing daily OHLC candles for pattern detection."""
    user_id  = int(get_jwt_identity())
    symbol   = request.args.get('symbol', '').strip().upper()
    exchange = request.args.get('exchange', 'NSE').strip().upper()
    try:
        days = min(max(int(request.args.get('days', 10)), 2), 200)
    except (ValueError, TypeError):
        days = 10

    if not symbol:
        return jsonify({'error': 'symbol required'}), 400

    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (config and config.is_connected and config.access_token_encrypted):
        return jsonify({'error': 'Kite not connected'}), 400

    try:
        from kiteconnect import KiteConnect
        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))

        token = _resolve_token(symbol, exchange, kite)
        if not token:
            return jsonify({'error': f'{exchange}:{symbol} not found — try refreshing instruments'}), 404

        now_ist = datetime.now(_IST)
        to_date = now_ist.date()
        # Request extra days to account for weekends and holidays
        from_date = to_date - timedelta(days=days + 15)

        raw = kite.historical_data(
            token,
            from_date.strftime('%Y-%m-%d'),
            to_date.strftime('%Y-%m-%d'),
            'day',
        )
        candles = [{
            'date':   c['date'].strftime('%Y-%m-%d'),
            'open':   c['open'],
            'high':   c['high'],
            'low':    c['low'],
            'close':  c['close'],
            'volume': c['volume'],
        } for c in raw][-days:]

        return jsonify({'symbol': symbol, 'exchange': exchange, 'candles': candles}), 200
    except Exception as exc:
        logger.warning("Daily candle fetch failed for %s:%s: %s", exchange, symbol, exc)
        return jsonify({'error': str(exc)}), 500


@customer_market_bp.post('/api/customer/market/order')
@customer_required
def place_order():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    symbol   = (data.get('symbol') or '').strip().upper()
    exchange = (data.get('exchange') or 'NSE').strip().upper()
    txn_type = (data.get('transaction_type') or '').strip().upper()
    ord_type = (data.get('order_type') or 'MARKET').strip().upper()
    quantity = int(data.get('quantity') or 0)
    price    = float(data.get('price') or 0.0)
    mode     = (data.get('mode') or 'paper').strip().lower()
    product  = (data.get('product') or 'MIS').strip().upper()

    if not symbol:
        return jsonify({'error': 'Symbol is required'}), 400
    if txn_type not in ('BUY', 'SELL'):
        return jsonify({'error': 'transaction_type must be BUY or SELL'}), 400
    if ord_type not in ('MARKET', 'LIMIT'):
        return jsonify({'error': 'order_type must be MARKET or LIMIT'}), 400
    if product not in ('MIS', 'CNC', 'NRML'):
        return jsonify({'error': 'product must be MIS, CNC, or NRML'}), 400
    if quantity <= 0:
        return jsonify({'error': 'Quantity must be greater than 0'}), 400
    if ord_type == 'LIMIT' and price <= 0:
        return jsonify({'error': 'Price required for LIMIT orders'}), 400

    # Snap LIMIT price to nearest tick size to avoid Kite rejections
    if ord_type == 'LIMIT':
        tick = _tick_size(symbol, exchange)
        price = _snap_to_tick(price, tick)

    active_session = TradingSession.query.filter_by(
        user_id=user_id, status=SessionStatus.ACTIVE
    ).first()

    if mode == 'live':
        config = KiteConfig.query.filter_by(user_id=user_id).first()
        if not config or not config.is_connected:
            return jsonify({'error': 'Kite account not connected'}), 400

        try:
            kite_order_id = kite_service.place_order(user_id, {
                'symbol': symbol,
                'exchange': exchange,
                'transaction_type': txn_type,
                'order_type': ord_type,
                'quantity': quantity,
                'price': price if ord_type == 'LIMIT' else 0,
                'product': product,
                'variety': 'regular',
                'mode': 'live',
            })
        except (ValueError, RuntimeError) as exc:
            return jsonify({'error': str(exc)}), 400

        order = LiveOrder(
            user_id=user_id,
            session_id=active_session.id if active_session else None,
            kite_order_id=kite_order_id,
            symbol=symbol,
            exchange=exchange,
            transaction_type=TransactionType[txn_type],
            order_type=OrderType[ord_type],
            quantity=quantity,
            price=price,
            status=OrderStatus.OPEN,
            tag='manual',
        )
        db.session.add(order)
        db.session.commit()
        return jsonify({'order': order.to_dict(), 'kite_order_id': kite_order_id}), 201

    # ── Paper mode ──
    fill_price = price  # for MARKET: frontend passes current LTP; for LIMIT: already snapped above

    va = VirtualAccount.query.filter_by(user_id=user_id).first()
    if not va:
        return jsonify({'error': 'Virtual account not found'}), 400

    cost = fill_price * quantity
    if txn_type == 'BUY':
        if va.balance < cost:
            return jsonify({'error': f'Insufficient virtual balance (need ₹{cost:,.2f}, have ₹{va.balance:,.2f})'}), 400
        va.balance = round(va.balance - cost, 2)
    else:
        va.balance = round(va.balance + cost, 2)

    order = PaperOrder(
        user_id=user_id,
        session_id=active_session.id if active_session else None,
        symbol=symbol,
        exchange=exchange,
        transaction_type=PaperOrderType[txn_type],
        order_type=PaperOrderCategory[ord_type],
        quantity=quantity,
        trigger_price=fill_price,
        fill_price=fill_price,
        fill_time=datetime.now(timezone.utc),
        status=PaperOrderStatus.FILLED,
    )
    db.session.add(order)
    db.session.commit()
    return jsonify({'order': order.to_dict()}), 201
