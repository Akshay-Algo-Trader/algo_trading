"""Admin backtest endpoint. Same simulation as the customer route, but
bypasses the UserStrategy assignment gate so admins can backtest any strategy.

Uses the admin's own connected KiteConfig for historical data; falls back to
any connected KiteConfig if the admin hasn't connected Kite themselves (the
backtest just needs market history, not order placement)."""

import logging
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

from app.models import CandlePattern, KiteConfig
from app.models.strategy import Strategy
from app.routes.decorators import admin_required
from app.routes.customer.backtest import (
    _IST,
    _check_indicators,
    _check_pattern,
    _required_warmup,
    _simulate,
    _simulate_options,
)
from app.services.encryption import decrypt

logger = logging.getLogger(__name__)

admin_backtest_bp = Blueprint('admin_backtest', __name__)


def _last_thursday(date):
    """Return the last Thursday on or before the given date."""
    while date.weekday() != 3:  # 3 = Thursday
        date -= timedelta(days=1)
    return date


def _option_expirations_last_3m():
    """Generate all weekly option expiry dates from the last 3 months."""
    now = datetime.now(_IST).date()
    three_months_ago = now - timedelta(days=90)
    expirations = []

    # Get all Thursdays in the last 3 months (weekly expirations)
    current = _last_thursday(now)
    while current >= three_months_ago:
        expirations.append(current)
        current -= timedelta(days=7)

    return sorted(expirations, reverse=True)  # Most recent first


def _generate_option_symbols(underlying: str, expirations: list, strikes_range: int = 5) -> list[str]:
    """Generate option symbols for an underlying across expirations.

    Args:
        underlying: Underlying symbol (e.g., 'APOLLOHOSP', 'NIFTY')
        expirations: List of (date, atm_price) tuples for option expirations
        strikes_range: Number of strikes above/below ATM to include

    Returns:
        List of option symbols like 'APOLLOHOSP25JUL7600CE'
    """
    symbols = []

    for expiry_date, atm_price in expirations:
        exp_str = expiry_date.strftime('%d%b').upper()

        # Generate strikes around ATM (assuming 100-point intervals for stocks)
        base_strike = int((atm_price // 100) * 100)
        strike_interval = 50 if underlying in ['NIFTY', 'BANKNIFTY'] else 100

        for strike_offset in range(-strikes_range, strikes_range + 1):
            strike = base_strike + (strike_offset * strike_interval)
            if strike > 0:
                for option_type in ['CE', 'PE']:
                    symbol = f"{underlying}{expiry_date.strftime('%d%b').upper()}{strike}{option_type}"
                    symbols.append(symbol)

    return symbols


@admin_backtest_bp.post('/api/admin/backtest')
@admin_required
def run_admin_backtest():
    user_id = int(get_jwt_identity())
    data    = request.get_json() or {}

    strategy_id = data.get('strategy_id')
    try:
        days = min(max(int(data.get('days', 90)), 30), 365)
    except (ValueError, TypeError):
        days = 90

    if not strategy_id:
        return jsonify({'error': 'strategy_id required'}), 400

    strategy = Strategy.query.get(strategy_id)
    if not strategy:
        return jsonify({'error': 'Strategy not found'}), 404

    # Prefer admin's own Kite config; fall back to any connected config
    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (config and config.is_connected and config.access_token_encrypted):
        config = KiteConfig.query.filter_by(is_connected=True).first()
    if not (config and config.access_token_encrypted):
        return jsonify({'error': 'No connected Kite account available — connect one to run backtests'}), 400

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
        from_date = to_date - timedelta(days=days + 120)

        raw = kite.historical_data(
            token,
            from_date.strftime('%Y-%m-%d'),
            to_date.strftime('%Y-%m-%d'),
            'day',
        )
        all_candles = [{
            'date':   c['date'].strftime('%Y-%m-%d'),
            'open':   c['open'], 'high': c['high'],
            'low':    c['low'],  'close': c['close'],
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
        sim_candles = all_candles[-(days + warmup):]

        if options_mode:
            detections, trades, skipped_dates = _simulate_options(strategy_dict, sim_candles, kite, option_config)
        else:
            detections, trades = _simulate(strategy_dict, sim_candles)
            skipped_dates = []

        winning  = [t for t in trades if t['pnl_pct'] > 0]
        losing   = [t for t in trades if t['pnl_pct'] <= 0]

        sl_reasons = {'stop_loss', 'first_candle_violated', 'partial_then_sl'}
        tp_reasons = {'take_profit', 'multi_target', 'partial_book'} | {f'take_profit_t{i}' for i in (1, 2, 3)}

        sl_count = sum(1 for t in trades if t['exit_reason'] in sl_reasons)
        tp_count = sum(1 for t in trades if t['exit_reason'] in tp_reasons)
        total_pnl   = round(sum(t['pnl'] for t in trades), 2)
        accuracy    = round(len(winning) / len(trades) * 100, 1) if trades else 0
        avg_pnl_pct = round(sum(t['pnl_pct'] for t in trades) / len(trades), 2) if trades else 0

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
        logger.exception("Admin backtest failed for strategy %s user %s: %s", strategy_id, user_id, exc)
        return jsonify({'error': str(exc)}), 500


# ─── Pattern scanner ──────────────────────────────────────────────────────────
# Scans a pattern against a universe of instruments and reports how many times
# each instrument matched. The output is sorted by match count so the admin can
# pick the best-fitting instrument for a given pattern.

def _universe_symbols(universe: str, kite=None) -> list[dict]:
    """Resolve a universe key to a list of {symbol, exchange} dicts.

    Args:
        universe: Universe key (INTRADAY, NIFTY50, OPTIONS_LAST3M, etc.)
        kite: Optional KiteConnect instance for fetching prices (needed for options)
    """
    from app.routes.customer.market import (
        _NIFTY50_SYMBOLS, _SENSEX_SYMBOLS, _BANKNIFTY_SYMBOLS, _INDICES_LIST,
    )
    u = (universe or '').upper().replace(' ', '')

    if u == 'OPTIONS_LAST3M':
        # Generate option symbols for major underlyings from last 3 months
        expirations = _option_expirations_last_3m()
        if not expirations or not kite:
            return []

        options = []
        underlyings = [
            ('NIFTY', 'NFO'), ('BANKNIFTY', 'NFO'),
            ('APOLLOHOSP', 'NSE'), ('ADANIPORTS', 'NSE'), ('TCS', 'NSE'),
        ]

        for underlying, exchange in underlyings:
            try:
                # Get ATM price for each expiration
                if exchange == 'NFO':
                    key = f"{exchange}:{underlying}"
                else:
                    key = f"{exchange}:{underlying}"
                ohlc_data = kite.ohlc([key])
                atm = ohlc_data.get(key, {}).get('last_price', 0)
                if atm <= 0:
                    continue

                # Generate option symbols
                expiry_tuples = [(exp, atm) for exp in expirations]
                symbols = _generate_option_symbols(underlying, expiry_tuples, strikes_range=3)
                exchange_for_options = 'NFO' if exchange == 'NFO' else 'NFO'
                for sym in symbols[:20]:  # Limit to 20 per underlying to avoid too many
                    options.append({'symbol': sym, 'exchange': exchange_for_options})
            except Exception as exc:
                logger.warning(f"Failed to generate options for {underlying}: {exc}")

        return options

    if u == 'INTRADAY' or u == 'INTRADAYINDICES':
        intraday_indices = [
            'NIFTY 50', 'NIFTY NEXT 50', 'NIFTY MIDCAP 50',
            'NIFTY BANK', 'SENSEX',
        ]
        return [
            {'symbol': i['symbol'], 'exchange': i['exchange']}
            for i in _INDICES_LIST if i['symbol'] in intraday_indices
        ]
    if u == 'NIFTY50':
        return [{'symbol': s, 'exchange': 'NSE'} for s in _NIFTY50_SYMBOLS]
    if u == 'SENSEX':
        return [{'symbol': s, 'exchange': 'BSE'} for s in _SENSEX_SYMBOLS]
    if u == 'BANKNIFTY':
        return [{'symbol': s, 'exchange': 'NSE'} for s in _BANKNIFTY_SYMBOLS]
    if u == 'INDICES':
        return [{'symbol': i['symbol'], 'exchange': i['exchange']} for i in _INDICES_LIST]
    if u == 'ALL':
        seen = set()
        out = []
        for s in _NIFTY50_SYMBOLS:
            key = ('NSE', s)
            if key not in seen:
                seen.add(key)
                out.append({'symbol': s, 'exchange': 'NSE'})
        for s in _SENSEX_SYMBOLS:
            key = ('BSE', s)
            if key not in seen:
                seen.add(key)
                out.append({'symbol': s, 'exchange': 'BSE'})
        for s in _BANKNIFTY_SYMBOLS:
            key = ('NSE', s)
            if key not in seen:
                seen.add(key)
                out.append({'symbol': s, 'exchange': 'NSE'})
        for i in _INDICES_LIST:
            key = (i['exchange'], i['symbol'])
            if key not in seen:
                seen.add(key)
                out.append({'symbol': i['symbol'], 'exchange': i['exchange']})
        return out
    return []


@admin_backtest_bp.post('/api/admin/pattern-scan')
@admin_required
def run_pattern_scan():
    """Scan one pattern against a universe of instruments — return per-instrument
    match counts and dates. Useful for choosing which stock/index best fits a
    given pattern before wiring it into a strategy."""
    user_id = int(get_jwt_identity())
    data    = request.get_json() or {}

    pattern_id    = data.get('pattern_id')
    universe_key  = (data.get('universe') or 'NIFTY50').upper()
    apply_filters = bool(data.get('apply_indicator_filters'))
    try:
        days = min(max(int(data.get('days', 90)), 30), 365)
    except (ValueError, TypeError):
        days = 90

    if not pattern_id:
        return jsonify({'error': 'pattern_id required'}), 400

    pattern = CandlePattern.query.get(pattern_id)
    if not pattern:
        return jsonify({'error': 'Pattern not found'}), 404

    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (config and config.is_connected and config.access_token_encrypted):
        config = KiteConfig.query.filter_by(is_connected=True).first()
    if not (config and config.access_token_encrypted):
        return jsonify({'error': 'No connected Kite account available — connect one to run the scan'}), 400

    try:
        from kiteconnect import KiteConnect
        from app.routes.customer.market import _resolve_token

        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))

        # For OPTIONS_LAST3M, we need kite to fetch current prices
        universe = _universe_symbols(universe_key, kite=kite if universe_key == 'OPTIONS_LAST3M' else None)
        if not universe:
            return jsonify({'error': f'Unknown universe: {universe_key!r}'}), 400

        pattern_dict = pattern.to_dict()
        ind_cfg = pattern_dict.get('indicator_settings') if apply_filters else None
        warmup  = _required_warmup(
            pattern_dict.get('indicator_settings'),
            pattern_dict.get('trade_filters'),
        )

        now_ist   = datetime.now(_IST)
        to_date   = now_ist.date()
        from_date = to_date - timedelta(days=days + max(warmup, 30) + 60)  # extra for warmup + weekends

        results = []
        errors  = []
        for inst in universe:
            symbol, exchange = inst['symbol'], inst['exchange']
            try:
                token = _resolve_token(symbol, exchange, kite)
                if not token:
                    errors.append({'symbol': symbol, 'exchange': exchange, 'reason': 'instrument not found'})
                    continue
                raw = kite.historical_data(
                    token,
                    from_date.strftime('%Y-%m-%d'),
                    to_date.strftime('%Y-%m-%d'),
                    'day',
                )
            except Exception as exc:
                errors.append({'symbol': symbol, 'exchange': exchange, 'reason': str(exc)[:120]})
                continue

            candles = [{
                'date':   c['date'].strftime('%Y-%m-%d'),
                'open':   c['open'], 'high': c['high'],
                'low':    c['low'],  'close': c['close'],
                'volume': c['volume'],
            } for c in raw]
            if len(candles) < warmup + 2:
                continue

            # Walk forward day by day; collect every match. Keep at most the
            # first 30 sample dicts to bound the response size; the count is
            # the total across all matches in the window.
            matches = []
            count   = 0
            for i in range(warmup, len(candles)):
                window = candles[:i + 1]
                if not _check_pattern(pattern_dict, window):
                    continue
                if apply_filters and not _check_indicators(ind_cfg, window):
                    continue
                count += 1
                if len(matches) < 30:
                    matches.append({'date': candles[i]['date'], 'candle': candles[i]})

            results.append({
                'symbol':       symbol,
                'exchange':     exchange,
                'match_count':  count,
                'matches':      matches,
                'days_covered': max(0, len(candles) - warmup),
            })

        results.sort(key=lambda r: r['match_count'], reverse=True)

        return jsonify({
            'pattern':  pattern_dict,
            'universe': universe_key,
            'period':   {
                'from': from_date.strftime('%Y-%m-%d'),
                'to':   to_date.strftime('%Y-%m-%d'),
                'days': days,
            },
            'apply_indicator_filters': apply_filters,
            'instruments_scanned':     len(universe),
            'results':                 results,
            'errors':                  errors,
        }), 200

    except Exception as exc:
        logger.exception("Pattern scan failed for pattern %s user %s: %s", pattern_id, user_id, exc)
        return jsonify({'error': str(exc)}), 500
