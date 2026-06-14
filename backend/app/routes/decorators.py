from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
from app.models import User, UserRole, AdminUser


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        if get_jwt().get('actor') != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        admin = AdminUser.query.get(int(get_jwt_identity()))
        if not admin or not admin.is_active:
            return jsonify({'error': 'Admin access required'}), 403
        return fn(*args, **kwargs)
    return wrapper


def customer_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        if get_jwt().get('actor') != 'customer':
            return jsonify({'error': 'Customer access required'}), 403
        user = User.query.get(int(get_jwt_identity()))
        if not user or user.role != UserRole.CUSTOMER:
            return jsonify({'error': 'Customer access required'}), 403
        return fn(*args, **kwargs)
    return wrapper
