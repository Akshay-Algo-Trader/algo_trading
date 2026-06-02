from flask import Blueprint, request, jsonify, redirect
from datetime import datetime, timezone
from app.extensions import db
from app.models import User, KiteConfig
from app.routes.decorators import admin_required
from app.services.encryption import encrypt, decrypt

admin_kite_bp = Blueprint('admin_kite', __name__)


@admin_kite_bp.get('/api/admin/kite/config')
@admin_required
def list_kite_configs():
    configs = KiteConfig.query.all()
    result = []
    for c in configs:
        d = c.to_dict()
        d['api_key'] = decrypt(c.api_key_encrypted) if c.api_key_encrypted else ''
        d['api_secret'] = decrypt(c.api_secret_encrypted) if c.api_secret_encrypted else ''
        result.append(d)
    return jsonify({'configs': result}), 200


@admin_kite_bp.post('/api/admin/kite/config/<int:user_id>')
@admin_required
def set_kite_config(user_id):
    User.query.get_or_404(user_id)
    data = request.get_json() or {}
    api_key = data.get('api_key', '').strip()
    api_secret = data.get('api_secret', '').strip()

    if not api_key or not api_secret:
        return jsonify({'error': 'api_key and api_secret required'}), 400

    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if config:
        config.api_key_encrypted = encrypt(api_key)
        config.api_secret_encrypted = encrypt(api_secret)
        config.access_token_encrypted = None
        config.is_connected = False
    else:
        config = KiteConfig(
            user_id=user_id,
            api_key_encrypted=encrypt(api_key),
            api_secret_encrypted=encrypt(api_secret)
        )
        db.session.add(config)

    db.session.commit()
    return jsonify({'config': config.to_dict()}), 200


@admin_kite_bp.get('/api/admin/kite/login-url/<int:user_id>')
@admin_required
def get_login_url(user_id):
    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not config or not config.api_key_encrypted:
        return jsonify({'error': 'Kite API key not configured for this user'}), 404

    api_key = decrypt(config.api_key_encrypted)
    url = f'https://kite.zerodha.com/connect/login?api_key={api_key}&v=3'
    return jsonify({'login_url': url, 'user_id': user_id}), 200


@admin_kite_bp.get('/api/kite/callback')
def kite_callback():
    """
    Zerodha redirects here after OAuth login.
    Kite sends: ?request_token=xxx&status=success&action=login
    Note: api_key is NOT included in the callback — we scan all configs to find the right one.
    """
    status = request.args.get('status')
    request_token = request.args.get('request_token')

    if status == 'error' or not request_token:
        msg = request.args.get('message', 'Kite login was cancelled or failed')
        return redirect(f'/admin?kite_status=error&kite_msg={msg}')

    # Kite doesn't return api_key in callback, so try each config until one succeeds
    from kiteconnect import KiteConnect
    configs = KiteConfig.query.all()
    for config in configs:
        if not config.api_key_encrypted or not config.api_secret_encrypted:
            continue
        try:
            api_key = decrypt(config.api_key_encrypted)
            api_secret = decrypt(config.api_secret_encrypted)
            kite = KiteConnect(api_key=api_key)
            session_data = kite.generate_session(request_token, api_secret=api_secret)
            config.access_token_encrypted = encrypt(session_data['access_token'])
            config.token_generated_at = datetime.now(timezone.utc)
            config.is_connected = True
            db.session.commit()
            return redirect('/admin?kite_status=connected')
        except Exception:
            db.session.rollback()
            continue

    return redirect('/admin?kite_status=failed')
