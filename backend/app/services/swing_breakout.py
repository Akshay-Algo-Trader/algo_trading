"""Swing-level breakout analysis — Python port of the level-analysis helpers
in frontend/src/components/admin/SwingZoneChart.jsx, plus the breakout-entry
rule shared by the live trading engine and the backtest simulator.
"""


def classify_by_ltp(levels, ltp):
    """LTP decides type: above LTP -> RESISTANCE, at/below -> SUPPORT.
    Python port of classifyByLtp in SwingZoneChart.jsx."""
    if ltp is None:
        return levels or []
    return [
        {**l, 'type': 'RESISTANCE' if l['price'] > ltp else 'SUPPORT'}
        for l in (levels or [])
    ]


def find_last_level(levels):
    """Most recently formed level (by date) across both types."""
    if not levels:
        return None
    return max(levels, key=lambda l: str(l['date']))


def find_nearest_levels(levels, current_price):
    """Closest RESISTANCE above, and closest SUPPORT below, current_price."""
    nearest_resistance = None
    nearest_support = None
    if current_price is None:
        return {'nearest_resistance': None, 'nearest_support': None}

    for l in levels or []:
        if l['type'] == 'RESISTANCE' and l['price'] > current_price:
            if nearest_resistance is None or l['price'] < nearest_resistance['price']:
                nearest_resistance = l
        if l['type'] == 'SUPPORT' and l['price'] < current_price:
            if nearest_support is None or l['price'] > nearest_support['price']:
                nearest_support = l

    return {'nearest_resistance': nearest_resistance, 'nearest_support': nearest_support}


def find_strong_levels(levels, pct):
    """Clusters of >=2 same-type levels within `pct`% of each other, PLUS the
    two extreme levels which are always treated as strong: the MAX resistance
    (the outermost ceiling) and the MIN support (the outermost floor).

    Resistance clusters are represented by their MAX price (the ceiling);
    support clusters by their MIN price (the floor). Extreme strong lines are
    flagged with ``extreme=True`` so callers can surface them in logs.
    """
    def clusters(level_type, pick_strong):
        if not pct:
            return []
        sorted_levels = sorted(
            (l for l in (levels or []) if l['type'] == level_type),
            key=lambda l: l['price'],
        )

        groups = []
        current = []
        for l in sorted_levels:
            if current:
                prev = current[-1]
                diff_pct = (l['price'] - prev['price']) / prev['price'] * 100
                if diff_pct > pct:
                    groups.append(current)
                    current = []
            current.append(l)
        if current:
            groups.append(current)

        return [
            {'price': pick_strong([l['price'] for l in g]), 'members': g}
            for g in groups if len(g) >= 2
        ]

    strong_resistance = clusters('RESISTANCE', max)
    strong_support = clusters('SUPPORT', min)

    # The outermost levels are strong by definition — the highest resistance is
    # the ultimate ceiling and the lowest support the ultimate floor. Add each
    # as a single-member strong line unless a cluster already sits on it.
    resistances = [l for l in (levels or []) if l['type'] == 'RESISTANCE']
    supports = [l for l in (levels or []) if l['type'] == 'SUPPORT']

    if resistances:
        top = max(resistances, key=lambda l: l['price'])
        if not any(c['price'] == top['price'] for c in strong_resistance):
            strong_resistance.append({'price': top['price'], 'members': [top], 'extreme': True})
    if supports:
        bottom = min(supports, key=lambda l: l['price'])
        if not any(c['price'] == bottom['price'] for c in strong_support):
            strong_support.append({'price': bottom['price'], 'members': [bottom], 'extreme': True})

    return {
        'strong_resistance': strong_resistance,
        'strong_support': strong_support,
    }


def evaluate_breakout(levels, strong_pct, prev_price, price, strict=False):
    """Evaluate the swing-level breakout entry rule (scanner-aligned).

    1. The most-recently-formed level ("last level") sets the trade bias:
       RESISTANCE -> bullish (buy), SUPPORT -> bearish (sell/short).
    2. Levels are re-classified by the pre-breakout price (above -> RESISTANCE,
       at/below -> SUPPORT), the same way the swing-level scanner and the
       chart do.
    3. The scanner's "strong + nearest" condition must hold on the
       trade-direction side: the NEAREST level to the pre-breakout price must
       sit on a strong cluster (member of it; strict=True requires it to BE
       the cluster's line price).
    4. Entry fires when price crosses through that cluster's strong line
       between the previous tick/candle and the current one.

    Returns None, or {'direction', 'level_price', 'nearest_price',
    'cluster_size', 'last_level'}.
    """
    if prev_price is None or price is None:
        return None

    last = find_last_level(levels)
    if not last:
        return None

    direction = 'bullish' if last['type'] == 'RESISTANCE' else 'bearish'

    # The scanner condition is a pre-breakout state, so classify and pick the
    # nearest level relative to prev_price — at the crossing tick the broken
    # level would already have flipped sides if classified by current price.
    classified = classify_by_ltp(levels, prev_price)
    nearest = find_nearest_levels(classified, prev_price)
    strong = find_strong_levels(classified, strong_pct)

    if direction == 'bullish':
        nearest_level = nearest['nearest_resistance']
        clusters = strong['strong_resistance']
    else:
        nearest_level = nearest['nearest_support']
        clusters = strong['strong_support']

    if not nearest_level:
        return None

    cluster = None
    for c in clusters:
        if strict:
            matched = c['price'] == nearest_level['price']
        else:
            matched = any(m['price'] == nearest_level['price'] for m in c['members'])
        if matched:
            cluster = c
            break
    if cluster is None:
        return None

    level_price = cluster['price']
    if direction == 'bullish':
        crossed = prev_price < level_price <= price
    else:
        crossed = prev_price > level_price >= price

    if not crossed:
        return None

    return {
        'direction': direction,
        'level_price': level_price,
        'nearest_price': nearest_level['price'],
        'cluster_size': len(cluster['members']),
        'is_extreme': bool(cluster.get('extreme')),
        'last_level': last,
    }
