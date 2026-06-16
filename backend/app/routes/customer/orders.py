from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.models import LiveOrder, PaperOrder, TradingSession
from app.models.trading_session import SessionMode
from app.routes.decorators import customer_required
from collections import defaultdict

customer_orders_bp = Blueprint('customer_orders', __name__)


def _compute_paper_pnl(orders):
    """
    Attach realised P&L to the exit (SELL) order of each session.
    Groups FILLED BUY/SELL pairs by session_id and attributes
    (sell_price - buy_price) * quantity to the SELL order.
    """
    # Build per-session entry price index: session_id -> avg fill price of BUY orders
    session_buy = defaultdict(list)
    for d in orders:
        if (d.get('transaction_type') == 'BUY'
                and d.get('status') == 'FILLED'
                and d.get('session_id') is not None
                and d.get('fill_price') is not None):
            session_buy[d['session_id']].append((d['fill_price'], d['quantity']))

    for d in orders:
        if (d.get('transaction_type') == 'SELL'
                and d.get('status') == 'FILLED'
                and d.get('session_id') is not None
                and d.get('fill_price') is not None):
            buys = session_buy.get(d['session_id'], [])
            if buys:
                # weighted-average entry price across all BUY fills in the session
                total_qty = sum(q for _, q in buys)
                avg_buy = sum(p * q for p, q in buys) / total_qty if total_qty else None
                if avg_buy is not None:
                    d['pnl'] = round((d['fill_price'] - avg_buy) * d['quantity'], 2)
    return orders


@customer_orders_bp.get('/api/customer/orders')
@customer_required
def my_orders():
    user_id = int(get_jwt_identity())
    mode = request.args.get('mode', '').lower()

    def with_meta(order):
        d = order.to_dict()
        try:
            d['strategy_name'] = order.session.strategy.name if order.session and order.session.strategy else None
        except Exception:
            d['strategy_name'] = None
        d.setdefault('pnl', None)
        return d

    # Replay orders are PaperOrder rows on REPLAY-mode sessions — kept out of the
    # Paper tab so the two stay isolated; surfaced only under mode='replay'.
    replay_session_ids = [
        sid for (sid,) in TradingSession.query
        .with_entities(TradingSession.id)
        .filter_by(user_id=user_id, mode=SessionMode.REPLAY)
        .all()
    ]

    result = {}
    if mode in ('', 'live'):
        live = LiveOrder.query.filter_by(user_id=user_id).order_by(
            LiveOrder.placed_at.desc()
        ).all()
        result['live'] = [with_meta(o) for o in live]
    if mode in ('', 'paper'):
        q = PaperOrder.query.filter_by(user_id=user_id)
        if replay_session_ids:
            q = q.filter(PaperOrder.session_id.notin_(replay_session_ids))
        paper = q.order_by(PaperOrder.created_at.desc()).all()
        result['paper'] = _compute_paper_pnl([with_meta(o) for o in paper])
    if mode == 'replay':
        replay = (
            PaperOrder.query.filter_by(user_id=user_id)
            .filter(PaperOrder.session_id.in_(replay_session_ids))
            .order_by(PaperOrder.created_at.desc())
            .all()
        ) if replay_session_ids else []
        result['replay'] = _compute_paper_pnl([with_meta(o) for o in replay])

    return jsonify({'orders': result}), 200
