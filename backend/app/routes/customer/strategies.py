from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity
from app.models import UserStrategy
from app.routes.decorators import customer_required

customer_strategies_bp = Blueprint('customer_strategies', __name__)


@customer_strategies_bp.get('/api/customer/strategies')
@customer_required
def my_strategies():
    user_id = int(get_jwt_identity())
    assignments = UserStrategy.query.filter_by(user_id=user_id, is_active=True).all()
    return jsonify({
        'strategies': [a.strategy.to_dict() for a in assignments if a.strategy]
    }), 200
