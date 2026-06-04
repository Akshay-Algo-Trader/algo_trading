from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models import Strategy, UserStrategy, Exchange, OrderType, User
from app.routes.decorators import admin_required

admin_strategies_bp = Blueprint('admin_strategies', __name__)

NIFTY50_FALLBACK = [
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


INDICES_FALLBACK = [
    {"symbol": "NIFTY 50",        "name": "NIFTY 50",              "exchange": "NSE"},
    {"symbol": "NIFTY BANK",      "name": "Nifty Bank",            "exchange": "NSE"},
    {"symbol": "NIFTY IT",        "name": "Nifty IT",              "exchange": "NSE"},
    {"symbol": "NIFTY MIDCAP 150","name": "Nifty Midcap 150",      "exchange": "NSE"},
    {"symbol": "NIFTY NEXT 50",   "name": "Nifty Next 50",         "exchange": "NSE"},
    {"symbol": "NIFTY 100",       "name": "Nifty 100",             "exchange": "NSE"},
    {"symbol": "NIFTY 200",       "name": "Nifty 200",             "exchange": "NSE"},
    {"symbol": "NIFTY 500",       "name": "Nifty 500",             "exchange": "NSE"},
    {"symbol": "NIFTY AUTO",      "name": "Nifty Auto",            "exchange": "NSE"},
    {"symbol": "NIFTY FMCG",      "name": "Nifty FMCG",           "exchange": "NSE"},
    {"symbol": "NIFTY PHARMA",    "name": "Nifty Pharma",          "exchange": "NSE"},
    {"symbol": "NIFTY METAL",     "name": "Nifty Metal",           "exchange": "NSE"},
    {"symbol": "NIFTY REALTY",    "name": "Nifty Realty",          "exchange": "NSE"},
    {"symbol": "NIFTY ENERGY",    "name": "Nifty Energy",          "exchange": "NSE"},
    {"symbol": "NIFTY INFRA",     "name": "Nifty Infrastructure",  "exchange": "NSE"},
    {"symbol": "NIFTY MEDIA",     "name": "Nifty Media",           "exchange": "NSE"},
    {"symbol": "SENSEX",          "name": "BSE SENSEX",            "exchange": "BSE"},
    {"symbol": "BANKEX",          "name": "BSE Bankex",            "exchange": "BSE"},
    {"symbol": "BSE500",          "name": "BSE 500",               "exchange": "BSE"},
]


@admin_strategies_bp.get('/api/admin/instruments')
@admin_required
def list_instruments():
    from app.models.instrument import Instrument
    from sqlalchemy import or_
    q = request.args.get('q', '').strip().upper()

    # Search equities, indices, and MCX commodity futures
    SEARCH_EXCHANGES = ['NSE', 'BSE', 'NFO', 'NSE_INDICES', 'BSE_INDICES', 'MCX']
    base = Instrument.query.filter(Instrument.exchange.in_(SEARCH_EXCHANGES))
    if q:
        base = base.filter(
            or_(
                Instrument.tradingsymbol.ilike(f'%{q}%'),
                Instrument.name.ilike(f'%{q}%'),
            )
        )
    instruments = base.order_by(Instrument.tradingsymbol).limit(50).all()

    if instruments:
        return jsonify({'instruments': [
            {'symbol': i.tradingsymbol, 'exchange': i.exchange, 'name': i.name or i.tradingsymbol}
            for i in instruments
        ]}), 200


    # Instruments table not populated — combine indices + equities + MCX commodities
    from datetime import date
    _MONTH_CODES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    _MCX_META = [
        ('GOLD',       'Gold'),       ('GOLDM',      'Gold Mini'),
        ('GOLDPETAL',  'Gold Petal'), ('SILVER',     'Silver'),
        ('SILVERM',    'Silver Mini'),('SILVERMIC',  'Silver Micro'),
        ('CRUDEOIL',   'Crude Oil'),  ('CRUDEOILM',  'Crude Oil Mini'),
        ('NATURALGAS', 'Natural Gas'),('COPPER',     'Copper'),
        ('ALUMINIUM',  'Aluminium'),  ('ZINC',       'Zinc'),
        ('LEAD',       'Lead'),       ('NICKEL',     'Nickel'),
        ('MENTHAOIL',  'Mentha Oil'),
    ]
    today = date.today()
    mcx_fallback = []
    for base, name in _MCX_META:
        m, y = today.month, today.year
        symbol = f"{base}{str(y)[2:]}{_MONTH_CODES[m - 1]}FUT"
        mcx_fallback.append({'symbol': symbol, 'name': name, 'exchange': 'MCX'})

    combined = INDICES_FALLBACK + [{**i, 'exchange': 'NSE'} for i in NIFTY50_FALLBACK] + mcx_fallback
    q_lower = q.lower()
    filtered = [
        i for i in combined
        if not q or q_lower in i['symbol'].lower() or q_lower in i['name'].lower()
    ]
    return jsonify({'instruments': filtered}), 200


@admin_strategies_bp.get('/api/admin/strategies')
@admin_required
def list_strategies():
    strategies = Strategy.query.all()
    return jsonify({'strategies': [s.to_dict() for s in strategies]}), 200


@admin_strategies_bp.post('/api/admin/strategies')
@admin_required
def create_strategy():
    data = request.get_json() or {}
    required = ['name', 'instrument', 'exchange', 'order_type', 'quantity',
                'entry_condition', 'exit_condition', 'stop_loss_pct', 'take_profit_pct']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    try:
        exchange = Exchange[data['exchange'].upper()]
        order_type = OrderType[data['order_type'].upper()]
    except KeyError as e:
        return jsonify({'error': f'Invalid value: {e}'}), 400

    strategy = Strategy(
        name=data['name'],
        description=data.get('description'),
        instrument=data['instrument'],
        exchange=exchange,
        order_type=order_type,
        quantity=int(data['quantity']),
        entry_condition=data['entry_condition'],
        exit_condition=data['exit_condition'],
        stop_loss_pct=float(data['stop_loss_pct']),
        take_profit_pct=float(data['take_profit_pct']),
        candle_pattern_id=data.get('candle_pattern_id'),
        created_by=int(get_jwt_identity())
    )
    db.session.add(strategy)
    db.session.commit()
    return jsonify({'strategy': strategy.to_dict()}), 201


@admin_strategies_bp.put('/api/admin/strategies/<int:strategy_id>')
@admin_required
def update_strategy(strategy_id):
    strategy = Strategy.query.get_or_404(strategy_id)
    data = request.get_json() or {}

    scalar_fields = ['name', 'description', 'instrument', 'quantity',
                     'entry_condition', 'exit_condition', 'stop_loss_pct',
                     'take_profit_pct', 'candle_pattern_id', 'is_active']
    for field in scalar_fields:
        if field in data:
            setattr(strategy, field, data[field])

    if 'exchange' in data:
        strategy.exchange = Exchange[data['exchange'].upper()]
    if 'order_type' in data:
        strategy.order_type = OrderType[data['order_type'].upper()]

    db.session.commit()
    return jsonify({'strategy': strategy.to_dict()}), 200


@admin_strategies_bp.delete('/api/admin/strategies/<int:strategy_id>')
@admin_required
def delete_strategy(strategy_id):
    strategy = Strategy.query.get_or_404(strategy_id)
    db.session.delete(strategy)
    db.session.commit()
    return jsonify({'message': 'Strategy deleted'}), 200


@admin_strategies_bp.post('/api/admin/strategies/<int:strategy_id>/assign')
@admin_required
def assign_strategy(strategy_id):
    Strategy.query.get_or_404(strategy_id)
    data = request.get_json() or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    User.query.get_or_404(user_id)

    if UserStrategy.query.filter_by(user_id=user_id, strategy_id=strategy_id).first():
        return jsonify({'error': 'Strategy already assigned to this user'}), 409

    us = UserStrategy(user_id=user_id, strategy_id=strategy_id)
    db.session.add(us)
    db.session.commit()
    return jsonify({'assignment': us.to_dict()}), 201


@admin_strategies_bp.post('/api/admin/strategies/<int:strategy_id>/assign-bulk')
@admin_required
def assign_strategy_bulk(strategy_id):
    Strategy.query.get_or_404(strategy_id)
    data = request.get_json() or {}
    if 'user_ids' not in data or not isinstance(data['user_ids'], list):
        return jsonify({'error': 'user_ids array required'}), 400

    desired = set(data['user_ids'])
    current_qs = UserStrategy.query.filter_by(strategy_id=strategy_id).all()
    current = {us.user_id: us for us in current_qs}

    added = []
    for uid in desired:
        if uid not in current:
            User.query.get_or_404(uid)
            db.session.add(UserStrategy(user_id=uid, strategy_id=strategy_id))
            added.append(uid)

    removed = []
    for uid, us in current.items():
        if uid not in desired:
            db.session.delete(us)
            removed.append(uid)

    db.session.commit()
    return jsonify({'added': added, 'removed': removed}), 200


@admin_strategies_bp.delete('/api/admin/strategies/<int:strategy_id>/unassign/<int:user_id>')
@admin_required
def unassign_strategy(strategy_id, user_id):
    us = UserStrategy.query.filter_by(
        user_id=user_id, strategy_id=strategy_id
    ).first_or_404()
    db.session.delete(us)
    db.session.commit()
    return jsonify({'message': 'Strategy unassigned'}), 200
