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
        return True
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


def _required_warmup(indicator_settings, trade_filters):
    needed = 10
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


# ─── Core simulation ──────────────────────────────────────────────────────────

def _simulate(strategy_dict, all_candles):
    pattern   = _j(strategy_dict.get('candle_pattern'), {}) or {}
    sl_pct    = float(strategy_dict.get('stop_loss_pct') or 2)
    tp_pct    = float(strategy_dict.get('take_profit_pct') or 4)
    direction = pattern.get('direction', 'bullish')
    ind_cfg   = _j(pattern.get('indicator_settings'), {})
    trade_cfg = _j(pattern.get('trade_filters'), {})
    warmup    = _required_warmup(ind_cfg, trade_cfg)
    quantity  = int(strategy_dict.get('quantity') or 1)

    detections = []
    trades     = []

    i = warmup
    while i < len(all_candles):
        window = all_candles[:i + 1]

        if (_check_pattern(pattern, window)
                and _check_indicators(ind_cfg, window)
                and _check_trend_filter(trade_cfg, window)):

            det = all_candles[i]
            detections.append({
                'date':         det['date'],
                'candle':       det,
                'pattern_name': pattern.get('name', 'Pattern'),
            })

            # Enter at next day's open
            if i + 1 >= len(all_candles):
                i += 1
                continue

            entry_c     = all_candles[i + 1]
            entry_price = entry_c['open']

            if direction == 'bearish':
                sl_price = entry_price * (1 + sl_pct / 100)
                tp_price = entry_price * (1 - tp_pct / 100)
            else:
                sl_price = entry_price * (1 - sl_pct / 100)
                tp_price = entry_price * (1 + tp_pct / 100)

            exit_idx    = len(all_candles) - 1
            exit_price  = all_candles[-1]['close']
            exit_reason = 'end_of_period'

            for j in range(i + 2, len(all_candles)):
                c = all_candles[j]
                if direction == 'bearish':
                    if c['high'] >= sl_price:
                        exit_idx, exit_price, exit_reason = j, sl_price, 'stop_loss'
                        break
                    if c['low'] <= tp_price:
                        exit_idx, exit_price, exit_reason = j, tp_price, 'take_profit'
                        break
                else:
                    if c['low'] <= sl_price:
                        exit_idx, exit_price, exit_reason = j, sl_price, 'stop_loss'
                        break
                    if c['high'] >= tp_price:
                        exit_idx, exit_price, exit_reason = j, tp_price, 'take_profit'
                        break

            if direction == 'bearish':
                pnl_pct = (entry_price - exit_price) / entry_price * 100
            else:
                pnl_pct = (exit_price - entry_price) / entry_price * 100

            pnl = pnl_pct / 100 * entry_price * quantity

            trades.append({
                'detection_date': det['date'],
                'entry_date':     entry_c['date'],
                'entry_price':    round(entry_price, 2),
                'exit_date':      all_candles[exit_idx]['date'],
                'exit_price':     round(exit_price, 2),
                'exit_reason':    exit_reason,
                'pnl':            round(pnl, 2),
                'pnl_pct':        round(pnl_pct, 2),
                'direction':      direction.upper(),
            })

            i = exit_idx + 1
        else:
            i += 1

    return detections, trades


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

        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))

        exchange_str = strategy.exchange.value if hasattr(strategy.exchange, 'value') else str(strategy.exchange)
        token = _resolve_token(strategy.instrument, exchange_str, kite)
        if not token:
            return jsonify({'error': f'{exchange_str}:{strategy.instrument} not found — refresh instruments'}), 404

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
            pattern.get('indicator_settings'),
            pattern.get('trade_filters'),
        )

        # Keep days + warmup candles so first day in simulation window has proper history
        sim_candles = all_candles[-(days + warmup):]

        detections, trades = _simulate(strategy_dict, sim_candles)

        winning  = [t for t in trades if t['pnl_pct'] > 0]
        losing   = [t for t in trades if t['pnl_pct'] <= 0]
        sl_count = sum(1 for t in trades if t['exit_reason'] == 'stop_loss')
        tp_count = sum(1 for t in trades if t['exit_reason'] == 'take_profit')
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
