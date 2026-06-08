import logging
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models import ZoneConfig, ZoneScanResult, KiteConfig
from app.routes.decorators import admin_required
from app.services.zone_detector import detect_zones
from app.services.encryption import decrypt
import copy

logger = logging.getLogger(__name__)
admin_zones_bp = Blueprint('admin_zones', __name__)

_IST = timezone(timedelta(hours=5, minutes=30))


@admin_zones_bp.get('/api/admin/zones')
@admin_required
def list_zones():
    zones = ZoneConfig.query.order_by(ZoneConfig.name).all()
    return jsonify({'zones': [z.to_dict() for z in zones]}), 200


@admin_zones_bp.post('/api/admin/zones')
@admin_required
def create_zone():
    data = request.get_json() or {}
    if not data.get('name'):
        return jsonify({'error': 'Missing fields: name'}), 400

    if ZoneConfig.query.filter_by(name=data['name']).first():
        return jsonify({'error': 'A zone config with this name already exists'}), 409

    zone = ZoneConfig(
        name=data['name'],
        description=data.get('description'),
        created_by=int(get_jwt_identity()),
    )
    db.session.add(zone)
    db.session.commit()
    return jsonify({'zone': zone.to_dict()}), 201


@admin_zones_bp.get('/api/admin/zones/<int:zone_id>')
@admin_required
def get_zone(zone_id):
    zone = ZoneConfig.query.get_or_404(zone_id)
    return jsonify(zone.to_dict()), 200


@admin_zones_bp.put('/api/admin/zones/<int:zone_id>')
@admin_required
def update_zone(zone_id):
    zone = ZoneConfig.query.get_or_404(zone_id)
    data = request.get_json() or {}

    for field in ['name', 'description', 'is_active']:
        if field in data:
            setattr(zone, field, data[field])

    for json_field in ['sr_settings', 'swing_settings', 'confluence_settings']:
        if json_field in data and data[json_field] is not None:
            existing = copy.deepcopy(getattr(zone, json_field) or {})
            existing.update(data[json_field])
            setattr(zone, json_field, existing)

    if 'fvg_settings' in data and data['fvg_settings'] is not None:
        existing = copy.deepcopy(getattr(zone, 'fvg_settings') or {})
        for tf, settings in data['fvg_settings'].items():
            if tf not in existing:
                existing[tf] = {}
            if settings is not None:
                existing[tf].update(settings)
        zone.fvg_settings = existing

    db.session.commit()
    return jsonify({'zone': zone.to_dict()}), 200


@admin_zones_bp.delete('/api/admin/zones/<int:zone_id>')
@admin_required
def delete_zone(zone_id):
    zone = ZoneConfig.query.get_or_404(zone_id)
    db.session.delete(zone)
    db.session.commit()
    return jsonify({'message': 'Zone config deleted'}), 200


@admin_zones_bp.post('/api/admin/zones/<int:zone_id>/scan')
@admin_required
def scan_zones(zone_id):
    user_id = int(get_jwt_identity())
    zone_config = ZoneConfig.query.get_or_404(zone_id)
    data = request.get_json() or {}

    instrument = data.get('instrument')
    exchange = data.get('exchange', 'NSE')
    timeframe = data.get('timeframe', 'day')
    try:
        scan_days = min(max(int(data.get('scan_days', 90)), 5), 365)
    except (ValueError, TypeError):
        scan_days = 90

    if not instrument:
        return jsonify({'error': 'instrument required'}), 400

    config = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (config and config.is_connected and config.access_token_encrypted):
        config = KiteConfig.query.filter_by(is_connected=True).first()
    if not (config and config.access_token_encrypted):
        return jsonify({'error': 'No connected Kite account available'}), 400

    try:
        from kiteconnect import KiteConnect
        from app.routes.customer.market import _resolve_token

        kite = KiteConnect(api_key=decrypt(config.api_key_encrypted))
        kite.set_access_token(decrypt(config.access_token_encrypted))

        token = _resolve_token(instrument, exchange, kite)
        if not token:
            return jsonify({'error': f'{exchange}:{instrument} not found'}), 404

        now_ist = datetime.now(_IST)
        to_date = now_ist.date()
        from_date = to_date - timedelta(days=scan_days + 120)

        raw = kite.historical_data(
            token,
            from_date.strftime('%Y-%m-%d'),
            to_date.strftime('%Y-%m-%d'),
            'day',
        )
        all_candles = [{
            'date': c['date'].strftime('%Y-%m-%d'),
            'open': c['open'], 'high': c['high'],
            'low': c['low'], 'close': c['close'],
            'volume': c['volume'],
        } for c in raw]

        if len(all_candles) < 5:
            return jsonify({'error': 'Not enough historical data for this instrument'}), 400

        zone_dict = zone_config.to_dict()

        # Use all available candles for zone detection (includes warmup period)
        detected_zones = detect_zones(all_candles, zone_dict)

        # Filter results to only last N working days
        if len(all_candles) >= scan_days:
            # Get the last N trading days (not calendar days)
            report_candles = all_candles[-scan_days:]
        else:
            report_candles = all_candles

        # Filter detected zones to only those in the report period
        if report_candles:
            report_start_date = report_candles[0]['date']
            filtered_zones = [z for z in detected_zones if z.get('date', '') >= report_start_date]
        else:
            filtered_zones = detected_zones

        period_from = report_candles[0]['date'] if report_candles else from_date.strftime('%Y-%m-%d')
        period_to = report_candles[-1]['date'] if report_candles else to_date.strftime('%Y-%m-%d')

        result = ZoneScanResult(
            zone_config_id=zone_id,
            instrument=instrument,
            exchange=exchange,
            timeframe=timeframe,
            scan_days=scan_days,
            period_from=period_from,
            period_to=period_to,
            zones_detected=filtered_zones,
            total_zones=len(filtered_zones),
            scanned_by=user_id,
        )
        db.session.add(result)
        db.session.commit()

        zone_type_counts = {}
        for zone in filtered_zones:
            zone_type = zone.get('type', 'UNKNOWN')
            zone_type_counts[zone_type] = zone_type_counts.get(zone_type, 0) + 1

        return jsonify({
            'zone_config': zone_dict,
            'scan_result': result.to_dict(),
            'summary': {
                'total_zones_detected': len(filtered_zones),
                'zone_breakdown': zone_type_counts,
                'period': {'from': period_from, 'to': period_to, 'days': scan_days},
            },
        }), 200

    except Exception as exc:
        logger.exception("Zone scan failed for zone_id %s user %s: %s", zone_id, user_id, exc)
        return jsonify({'error': str(exc)}), 500


@admin_zones_bp.get('/api/admin/zones/<int:zone_id>/scan-history')
@admin_required
def get_scan_history(zone_id):
    ZoneConfig.query.get_or_404(zone_id)
    results = ZoneScanResult.query.filter_by(zone_config_id=zone_id).order_by(
        ZoneScanResult.scanned_at.desc()
    ).limit(50).all()
    return jsonify({'scan_results': [r.to_dict() for r in results]}), 200


@admin_zones_bp.get('/api/admin/zones/<int:zone_id>/scan/<int:result_id>')
@admin_required
def get_scan_result(zone_id, result_id):
    ZoneConfig.query.get_or_404(zone_id)
    result = ZoneScanResult.query.get_or_404(result_id)
    if result.zone_config_id != zone_id:
        return jsonify({'error': 'Scan result not found'}), 404
    return jsonify(result.to_dict()), 200
