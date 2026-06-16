import logging

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import get_jwt_identity
from datetime import datetime, timezone
from app.extensions import db
from app.models import (
    KiteConfig, LiveOrder, PaperOrder, TradingSession, SessionMode,
    SessionStatus, Strategy, ExecutionLog,
)
from app.routes.decorators import customer_required
from app.services.kite_service import IST

customer_session_bp = Blueprint('customer_session', __name__)
logger = logging.getLogger(__name__)

_IST_OFFSET_SEC = 19800  # +05:30 — chart timestamps fake IST wall-clock as UTC


def _parse_replay_start(value):
    """Parse a replay start time. Supports:
    - UTC format with Z: '2026-06-15T03:45:00Z' (frontend sends UTC time)
    - ISO format with timezone: '2026-06-15T09:15:00+05:30'
    - Naive datetime-local: 'YYYY-MM-DDTHH:MM[:SS]' (treated as IST)

    Returns a tz-aware IST datetime, or None if invalid."""
    if not value:
        return None

    value_str = str(value)

    # Try UTC format first (with Z suffix) - this is what the new frontend sends
    if value_str.endswith('Z'):
        try:
            dt = datetime.strptime(value_str, '%Y-%m-%dT%H:%M:%SZ')
            # Interpret as UTC and convert to IST
            return dt.replace(tzinfo=timezone.utc).astimezone(IST)
        except ValueError:
            pass

    # Try parsing ISO format with timezone (e.g., '2026-06-15T09:15:00+05:30')
    for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M%z'):
        try:
            dt = datetime.strptime(value_str, fmt)
            # Convert to IST to ensure consistent timezone
            return dt.astimezone(IST)
        except ValueError:
            continue

    # Fall back to naive parsing (assume IST)
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M'):
        try:
            return datetime.strptime(value_str, fmt).replace(tzinfo=IST)
        except ValueError:
            continue
    return None


@customer_session_bp.post('/api/customer/session/start')
@customer_required
def start_session():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    strategy_id = data.get('strategy_id')
    mode = data.get('mode', 'paper').lower()

    if not strategy_id:
        return jsonify({'error': 'strategy_id required'}), 400

    try:
        session_mode = SessionMode(mode)
    except ValueError:
        return jsonify({'error': 'mode must be "live", "paper" or "replay"'}), 400

    strategy = Strategy.query.get_or_404(strategy_id)

    # ── Replay mode validation — a paper-style simulation over historical candles ──
    replay_start_at = None
    if session_mode == SessionMode.REPLAY:
        opt_cfg = strategy.option_config if isinstance(strategy.option_config, dict) else None
        if opt_cfg and opt_cfg.get('enabled'):
            return jsonify({'error': 'Replay does not support option strategies yet'}), 400

        replay_start_at = _parse_replay_start(data.get('replay_start'))
        if replay_start_at is None:
            return jsonify({'error': 'replay_start (a past date & time) is required for replay'}), 400
        if replay_start_at >= datetime.now(IST):
            return jsonify({'error': 'replay_start must be in the past'}), 400

        kite_cfg = KiteConfig.query.filter_by(user_id=user_id).first()
        if not (kite_cfg and kite_cfg.is_connected and kite_cfg.access_token_encrypted):
            return jsonify({'error': 'Connect your Kite account to replay historical data'}), 400

    active = TradingSession.query.filter_by(
        user_id=user_id, status=SessionStatus.ACTIVE
    ).first()
    if active:
        return jsonify({'error': 'You already have an active session'}), 409

    session = TradingSession(
        user_id=user_id, strategy_id=strategy_id, mode=session_mode,
        phase='monitoring', pattern_detected=False,
        replay_start_at=replay_start_at,
    )
    db.session.add(session)
    db.session.commit()

    # Engage the backend engine
    try:
        current_app.session_manager.start_session(user_id, strategy_id, mode, session.id)
    except Exception as exc:
        # Roll back the persisted session row if the engine refuses to start
        session.status = SessionStatus.STOPPED
        session.stopped_at = datetime.now(timezone.utc)
        session.auto_stop_reason = f'engine_start_failed: {exc}'
        db.session.commit()
        return jsonify({'error': f'Failed to start engine: {exc}'}), 500

    return jsonify({'session': session.to_dict()}), 201


@customer_session_bp.post('/api/customer/session/stop')
@customer_required
def stop_session():
    user_id = int(get_jwt_identity())
    session = TradingSession.query.filter_by(
        user_id=user_id, status=SessionStatus.ACTIVE
    ).first()
    if not session:
        return jsonify({'error': 'No active session found'}), 404

    current_app.session_manager.stop_session(session.id, reason='manual')

    # If the engine didn't mark it stopped (rare), do it here as a safety net
    session = TradingSession.query.get(session.id)
    if session.status == SessionStatus.ACTIVE:
        session.status = SessionStatus.STOPPED
        session.stopped_at = datetime.now(timezone.utc)
        db.session.commit()
    return jsonify({'session': session.to_dict()}), 200


@customer_session_bp.get('/api/customer/session/state')
@customer_required
def session_state():
    """Return current execution state + recent logs for the user's active session.

    The frontend uses this as a polling endpoint — the executor lives on the
    server now, the browser is just a viewer.
    """
    user_id = int(get_jwt_identity())
    session = (
        TradingSession.query
        .filter_by(user_id=user_id)
        .order_by(TradingSession.started_at.desc())
        .first()
    )
    if not session:
        return jsonify({'session': None, 'logs': []}), 200

    logs = (
        ExecutionLog.query
        .filter_by(session_id=session.id)
        .order_by(ExecutionLog.id.desc())
        .limit(80)
        .all()
    )

    payload = session.to_dict()

    # The engine throttles DB persistence (LTP every ~5s while monitoring), so
    # overlay the live in-memory state for a truly real-time view when the
    # engine is in this process.
    engine = current_app.session_manager.get_engine(session.id)
    if engine is not None:
        try:
            st = engine.get_status()
            if st.get('last_ltp') is not None:
                payload['last_ltp'] = st['last_ltp']
            if st.get('phase'):
                payload['phase'] = st['phase']
            payload['pattern_detected'] = st.get('pattern_detected', payload['pattern_detected'])
            if st.get('entry_price') is not None:
                payload['entry_price'] = st['entry_price']
            if st.get('plan_state') is not None:
                payload['plan_state'] = st['plan_state']
            payload['replay'] = st.get('replay')
        except Exception:
            logger.exception("engine.get_status failed for session %d", session.id)

    return jsonify({
        'session': payload,
        'logs':    [l.to_dict() for l in logs],
        'engine_active': current_app.session_manager.is_active(session.id),
    }), 200


def _candle_ts(date_str):
    """'YYYY-MM-DD HH:MM:SS' IST wall-clock → epoch reinterpreted as UTC, the
    same trick the admin swing chart uses so lightweight-charts shows IST."""
    return int(datetime.strptime(str(date_str)[:19], '%Y-%m-%d %H:%M:%S')
               .replace(tzinfo=timezone.utc).timestamp())


def _order_ts(dt):
    """UTC order timestamp → IST-as-UTC epoch aligned with chart candles."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp()) + _IST_OFFSET_SEC


@customer_session_bp.get('/api/customer/session/chart')
@customer_required
def session_chart():
    """Everything the execution chart needs to mirror the engine's view:
    the swing-config candles the engine evaluates, the S&R levels it detects,
    the persisted breakout signal, and the session's orders as trade markers.

    Prefers the live engine's own candle cache so the chart shows exactly
    what the engine sees; falls back to a direct Kite fetch for sessions whose
    engine is no longer in memory (stopped / exited)."""
    user_id = int(get_jwt_identity())
    session = (
        TradingSession.query
        .filter_by(user_id=user_id)
        .order_by(TradingSession.started_at.desc())
        .first()
    )
    if not session:
        return jsonify({'chart': None}), 200

    strategy = db.session.get(Strategy, session.strategy_id)
    if not strategy or not strategy.swing_zone_config:
        return jsonify({'chart': None}), 200
    swing_cfg = strategy.swing_zone_config.to_dict()

    plan_state = session.plan_state if isinstance(session.plan_state, dict) else {}
    resolved_contract = plan_state.get('resolved_contract')
    breakout = plan_state.get('breakout')

    # Levels and breakouts live on the underlying for option strategies —
    # the chart always shows the instrument the engine monitors for entry.
    opt_cfg = strategy.option_config or {}
    if isinstance(opt_cfg, dict) and opt_cfg.get('enabled'):
        from app.services.option_resolver import meta_for as _option_meta_for
        meta = _option_meta_for(opt_cfg.get('underlying') or '')
        if not meta:
            return jsonify({'chart': None}), 200
        symbol, exchange = meta['underlying_symbol'], meta['underlying_exchange']
        option_mode = True
    else:
        symbol, exchange = strategy.instrument, strategy.exchange.value
        option_mode = False

    from app.services.swing_zone_detector import detect_sr_levels, fetch_candles_for_swing_config

    candles, levels, engine_ltp = [], [], None
    engine = current_app.session_manager.get_engine(session.id)
    if engine is not None:
        try:
            snap = engine.get_chart_data()
            candles, levels, engine_ltp = snap['candles'], snap['levels'], snap['ltp']
        except Exception:
            logger.exception("engine.get_chart_data failed for session %d", session.id)

    if not candles:
        kite_cfg = KiteConfig.query.filter_by(user_id=user_id).first()
        if not (kite_cfg and kite_cfg.is_connected and kite_cfg.access_token_encrypted):
            kite_cfg = KiteConfig.query.filter_by(is_connected=True).first()
        if not (kite_cfg and kite_cfg.access_token_encrypted):
            return jsonify({'error': 'No connected Kite account available'}), 400
        try:
            from kiteconnect import KiteConnect
            from app.services.encryption import decrypt
            kite = KiteConnect(api_key=decrypt(kite_cfg.api_key_encrypted))
            kite.set_access_token(decrypt(kite_cfg.access_token_encrypted))
            candles = fetch_candles_for_swing_config(kite, swing_cfg, symbol, exchange)
        except Exception as exc:
            logger.exception("Session chart candle fetch failed user=%s: %s", user_id, exc)
            return jsonify({'error': str(exc)}), 500

        closed = candles[:-1] if candles else []
        pivot_bars = int(swing_cfg.get('pivot_bars') or 5)
        if len(closed) >= pivot_bars * 2 + 1:
            levels = detect_sr_levels(closed, pivot_bars)

    chart_candles = [{
        'time': _candle_ts(c['date']),
        'open': c['open'], 'high': c['high'],
        'low': c['low'], 'close': c['close'],
    } for c in candles]

    chart_levels = [{
        'price': l['price'], 'type': l['type'],
        'date': str(l['date']), 'time': _candle_ts(l['date']),
    } for l in levels]

    if breakout:
        breakout = dict(breakout)
        if breakout.get('det_candle_date'):
            breakout['time'] = _candle_ts(breakout['det_candle_date'])

    # After the engine swaps to the option contract, session.last_ltp is the
    # option premium — meaningless on the underlying's price scale.
    ltp = None
    if not resolved_contract:
        ltp = engine_ltp if engine_ltp is not None else session.last_ltp

    # Replay orders are recorded as PaperOrders (on a REPLAY session); only LIVE
    # uses LiveOrder. Picking the wrong model here drops the trade markers.
    order_model = LiveOrder if session.mode == SessionMode.LIVE else PaperOrder
    orders = (
        order_model.query
        .filter_by(session_id=session.id)
        .order_by(order_model.id.asc())
        .all()
    )
    chart_orders = [{
        'side':   o.transaction_type.value,
        'qty':    o.quantity,
        'price':  getattr(o, 'fill_price', None) or getattr(o, 'price', None),
        'symbol': o.symbol,
        'tag':    getattr(o, 'tag', None),
        'time':   _order_ts(getattr(o, 'fill_time', None) or o.created_at),
    } for o in orders]

    return jsonify({'chart': {
        'symbol':       symbol,
        'exchange':     exchange,
        'option_mode':  option_mode,
        # Entry/SL/target prices are in option-premium space once a contract is
        # resolved — they can't be drawn on the underlying's chart.
        'plan_overlay': not resolved_contract,
        'candles':      chart_candles,
        'levels':       chart_levels,
        'ltp':          ltp,
        'breakout':     breakout,
        'orders':       chart_orders,
        'config': {
            'name':             swing_cfg.get('name'),
            'candle_size':      swing_cfg.get('candle_size'),
            'pivot_bars':       swing_cfg.get('pivot_bars'),
            'strong_level_pct': swing_cfg.get('strong_level_pct'),
            'period_days':      swing_cfg.get('period_days'),
        },
    }}), 200
