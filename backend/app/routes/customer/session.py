from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import get_jwt_identity
from datetime import datetime, timezone
from app.extensions import db
from app.models import TradingSession, SessionMode, SessionStatus, Strategy, ExecutionLog
from app.routes.decorators import customer_required

customer_session_bp = Blueprint('customer_session', __name__)


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
        return jsonify({'error': 'mode must be "live" or "paper"'}), 400

    Strategy.query.get_or_404(strategy_id)

    active = TradingSession.query.filter_by(
        user_id=user_id, status=SessionStatus.ACTIVE
    ).first()
    if active:
        return jsonify({'error': 'You already have an active session'}), 409

    session = TradingSession(
        user_id=user_id, strategy_id=strategy_id, mode=session_mode,
        phase='monitoring', pattern_detected=False,
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

    return jsonify({
        'session': session.to_dict(),
        'logs':    [l.to_dict() for l in logs],
        'engine_active': current_app.session_manager.is_active(session.id),
    }), 200
