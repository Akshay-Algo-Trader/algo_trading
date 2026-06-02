from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from datetime import datetime, timezone
from app.extensions import db
from app.models import TradingSession, SessionMode, SessionStatus, Strategy
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

    session = TradingSession(user_id=user_id, strategy_id=strategy_id, mode=session_mode)
    db.session.add(session)
    db.session.commit()
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

    session.status = SessionStatus.STOPPED
    session.stopped_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'session': session.to_dict()}), 200
