from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity
from app.models import KiteConfig
from app.routes.decorators import customer_required
from app.services.encryption import decrypt

customer_kite_bp = Blueprint('customer_kite', __name__)


@customer_kite_bp.get('/api/customer/kite/login-url')
@customer_required
def get_login_url():
    user_id = int(get_jwt_identity())
    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not config or not config.api_key_encrypted:
        return jsonify({'error': 'Kite API key not configured'}), 404

    api_key = decrypt(config.api_key_encrypted)
    url = f'https://kite.zerodha.com/connect/login?api_key={api_key}&v=3'
    return jsonify({'login_url': url}), 200
