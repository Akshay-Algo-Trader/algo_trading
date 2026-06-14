"""Admin backtest endpoint. Same simulation as the customer route, but
bypasses the UserStrategy assignment gate so admins can backtest any strategy.

Uses any connected KiteConfig for historical data (admins don't own a Kite
config; the backtest just needs market history, not order placement)."""

import logging
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

from app.models import KiteConfig
from app.models.strategy import Strategy
from app.routes.decorators import admin_required
from app.routes.customer.backtest import (
    _BUFFER_DAYS,
    _MAX_FETCH_DAYS,
    _attach_trade_charts,
    _build_chart,
    _simulate_swing_breakout,
    _simulate_swing_breakout_options,
    fetch_candles_for_swing_config,
)
from app.services.encryption import decrypt

logger = logging.getLogger(__name__)

admin_backtest_bp = Blueprint('admin_backtest', __name__)


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

    if not strategy.swing_zone_config_id:
        return jsonify({'error': 'Strategy has no Swing Zone Config — edit the strategy first'}), 400

    swing_config = strategy.swing_zone_config

    # Admins don't own a Kite config; use any connected config for market data.
    config = KiteConfig.query.filter_by(is_connected=True).first()
    if not (config and config.access_token_encrypted):
        return jsonify({'error': 'No connected Kite account available — connect one to run backtests'}), 400

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

        sl_reasons = {'stop_loss', 'first_candle_violated', 'partial_then_sl'}
        tp_reasons = {'take_profit', 'multi_target', 'partial_book'} | {f'take_profit_t{i}' for i in (1, 2, 3)}

        sl_count = sum(1 for t in trades if t['exit_reason'] in sl_reasons)
        tp_count = sum(1 for t in trades if t['exit_reason'] in tp_reasons)
        total_pnl   = round(sum(t['pnl'] for t in trades), 2)
        accuracy    = round(len(winning) / len(trades) * 100, 1) if trades else 0
        avg_pnl_pct = round(sum(t['pnl_pct'] for t in trades) / len(trades), 2) if trades else 0
        avg_entry_price = round(sum(t['entry_price'] for t in trades) / len(trades), 2) if trades else 0

        period_from = report_candles[0]['date']
        period_to   = report_candles[-1]['date']

        chart = _build_chart(
            report_candles, trades,
            symbol=candle_symbol, exchange=candle_exchange,
            candle_size=candle_size, options_mode=options_mode,
        )
        _attach_trade_charts(
            all_candles, trades,
            symbol=candle_symbol, exchange=candle_exchange,
            candle_size=candle_size, options_mode=options_mode,
            swing_config=swing_config_dict,
        )

        return jsonify({
            'strategy':           strategy_dict,
            'period':             {'from': period_from, 'to': period_to, 'days': days},
            'candles_analyzed':   len(report_candles),
            'pattern_detections': detections,
            'trades':             trades,
            'skipped_dates':      skipped_dates,
            'chart':              chart,
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
                'avg_entry_price':           avg_entry_price,
            },
        }), 200

    except Exception as exc:
        logger.exception("Admin backtest failed for strategy %s user %s: %s", strategy_id, user_id, exc)
        return jsonify({'error': str(exc)}), 500
