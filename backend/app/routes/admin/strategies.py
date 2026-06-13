import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from datetime import datetime, timezone, timedelta
from app.extensions import db
from app.models import Strategy, UserStrategy, Exchange, OrderType, User
from app.routes.decorators import admin_required

logger = logging.getLogger(__name__)

_IST = timezone(timedelta(hours=5, minutes=30))

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
    {"symbol": "NIFTY 50",        "name": "NIFTY 50",              "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY BANK",      "name": "Nifty Bank",            "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY IT",        "name": "Nifty IT",              "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY MIDCAP 150","name": "Nifty Midcap 150",      "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY NEXT 50",   "name": "Nifty Next 50",         "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY 100",       "name": "Nifty 100",             "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY 200",       "name": "Nifty 200",             "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY 500",       "name": "Nifty 500",             "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY AUTO",      "name": "Nifty Auto",            "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY FMCG",      "name": "Nifty FMCG",           "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY PHARMA",    "name": "Nifty Pharma",          "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY METAL",     "name": "Nifty Metal",           "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY REALTY",    "name": "Nifty Realty",          "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY ENERGY",    "name": "Nifty Energy",          "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY INFRA",     "name": "Nifty Infrastructure",  "exchange": "NSE_INDICES"},
    {"symbol": "NIFTY MEDIA",     "name": "Nifty Media",           "exchange": "NSE_INDICES"},
    {"symbol": "SENSEX",          "name": "BSE SENSEX",            "exchange": "BSE"},
    {"symbol": "BANKEX",          "name": "BSE Bankex",            "exchange": "BSE"},
    {"symbol": "BSE500",          "name": "BSE 500",               "exchange": "BSE"},
]


@admin_strategies_bp.post('/api/admin/instruments/sync')
@admin_required
def sync_instruments():
    from app.models import KiteConfig
    from app.services.kite_service import kite_service
    from app.services.encryption import decrypt
    from app.models.instrument import Instrument
    user_id = int(get_jwt_identity())

    kite_cfg = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (kite_cfg and kite_cfg.is_connected and kite_cfg.access_token_encrypted):
        kite_cfg = KiteConfig.query.filter_by(is_connected=True).first()
    if not (kite_cfg and kite_cfg.access_token_encrypted):
        return jsonify({'error': 'No connected Kite account available'}), 400

    try:
        from kiteconnect import KiteConnect
        kite = KiteConnect(api_key=decrypt(kite_cfg.api_key_encrypted))
        kite.set_access_token(decrypt(kite_cfg.access_token_encrypted))

        total = 0
        for exchange in ['NSE', 'BSE', 'NFO', 'NSE_INDICES']:
            try:
                records = kite.instruments(exchange)
            except Exception as exc:
                continue
            for r in records:
                existing = Instrument.query.filter_by(
                    instrument_token=r['instrument_token'], exchange=exchange
                ).first()
                if existing:
                    existing.tradingsymbol = r.get('tradingsymbol', '')
                    existing.name = r.get('name', '')
                    existing.instrument_type = r.get('instrument_type', '')
                    existing.segment = r.get('segment', '')
                    existing.lot_size = r.get('lot_size')
                    existing.tick_size = r.get('tick_size')
                else:
                    db.session.add(Instrument(
                        instrument_token=r['instrument_token'],
                        tradingsymbol=r.get('tradingsymbol', ''),
                        exchange=exchange,
                        name=r.get('name', ''),
                        instrument_type=r.get('instrument_type', ''),
                        segment=r.get('segment', ''),
                        lot_size=r.get('lot_size'),
                        tick_size=r.get('tick_size'),
                    ))
                total += 1
            db.session.commit()

        return jsonify({'message': f'Synced {total} instruments', 'total': total}), 200
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


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
        from sqlalchemy import func, case
        q_nospace = q.replace(' ', '')
        base = base.filter(
            or_(
                Instrument.tradingsymbol.ilike(f'%{q}%'),
                Instrument.name.ilike(f'%{q}%'),
                func.replace(Instrument.tradingsymbol, ' ', '').ilike(f'%{q_nospace}%'),
            )
        )
        # Indices first, then exact symbol match, then starts-with, then rest
        priority = case(
            (Instrument.exchange.in_(['NSE_INDICES', 'BSE_INDICES']), 0),
            (func.replace(Instrument.tradingsymbol, ' ', '').ilike(q_nospace), 1),
            (func.replace(Instrument.tradingsymbol, ' ', '').ilike(f'{q_nospace}%'), 2),
            else_=3
        )
        instruments = base.order_by(priority, Instrument.tradingsymbol).limit(50).all()
    else:
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
    q_nospace = q_lower.replace(' ', '')
    filtered = [
        i for i in combined
        if not q
        or q_lower in i['symbol'].lower()
        or q_lower in i['name'].lower()
        or q_nospace in i['symbol'].lower().replace(' ', '')
    ]
    return jsonify({'instruments': filtered}), 200


@admin_strategies_bp.get('/api/admin/instruments/price')
@admin_required
def get_instrument_price_admin():
    from app.models import KiteConfig
    from app.services.encryption import decrypt
    symbol   = request.args.get('symbol', '').strip().upper()
    exchange = request.args.get('exchange', 'NSE').strip().upper()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400

    # Use any connected customer's Kite credentials to fetch LTP
    config = KiteConfig.query.filter_by(is_connected=True).first()
    if not (config and config.access_token_encrypted):
        return jsonify({'symbol': symbol, 'exchange': exchange, 'ltp': None}), 200

    try:
        from kiteconnect import KiteConnect
        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))
        key  = f"{exchange}:{symbol}"
        data = kite.ohlc([key])
        ltp  = data.get(key, {}).get('last_price')
        return jsonify({'symbol': symbol, 'exchange': exchange, 'ltp': ltp}), 200
    except Exception as exc:
        return jsonify({'symbol': symbol, 'exchange': exchange, 'ltp': None}), 200


@admin_strategies_bp.get('/api/admin/candles')
@admin_required
def get_candles():
    from datetime import datetime, timedelta
    from app.routes.customer.market import _resolve_token
    from app.services.encryption import decrypt
    from app.models import KiteConfig

    instrument = request.args.get('instrument', '').strip().upper()
    exchange = request.args.get('exchange', 'NSE').upper()
    timeframe = request.args.get('timeframe', '1H').upper()

    if not instrument:
        return jsonify({'error': 'instrument required'}), 400

    # Map timeframe to Kite interval
    tf_map = {
        '1D': 'day', '4H': '60minute', '1H': '60minute',
        '30M': '30minute', '15M': '15minute', '5M': '5minute', '3M': '3minute',
    }
    interval = tf_map.get(timeframe)
    if not interval:
        return jsonify({'error': f'Unsupported timeframe: {timeframe}'}), 400

    try:
        user_id = int(get_jwt_identity())
        config = KiteConfig.query.filter_by(user_id=user_id).first()
        if not (config and config.is_connected and config.access_token_encrypted):
            config = KiteConfig.query.filter_by(is_connected=True).first()
        if not (config and config.access_token_encrypted):
            return jsonify({'error': 'No connected Kite account — cannot fetch chart data'}), 400

        from kiteconnect import KiteConnect
        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))

        token = _resolve_token(instrument, exchange, kite)
        if not token:
            return jsonify({'error': f'{exchange}:{instrument} not found'}), 404

        now_ist = datetime.now(_IST)
        to_date = now_ist.date()
        from_date = to_date - timedelta(days=14)

        raw = kite.historical_data(token, from_date.strftime('%Y-%m-%d'), to_date.strftime('%Y-%m-%d'), interval)
        candles = [{
            'time': int(c['date'].timestamp()),
            'open': c['open'],
            'high': c['high'],
            'low': c['low'],
            'close': c['close'],
            'volume': c['volume'],
        } for c in raw]

        return jsonify({'candles': candles}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to fetch candles: {str(e)}'}), 500


@admin_strategies_bp.get('/api/admin/strategies')
@admin_required
def list_strategies():
    strategies = Strategy.query.all()
    return jsonify({'strategies': [s.to_dict() for s in strategies]}), 200


@admin_strategies_bp.get('/api/admin/strategies/swing-preview')
@admin_required
def swing_preview():
    from app.models import SwingZoneConfig, KiteConfig
    from app.services.encryption import decrypt
    from app.services.swing_zone_detector import detect_sr_levels, fetch_candles_for_swing_config
    from app.services.swing_breakout import find_last_level, find_strong_levels, evaluate_breakout

    instrument = request.args.get('instrument', '').strip().upper()
    exchange = request.args.get('exchange', 'NSE').upper()
    swing_zone_config_id = request.args.get('swing_zone_config_id')

    if not instrument:
        return jsonify({'error': 'instrument required'}), 400
    if not swing_zone_config_id:
        return jsonify({'error': 'swing_zone_config_id required'}), 400

    swing_config = SwingZoneConfig.query.get_or_404(int(swing_zone_config_id))

    user_id = int(get_jwt_identity())
    kite_cfg = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (kite_cfg and kite_cfg.is_connected and kite_cfg.access_token_encrypted):
        kite_cfg = KiteConfig.query.filter_by(is_connected=True).first()
    if not (kite_cfg and kite_cfg.access_token_encrypted):
        return jsonify({'error': 'No connected Kite account available'}), 400

    try:
        from kiteconnect import KiteConnect
        kite = KiteConnect(api_key=decrypt(kite_cfg.api_key_encrypted))
        kite.set_access_token(decrypt(kite_cfg.access_token_encrypted))

        candles = fetch_candles_for_swing_config(kite, swing_config.to_dict(), instrument, exchange)
        if len(candles) < swing_config.pivot_bars * 2 + 1:
            return jsonify({'error': 'Not enough historical data for this instrument'}), 400

        # Fetched candles include extra buffer days for pivot-detection
        # context — trim to the configured Lookback Period so the levels
        # and chart shown to the user match the swing config exactly.
        start_date = (datetime.now(_IST) - timedelta(days=swing_config.period_days)).strftime('%Y-%m-%d')
        report_candles = [c for c in candles if c['date'][:10] >= start_date]
        if not report_candles:
            report_candles = candles

        levels = detect_sr_levels(report_candles, pivot_bars=swing_config.pivot_bars)
        last_level = find_last_level(levels)
        strong = find_strong_levels(levels, swing_config.strong_level_pct)

        prev_close = candles[-2]['close']
        last_close = candles[-1]['close']
        signal = evaluate_breakout(levels, swing_config.strong_level_pct, prev_close, last_close)

        direction = None
        if last_level:
            direction = 'bullish' if last_level['type'] == 'RESISTANCE' else 'bearish'

        return jsonify({
            'levels': levels,
            'last_level': last_level,
            'strong_resistance': strong['strong_resistance'],
            'strong_support': strong['strong_support'],
            'signal': signal,
            'direction': direction,
            'ltp': last_close,
            'period': {'from': report_candles[0]['date'], 'to': report_candles[-1]['date']},
        }), 200
    except Exception as exc:
        logger.exception("Swing preview failed instrument=%s: %s", instrument, exc)
        return jsonify({'error': str(exc)}), 500


@admin_strategies_bp.post('/api/admin/strategies')
@admin_required
def create_strategy():
    data = request.get_json() or {}
    required = ['name', 'instrument', 'exchange', 'order_type', 'quantity',
                'stop_loss_pct', 'take_profit_pct']
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
        stop_loss_pct=float(data['stop_loss_pct']),
        take_profit_pct=float(data['take_profit_pct']),
        stop_loss_rules=data.get('stop_loss_rules'),
        target_rules=data.get('target_rules'),
        trade_type=data.get('trade_type', 'swing'),
        exit_after_days=data.get('exit_after_days'),
        swing_zone_config_id=data.get('swing_zone_config_id'),
        option_config=data.get('option_config'),
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
                     'stop_loss_pct', 'take_profit_pct', 'stop_loss_rules',
                     'target_rules', 'trade_type', 'exit_after_days',
                     'swing_zone_config_id', 'option_config',
                     'is_active']
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
