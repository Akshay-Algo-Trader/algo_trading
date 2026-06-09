import logging
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models import FvgZoneConfig, FvgZoneScanResult, KiteConfig
from app.routes.decorators import admin_required
from app.services.fvg_zone_detector import detect_fvg_zones, _aggregate_to_4h
from app.services.encryption import decrypt

logger = logging.getLogger(__name__)
admin_fvg_zones_bp = Blueprint('admin_fvg_zones', __name__)

_IST = timezone(timedelta(hours=5, minutes=30))

_KITE_INTERVAL = {
    '15min': '15minute',
    '30min': '30minute',
    '1hour': '60minute',
    '4hour': '60minute',  # fetched as 60m then aggregated
}

_VALID_TYPES = ('bullish', 'bearish', 'both')
_VALID_SIZES = ('15min', '30min', '1hour', '4hour')
_VALID_PERIODS = (1, 7, 10, 30, 60)


@admin_fvg_zones_bp.get('/api/admin/fvg-zones')
@admin_required
def list_fvg_zones():
    configs = FvgZoneConfig.query.order_by(FvgZoneConfig.name).all()
    return jsonify({'fvg_zones': [c.to_dict() for c in configs]}), 200


@admin_fvg_zones_bp.post('/api/admin/fvg-zones')
@admin_required
def create_fvg_zone():
    data = request.get_json() or {}
    if not data.get('name'):
        return jsonify({'error': 'Missing field: name'}), 400

    if FvgZoneConfig.query.filter_by(name=data['name']).first():
        return jsonify({'error': 'An FVG zone config with this name already exists'}), 409

    config = FvgZoneConfig(
        name=data['name'],
        description=data.get('description'),
        fvg_type=data.get('fvg_type', 'both'),
        candle_size=data.get('candle_size', '1hour'),
        period_days=int(data.get('period_days', 30)),
        impulse_multiplier=float(data.get('impulse_multiplier', 1.5)),
        min_gap_pct=float(data.get('min_gap_pct', 0.05)),
        created_by=int(get_jwt_identity()),
    )
    db.session.add(config)
    db.session.commit()
    return jsonify({'fvg_zone': config.to_dict()}), 201


@admin_fvg_zones_bp.get('/api/admin/fvg-zones/<int:config_id>')
@admin_required
def get_fvg_zone(config_id):
    config = FvgZoneConfig.query.get_or_404(config_id)
    return jsonify(config.to_dict()), 200


@admin_fvg_zones_bp.put('/api/admin/fvg-zones/<int:config_id>')
@admin_required
def update_fvg_zone(config_id):
    config = FvgZoneConfig.query.get_or_404(config_id)
    data = request.get_json() or {}

    for field in ['name', 'description', 'fvg_type', 'candle_size', 'is_active']:
        if field in data:
            setattr(config, field, data[field])

    if 'period_days' in data:
        config.period_days = int(data['period_days'])
    if 'impulse_multiplier' in data:
        config.impulse_multiplier = float(data['impulse_multiplier'])
    if 'min_gap_pct' in data:
        config.min_gap_pct = float(data['min_gap_pct'])

    db.session.commit()
    return jsonify({'fvg_zone': config.to_dict()}), 200


@admin_fvg_zones_bp.delete('/api/admin/fvg-zones/<int:config_id>')
@admin_required
def delete_fvg_zone(config_id):
    config = FvgZoneConfig.query.get_or_404(config_id)
    db.session.delete(config)
    db.session.commit()
    return jsonify({'message': 'FVG zone config deleted'}), 200


@admin_fvg_zones_bp.post('/api/admin/fvg-zones/<int:config_id>/scan')
@admin_required
def scan_fvg_zones(config_id):
    user_id = int(get_jwt_identity())
    fvg_config = FvgZoneConfig.query.get_or_404(config_id)
    data = request.get_json() or {}

    instrument = data.get('instrument', '').strip().upper()
    exchange = data.get('exchange', 'NSE')
    if not instrument:
        return jsonify({'error': 'instrument required'}), 400

    candle_size = fvg_config.candle_size
    period_days = fvg_config.period_days

    kite_interval = _KITE_INTERVAL.get(candle_size, '60minute')
    is_4h = candle_size == '4hour'

    kite_cfg = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (kite_cfg and kite_cfg.is_connected and kite_cfg.access_token_encrypted):
        kite_cfg = KiteConfig.query.filter_by(is_connected=True).first()
    if not (kite_cfg and kite_cfg.access_token_encrypted):
        return jsonify({'error': 'No connected Kite account available'}), 400

    try:
        from kiteconnect import KiteConnect
        from app.routes.customer.market import _resolve_token

        kite = KiteConnect(api_key=decrypt(kite_cfg.api_key_encrypted))
        kite.set_access_token(decrypt(kite_cfg.access_token_encrypted))

        token = _resolve_token(instrument, exchange, kite)
        if not token:
            return jsonify({'error': f'{exchange}:{instrument} not found'}), 404

        now_ist = datetime.now(_IST)
        to_date = now_ist.date()
        # Add warmup: 20 extra trading days for ATR calculation
        warmup_days = 20
        from_date = to_date - timedelta(days=period_days + warmup_days + 10)

        raw = kite.historical_data(
            token,
            from_date.strftime('%Y-%m-%d'),
            to_date.strftime('%Y-%m-%d'),
            kite_interval,
        )

        all_candles = [{
            'date': c['date'].strftime('%Y-%m-%d %H:%M:%S'),
            'open': c['open'],
            'high': c['high'],
            'low': c['low'],
            'close': c['close'],
            'volume': c.get('volume', 0),
        } for c in raw]

        if is_4h:
            all_candles = _aggregate_to_4h(all_candles)

        if len(all_candles) < 3:
            return jsonify({'error': 'Not enough historical data for this instrument'}), 400

        # Determine how many candles correspond to `period_days`
        # For intraday: ~25 candles/day for 15min, ~13 for 30min, ~6 for 60min/4h (post-agg)
        candles_per_day = {'15min': 25, '30min': 13, '1hour': 6, '4hour': 2}
        cpd = candles_per_day.get(candle_size, 6)
        report_candle_count = period_days * cpd

        if len(all_candles) >= report_candle_count:
            report_candles = all_candles[-report_candle_count:]
        else:
            report_candles = all_candles

        # Run detection on all candles (warmup included) then filter to report window
        zones = detect_fvg_zones(
            all_candles,
            fvg_type=fvg_config.fvg_type,
            impulse_multiplier=fvg_config.impulse_multiplier,
            min_gap_pct=fvg_config.min_gap_pct,
        )

        period_start = report_candles[0]['date'] if report_candles else ''
        filtered_zones = [z for z in zones if z['zone_start_datetime'] >= period_start]

        period_from = report_candles[0]['date'] if report_candles else from_date.strftime('%Y-%m-%d')
        period_to = report_candles[-1]['date'] if report_candles else to_date.strftime('%Y-%m-%d')

        result = FvgZoneScanResult(
            fvg_config_id=config_id,
            instrument=instrument,
            exchange=exchange,
            candle_size=candle_size,
            period_days=period_days,
            period_from=period_from,
            period_to=period_to,
            zones_detected=filtered_zones,
            total_zones=len(filtered_zones),
            scanned_by=user_id,
        )
        db.session.add(result)
        db.session.commit()

        bullish = sum(1 for z in filtered_zones if z['type'] == 'FVG_BULLISH')
        bearish = sum(1 for z in filtered_zones if z['type'] == 'FVG_BEARISH')

        return jsonify({
            'fvg_zone': fvg_config.to_dict(),
            'scan_result': result.to_dict(),
            'summary': {
                'total_zones': len(filtered_zones),
                'bullish': bullish,
                'bearish': bearish,
                'period': {'from': period_from, 'to': period_to, 'days': period_days},
            },
        }), 200

    except Exception as exc:
        logger.exception("FVG zone scan failed config=%s user=%s: %s", config_id, user_id, exc)
        return jsonify({'error': str(exc)}), 500


@admin_fvg_zones_bp.get('/api/admin/fvg-zones/<int:config_id>/scan-history')
@admin_required
def get_fvg_scan_history(config_id):
    FvgZoneConfig.query.get_or_404(config_id)
    results = FvgZoneScanResult.query.filter_by(fvg_config_id=config_id).order_by(
        FvgZoneScanResult.scanned_at.desc()
    ).limit(50).all()
    return jsonify({'scan_results': [r.to_dict() for r in results]}), 200


@admin_fvg_zones_bp.get('/api/admin/fvg-zones/<int:config_id>/scan/<int:result_id>')
@admin_required
def get_fvg_scan_result(config_id, result_id):
    FvgZoneConfig.query.get_or_404(config_id)
    result = FvgZoneScanResult.query.get_or_404(result_id)
    if result.fvg_config_id != config_id:
        return jsonify({'error': 'Scan result not found'}), 404
    return jsonify(result.to_dict()), 200


@admin_fvg_zones_bp.get('/api/admin/fvg-zones/chart-candles')
@admin_required
def get_chart_candles():
    """Fetch candles for chart display around an FVG zone.

    Query params:
        instrument, exchange, candle_size, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD)
    Returns candles as [{time: unix_ts, open, high, low, close}].
    """
    user_id = int(get_jwt_identity())
    instrument = request.args.get('instrument', '').strip().upper()
    exchange = request.args.get('exchange', 'NSE').upper()
    candle_size = request.args.get('candle_size', '1hour')
    from_date_str = request.args.get('from_date', '')
    to_date_str = request.args.get('to_date', '')

    if not instrument:
        return jsonify({'error': 'instrument required'}), 400
    if not from_date_str or not to_date_str:
        return jsonify({'error': 'from_date and to_date required'}), 400

    kite_interval = _KITE_INTERVAL.get(candle_size, '60minute')
    is_4h = candle_size == '4hour'

    kite_cfg = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (kite_cfg and kite_cfg.is_connected and kite_cfg.access_token_encrypted):
        kite_cfg = KiteConfig.query.filter_by(is_connected=True).first()
    if not (kite_cfg and kite_cfg.access_token_encrypted):
        return jsonify({'error': 'No connected Kite account available'}), 400

    try:
        from kiteconnect import KiteConnect
        from app.routes.customer.market import _resolve_token

        kite = KiteConnect(api_key=decrypt(kite_cfg.api_key_encrypted))
        kite.set_access_token(decrypt(kite_cfg.access_token_encrypted))

        token = _resolve_token(instrument, exchange, kite)
        if not token:
            return jsonify({'error': f'{exchange}:{instrument} not found'}), 404

        raw = kite.historical_data(token, from_date_str, to_date_str, kite_interval)
        candles_raw = [{
            'date': c['date'].strftime('%Y-%m-%d %H:%M:%S'),
            'open': c['open'], 'high': c['high'],
            'low': c['low'], 'close': c['close'],
            'volume': c.get('volume', 0),
            '_ts': int(c['date'].timestamp()),
        } for c in raw]

        if is_4h:
            groups = []
            for i in range(0, len(candles_raw), 4):
                g = candles_raw[i:i + 4]
                if not g:
                    continue
                groups.append({
                    'time': g[0]['_ts'],
                    'open': g[0]['open'],
                    'high': max(c['high'] for c in g),
                    'low': min(c['low'] for c in g),
                    'close': g[-1]['close'],
                })
            candles = groups
        else:
            candles = [{'time': c['_ts'], 'open': c['open'], 'high': c['high'],
                        'low': c['low'], 'close': c['close']} for c in candles_raw]

        return jsonify({'candles': candles}), 200

    except Exception as exc:
        logger.exception("FVG chart candles failed user=%s: %s", user_id, exc)
        return jsonify({'error': str(exc)}), 500
