from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models import CandlePattern
from app.routes.decorators import admin_required

admin_candle_patterns_bp = Blueprint('admin_candle_patterns', __name__)


@admin_candle_patterns_bp.get('/api/admin/candle-patterns')
@admin_required
def list_patterns():
    patterns = CandlePattern.query.order_by(CandlePattern.name).all()
    return jsonify({'patterns': [p.to_dict() for p in patterns]}), 200


@admin_candle_patterns_bp.post('/api/admin/candle-patterns')
@admin_required
def create_pattern():
    data = request.get_json() or {}
    required = ['name', 'pattern_type', 'direction']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    if CandlePattern.query.filter_by(name=data['name']).first():
        return jsonify({'error': 'A pattern with this name already exists'}), 409

    pattern = CandlePattern(
        name=data['name'],
        description=data.get('description'),
        pattern_type=data['pattern_type'],
        direction=data['direction'],
        market=data.get('market'),
        timeframes=data.get('timeframes'),
        entry_conditions=data.get('entry_conditions'),
        stop_loss_rules=data.get('stop_loss_rules'),
        target_rules=data.get('target_rules'),
        indicator_settings=data.get('indicator_settings'),
        trade_filters=data.get('trade_filters'),
        created_by=int(get_jwt_identity()),
    )
    db.session.add(pattern)
    db.session.commit()
    return jsonify({'pattern': pattern.to_dict()}), 201


@admin_candle_patterns_bp.put('/api/admin/candle-patterns/<int:pattern_id>')
@admin_required
def update_pattern(pattern_id):
    pattern = CandlePattern.query.get_or_404(pattern_id)
    data = request.get_json() or {}

    for field in ['name', 'description', 'pattern_type', 'direction', 'market',
                  'timeframes', 'entry_conditions', 'stop_loss_rules',
                  'target_rules', 'indicator_settings', 'trade_filters', 'is_active']:
        if field in data:
            setattr(pattern, field, data[field])

    db.session.commit()
    return jsonify({'pattern': pattern.to_dict()}), 200


@admin_candle_patterns_bp.delete('/api/admin/candle-patterns/<int:pattern_id>')
@admin_required
def delete_pattern(pattern_id):
    pattern = CandlePattern.query.get_or_404(pattern_id)
    # Unlink strategies before deleting
    from app.models import Strategy
    Strategy.query.filter_by(candle_pattern_id=pattern_id).update({'candle_pattern_id': None})
    db.session.delete(pattern)
    db.session.commit()
    return jsonify({'message': 'Pattern deleted'}), 200
