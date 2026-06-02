import re
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity
)
from app.extensions import db
from app.models import User, UserRole, VirtualAccount

auth_bp = Blueprint('auth', __name__)

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


@auth_bp.post('/api/auth/register')
def register():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    if not _EMAIL_RE.match(email):
        return jsonify({'error': 'Invalid email address'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'An account with that email already exists'}), 409

    user = User(email=email, role=UserRole.CUSTOMER, is_active=True)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    account = VirtualAccount(user_id=user.id, balance=100000.0, initial_balance=100000.0)
    db.session.add(account)
    db.session.commit()

    return jsonify({
        'access_token': create_access_token(identity=str(user.id)),
        'refresh_token': create_refresh_token(identity=str(user.id)),
        'user': user.to_dict(),
    }), 201


@auth_bp.post('/api/auth/login')
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password) or not user.is_active:
        return jsonify({'error': 'Invalid credentials'}), 401

    return jsonify({
        'access_token': create_access_token(identity=str(user.id)),
        'refresh_token': create_refresh_token(identity=str(user.id)),
        'user': user.to_dict()
    }), 200


@auth_bp.post('/api/auth/refresh')
@jwt_required(refresh=True)
def refresh():
    return jsonify({'access_token': create_access_token(identity=get_jwt_identity())}), 200


@auth_bp.post('/api/auth/logout')
@jwt_required()
def logout():
    return jsonify({'message': 'Logged out'}), 200


@auth_bp.get('/api/auth/me')
@jwt_required()
def me():
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': user.to_dict()}), 200
