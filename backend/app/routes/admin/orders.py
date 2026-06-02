from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
from app.extensions import db
from app.models import LiveOrder, PaperOrder, KiteConfig, TradingSession, SessionStatus
from app.models.live_order import TransactionType, OrderStatus, OrderType as LiveOrderType
from app.routes.decorators import admin_required
from app.services.encryption import decrypt

admin_orders_bp = Blueprint('admin_orders', __name__)


@admin_orders_bp.get('/api/admin/orders/live')
@admin_required
def live_orders():
    orders = LiveOrder.query.order_by(LiveOrder.placed_at.desc()).all()
    return jsonify({'orders': [o.to_dict() for o in orders]}), 200


@admin_orders_bp.get('/api/admin/orders/paper')
@admin_required
def paper_orders():
    orders = PaperOrder.query.order_by(PaperOrder.created_at.desc()).all()
    return jsonify({'orders': [o.to_dict() for o in orders]}), 200


@admin_orders_bp.post('/api/admin/orders/manual')
@admin_required
def manual_order():
    data = request.get_json() or {}
    required = ['user_id', 'session_id', 'symbol', 'exchange',
                'transaction_type', 'quantity', 'order_type']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    user_id = data['user_id']
    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not config or not config.is_connected:
        return jsonify({'error': 'User Kite account not connected'}), 400

    try:
        transaction_type = TransactionType[data['transaction_type'].upper()]
        order_type = LiveOrderType[data['order_type'].upper()]
    except KeyError as e:
        return jsonify({'error': f'Invalid enum value: {e}'}), 400

    try:
        from kiteconnect import KiteConnect
        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))

        order_type_str = data['order_type'].upper()
        price = data.get('price')

        # Zerodha API does not allow MARKET orders via API.
        # Convert to LIMIT with a 0.5% slippage buffer so the order fills immediately.
        if order_type_str == 'MARKET' and not price:
            ltp_key = f"{data['exchange']}:{data['symbol']}"
            ltp_data = kite.ltp([ltp_key])
            ltp = ltp_data[ltp_key]['last_price']
            protection_pct = 0.005  # 0.5%
            if data['transaction_type'].upper() == 'BUY':
                price = round(ltp * (1 + protection_pct), 2)
            else:
                price = round(ltp * (1 - protection_pct), 2)
            order_type_str = 'LIMIT'

        kite_order_id = kite.place_order(
            variety=kite.VARIETY_REGULAR,
            exchange=data['exchange'],
            tradingsymbol=data['symbol'],
            transaction_type=data['transaction_type'].upper(),
            quantity=int(data['quantity']),
            order_type=order_type_str,
            product=data.get('product', kite.PRODUCT_MIS),
            price=price
        )

        order = LiveOrder(
            user_id=user_id,
            session_id=data['session_id'],
            kite_order_id=str(kite_order_id),
            symbol=data['symbol'],
            exchange=data['exchange'],
            transaction_type=transaction_type,
            order_type=order_type,
            quantity=int(data['quantity']),
            price=float(data.get('price') or 0.0),
            placed_at=datetime.now(timezone.utc)
        )
        db.session.add(order)
        db.session.commit()
        return jsonify({'order': order.to_dict(), 'kite_order_id': kite_order_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
