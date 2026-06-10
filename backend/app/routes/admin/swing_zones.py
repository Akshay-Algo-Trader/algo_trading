import logging
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models import SwingZoneConfig, SwingZoneScanResult, KiteConfig
from app.routes.decorators import admin_required
from app.services.swing_zone_detector import detect_sr_levels
from app.services.fvg_zone_detector import _aggregate_to_4h
from app.services.encryption import decrypt

logger = logging.getLogger(__name__)
admin_swing_zones_bp = Blueprint('admin_swing_zones', __name__)

_IST = timezone(timedelta(hours=5, minutes=30))

_KITE_INTERVAL = {
    '1min': 'minute',
    '5min': '5minute',
    '15min': '15minute',
    '30min': '30minute',
    '1hour': '60minute',
    '4hour': '60minute',
}

_VALID_SIZES = ('1min', '5min', '15min', '30min', '1hour', '4hour')
_VALID_PERIODS = (1, 7, 10, 30, 60, 90)
_VALID_STRONG_PCTS = (0.1, 0.5, 1.0, 1.5, 2.0)

# Buffer days fetched before start_date to give pivot detection lookback context
_BUFFER_DAYS = {
    '1min': 3,
    '5min': 5,
    '15min': 7,
    '30min': 10,
    '1hour': 15,
    '4hour': 40,
}

# Kite historical data API max range (days) per interval
_MAX_FETCH_DAYS = {
    '1min': 60,
    '5min': 100,
    '15min': 200,
    '30min': 200,
    '1hour': 400,
    '4hour': 400,
}


@admin_swing_zones_bp.get('/api/admin/swing-zones')
@admin_required
def list_swing_zones():
    configs = SwingZoneConfig.query.order_by(SwingZoneConfig.name).all()
    return jsonify({'swing_zones': [c.to_dict() for c in configs]}), 200


@admin_swing_zones_bp.post('/api/admin/swing-zones')
@admin_required
def create_swing_zone():
    data = request.get_json() or {}
    if not data.get('name'):
        return jsonify({'error': 'Missing field: name'}), 400

    if SwingZoneConfig.query.filter_by(name=data['name']).first():
        return jsonify({'error': 'A config with this name already exists'}), 409

    strong_level_pct = float(data.get('strong_level_pct', 0.5))
    if strong_level_pct not in _VALID_STRONG_PCTS:
        return jsonify({'error': f'strong_level_pct must be one of {_VALID_STRONG_PCTS}'}), 400

    config = SwingZoneConfig(
        name=data['name'],
        description=data.get('description'),
        candle_size=data.get('candle_size', '4hour'),
        period_days=int(data.get('period_days', 30)),
        pivot_bars=int(data.get('pivot_bars', 5)),
        strong_level_pct=strong_level_pct,
        created_by=int(get_jwt_identity()),
    )
    db.session.add(config)
    db.session.commit()
    return jsonify({'swing_zone': config.to_dict()}), 201


@admin_swing_zones_bp.get('/api/admin/swing-zones/<int:config_id>')
@admin_required
def get_swing_zone(config_id):
    config = SwingZoneConfig.query.get_or_404(config_id)
    return jsonify(config.to_dict()), 200


@admin_swing_zones_bp.put('/api/admin/swing-zones/<int:config_id>')
@admin_required
def update_swing_zone(config_id):
    config = SwingZoneConfig.query.get_or_404(config_id)
    data = request.get_json() or {}

    for field in ['name', 'description', 'candle_size', 'is_active']:
        if field in data:
            setattr(config, field, data[field])

    for int_field in ['period_days', 'pivot_bars']:
        if int_field in data:
            setattr(config, int_field, int(data[int_field]))

    if 'strong_level_pct' in data:
        strong_level_pct = float(data['strong_level_pct'])
        if strong_level_pct not in _VALID_STRONG_PCTS:
            return jsonify({'error': f'strong_level_pct must be one of {_VALID_STRONG_PCTS}'}), 400
        config.strong_level_pct = strong_level_pct

    db.session.commit()
    return jsonify({'swing_zone': config.to_dict()}), 200


@admin_swing_zones_bp.delete('/api/admin/swing-zones/<int:config_id>')
@admin_required
def delete_swing_zone(config_id):
    config = SwingZoneConfig.query.get_or_404(config_id)
    db.session.delete(config)
    db.session.commit()
    return jsonify({'message': 'Config deleted'}), 200


@admin_swing_zones_bp.post('/api/admin/swing-zones/<int:config_id>/scan')
@admin_required
def scan_swing_zones(config_id):
    user_id = int(get_jwt_identity())
    swing_config = SwingZoneConfig.query.get_or_404(config_id)
    data = request.get_json() or {}

    instrument = data.get('instrument', '').strip().upper()
    exchange = data.get('exchange', 'NSE')
    if not instrument:
        return jsonify({'error': 'instrument required'}), 400

    candle_size = swing_config.candle_size
    is_4h = candle_size == '4hour'
    kite_interval = _KITE_INTERVAL.get(candle_size, '60minute')

    start_date_str = data.get('start_date', '').strip()
    end_date_str = data.get('end_date', '').strip()
    if start_date_str and end_date_str:
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format, expected YYYY-MM-DD'}), 400
        if start_date >= end_date:
            return jsonify({'error': 'start_date must be before end_date'}), 400
        period_days = (end_date - start_date).days

        max_days = _MAX_FETCH_DAYS.get(candle_size, 400) - _BUFFER_DAYS.get(candle_size, 40)
        if period_days > max_days:
            return jsonify({'error': f'Date range too large for {candle_size} candles (max {max_days} days)'}), 400
    else:
        period_days = swing_config.period_days
        end_date = datetime.now(_IST).date()
        start_date = end_date - timedelta(days=period_days)

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

        fetch_from = start_date - timedelta(days=_BUFFER_DAYS.get(candle_size, 40))

        raw = kite.historical_data(
            token,
            fetch_from.strftime('%Y-%m-%d'),
            end_date.strftime('%Y-%m-%d'),
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

        if len(all_candles) < swing_config.pivot_bars * 2 + 1:
            return jsonify({'error': 'Not enough historical data for this instrument'}), 400

        start_filter = start_date.strftime('%Y-%m-%d')
        report_candles = [c for c in all_candles if c['date'][:10] >= start_filter]
        if not report_candles:
            report_candles = all_candles

        levels = detect_sr_levels(report_candles, pivot_bars=swing_config.pivot_bars)

        period_from = report_candles[0]['date'] if report_candles else from_date.strftime('%Y-%m-%d')
        period_to = report_candles[-1]['date'] if report_candles else to_date.strftime('%Y-%m-%d')

        result = SwingZoneScanResult.query.filter_by(
            swing_config_id=config_id,
            instrument=instrument,
            exchange=exchange,
        ).first()

        if result:
            result.candle_size = candle_size
            result.period_days = period_days
            result.period_from = period_from
            result.period_to = period_to
            result.levels_detected = levels
            result.total_levels = len(levels)
            result.scanned_by = user_id
            result.scanned_at = datetime.now(timezone.utc)
        else:
            # Trim history to 19 before adding so total stays at 20
            existing = SwingZoneScanResult.query.filter_by(swing_config_id=config_id)\
                .order_by(SwingZoneScanResult.scanned_at.asc()).all()
            if len(existing) >= 20:
                for old in existing[:len(existing) - 19]:
                    db.session.delete(old)

            result = SwingZoneScanResult(
                swing_config_id=config_id,
                instrument=instrument,
                exchange=exchange,
                candle_size=candle_size,
                period_days=period_days,
                period_from=period_from,
                period_to=period_to,
                levels_detected=levels,
                total_levels=len(levels),
                scanned_by=user_id,
            )
            db.session.add(result)

        db.session.commit()

        resistance_count = sum(1 for lv in levels if lv['type'] == 'RESISTANCE')
        support_count = sum(1 for lv in levels if lv['type'] == 'SUPPORT')

        return jsonify({
            'config': swing_config.to_dict(),
            'scan_result': result.to_dict(),
            'summary': {
                'total_levels': len(levels),
                'resistance': resistance_count,
                'support': support_count,
                'period': {'from': period_from, 'to': period_to, 'days': period_days},
            },
        }), 200

    except Exception as exc:
        logger.exception("Swing zone scan failed config=%s user=%s: %s", config_id, user_id, exc)
        return jsonify({'error': str(exc)}), 500


@admin_swing_zones_bp.get('/api/admin/swing-zones/<int:config_id>/scan-history')
@admin_required
def get_swing_scan_history(config_id):
    SwingZoneConfig.query.get_or_404(config_id)
    results = SwingZoneScanResult.query.filter_by(swing_config_id=config_id).order_by(
        SwingZoneScanResult.scanned_at.desc()
    ).limit(20).all()
    return jsonify({'scan_results': [r.to_dict() for r in results]}), 200


@admin_swing_zones_bp.get('/api/admin/swing-zones/<int:config_id>/scan/<int:result_id>')
@admin_required
def get_swing_scan_result(config_id, result_id):
    config = SwingZoneConfig.query.get_or_404(config_id)
    result = SwingZoneScanResult.query.get_or_404(result_id)
    if result.swing_config_id != config_id:
        return jsonify({'error': 'Scan result not found'}), 404
    data = result.to_dict()
    data['strong_level_pct'] = config.strong_level_pct
    return jsonify(data), 200


@admin_swing_zones_bp.get('/api/admin/swing-zones/chart-candles')
@admin_required
def get_swing_chart_candles():
    user_id = int(get_jwt_identity())
    instrument = request.args.get('instrument', '').strip().upper()
    exchange = request.args.get('exchange', 'NSE').upper()
    candle_size = request.args.get('candle_size', '4hour')
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
            # Reinterpret IST wall-clock as UTC so lightweight-charts (which renders
            # numeric timestamps in UTC) displays the correct IST time.
            '_ts': int(c['date'].replace(tzinfo=timezone.utc).timestamp()),
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
        logger.exception("Swing zone chart-candles failed user=%s: %s", user_id, exc)
        return jsonify({'error': str(exc)}), 500
