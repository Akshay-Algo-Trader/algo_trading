from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

import math

from app.extensions import db
from app.models import KiteConfig, TradingSession, SessionStatus
from app.models.instrument import Instrument
from app.models.live_order import LiveOrder, TransactionType, OrderStatus, OrderType
from app.models.paper_order import PaperOrder, PaperOrderType, PaperOrderStatus, PaperOrderCategory
from app.models.virtual_account import VirtualAccount
from app.routes.decorators import customer_required
from app.services.encryption import decrypt
from app.services.kite_service import kite_service


def _snap_to_tick(price: float, tick: float) -> float:
    """Round price to the nearest valid tick-size multiple."""
    if not tick or tick <= 0:
        return round(price, 2)
    snapped = round(round(price / tick) * tick, 10)
    # Trim floating-point noise: keep only as many decimals as tick has
    decimals = len(str(tick).rstrip('0').split('.')[-1]) if '.' in str(tick) else 0
    return round(snapped, decimals)


def _tick_size(symbol: str, exchange: str) -> float:
    """Look up tick_size from instruments table; default to 0.05 for NSE equities."""
    inst = Instrument.query.filter_by(tradingsymbol=symbol, exchange=exchange).first()
    if inst and inst.tick_size and inst.tick_size > 0:
        return inst.tick_size
    return 0.05  # NSE equity default

customer_market_bp = Blueprint('customer_market', __name__)

NIFTY50 = [
    {"symbol": "ADANIENT",   "name": "Adani Enterprises"},
    {"symbol": "ADANIPORTS", "name": "Adani Ports & SEZ"},
    {"symbol": "APOLLOHOSP", "name": "Apollo Hospitals"},
    {"symbol": "ASIANPAINT", "name": "Asian Paints"},
    {"symbol": "AXISBANK",   "name": "Axis Bank"},
    {"symbol": "BAJAJ-AUTO", "name": "Bajaj Auto"},
    {"symbol": "BAJAJFINSV", "name": "Bajaj Finserv"},
    {"symbol": "BAJFINANCE", "name": "Bajaj Finance"},
    {"symbol": "BHARTIARTL", "name": "Bharti Airtel"},
    {"symbol": "BPCL",       "name": "BPCL"},
    {"symbol": "BRITANNIA",  "name": "Britannia Industries"},
    {"symbol": "CIPLA",      "name": "Cipla"},
    {"symbol": "COALINDIA",  "name": "Coal India"},
    {"symbol": "DIVISLAB",   "name": "Divi's Laboratories"},
    {"symbol": "DRREDDY",    "name": "Dr Reddy's Laboratories"},
    {"symbol": "EICHERMOT",  "name": "Eicher Motors"},
    {"symbol": "GRASIM",     "name": "Grasim Industries"},
    {"symbol": "HCLTECH",    "name": "HCL Technologies"},
    {"symbol": "HDFCBANK",   "name": "HDFC Bank"},
    {"symbol": "HDFCLIFE",   "name": "HDFC Life Insurance"},
    {"symbol": "HEROMOTOCO", "name": "Hero MotoCorp"},
    {"symbol": "HINDALCO",   "name": "Hindalco Industries"},
    {"symbol": "HINDUNILVR", "name": "Hindustan Unilever"},
    {"symbol": "ICICIBANK",  "name": "ICICI Bank"},
    {"symbol": "INDUSINDBK", "name": "IndusInd Bank"},
    {"symbol": "INFY",       "name": "Infosys"},
    {"symbol": "ITC",        "name": "ITC"},
    {"symbol": "JSWSTEEL",   "name": "JSW Steel"},
    {"symbol": "KOTAKBANK",  "name": "Kotak Mahindra Bank"},
    {"symbol": "LT",         "name": "Larsen & Toubro"},
    {"symbol": "M&M",        "name": "Mahindra & Mahindra"},
    {"symbol": "MARUTI",     "name": "Maruti Suzuki India"},
    {"symbol": "NESTLEIND",  "name": "Nestle India"},
    {"symbol": "NTPC",       "name": "NTPC"},
    {"symbol": "ONGC",       "name": "Oil & Natural Gas Corp"},
    {"symbol": "POWERGRID",  "name": "Power Grid Corporation"},
    {"symbol": "RELIANCE",   "name": "Reliance Industries"},
    {"symbol": "SBILIFE",    "name": "SBI Life Insurance"},
    {"symbol": "SBIN",       "name": "State Bank of India"},
    {"symbol": "SUNPHARMA",  "name": "Sun Pharmaceutical"},
    {"symbol": "TATACONSUM", "name": "Tata Consumer Products"},
    {"symbol": "TATAMOTORS", "name": "Tata Motors"},
    {"symbol": "TATASTEEL",  "name": "Tata Steel"},
    {"symbol": "TCS",        "name": "Tata Consultancy Services"},
    {"symbol": "TECHM",      "name": "Tech Mahindra"},
    {"symbol": "TITAN",      "name": "Titan Company"},
    {"symbol": "ULTRACEMCO", "name": "UltraTech Cement"},
    {"symbol": "UPL",        "name": "UPL"},
    {"symbol": "WIPRO",      "name": "Wipro"},
    {"symbol": "SHRIRAMFIN", "name": "Shriram Finance"},
]


@customer_market_bp.get('/api/customer/market/nifty50')
@customer_required
def nifty50():
    user_id = int(get_jwt_identity())
    # Build base list; enrich with tick_size from instruments table
    stocks = []
    for s in NIFTY50:
        tick = _tick_size(s['symbol'], 'NSE')
        stocks.append(dict(s, exchange='NSE', ltp=None, prev_close=None,
                           change=None, change_pct=None, tick_size=tick))

    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if config and config.is_connected and config.access_token_encrypted:
        try:
            from kiteconnect import KiteConnect
            kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
            kite.set_access_token(decrypt(config.access_token_encrypted))

            keys = [f"NSE:{s['symbol']}" for s in NIFTY50]
            ohlc_data = kite.ohlc(keys)

            for stock in stocks:
                key = f"NSE:{stock['symbol']}"
                d = ohlc_data.get(key, {})
                ltp = d.get('last_price')
                prev_close = d.get('ohlc', {}).get('close')
                if ltp is not None:
                    stock['ltp'] = ltp
                if prev_close is not None:
                    stock['prev_close'] = prev_close
                if ltp is not None and prev_close and prev_close > 0:
                    stock['change'] = round(ltp - prev_close, 2)
                    stock['change_pct'] = round((ltp - prev_close) / prev_close * 100, 2)
        except Exception:
            pass  # return list with null prices

    return jsonify({'stocks': stocks}), 200


@customer_market_bp.post('/api/customer/market/order')
@customer_required
def place_order():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    symbol   = (data.get('symbol') or '').strip().upper()
    exchange = (data.get('exchange') or 'NSE').strip().upper()
    txn_type = (data.get('transaction_type') or '').strip().upper()
    ord_type = (data.get('order_type') or 'MARKET').strip().upper()
    quantity = int(data.get('quantity') or 0)
    price    = float(data.get('price') or 0.0)
    mode     = (data.get('mode') or 'paper').strip().lower()
    product  = (data.get('product') or 'MIS').strip().upper()

    if not symbol:
        return jsonify({'error': 'Symbol is required'}), 400
    if txn_type not in ('BUY', 'SELL'):
        return jsonify({'error': 'transaction_type must be BUY or SELL'}), 400
    if ord_type not in ('MARKET', 'LIMIT'):
        return jsonify({'error': 'order_type must be MARKET or LIMIT'}), 400
    if product not in ('MIS', 'CNC'):
        return jsonify({'error': 'product must be MIS or CNC'}), 400
    if quantity <= 0:
        return jsonify({'error': 'Quantity must be greater than 0'}), 400
    if ord_type == 'LIMIT' and price <= 0:
        return jsonify({'error': 'Price required for LIMIT orders'}), 400

    # Snap LIMIT price to nearest tick size to avoid Kite rejections
    if ord_type == 'LIMIT':
        tick = _tick_size(symbol, exchange)
        price = _snap_to_tick(price, tick)

    active_session = TradingSession.query.filter_by(
        user_id=user_id, status=SessionStatus.ACTIVE
    ).first()

    if mode == 'live':
        config = KiteConfig.query.filter_by(user_id=user_id).first()
        if not config or not config.is_connected:
            return jsonify({'error': 'Kite account not connected'}), 400

        try:
            kite_order_id = kite_service.place_order(user_id, {
                'symbol': symbol,
                'exchange': exchange,
                'transaction_type': txn_type,
                'order_type': ord_type,
                'quantity': quantity,
                'price': price if ord_type == 'LIMIT' else 0,
                'product': product,
                'variety': 'regular',
                'mode': 'live',
            })
        except (ValueError, RuntimeError) as exc:
            return jsonify({'error': str(exc)}), 400

        order = LiveOrder(
            user_id=user_id,
            session_id=active_session.id if active_session else None,
            kite_order_id=kite_order_id,
            symbol=symbol,
            exchange=exchange,
            transaction_type=TransactionType[txn_type],
            order_type=OrderType[ord_type],
            quantity=quantity,
            price=price,
            status=OrderStatus.OPEN,
            tag='manual',
        )
        db.session.add(order)
        db.session.commit()
        return jsonify({'order': order.to_dict(), 'kite_order_id': kite_order_id}), 201

    # ── Paper mode ──
    fill_price = price  # for MARKET: frontend passes current LTP; for LIMIT: already snapped above

    va = VirtualAccount.query.filter_by(user_id=user_id).first()
    if not va:
        return jsonify({'error': 'Virtual account not found'}), 400

    cost = fill_price * quantity
    if txn_type == 'BUY':
        if va.balance < cost:
            return jsonify({'error': f'Insufficient virtual balance (need ₹{cost:,.2f}, have ₹{va.balance:,.2f})'}), 400
        va.balance = round(va.balance - cost, 2)
    else:
        va.balance = round(va.balance + cost, 2)

    order = PaperOrder(
        user_id=user_id,
        session_id=active_session.id if active_session else None,
        symbol=symbol,
        exchange=exchange,
        transaction_type=PaperOrderType[txn_type],
        order_type=PaperOrderCategory[ord_type],
        quantity=quantity,
        trigger_price=fill_price,
        fill_price=fill_price,
        fill_time=datetime.now(timezone.utc),
        status=PaperOrderStatus.FILLED,
    )
    db.session.add(order)
    db.session.commit()
    return jsonify({'order': order.to_dict()}), 201
