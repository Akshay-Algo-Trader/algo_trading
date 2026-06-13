import json
import logging
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

from app.models import KiteConfig
from app.models.strategy import Strategy
from app.models.user_strategy import UserStrategy
from app.routes.decorators import customer_required
from app.services.encryption import decrypt
from app.services.swing_breakout import evaluate_breakout
from app.services.swing_zone_detector import (
    _BUFFER_DAYS,
    _MAX_FETCH_DAYS,
    detect_sr_levels,
    fetch_candles_for_swing_config,
)

logger = logging.getLogger(__name__)

customer_backtest_bp = Blueprint('customer_backtest', __name__)


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


# ─── Swing-level breakout simulation ──────────────────────────────────────────

def _breakout_label(signal):
    """Human-readable breakout name that surfaces the strong-level kind — the
    MAX RESISTANCE / MIN SUPPORT extreme (now treated as strong) vs a cluster —
    mirroring the live engine's entry log."""
    direction = signal['direction']
    if signal.get('is_extreme'):
        strong = 'MAX RESISTANCE' if direction == 'bullish' else 'MIN SUPPORT'
    else:
        strong = f"strong cluster ×{signal['cluster_size']}"
    return f"{direction.upper()} Breakout — {strong}"


def _rolling_window(all_candles, i, period_days):
    """Candles within `period_days` of all_candles[i]['date'], inclusive, up to index i."""
    end_dt = datetime.strptime(all_candles[i]['date'], '%Y-%m-%d %H:%M:%S')
    start_dt = end_dt - timedelta(days=period_days)
    return [
        c for c in all_candles[:i + 1]
        if datetime.strptime(c['date'], '%Y-%m-%d %H:%M:%S') >= start_dt
    ]


def _simulate_swing_breakout(strategy_dict, swing_config, all_candles):
    """Walk forward over swing-config-granularity candles, recomputing S&R levels
    on a rolling `period_days` window and entering on the same breakout signal
    the live engine uses (`evaluate_breakout`)."""
    pivot_bars  = int(swing_config.get('pivot_bars') or 5)
    strong_pct  = swing_config.get('strong_level_pct')
    period_days = int(swing_config.get('period_days') or 30)
    quantity    = int(strategy_dict.get('quantity') or 1)

    detections = []
    trades = []

    i = 1
    while i < len(all_candles) - 1:
        window = _rolling_window(all_candles, i, period_days)
        if len(window) < pivot_bars * 2 + 1:
            i += 1
            continue

        levels = detect_sr_levels(window, pivot_bars)
        signal = evaluate_breakout(levels, strong_pct, all_candles[i - 1]['close'], all_candles[i]['close'])
        if not signal:
            i += 1
            continue

        det = all_candles[i]
        direction = signal['direction']
        detections.append({
            'date': det['date'],
            'candle': det,
            'pattern_name': _breakout_label(signal),
            'level_price': signal['level_price'],
        })

        if not _check_candle_size(strategy_dict, det):
            i += 1
            continue

        entry_c = all_candles[i + 1]
        entry_price = entry_c['open']

        plan = _build_trade_plan(strategy_dict, window, entry_price, det, direction)
        candles_after = all_candles[i + 1:]
        fills = _simulate_exits(plan, quantity, candles_after)
        qty_total, vwap_exit, reason, pnl, pnl_pct = _summarize_fills(fills, entry_price, direction)
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
            'level_price':    signal['level_price'],
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
            for j in range(i + 1, len(all_candles)):
                if all_candles[j]['date'] == fills[-1]['date']:
                    last_fill_index = j
                    break
        i = last_fill_index + 1

    return detections, trades


def _simulate_swing_breakout_options(strategy_dict, swing_config, all_candles, kite, option_config):
    """
    Options-mode backtest. Breakout detection runs on the underlying candles, but
    each entry is simulated against the historical daily premium series of the
    resolved CE/PE contract. Detection candles where no live NFO/BFO contract can
    be resolved are returned in `skipped_dates`.
    """
    from app.services.option_resolver import resolve_option_contract

    pivot_bars  = int(swing_config.get('pivot_bars') or 5)
    strong_pct  = swing_config.get('strong_level_pct')
    period_days = int(swing_config.get('period_days') or 30)
    quantity    = int(strategy_dict.get('quantity') or 1)

    underlying       = (option_config or {}).get('underlying', 'NIFTY')
    strike_selection = (option_config or {}).get('strike_selection', 'ATM')
    expiry_policy    = (option_config or {}).get('expiry', 'current_week')

    detections    = []
    trades        = []
    skipped_dates = []

    i = 1
    while i < len(all_candles) - 1:
        window = _rolling_window(all_candles, i, period_days)
        if len(window) < pivot_bars * 2 + 1:
            i += 1
            continue

        levels = detect_sr_levels(window, pivot_bars)
        signal = evaluate_breakout(levels, strong_pct, all_candles[i - 1]['close'], all_candles[i]['close'])
        if not signal:
            i += 1
            continue

        det = all_candles[i]
        direction = signal['direction']
        detections.append({
            'date': det['date'],
            'candle': det,
            'pattern_name': _breakout_label(signal),
            'level_price': signal['level_price'],
        })

        if not _check_candle_size(strategy_dict, det):
            i += 1
            continue

        entry_c = all_candles[i + 1]

        # Resolve the option contract as of the detection candle (using detection
        # close as the underlying LTP — entry happens on the next candle's open).
        try:
            det_date = datetime.strptime(det['date'][:10], '%Y-%m-%d').date()
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
            entry_date  = datetime.strptime(entry_c['date'][:10], '%Y-%m-%d').date()
            expiry_date = datetime.strptime(contract['expiry'], '%Y-%m-%d').date()
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
        plan = _build_trade_plan(strategy_dict, window, entry_price, plan_det_candle, 'bullish')
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
            'level_price':    signal['level_price'],
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

        # Advance past last fill date in the underlying timeline (premium dates are
        # day-only; compare against the date portion of the underlying candle date)
        last_fill_index = i + 1
        if fills:
            for j in range(i + 1, len(all_candles)):
                if all_candles[j]['date'][:10] == fills[-1]['date']:
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

    if not strategy.swing_zone_config_id:
        return jsonify({'error': 'Strategy has no Swing Zone Config — edit the strategy first'}), 400

    swing_config = strategy.swing_zone_config

    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (config and config.is_connected and config.access_token_encrypted):
        return jsonify({'error': 'Kite not connected — connect your Kite account to run backtests'}), 400

    try:
        from kiteconnect import KiteConnect
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

        candle_size = swing_config.candle_size
        max_extra = _MAX_FETCH_DAYS.get(candle_size, 400) - _BUFFER_DAYS.get(candle_size, 40) - swing_config.period_days
        days = min(days, max(max_extra, 1))

        all_candles = fetch_candles_for_swing_config(
            kite, swing_config.to_dict(), candle_symbol, candle_exchange, extra_days=days,
        )

        if len(all_candles) < swing_config.pivot_bars * 2 + 1:
            return jsonify({'error': 'Not enough historical data for this instrument'}), 400

        swing_config_dict = swing_config.to_dict()
        strategy_dict = strategy.to_dict()

        if options_mode:
            detections, trades, skipped_dates = _simulate_swing_breakout_options(
                strategy_dict, swing_config_dict, all_candles, kite, option_config,
            )
        else:
            detections, trades = _simulate_swing_breakout(strategy_dict, swing_config_dict, all_candles)
            skipped_dates = []

        # Restrict the report window to the requested `days` ending at the last candle
        last_dt = datetime.strptime(all_candles[-1]['date'], '%Y-%m-%d %H:%M:%S')
        cutoff_dt = last_dt - timedelta(days=days)
        report_candles = [
            c for c in all_candles
            if datetime.strptime(c['date'], '%Y-%m-%d %H:%M:%S') >= cutoff_dt
        ]
        if not report_candles:
            report_candles = all_candles

        cutoff_str = report_candles[0]['date']
        detections = [d for d in detections if d['date'] >= cutoff_str]
        trades     = [t for t in trades if t['entry_date'] >= cutoff_str]

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

        period_from = report_candles[0]['date']
        period_to   = report_candles[-1]['date']

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
