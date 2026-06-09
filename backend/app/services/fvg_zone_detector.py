"""FVG Zone detection using the 3-candle pattern with strict quality rules."""


def _compute_atr(candles, period=14):
    """Compute simple ATR (average true range) over the last `period` candles."""
    if len(candles) < 2:
        return 0.0
    trs = []
    for i in range(1, len(candles)):
        prev_close = candles[i - 1]['close']
        c = candles[i]
        tr = max(
            c['high'] - c['low'],
            abs(c['high'] - prev_close),
            abs(c['low'] - prev_close),
        )
        trs.append(tr)
    window = trs[-period:] if len(trs) >= period else trs
    return sum(window) / len(window) if window else 0.0


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


def detect_fvg_zones(candles, fvg_type='both', impulse_multiplier=1.5, min_gap_pct=0.05, atr_period=14):
    """
    Detect 3-candle Fair Value Gap (FVG) zones in candle data.

    Three-candle rules enforced:
      1. No overlap — candle 1 and candle 3 must not touch each other's wicks in
         the FVG price range. If candle1.high >= candle3.low (bullish) or
         candle3.high >= candle1.low (bearish), there is no FVG.
      2. Strong impulse — candle 2 body must be at least `impulse_multiplier` × the
         average body of candles 1 and 3. A tiny middle candle is noise.
      3. Clean structure — candle 2 body must exceed 1× the local ATR so the move
         happens in a directional context, not choppy sideways action.

    Args:
        candles: List of dicts with 'date', 'open', 'high', 'low', 'close', 'volume'.
                 'date' should be a string (datetime or date).
        fvg_type: 'bullish', 'bearish', or 'both'.
        impulse_multiplier: Minimum ratio of candle 2 body to avg outer bodies.
        min_gap_pct: Minimum FVG gap as a percentage of candle 1's high (bullish)
                     or candle 1's low (bearish).
        atr_period: Lookback period for ATR-based structure filter.

    Returns:
        List of zone dicts with zone_start_datetime, zone_end_datetime, high, low, etc.
    """
    if len(candles) < 3:
        return []

    zones = []

    for i in range(1, len(candles) - 1):
        c1 = candles[i - 1]
        c2 = candles[i]
        c3 = candles[i + 1]

        c1_body = abs(c1['close'] - c1['open'])
        c2_body = abs(c2['close'] - c2['open'])
        c3_body = abs(c3['close'] - c3['open'])

        # Rule 2: strong impulse — candle 2 body must dominate candles 1 and 3
        avg_outer = (c1_body + c3_body) / 2 if (c1_body + c3_body) > 0 else 0.001
        if c2_body < impulse_multiplier * avg_outer:
            continue

        # Rule 3: clean structure — candle 2 body must be at least the local ATR
        local_candles = candles[max(0, i - atr_period):i]
        atr = _compute_atr(local_candles)
        if atr > 0 and c2_body < atr:
            continue

        # ── Bullish FVG ──────────────────────────────────────────────────────────
        if fvg_type in ('bullish', 'both'):
            # Rule 1: no overlap between c1's high and c3's low
            if c1['high'] < c3['low']:
                zone_low = c1['high']
                zone_high = c3['low']
                gap_pct = (zone_high - zone_low) / zone_low * 100
                if gap_pct >= min_gap_pct:
                    zones.append({
                        'type': 'FVG_BULLISH',
                        'zone_start_datetime': c1['date'],
                        'zone_end_datetime': c3['date'],
                        'high': round(zone_high, 2),
                        'low': round(zone_low, 2),
                        'gap_pct': round(gap_pct, 4),
                        'impulse_body': round(c2_body, 2),
                        'c1_date': c1['date'],
                        'c2_date': c2['date'],
                        'c3_date': c3['date'],
                        'detected_at_index': i,
                    })

        # ── Bearish FVG ──────────────────────────────────────────────────────────
        if fvg_type in ('bearish', 'both'):
            # Rule 1: no overlap between c3's high and c1's low
            if c3['high'] < c1['low']:
                zone_low = c3['high']
                zone_high = c1['low']
                gap_pct = (zone_high - zone_low) / zone_high * 100
                if gap_pct >= min_gap_pct:
                    zones.append({
                        'type': 'FVG_BEARISH',
                        'zone_start_datetime': c1['date'],
                        'zone_end_datetime': c3['date'],
                        'high': round(zone_high, 2),
                        'low': round(zone_low, 2),
                        'gap_pct': round(gap_pct, 4),
                        'impulse_body': round(c2_body, 2),
                        'c1_date': c1['date'],
                        'c2_date': c2['date'],
                        'c3_date': c3['date'],
                        'detected_at_index': i,
                    })

    zones.sort(key=lambda z: z['detected_at_index'])
    return zones
