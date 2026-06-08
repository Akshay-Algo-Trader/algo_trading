"""Zone detection service - identifies FVG, S&R, and Swing zones in candle data."""


def _calc_fvg_zones(candles, settings):
    """Detect Fair Value Gaps (FVGs) in candle data.

    An FVG is a gap between candles:
    - Bullish FVG: prev_high < curr_low (gap up)
    - Bearish FVG: prev_low > curr_high (gap down)
    """
    if not settings.get('enabled') or len(candles) < 2:
        return []

    lookback = settings.get('lookback_candles', 100)
    min_gap_pct = settings.get('min_gap_pct', 0.1)
    max_gap_pct = settings.get('max_gap_pct', 2.0)
    gap_fill_tol = settings.get('gap_fill_tolerance_pct', 0.1)

    zones = []
    candles = candles[-lookback:] if len(candles) > lookback else candles

    for i in range(1, len(candles)):
        prev_candle = candles[i - 1]
        curr_candle = candles[i]

        # Bullish FVG (gap up)
        if prev_candle['high'] < curr_candle['low']:
            gap_pct = ((curr_candle['low'] - prev_candle['high']) / prev_candle['high']) * 100
            if min_gap_pct <= gap_pct <= max_gap_pct:
                zones.append({
                    'type': 'FVG_BULLISH',
                    'start_date': prev_candle['date'],
                    'end_date': curr_candle['date'],
                    'high': curr_candle['low'],
                    'low': prev_candle['high'],
                    'gap_pct': round(gap_pct, 2),
                    'detected_at_index': i,
                })

        # Bearish FVG (gap down)
        if prev_candle['low'] > curr_candle['high']:
            gap_pct = ((prev_candle['low'] - curr_candle['high']) / prev_candle['low']) * 100
            if min_gap_pct <= gap_pct <= max_gap_pct:
                zones.append({
                    'type': 'FVG_BEARISH',
                    'start_date': prev_candle['date'],
                    'end_date': curr_candle['date'],
                    'high': prev_candle['low'],
                    'low': curr_candle['high'],
                    'gap_pct': round(gap_pct, 2),
                    'detected_at_index': i,
                })

    return zones


def _calc_sr_zones(candles, settings):
    """Detect Support & Resistance zones using price touch counts.

    A level is considered S&R if it has been touched min_touches times
    within the price tolerance band.
    """
    if len(candles) < 2:
        return []

    lookback = settings.get('lookback_candles', 200)
    touch_min = settings.get('touch_count_min', 3)
    price_tol = settings.get('price_tolerance_pct', 0.25)
    zone_width = settings.get('zone_width_pct', 0.5)

    zones = []
    candles = candles[-lookback:] if len(candles) > lookback else candles

    if len(candles) < 2:
        return zones

    # Collect all high and low pivot points
    price_levels = []
    for i, c in enumerate(candles):
        price_levels.append(('high', c['high'], c['date'], i))
        price_levels.append(('low', c['low'], c['date'], i))

    # Group nearby prices as same level (within tolerance)
    processed = set()
    for idx, (level_type, price, date, candle_idx) in enumerate(price_levels):
        if idx in processed:
            continue

        # Find all prices within tolerance band
        tolerance = price * price_tol / 100
        band_min = price - tolerance
        band_max = price + tolerance

        touches = []
        for i, (lt, p, d, cidx) in enumerate(price_levels):
            if band_min <= p <= band_max:
                touches.append((d, cidx, p))
                processed.add(i)

        if len(touches) >= touch_min:
            avg_price = sum(t[2] for t in touches) / len(touches)
            zone_h = avg_price * (1 + zone_width / 100)
            zone_l = avg_price * (1 - zone_width / 100)

            # Sort touches by date to get first and last touch
            touches_sorted = sorted(touches, key=lambda x: x[0])

            zones.append({
                'type': 'SR',
                'start_date': touches_sorted[0][0],
                'end_date': touches_sorted[-1][0],
                'high': round(zone_h, 2),
                'low': round(zone_l, 2),
                'touches': len(touches),
                'avg_price': round(avg_price, 2),
                'detected_at_index': touches_sorted[-1][1],
            })

    return zones


def _calc_swing_zones(candles, settings):
    """Detect Swing High and Swing Low zones.

    A swing high is a candle whose high is higher than N candles to left/right.
    A swing low is a candle whose low is lower than N candles to left/right.
    """
    if len(candles) < 3:
        return []

    lookback = settings.get('lookback_candles', 100)
    left_bars = settings.get('swing_left_bars', 5)
    right_bars = settings.get('swing_right_bars', 5)
    min_swing_pct = settings.get('min_swing_pct', 0.5)

    zones = []
    candles = candles[-lookback:] if len(candles) > lookback else candles

    # Swing Highs
    for i in range(left_bars, len(candles) - right_bars):
        curr = candles[i]
        left = candles[i - left_bars:i]
        right = candles[i + 1:i + 1 + right_bars]

        if all(curr['high'] >= c['high'] for c in left) and all(curr['high'] >= c['high'] for c in right):
            start_date = left[0]['date'] if left else curr['date']
            end_date = right[-1]['date'] if right else curr['date']
            zones.append({
                'type': 'SWING_HIGH',
                'start_date': start_date,
                'end_date': end_date,
                'high': round(curr['high'], 2),
                'low': round(curr['high'] * (1 - min_swing_pct / 100), 2),
                'detected_at_index': i,
            })

    # Swing Lows
    for i in range(left_bars, len(candles) - right_bars):
        curr = candles[i]
        left = candles[i - left_bars:i]
        right = candles[i + 1:i + 1 + right_bars]

        if all(curr['low'] <= c['low'] for c in left) and all(curr['low'] <= c['low'] for c in right):
            start_date = left[0]['date'] if left else curr['date']
            end_date = right[-1]['date'] if right else curr['date']
            zones.append({
                'type': 'SWING_LOW',
                'start_date': start_date,
                'end_date': end_date,
                'high': round(curr['low'] * (1 + min_swing_pct / 100), 2),
                'low': round(curr['low'], 2),
                'detected_at_index': i,
            })

    return zones


def detect_zones(candles, zone_config):
    """Detect all zone types based on zone_config settings.

    Args:
        candles: List of candle dicts with 'date', 'open', 'high', 'low', 'close', 'volume'
        zone_config: Dict with 'fvg_settings', 'sr_settings', 'swing_settings'

    Returns:
        List of detected zones sorted by date detected
    """
    if not candles or len(candles) < 2:
        return []

    all_zones = []

    # Detect FVG zones from all enabled timeframes
    fvg_settings = zone_config.get('fvg_settings', {})
    for tf, settings in fvg_settings.items():
        if isinstance(settings, dict) and settings.get('enabled'):
            all_zones.extend(_calc_fvg_zones(candles, settings))

    # Detect S&R zones
    sr_settings = zone_config.get('sr_settings', {})
    if sr_settings:
        all_zones.extend(_calc_sr_zones(candles, sr_settings))

    # Detect Swing zones
    swing_settings = zone_config.get('swing_settings', {})
    if swing_settings:
        all_zones.extend(_calc_swing_zones(candles, swing_settings))

    # Sort by detection index (when it occurred in the candle series)
    all_zones.sort(key=lambda z: z.get('detected_at_index', 0))

    return all_zones
