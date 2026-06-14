import re
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models import AdminUser
from app.routes.decorators import admin_required

admin_admin_users_bp = Blueprint('admin_admin_users', __name__)

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
_MIN_TIMEOUT = 1
_MAX_TIMEOUT = 43200  # 30 days in minutes


def _acting_admin():
    return AdminUser.query.get(int(get_jwt_identity()))


@admin_admin_users_bp.get('/api/admin/admin-users')
@admin_required
def list_admins():
    admins = AdminUser.query.order_by(AdminUser.id).all()
    return jsonify({'admins': [a.to_dict() for a in admins]}), 200


@admin_admin_users_bp.post('/api/admin/admin-users')
@admin_required
def create_admin():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    timeout = data.get('session_timeout_minutes', 60)

    if not _EMAIL_RE.match(email):
        return jsonify({'error': 'Invalid email address'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    try:
        timeout = int(timeout)
    except (ValueError, TypeError):
        return jsonify({'error': 'session_timeout_minutes must be a number'}), 400
    if not _MIN_TIMEOUT <= timeout <= _MAX_TIMEOUT:
        return jsonify({'error': f'session_timeout_minutes must be between {_MIN_TIMEOUT} and {_MAX_TIMEOUT}'}), 400
    if AdminUser.query.filter_by(email=email).first():
        return jsonify({'error': 'An admin with that email already exists'}), 409

    admin = AdminUser(email=email, is_active=True, session_timeout_minutes=timeout)
    admin.set_password(password)
    db.session.add(admin)
    db.session.commit()
    return jsonify({'admin': admin.to_dict()}), 201


@admin_admin_users_bp.put('/api/admin/admin-users/<int:admin_id>')
@admin_required
def update_admin(admin_id):
    admin = AdminUser.query.get_or_404(admin_id)
    data = request.get_json() or {}

    if 'session_timeout_minutes' in data:
        try:
            timeout = int(data['session_timeout_minutes'])
        except (ValueError, TypeError):
            return jsonify({'error': 'session_timeout_minutes must be a number'}), 400
        if not _MIN_TIMEOUT <= timeout <= _MAX_TIMEOUT:
            return jsonify({'error': f'session_timeout_minutes must be between {_MIN_TIMEOUT} and {_MAX_TIMEOUT}'}), 400
        admin.session_timeout_minutes = timeout

    if 'is_active' in data:
        is_active = bool(data['is_active'])
        # Don't let an admin deactivate themselves or the last active admin.
        if not is_active:
            if admin.id == _acting_admin().id:
                return jsonify({'error': 'You cannot deactivate your own account'}), 400
            active_count = AdminUser.query.filter_by(is_active=True).count()
            if admin.is_active and active_count <= 1:
                return jsonify({'error': 'Cannot deactivate the last active admin'}), 400
        admin.is_active = is_active

    db.session.commit()
    return jsonify({'admin': admin.to_dict()}), 200


@admin_admin_users_bp.post('/api/admin/admin-users/<int:admin_id>/change-password')
@admin_required
def change_password(admin_id):
    """Change an admin's password. The acting admin re-enters THEIR OWN current
    password to authorize the change (for self or any other admin)."""
    target = AdminUser.query.get_or_404(admin_id)
    data = request.get_json() or {}
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters'}), 400

    acting = _acting_admin()
    if not acting or not acting.check_password(current_password):
        return jsonify({'error': 'Your current password is incorrect'}), 401

    target.set_password(new_password)
    db.session.commit()
    return jsonify({'message': 'Password updated'}), 200


@admin_admin_users_bp.delete('/api/admin/admin-users/<int:admin_id>')
@admin_required
def delete_admin(admin_id):
    target = AdminUser.query.get_or_404(admin_id)
    if target.id == _acting_admin().id:
        return jsonify({'error': 'You cannot delete your own account'}), 400
    if AdminUser.query.count() <= 1:
        return jsonify({'error': 'Cannot delete the last admin'}), 400

    db.session.delete(target)
    db.session.commit()
    return jsonify({'message': 'Admin deleted'}), 200
