import json
import logging
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models import KiteConfig
from app.models.strategy import Strategy
from app.models.user_strategy import UserStrategy
from app.routes.decorators import customer_required
from app.services.encryption import decrypt

logger = logging.getLogger(__name__)

customer_backtest_bp = Blueprint('customer_backtest', __name__)

_IST = timezone(timedelta(hours=5, minutes=30))


def _j(val, default=None):
    """Parse val if it's a JSON string; otherwise return as-is."""
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return default
    return val if val is not None else default


def _num(v, default=None):
    """Coerce v to float; return default if not numeric."""
    if v is None or v == '':
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ─── Candle-pattern logic (mirrors useStrategyExecutor.js) ────────────────────

def _check_candle_condition(cond, candles):
    if not candles or len(candles) < 2:
        return False
    cond = _j(cond, {})
    if not isinstance(cond, dict):
        return False
    today = candles[-1]
    prev  = candles[-2]
    t     = cond.get('type', '')
    v     = float(cond.get('value') or 0)

    if t == 'bullish_candle':
        if today['close'] <= today['open']:
            return False
        rng = today['high'] - today['low']
        return True if rng <= 0 else (today['close'] - today['open']) / rng * 100 >= v

    if t == 'bearish_candle':
        if today['close'] >= today['open']:
            return False
        rng = today['high'] - today['low']
        return True if rng <= 0 else (today['open'] - today['close']) / rng * 100 >= v

    if t == 'gap_up':
        return prev['close'] > 0 and (today['open'] - prev['close']) / prev['close'] * 100 >= v

    if t == 'gap_down':
        return prev['close'] > 0 and (prev['close'] - today['open']) / prev['close'] * 100 >= v

    if t == 'bullish_engulfing':
        return (prev['close'] < prev['open'] and today['close'] > today['open']
                and today['open'] <= prev['close'] and today['close'] >= prev['open'])

    if t == 'bearish_engulfing':
        return (prev['close'] > prev['open'] and today['close'] < today['open']
                and today['open'] >= prev['close'] and today['close'] <= prev['open'])

    if t == 'hammer':
        rng = today['high'] - today['low']
        if rng <= 0:
            return False
        return (min(today['open'], today['close']) - today['low']) / rng * 100 >= (v or 60)

    if t == 'shooting_star':
        rng = today['high'] - today['low']
        if rng <= 0:
            return False
        return (today['high'] - max(today['open'], today['close'])) / rng * 100 >= (v or 60)

    if t == 'doji':
        rng = today['high'] - today['low']
        if rng <= 0:
            return False
        return abs(today['close'] - today['open']) / rng * 100 <= (v or 5)

    if t == 'inside_bar':
        return today['high'] <= prev['high'] and today['low'] >= prev['low']

    if t == 'outside_bar':
        return today['high'] > prev['high'] and today['low'] < prev['low']

    if t == 'consolidation_breakout':
        n = max(2, int(v or 3))
        if len(candles) < n + 1:
            return False
        prev_n = candles[-(n + 1):-1]
        max_h  = max(c['high'] for c in prev_n)
        min_h  = min(c['high'] for c in prev_n)
        rp     = (max_h - min_h) / min_h * 100 if min_h > 0 else 999
        return rp <= 0.4 and today['high'] > max_h

    if t == 'consolidation_breakdown':
        n = max(2, int(v or 3))
        if len(candles) < n + 1:
            return False
        prev_n = candles[-(n + 1):-1]
        max_l  = max(c['low'] for c in prev_n)
        min_l  = min(c['low'] for c in prev_n)
        rp     = (max_l - min_l) / min_l * 100 if min_l > 0 else 999
        return rp <= 0.4 and today['low'] < min_l

    return False


def _check_pattern(pattern, candles):
    conds = _j((pattern or {}).get('entry_conditions', []), [])
    if not isinstance(conds, list) or not conds:
        return False
    return all(_check_candle_condition(c, candles) for c in conds)


def _calc_rsi(candles, period):
    if len(candles) < period + 1:
        return None
    closes = [c['close'] for c in candles]
    gains = losses = 0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        if d > 0:
            gains += d
        else:
            losses += abs(d)
    ag, al = gains / period, losses / period
    for i in range(period + 1, len(closes)):
        d   = closes[i] - closes[i - 1]
        ag  = (ag * (period - 1) + max(d, 0)) / period
        al  = (al * (period - 1) + max(-d, 0)) / period
    return 100 if al == 0 else 100 - 100 / (1 + ag / al)


def _calc_ema(candles, period):
    if len(candles) < period:
        return None
    closes = [c['close'] for c in candles]
    k   = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for c in closes[period:]:
        ema = c * k + ema * (1 - k)
    return ema


def _calc_sma(candles, period):
    if len(candles) < period:
        return None
    return sum(c['close'] for c in candles[-period:]) / period


def _calc_atr(candles, period=14):
    """Average True Range over the most recent `period` candles. Needs `period + 1` history."""
    if len(candles) < period + 1:
        return None
    trs = []
    for i in range(1, len(candles)):
        h, l, pc = candles[i]['high'], candles[i]['low'], candles[i - 1]['close']
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    if len(trs) < period:
        return None
    return sum(trs[-period:]) / period


def _check_indicators(settings, candles):
    settings = _j(settings, {})
    if not isinstance(settings, dict) or not settings:
        return True
    last = candles[-1]

    rsi_cfg = _j(settings.get('rsi'), {}) or {}
    if rsi_cfg.get('enabled'):
        p   = int(rsi_cfg.get('period') or 14)
        rsi = _calc_rsi(candles, p)
        if rsi is None:
            return False
        mn, mx = float(rsi_cfg.get('min') or 0), float(rsi_cfg.get('max') or 100)
        if not (mn <= rsi <= mx):
            return False

    ema_cfg = _j(settings.get('ema'), {}) or {}
    if ema_cfg.get('enabled'):
        p   = int(ema_cfg.get('period') or 20)
        ema = _calc_ema(candles, p)
        if ema is None:
            return False
        cond = ema_cfg.get('condition', 'price_above')
        if cond == 'price_above' and last['close'] <= ema:
            return False
        if cond == 'price_below' and last['close'] >= ema:
            return False

    sma_cfg = _j(settings.get('sma'), {}) or {}
    if sma_cfg.get('enabled'):
        p   = int(sma_cfg.get('period') or 50)
        sma = _calc_sma(candles, p)
        if sma is None:
            return False
        cond = sma_cfg.get('condition', 'price_above')
        if cond == 'price_above' and last['close'] <= sma:
            return False
        if cond == 'price_below' and last['close'] >= sma:
            return False

    vol_cfg = _j(settings.get('volume'), {}) or {}
    if vol_cfg.get('enabled'):
        p    = int(vol_cfg.get('period') or 20)
        mult = float(vol_cfg.get('min_multiplier') or 1.5)
        if len(candles) < p + 1:
            return False
        avg = sum(c['volume'] for c in candles[-(p + 1):-1]) / p
        if last['volume'] < avg * mult:
            return False

    return True


def _check_trend_filter(filters, candles):
    filters = _j(filters, {})
    tf = (filters if isinstance(filters, dict) else {}).get('trend_day_filter') or {}
    if not tf.get('enabled'):
        return True
    mx     = int(tf.get('max_consecutive') or 3)
    recent = candles[-(mx + 1):-1]
    if len(recent) < mx:
        return True
    all_bull = all(c['close'] > c['open'] for c in recent)
    all_bear = all(c['close'] < c['open'] for c in recent)
    return not all_bull and not all_bear


def _check_day_filter(filters, date_str):
    """Day-of-week trade filter. UI uses Sun=0..Sat=6."""
    filters = _j(filters, {})
    df = (filters if isinstance(filters, dict) else {}).get('day_filter') or {}
    if not df.get('enabled'):
        return True
    try:
        d = datetime.strptime(date_str, '%Y-%m-%d')
    except (TypeError, ValueError):
        return True
    js_weekday = (d.weekday() + 1) % 7  # Python Mon=0 → JS Sun=0
    allowed = df.get('days') or [1, 2, 3, 4, 5]
    return js_weekday in allowed


def _check_loss_limit(filters, prior_trades):
    """Block entries after N consecutive losing trades."""
    filters = _j(filters, {})
    ll = (filters if isinstance(filters, dict) else {}).get('loss_limit') or {}
    if not ll.get('enabled'):
        return True
    mx = int(ll.get('max_consecutive_losses') or 2)
    consec = 0
    for t in reversed(prior_trades):
        if t['pnl_pct'] < 0:
            consec += 1
        else:
            break
    return consec < mx


def _check_candle_size(strategy_dict, det_candle):
    """Pre-entry filter: reject if detection candle range exceeds max % of close."""
    sl_rules = _j(strategy_dict.get('stop_loss_rules'), {}) or {}
    max_pct = _num(sl_rules.get('candle_size_max_pct'))
    if max_pct is None:
        return True
    close = det_candle.get('close') or 0
    if close <= 0:
        return True
    rng_pct = (det_candle['high'] - det_candle['low']) / close * 100
    return rng_pct <= max_pct


def _required_warmup(indicator_settings, trade_filters):
    needed = 15  # ATR(14) needs 15 candles
    indicator_settings = _j(indicator_settings, {})
    if isinstance(indicator_settings, dict):
        for key, default in [('rsi', 14), ('ema', 20), ('sma', 50), ('volume', 20)]:
            cfg = _j(indicator_settings.get(key), {}) or {}
            if cfg.get('enabled'):
                needed = max(needed, int(cfg.get('period') or default) + 5)
    trade_filters = _j(trade_filters, {})
    tf = (trade_filters if isinstance(trade_filters, dict) else {}).get('trend_day_filter') or {}
    if tf.get('enabled'):
        needed = max(needed, int(tf.get('max_consecutive') or 3) + 5)
    return min(needed, 100)


# ─── Trade plan resolver ──────────────────────────────────────────────────────

def _build_trade_plan(strategy_dict, candles_at_entry, entry_price, det_candle, direction):
    """
    Resolve all strategy rules into a concrete execution plan applied to one trade.

    candles_at_entry: closed-candle history available at entry-decision time (used for ATR).
    det_candle: the detection candle whose low/high acts as the structural stop.
    """
    sl_pct  = _num(strategy_dict.get('stop_loss_pct'), 2)
    tp_pct  = _num(strategy_dict.get('take_profit_pct'), 4)
    sl_rules  = _j(strategy_dict.get('stop_loss_rules'), {}) or {}
    tgt_rules = _j(strategy_dict.get('target_rules'), {}) or {}

    sign = 1 if direction == 'bullish' else -1

    # Base SL distance: ATR-driven if requested
    atr_mult = _num(sl_rules.get('atr_multiplier'))
    base_sl_dist = None
    if atr_mult is not None and atr_mult > 0:
        atr = _calc_atr(candles_at_entry, period=14)
        if atr and atr > 0:
            base_sl_dist = atr * atr_mult
    if base_sl_dist is None:
        base_sl_dist = entry_price * sl_pct / 100

    # Base TP distance: risk-reward-driven if requested
    rr_ratio = _num(tgt_rules.get('risk_reward_ratio'))
    if rr_ratio is not None and rr_ratio > 0:
        base_tp_dist = base_sl_dist * rr_ratio
    else:
        base_tp_dist = entry_price * tp_pct / 100

    # Multi-target levels
    levels = []
    for key in ('pct_target_1', 'pct_target_2', 'pct_target_3'):
        v = _num(tgt_rules.get(key))
        if v is not None and v > 0:
            levels.append(v)
    levels.sort()
    targets = [
        {'index': idx, 'price': entry_price + sign * (entry_price * pct / 100), 'pct': pct}
        for idx, pct in enumerate(levels)
    ]

    # Partial-book — only honored when no multi-targets are set
    partial_book = None
    if not targets:
        bp = _num(tgt_rules.get('book_partial_at_pct'))
        if bp is not None and bp > 0:
            partial_book = {
                'price': entry_price + sign * (entry_price * bp / 100),
                'fraction': 0.5,
                'pct': bp,
            }

    return {
        'direction': direction,
        'sign': sign,
        'entry_price': entry_price,
        'det_candle_low':  det_candle['low'],
        'det_candle_high': det_candle['high'],
        'base_sl_dist': base_sl_dist,
        'base_tp_dist': base_tp_dist,
        'initial_sl_price': entry_price - sign * base_sl_dist,
        'final_tp_price':  entry_price + sign * base_tp_dist,
        'trail_pct':       _num(sl_rules.get('trailing_stop_pct')),
        'break_even_pct':  _num(sl_rules.get('break_even_after_pct')),
        'exit_below_first_candle': bool(sl_rules.get('exit_below_first_candle_low')),
        'targets': targets,
        'partial_book': partial_book,
        'atr_used': atr_mult is not None and base_sl_dist != entry_price * sl_pct / 100,
    }


# ─── Per-candle exit simulator ────────────────────────────────────────────────

def _split_qty(remaining, targets_left):
    """Equal split of remaining qty across remaining target legs; min 1 share."""
    if targets_left <= 0:
        return remaining
    if targets_left == 1:
        return remaining
    return max(1, remaining // targets_left)


def _simulate_exits(plan, total_qty, candles_after_entry):
    """
    Walk forward candle-by-candle, returning a list of fills.

    Convention when both SL and TP could trigger inside one bar: SL fires first
    (conservative — favours risk control, matches industry-standard backtests).
    """
    direction = plan['direction']
    sign      = plan['sign']
    entry     = plan['entry_price']

    hwm = entry  # high water mark — bullish trail anchor
    lwm = entry  # low water mark  — bearish trail anchor
    current_sl = plan['initial_sl_price']
    targets_hit = set()
    partial_booked = False
    remaining = total_qty
    fills = []

    for c in candles_after_entry:
        if remaining <= 0:
            break
        h, l = c['high'], c['low']
        date = c['date']

        # Update water marks
        if direction == 'bullish':
            hwm = max(hwm, h)
        else:
            lwm = min(lwm, l)

        # Trailing stop
        if plan['trail_pct'] is not None and plan['trail_pct'] > 0:
            if direction == 'bullish':
                trail = hwm * (1 - plan['trail_pct'] / 100)
                current_sl = max(current_sl, trail)
            else:
                trail = lwm * (1 + plan['trail_pct'] / 100)
                current_sl = min(current_sl, trail)

        # Break-even lift (once profit threshold met, SL never below entry)
        if plan['break_even_pct'] is not None and plan['break_even_pct'] > 0:
            be_trigger = entry * (1 + sign * plan['break_even_pct'] / 100)
            triggered = (h >= be_trigger) if direction == 'bullish' else (l <= be_trigger)
            if triggered:
                if direction == 'bullish':
                    current_sl = max(current_sl, entry)
                else:
                    current_sl = min(current_sl, entry)

        # ── 1. Stop / structural exit (full remaining) ────────────────────────
        sl_triggered = (l <= current_sl) if direction == 'bullish' else (h >= current_sl)
        struct_violated = False
        struct_price = None
        if plan['exit_below_first_candle']:
            if direction == 'bullish' and l < plan['det_candle_low']:
                struct_violated = True
                struct_price = plan['det_candle_low']
            elif direction == 'bearish' and h > plan['det_candle_high']:
                struct_violated = True
                struct_price = plan['det_candle_high']

        if sl_triggered or struct_violated:
            # When both could fire in the same bar, the level closer to the open fires first.
            # Bullish: price falls — higher of (sl, struct) hits first.
            # Bearish: price rises — lower of  (sl, struct) hits first.
            if sl_triggered and struct_violated:
                if direction == 'bullish':
                    use_sl = current_sl >= struct_price
                else:
                    use_sl = current_sl <= struct_price
            else:
                use_sl = sl_triggered
            if use_sl:
                exit_price, reason = current_sl, 'stop_loss'
            else:
                exit_price, reason = struct_price, 'first_candle_violated'
            fills.append({'qty': remaining, 'price': exit_price, 'date': date, 'reason': reason})
            remaining = 0
            break

        # ── 2. Multi-target partial exits (in ascending order for bullish) ────
        for t in plan['targets']:
            if t['index'] in targets_hit:
                continue
            hit = (h >= t['price']) if direction == 'bullish' else (l <= t['price'])
            if hit:
                targets_left = sum(1 for tt in plan['targets'] if tt['index'] not in targets_hit)
                qty = min(remaining, _split_qty(remaining, targets_left))
                if qty <= 0:
                    targets_hit.add(t['index'])
                    continue
                fills.append({
                    'qty': qty,
                    'price': t['price'],
                    'date': date,
                    'reason': f"take_profit_t{t['index'] + 1}",
                })
                remaining -= qty
                targets_hit.add(t['index'])
                if remaining <= 0:
                    break

        if remaining <= 0:
            break

        # ── 3. Single partial book (50% at one level) ─────────────────────────
        if plan['partial_book'] and not partial_booked:
            pb = plan['partial_book']
            hit = (h >= pb['price']) if direction == 'bullish' else (l <= pb['price'])
            if hit:
                qty = max(1, int(total_qty * pb['fraction']))
                qty = min(qty, remaining)
                fills.append({
                    'qty': qty, 'price': pb['price'], 'date': date, 'reason': 'partial_book',
                })
                remaining -= qty
                partial_booked = True

        if remaining <= 0:
            break

        # ── 4. Final TP — only if no multi-targets or all multi-targets hit ───
        all_targets_done = (not plan['targets']) or (len(targets_hit) == len(plan['targets']))
        if all_targets_done:
            final_tp = plan['final_tp_price']
            hit = (h >= final_tp) if direction == 'bullish' else (l <= final_tp)
            if hit:
                fills.append({
                    'qty': remaining, 'price': final_tp, 'date': date, 'reason': 'take_profit',
                })
                remaining = 0
                break

    # End-of-period flush
    if remaining > 0 and candles_after_entry:
        last = candles_after_entry[-1]
        fills.append({
            'qty': remaining, 'price': last['close'],
            'date': last['date'], 'reason': 'end_of_period',
        })

    return fills


def _summarize_fills(fills, entry_price, direction):
    """Aggregate fills into VWAP exit + dominant reason for display."""
    qty_total = sum(f['qty'] for f in fills)
    if qty_total <= 0:
        return 0, entry_price, 'end_of_period', 0, 0
    vwap = sum(f['qty'] * f['price'] for f in fills) / qty_total
    if direction == 'bullish':
        pnl = (vwap - entry_price) * qty_total
    else:
        pnl = (entry_price - vwap) * qty_total
    pnl_pct = (pnl / (entry_price * qty_total)) * 100 if entry_price > 0 else 0

    reasons = [f['reason'] for f in fills]
    unique_reasons = set(reasons)
    if len(unique_reasons) == 1:
        reason = reasons[0]
    elif any(r == 'stop_loss' or r == 'first_candle_violated' for r in reasons) and any(r.startswith('take_profit') or r == 'partial_book' for r in reasons):
        reason = 'partial_then_sl'
    elif all(r.startswith('take_profit') for r in reasons):
        reason = 'multi_target'
    else:
        reason = reasons[-1]
    return qty_total, vwap, reason, pnl, pnl_pct


# ─── Core simulation ──────────────────────────────────────────────────────────

def _simulate(strategy_dict, all_candles):
    pattern   = _j(strategy_dict.get('candle_pattern'), {}) or {}
    direction = pattern.get('direction', 'bullish')
    ind_cfg   = _j(strategy_dict.get('indicator_settings'), {})
    trade_cfg = _j(strategy_dict.get('trade_filters'), {})
    # Merge entry_conditions into pattern dict for _check_pattern() compat
    pattern   = {**pattern, 'entry_conditions': _j(strategy_dict.get('entry_conditions'), [])}
    warmup    = _required_warmup(ind_cfg, trade_cfg)
    quantity  = int(strategy_dict.get('quantity') or 1)

    detections = []
    trades     = []

    i = warmup
    while i < len(all_candles):
        det_window = all_candles[:i + 1]

        # Pattern + indicator + trend filter (all evaluated on closed candles ≤ i)
        pattern_ok = _check_pattern(pattern, det_window) and _check_indicators(ind_cfg, det_window) and _check_trend_filter(trade_cfg, det_window)

        if not pattern_ok:
            i += 1
            continue

        det = all_candles[i]
        detections.append({
            'date': det['date'], 'candle': det,
            'pattern_name': pattern.get('name', 'Pattern'),
        })

        # Need a next-day candle to enter on
        if i + 1 >= len(all_candles):
            i += 1
            continue

        entry_c = all_candles[i + 1]
        entry_price = entry_c['open']

        # Live-parity pre-entry filters — block entry but keep the detection recorded
        if not _check_day_filter(trade_cfg, entry_c['date']):
            i += 1
            continue
        if not _check_loss_limit(trade_cfg, trades):
            i += 1
            continue
        if not _check_candle_size(strategy_dict, det):
            i += 1
            continue

        # Resolve the full plan, then simulate exits across all subsequent candles
        plan = _build_trade_plan(strategy_dict, det_window, entry_price, det, direction)
        # Exit walk starts at entry day itself — same-day SL/TP is realistic
        candles_after = all_candles[i + 1:]
        fills = _simulate_exits(plan, quantity, candles_after)

        qty_total, vwap_exit, reason, pnl, pnl_pct = _summarize_fills(fills, entry_price, direction)

        # Find the last fill's date for headline exit_date
        last_fill_date = fills[-1]['date'] if fills else entry_c['date']

        trades.append({
            'detection_date': det['date'],
            'entry_date':     entry_c['date'],
            'entry_price':    round(entry_price, 2),
            'exit_date':      last_fill_date,
            'exit_price':     round(vwap_exit, 2),
            'exit_reason':    reason,
            'pnl':            round(pnl, 2),
            'pnl_pct':        round(pnl_pct, 2),
            'direction':      direction.upper(),
            'fills':          [
                {
                    'qty':    int(f['qty']),
                    'price':  round(f['price'], 2),
                    'date':   f['date'],
                    'reason': f['reason'],
                } for f in fills
            ],
        })

        # Advance to candle right after the last fill so we don't double-enter
        last_fill_index = i + 1
        if fills:
            # find the candle index matching last fill date
            for j in range(i + 1, len(all_candles)):
                if all_candles[j]['date'] == fills[-1]['date']:
                    last_fill_index = j
                    break
        i = last_fill_index + 1

    return detections, trades


def _simulate_options(strategy_dict, all_candles, kite, option_config):
    """
    Options-mode backtest. Pattern detection runs on the underlying candles, but
    each entry is simulated against the historical premium series of the
    resolved CE/PE contract. Detection days where no live NFO/BFO contract can
    be resolved are returned in `skipped_dates`.
    """
    from app.services.option_resolver import resolve_option_contract
    from datetime import datetime as _dt

    pattern   = _j(strategy_dict.get('candle_pattern'), {}) or {}
    direction = pattern.get('direction', 'bullish')
    ind_cfg   = _j(strategy_dict.get('indicator_settings'), {})
    trade_cfg = _j(strategy_dict.get('trade_filters'), {})
    # Merge entry_conditions into pattern dict for _check_pattern() compat
    pattern   = {**pattern, 'entry_conditions': _j(strategy_dict.get('entry_conditions'), [])}
    warmup    = _required_warmup(ind_cfg, trade_cfg)
    quantity  = int(strategy_dict.get('quantity') or 1)

    underlying       = (option_config or {}).get('underlying', 'NIFTY')
    strike_selection = (option_config or {}).get('strike_selection', 'ATM')
    expiry_policy    = (option_config or {}).get('expiry', 'current_week')

    detections    = []
    trades        = []
    skipped_dates = []

    i = warmup
    while i < len(all_candles):
        det_window = all_candles[:i + 1]

        pattern_ok = (
            _check_pattern(pattern, det_window)
            and _check_indicators(ind_cfg, det_window)
            and _check_trend_filter(trade_cfg, det_window)
        )
        if not pattern_ok:
            i += 1
            continue

        det = all_candles[i]
        detections.append({
            'date': det['date'], 'candle': det,
            'pattern_name': pattern.get('name', 'Pattern'),
        })

        if i + 1 >= len(all_candles):
            i += 1
            continue

        entry_c = all_candles[i + 1]

        if not _check_day_filter(trade_cfg, entry_c['date']):
            i += 1
            continue
        if not _check_loss_limit(trade_cfg, trades):
            i += 1
            continue
        if not _check_candle_size(strategy_dict, det):
            i += 1
            continue

        # Resolve the option contract as of the detection day (using detection
        # close as the underlying LTP — entry happens at next-day open).
        try:
            det_date = _dt.strptime(det['date'], '%Y-%m-%d').date()
        except Exception:
            skipped_dates.append(det['date'])
            i += 1
            continue

        contract = resolve_option_contract(
            underlying=underlying, direction=direction,
            strike_selection=strike_selection, expiry=expiry_policy,
            ltp_at_entry=det['close'], kite=kite, as_of=det_date,
        )
        if not contract:
            skipped_dates.append(det['date'])
            i += 1
            continue

        # Pull option premium daily candles from entry day through contract expiry
        try:
            entry_date = _dt.strptime(entry_c['date'], '%Y-%m-%d').date()
            expiry_date = _dt.strptime(contract['expiry'], '%Y-%m-%d').date()
            premium_raw = kite.historical_data(
                contract['instrument_token'],
                entry_date.strftime('%Y-%m-%d'),
                expiry_date.strftime('%Y-%m-%d'),
                'day',
            )
        except Exception as exc:
            logger.warning("Premium history fetch failed for %s: %s", contract['tradingsymbol'], exc)
            skipped_dates.append(det['date'])
            i += 1
            continue

        if not premium_raw:
            skipped_dates.append(det['date'])
            i += 1
            continue

        premium_candles = [{
            'date':   c['date'].strftime('%Y-%m-%d'),
            'open':   c['open'], 'high': c['high'],
            'low':    c['low'],  'close': c['close'],
            'volume': c.get('volume', 0),
        } for c in premium_raw]

        entry_price = premium_candles[0]['open']
        # Long option position regardless of underlying direction
        plan_det_candle = {'low': 0.0, 'high': float('inf'), 'close': entry_price}
        plan = _build_trade_plan(strategy_dict, det_window, entry_price, plan_det_candle, 'bullish')
        fills = _simulate_exits(plan, quantity, premium_candles)
        qty_total, vwap_exit, reason, pnl, pnl_pct = _summarize_fills(fills, entry_price, 'bullish')
        last_fill_date = fills[-1]['date'] if fills else entry_c['date']

        trades.append({
            'detection_date': det['date'],
            'entry_date':     entry_c['date'],
            'entry_price':    round(entry_price, 2),
            'exit_date':      last_fill_date,
            'exit_price':     round(vwap_exit, 2),
            'exit_reason':    reason,
            'pnl':            round(pnl, 2),
            'pnl_pct':        round(pnl_pct, 2),
            'direction':      direction.upper(),
            'instrument':     contract['tradingsymbol'],
            'exchange':       contract['exchange'],
            'option_strike':  contract['strike'],
            'option_expiry':  contract['expiry'],
            'option_type':    contract['option_type'],
            'fills':          [
                {'qty': int(f['qty']), 'price': round(f['price'], 2),
                 'date': f['date'], 'reason': f['reason']} for f in fills
            ],
        })

        # Advance past last fill date in the underlying timeline
        last_fill_index = i + 1
        if fills:
            for j in range(i + 1, len(all_candles)):
                if all_candles[j]['date'] == fills[-1]['date']:
                    last_fill_index = j
                    break
        i = last_fill_index + 1

    return detections, trades, skipped_dates


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@customer_backtest_bp.post('/api/customer/backtest')
@customer_required
def run_backtest():
    user_id = int(get_jwt_identity())
    data    = request.get_json() or {}

    strategy_id = data.get('strategy_id')
    try:
        days = min(max(int(data.get('days', 90)), 30), 365)
    except (ValueError, TypeError):
        days = 90

    if not strategy_id:
        return jsonify({'error': 'strategy_id required'}), 400

    us = UserStrategy.query.filter_by(user_id=user_id, strategy_id=strategy_id).first()
    if not us:
        return jsonify({'error': 'Strategy not found or not assigned to you'}), 404

    strategy = Strategy.query.get(strategy_id)
    if not strategy:
        return jsonify({'error': 'Strategy not found'}), 404

    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (config and config.is_connected and config.access_token_encrypted):
        return jsonify({'error': 'Kite not connected — connect your Kite account to run backtests'}), 400

    try:
        from kiteconnect import KiteConnect
        from app.routes.customer.market import _resolve_token
        from app.services.option_resolver import meta_for as _option_meta_for

        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))

        option_config = strategy.option_config if isinstance(strategy.option_config, dict) else None
        options_mode  = bool(option_config and option_config.get('enabled'))

        if options_mode:
            meta = _option_meta_for(option_config.get('underlying') or 'NIFTY')
            if not meta:
                return jsonify({'error': f"Unknown underlying: {option_config.get('underlying')!r}"}), 400
            candle_symbol   = meta['underlying_symbol']
            candle_exchange = meta['underlying_exchange']
        else:
            candle_symbol   = strategy.instrument
            candle_exchange = strategy.exchange.value if hasattr(strategy.exchange, 'value') else str(strategy.exchange)

        token = _resolve_token(candle_symbol, candle_exchange, kite)
        if not token:
            return jsonify({'error': f'{candle_exchange}:{candle_symbol} not found — refresh instruments'}), 404

        now_ist   = datetime.now(_IST)
        to_date   = now_ist.date()
        from_date = to_date - timedelta(days=days + 120)  # extra for warmup

        raw = kite.historical_data(
            token,
            from_date.strftime('%Y-%m-%d'),
            to_date.strftime('%Y-%m-%d'),
            'day',
        )

        all_candles = [{
            'date':   c['date'].strftime('%Y-%m-%d'),
            'open':   c['open'],
            'high':   c['high'],
            'low':    c['low'],
            'close':  c['close'],
            'volume': c['volume'],
        } for c in raw]

        if len(all_candles) < 5:
            return jsonify({'error': 'Not enough historical data for this instrument'}), 400

        strategy_dict = strategy.to_dict()
        pattern       = strategy_dict.get('candle_pattern') or {}
        warmup        = _required_warmup(
            strategy_dict.get('indicator_settings'),
            strategy_dict.get('trade_filters'),
        )

        # Keep days + warmup candles so first day in simulation window has proper history
        sim_candles = all_candles[-(days + warmup):]

        if options_mode:
            detections, trades, skipped_dates = _simulate_options(strategy_dict, sim_candles, kite, option_config)
        else:
            detections, trades = _simulate(strategy_dict, sim_candles)
            skipped_dates = []

        winning  = [t for t in trades if t['pnl_pct'] > 0]
        losing   = [t for t in trades if t['pnl_pct'] <= 0]

        # Categorize by what stopped the trade. With multi-leg fills the headline
        # reason is the *last* fill's reason; "partial_then_sl" counts as SL.
        sl_reasons = {'stop_loss', 'first_candle_violated', 'partial_then_sl'}
        tp_reasons = {'take_profit', 'multi_target', 'partial_book'}
        tp_reasons |= {f'take_profit_t{i}' for i in (1, 2, 3)}

        sl_count = sum(1 for t in trades if t['exit_reason'] in sl_reasons)
        tp_count = sum(1 for t in trades if t['exit_reason'] in tp_reasons)
        total_pnl   = round(sum(t['pnl'] for t in trades), 2)
        accuracy    = round(len(winning) / len(trades) * 100, 1) if trades else 0
        avg_pnl_pct = round(sum(t['pnl_pct'] for t in trades) / len(trades), 2) if trades else 0

        # Period covers the requested days (exclude warmup)
        report_candles = sim_candles[warmup:]
        period_from = report_candles[0]['date']  if report_candles else from_date.strftime('%Y-%m-%d')
        period_to   = report_candles[-1]['date'] if report_candles else to_date.strftime('%Y-%m-%d')

        return jsonify({
            'strategy':           strategy_dict,
            'period':             {'from': period_from, 'to': period_to, 'days': days},
            'candles_analyzed':   len(report_candles),
            'pattern_detections': detections,
            'trades':             trades,
            'skipped_dates':      skipped_dates,
            'summary': {
                'total_patterns_identified': len(detections),
                'total_trades_executed':     len(trades),
                'winning_trades':            len(winning),
                'losing_trades':             len(losing),
                'stop_loss_triggered':       sl_count,
                'take_profit_triggered':     tp_count,
                'accuracy_pct':              accuracy,
                'total_pnl':                 total_pnl,
                'avg_pnl_pct':               avg_pnl_pct,
            },
        }), 200

    except Exception as exc:
        logger.exception("Backtest failed for strategy %s user %s: %s", strategy_id, user_id, exc)
        return jsonify({'error': str(exc)}), 500
