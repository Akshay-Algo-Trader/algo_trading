from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity
from app.models import PaperPosition, KiteConfig
from app.routes.decorators import customer_required
from app.services.encryption import decrypt

customer_positions_bp = Blueprint('customer_positions', __name__)


@customer_positions_bp.get('/api/customer/positions')
@customer_required
def my_positions():
    user_id = int(get_jwt_identity())

    paper = [p.to_dict() for p in PaperPosition.query.filter_by(user_id=user_id).all()]

    live_holdings = []
    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if config and config.is_connected and config.access_token_encrypted:
        try:
            from kiteconnect import KiteConnect
            kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
            kite.set_access_token(decrypt(config.access_token_encrypted))
            live_holdings = kite.holdings()
        except Exception:
            live_holdings = []

    return jsonify({'paper_positions': paper, 'live_holdings': live_holdings}), 200
