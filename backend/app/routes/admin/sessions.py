from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
from app.extensions import db
from app.models import TradingSession, SessionMode, SessionStatus, AuditLog, User, Strategy
from app.routes.decorators import admin_required

admin_sessions_bp = Blueprint('admin_sessions', __name__)


@admin_sessions_bp.get('/api/admin/sessions')
@admin_required
def list_sessions():
    sessions = TradingSession.query.order_by(TradingSession.started_at.desc()).all()
    return jsonify({'sessions': [s.to_dict() for s in sessions]}), 200


@admin_sessions_bp.post('/api/admin/sessions/start')
@admin_required
def start_session():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    strategy_id = data.get('strategy_id')
    mode = data.get('mode', 'paper').lower()

    if not user_id or not strategy_id:
        return jsonify({'error': 'user_id and strategy_id required'}), 400

    try:
        session_mode = SessionMode(mode)
    except ValueError:
        return jsonify({'error': 'mode must be "live" or "paper"'}), 400

    User.query.get_or_404(user_id)
    Strategy.query.get_or_404(strategy_id)

    active = TradingSession.query.filter_by(
        user_id=user_id, status=SessionStatus.ACTIVE
    ).first()
    if active:
        return jsonify({'error': 'User already has an active session'}), 409

    session = TradingSession(user_id=user_id, strategy_id=strategy_id, mode=session_mode)
    db.session.add(session)
    db.session.commit()
    return jsonify({'session': session.to_dict()}), 201


@admin_sessions_bp.post('/api/admin/sessions/<int:session_id>/stop')
@admin_required
def stop_session(session_id):
    session = TradingSession.query.get_or_404(session_id)
    if session.status != SessionStatus.ACTIVE:
        return jsonify({'error': 'Session is not active'}), 400

    session.status = SessionStatus.STOPPED
    session.stopped_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'session': session.to_dict()}), 200


@admin_sessions_bp.get('/api/admin/logs')
@admin_required
def audit_logs():
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 200)
    user_id = request.args.get('user_id', type=int)
    mode = request.args.get('mode')
    event_type = request.args.get('event_type')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    query = AuditLog.query
    if user_id:
        query = query.filter_by(user_id=user_id)
    if mode:
        query = query.filter_by(mode=mode)
    if event_type:
        query = query.filter_by(event_type=event_type)
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)

    paginated = query.order_by(AuditLog.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        'logs': [l.to_dict() for l in paginated.items],
        'total': paginated.total,
        'page': paginated.page,
        'pages': paginated.pages
    }), 200
