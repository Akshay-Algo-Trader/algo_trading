"""S&R level detection — identifies swing high (resistance) and swing low (support) price points."""

from datetime import datetime, timezone, timedelta

_IST = timezone(timedelta(hours=5, minutes=30))


def _aggregate_to_4h(candles_60m):
    """Group every 4 consecutive 60-minute candles into a single 4H candle."""
    aggregated = []
    for i in range(0, len(candles_60m), 4):
        group = candles_60m[i:i + 4]
        if not group:
            continue
        aggregated.append({
            'date': group[0]['date'],
            'open': group[0]['open'],
            'high': max(c['high'] for c in group),
            'low': min(c['low'] for c in group),
            'close': group[-1]['close'],
            'volume': sum(c.get('volume', 0) for c in group),
        })
    return aggregated

_KITE_INTERVAL = {
    '1min': 'minute',
    '5min': '5minute',
    '15min': '15minute',
    '30min': '30minute',
    '1hour': '60minute',
    '4hour': '60minute',
}

# Buffer days fetched before start_date to give pivot detection lookback context
_BUFFER_DAYS = {
    '1min': 3,
    '5min': 5,
    '15min': 7,
    '30min': 10,
    '1hour': 15,
    '4hour': 40,
}

# Kite historical data API max range (days) per interval
_MAX_FETCH_DAYS = {
    '1min': 60,
    '5min': 100,
    '15min': 200,
    '30min': 200,
    '1hour': 400,
    '4hour': 400,
}


def fetch_candles_for_swing_config(kite, swing_config, instrument, exchange, extra_days=0, end_date=None):
    """Fetch (and, for 4hour, aggregate) candles for a SwingZoneConfig's
    candle_size, covering `period_days` + buffer + `extra_days` of history
    ending at `end_date` (defaults to today).

    swing_config: dict with 'candle_size' and 'period_days' keys (e.g.
    SwingZoneConfig.to_dict()).
    end_date: last calendar day to fetch through; lets the backtest report on a
    window that ends in the past. Defaults to today when None.
    Returns a list of candle dicts {date, open, high, low, close, volume}.
    """
    from app.routes.customer.market import _resolve_token

    candle_size = swing_config.get('candle_size', '4hour')
    is_4h = candle_size == '4hour'
    kite_interval = _KITE_INTERVAL.get(candle_size, '60minute')
    period_days = int(swing_config.get('period_days', 30))
    buffer_days = _BUFFER_DAYS.get(candle_size, 40)

    total_days = period_days + extra_days + buffer_days
    max_days = _MAX_FETCH_DAYS.get(candle_size, 400)
    if total_days > max_days:
        total_days = max_days

    if end_date is None:
        end_date = datetime.now(_IST).date()
    fetch_from = end_date - timedelta(days=total_days)

    token = _resolve_token(instrument, exchange, kite)
    if not token:
        return []

    raw = kite.historical_data(
        token,
        fetch_from.strftime('%Y-%m-%d'),
        end_date.strftime('%Y-%m-%d'),
        kite_interval,
    )

    candles = [{
        'date': c['date'].strftime('%Y-%m-%d %H:%M:%S'),
        'open': c['open'],
        'high': c['high'],
        'low': c['low'],
        'close': c['close'],
        'volume': c.get('volume', 0),
    } for c in raw]

    if is_4h:
        candles = _aggregate_to_4h(candles)

    return candles


def detect_sr_levels(candles, pivot_bars=5):
    """Detect support and resistance price levels from pivot highs and lows.

    A pivot high (resistance) is a candle whose high is strictly greater than
    the `pivot_bars` candles on each side.  A pivot low (support) is the mirror.

    Args:
        candles: list of dicts with keys date, open, high, low, close, volume
        pivot_bars: number of bars required on each side to confirm a pivot

    Returns:
        list of dicts {price, type, date} sorted by price descending
    """
    if len(candles) < pivot_bars * 2 + 1:
        return []

    levels = []
    for i in range(pivot_bars, len(candles) - pivot_bars):
        c = candles[i]
        left = range(i - pivot_bars, i)
        right = range(i + 1, i + pivot_bars + 1)

        if (all(c['high'] > candles[j]['high'] for j in left) and
                all(c['high'] > candles[j]['high'] for j in right)):
            levels.append({'price': round(c['high'], 2), 'type': 'RESISTANCE', 'date': c['date']})

        if (all(c['low'] < candles[j]['low'] for j in left) and
                all(c['low'] < candles[j]['low'] for j in right)):
            levels.append({'price': round(c['low'], 2), 'type': 'SUPPORT', 'date': c['date']})

    levels.sort(key=lambda x: x['date'])
    levels = _filter_alternating(levels)
    levels.sort(key=lambda x: x['price'], reverse=True)
    return levels


def _filter_alternating(levels):
    """Ensure R and S levels strictly alternate in chronological order.

    For back-to-back resistances, keep the higher-priced one (stronger).
    For back-to-back supports, keep the lower-priced one (stronger).
    """
    result = []
    for lvl in levels:
        if not result:
            result.append(lvl)
            continue
        last = result[-1]
        if lvl['type'] == last['type']:
            if lvl['type'] == 'RESISTANCE' and lvl['price'] > last['price']:
                result[-1] = lvl  # higher resistance is stronger
            elif lvl['type'] == 'SUPPORT' and lvl['price'] < last['price']:
                result[-1] = lvl  # lower support is stronger
        else:
            result.append(lvl)
    return result
