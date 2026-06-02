from flask import Blueprint, request, jsonify
from app.extensions import db
from app.models import User, UserRole, VirtualAccount, UserStrategy, Strategy
from app.routes.decorators import admin_required
from datetime import datetime, timezone

admin_users_bp = Blueprint('admin_users', __name__)


@admin_users_bp.get('/api/admin/users')
@admin_required
def list_users():
    role_filter = request.args.get('role', '').strip().lower()
    query = User.query
    if role_filter:
        try:
            query = query.filter_by(role=UserRole(role_filter))
        except ValueError:
            return jsonify({'error': f'Invalid role: {role_filter}'}), 400
    users = query.all()
    result = []
    for u in users:
        d = u.to_dict()
        d['kite_connected'] = u.kite_config.is_connected if u.kite_config else False
        result.append(d)
    return jsonify({'users': result}), 200


@admin_users_bp.post('/api/admin/users')
@admin_required
def create_user():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    virtual_balance = float(data.get('virtual_balance', 100000.0))

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409

    user = User(email=email, role=UserRole.CUSTOMER)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    account = VirtualAccount(
        user_id=user.id,
        balance=virtual_balance,
        initial_balance=virtual_balance
    )
    db.session.add(account)
    db.session.commit()
    return jsonify({'user': user.to_dict()}), 201


@admin_users_bp.put('/api/admin/users/<int:user_id>')
@admin_required
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}

    if 'password' in data:
        user.set_password(data['password'])
    if 'is_active' in data:
        user.is_active = bool(data['is_active'])

    db.session.commit()
    return jsonify({'user': user.to_dict()}), 200


@admin_users_bp.delete('/api/admin/users/<int:user_id>')
@admin_required
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'User deleted'}), 200


@admin_users_bp.get('/api/admin/users/<int:user_id>/strategies')
@admin_required
def user_strategies(user_id):
    User.query.get_or_404(user_id)
    assignments = UserStrategy.query.filter_by(user_id=user_id).all()
    strategy_ids = [a.strategy_id for a in assignments]
    strategies = Strategy.query.filter(Strategy.id.in_(strategy_ids)).all() if strategy_ids else []
    return jsonify({'strategies': [s.to_dict() for s in strategies]}), 200


@admin_users_bp.post('/api/admin/users/<int:user_id>/reset-virtual')
@admin_required
def reset_virtual(user_id):
    user = User.query.get_or_404(user_id)
    account = user.virtual_account
    if not account:
        return jsonify({'error': 'Virtual account not found'}), 404

    account.balance = account.initial_balance
    account.total_realised_pnl = 0.0
    account.reset_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'virtual_account': account.to_dict()}), 200
