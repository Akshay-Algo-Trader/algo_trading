"""S&R level detection — identifies swing high (resistance) and swing low (support) price points."""


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

    levels.sort(key=lambda x: x['price'], reverse=True)
    return levels
