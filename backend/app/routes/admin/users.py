from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models import (
    User, UserRole, VirtualAccount, VirtualTransaction, UserStrategy,
    Strategy, LiveOrder, PaperOrder, AdminUser,
)
from app.routes.decorators import admin_required
from datetime import datetime, timezone

admin_users_bp = Blueprint('admin_users', __name__)


def _record_txn(account, amount, kind, note):
    """Apply a signed delta to a virtual account and log it to the ledger.
    Caller is responsible for committing."""
    account.balance = round(account.balance + amount, 2)
    txn = VirtualTransaction(
        user_id=account.user_id,
        amount=round(amount, 2),
        balance_after=account.balance,
        kind=kind,
        note=note,
        created_by=int(get_jwt_identity()),
    )
    db.session.add(txn)
    return txn


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


@admin_users_bp.get('/api/admin/users/<int:user_id>')
@admin_required
def get_user(user_id):
    user = User.query.get_or_404(user_id)
    d = user.to_dict()
    d['kite_connected'] = user.kite_config.is_connected if user.kite_config else False
    d['virtual_account'] = user.virtual_account.to_dict() if user.virtual_account else None
    return jsonify({'user': d}), 200


@admin_users_bp.post('/api/admin/users')
@admin_required
def create_user():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    # Frontend's Add Customer form sends `initial_balance`; keep `virtual_balance`
    # as a fallback for older callers.
    virtual_balance = float(data.get('initial_balance', data.get('virtual_balance', 100000.0)))

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


@admin_users_bp.get('/api/admin/users/<int:user_id>/orders')
@admin_required
def user_orders(user_id):
    User.query.get_or_404(user_id)
    live = LiveOrder.query.filter_by(user_id=user_id).order_by(LiveOrder.placed_at.desc()).all()
    paper = PaperOrder.query.filter_by(user_id=user_id).order_by(PaperOrder.created_at.desc()).all()
    orders = [{**o.to_dict(), 'mode': 'LIVE'} for o in live]
    orders += [{**o.to_dict(), 'mode': 'PAPER'} for o in paper]
    return jsonify({'orders': orders}), 200


@admin_users_bp.get('/api/admin/users/<int:user_id>/virtual/transactions')
@admin_required
def virtual_transactions(user_id):
    User.query.get_or_404(user_id)
    txns = (VirtualTransaction.query
            .filter_by(user_id=user_id)
            .order_by(VirtualTransaction.id.desc())
            .all())
    admin_ids = {t.created_by for t in txns if t.created_by}
    emails = {}
    if admin_ids:
        emails = {a.id: a.email for a in AdminUser.query.filter(AdminUser.id.in_(admin_ids)).all()}
    result = []
    for t in txns:
        d = t.to_dict()
        d['created_by_email'] = emails.get(t.created_by)
        result.append(d)
    return jsonify({'transactions': result}), 200


@admin_users_bp.post('/api/admin/users/<int:user_id>/virtual/adjust')
@admin_required
def adjust_virtual(user_id):
    """Credit (+) or debit (−) a customer's virtual balance by `amount`."""
    user = User.query.get_or_404(user_id)
    account = user.virtual_account
    if not account:
        return jsonify({'error': 'Virtual account not found'}), 404

    data = request.get_json() or {}
    try:
        amount = round(float(data.get('amount')), 2)
    except (TypeError, ValueError):
        return jsonify({'error': 'amount must be a number'}), 400
    if amount == 0:
        return jsonify({'error': 'amount must be non-zero'}), 400
    if account.balance + amount < 0:
        return jsonify({'error': 'Adjustment would make the balance negative'}), 400

    note = (data.get('note') or '').strip() or None
    _record_txn(account, amount, 'topup' if amount > 0 else 'withdraw', note)
    db.session.commit()
    return jsonify({'virtual_account': account.to_dict()}), 200


@admin_users_bp.post('/api/admin/users/<int:user_id>/virtual/set')
@admin_required
def set_virtual(user_id):
    """Set a customer's virtual balance to an exact value, logging the delta."""
    user = User.query.get_or_404(user_id)
    account = user.virtual_account
    if not account:
        return jsonify({'error': 'Virtual account not found'}), 404

    data = request.get_json() or {}
    try:
        new_balance = round(float(data.get('balance')), 2)
    except (TypeError, ValueError):
        return jsonify({'error': 'balance must be a number'}), 400
    if new_balance < 0:
        return jsonify({'error': 'balance cannot be negative'}), 400

    note = (data.get('note') or '').strip() or None
    delta = round(new_balance - account.balance, 2)
    _record_txn(account, delta, 'set', note)
    db.session.commit()
    return jsonify({'virtual_account': account.to_dict()}), 200


@admin_users_bp.post('/api/admin/users/<int:user_id>/reset-virtual')
@admin_required
def reset_virtual(user_id):
    user = User.query.get_or_404(user_id)
    account = user.virtual_account
    if not account:
        return jsonify({'error': 'Virtual account not found'}), 404

    delta = round(account.initial_balance - account.balance, 2)
    account.total_realised_pnl = 0.0
    account.reset_at = datetime.now(timezone.utc)
    # _record_txn applies `delta` and sets balance to initial_balance.
    _record_txn(account, delta, 'reset', 'Reset to initial balance')
    db.session.commit()
    return jsonify({'virtual_account': account.to_dict()}), 200
