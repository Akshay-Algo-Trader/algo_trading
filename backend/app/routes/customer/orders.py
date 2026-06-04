from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.models import LiveOrder, PaperOrder
from app.routes.decorators import customer_required

customer_orders_bp = Blueprint('customer_orders', __name__)


@customer_orders_bp.get('/api/customer/orders')
@customer_required
def my_orders():
    user_id = int(get_jwt_identity())
    mode = request.args.get('mode', '').lower()

    def with_strategy(order):
        d = order.to_dict()
        try:
            d['strategy_name'] = order.session.strategy.name if order.session and order.session.strategy else None
        except Exception:
            d['strategy_name'] = None
        return d

    result = {}
    if mode in ('', 'live'):
        live = LiveOrder.query.filter_by(user_id=user_id).order_by(
            LiveOrder.placed_at.desc()
        ).all()
        result['live'] = [with_strategy(o) for o in live]
    if mode in ('', 'paper'):
        paper = PaperOrder.query.filter_by(user_id=user_id).order_by(
            PaperOrder.created_at.desc()
        ).all()
        result['paper'] = [with_strategy(o) for o in paper]

    return jsonify({'orders': result}), 200
