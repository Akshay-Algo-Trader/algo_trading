from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity
from app.models import User, TradingSession, SessionStatus, KiteConfig
from app.routes.decorators import customer_required
from app.services.encryption import decrypt

customer_dashboard_bp = Blueprint('customer_dashboard', __name__)


@customer_dashboard_bp.get('/api/customer/dashboard')
@customer_required
def dashboard():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    active_session = TradingSession.query.filter_by(
        user_id=user_id, status=SessionStatus.ACTIVE
    ).first()

    kite_config = KiteConfig.query.filter_by(user_id=user_id).first()

    portfolio_value = None
    margins = None
    if kite_config and kite_config.is_connected and kite_config.access_token_encrypted:
        try:
            from kiteconnect import KiteConnect
            kite = KiteConnect(api_key=decrypt(kite_config.api_key_encrypted))
            kite.set_access_token(decrypt(kite_config.access_token_encrypted))

            holdings = kite.holdings()
            portfolio_value = sum(
                h.get('last_price', 0) * h.get('quantity', 0) for h in holdings
            )

            raw = kite.margins(segment='equity')
            eq = raw.get('equity') or raw  # SDK may return nested or flat
            margins = {
                'available_margin': eq.get('net'),
                'used_margin':      eq.get('used', {}).get('debits'),
                'available_cash':   eq.get('available', {}).get('cash'),
            }
        except Exception:
            portfolio_value = None
            margins = None

    return jsonify({
        'user': user.to_dict(),
        'virtual_account': user.virtual_account.to_dict() if user.virtual_account else None,
        'active_session': active_session.to_dict() if active_session else None,
        'kite': kite_config.to_dict() if kite_config else None,
        'portfolio_value': portfolio_value,
        'margins': margins,
    }), 200
