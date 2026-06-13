import logging
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models import SwingZoneConfig, SwingZoneScanResult, KiteConfig
from app.routes.decorators import admin_required
from app.services.swing_zone_detector import (
    detect_sr_levels,
    _aggregate_to_4h,
    _KITE_INTERVAL,
    _BUFFER_DAYS,
    _MAX_FETCH_DAYS,
)
from app.services.encryption import decrypt

logger = logging.getLogger(__name__)
admin_swing_zones_bp = Blueprint('admin_swing_zones', __name__)

_IST = timezone(timedelta(hours=5, minutes=30))

_VALID_SIZES = ('1min', '5min', '15min', '30min', '1hour', '4hour')
_VALID_PERIODS = (1, 7, 10, 30, 60, 90)


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
    if not (0.01 <= strong_level_pct <= 1):
        return jsonify({'error': 'strong_level_pct must be between 0.01 and 1'}), 400

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
        if not (0.01 <= strong_level_pct <= 1):
            return jsonify({'error': 'strong_level_pct must be between 0.01 and 1'}), 400
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


# ── Bulk swing-level scanner ──────────────────────────────────────────────────

_SCANNER_EXCHANGES = ('NSE', 'BSE', 'NFO', 'NSE_INDICES', 'MCX')


def _build_scan_universe(kite, exchange):
    """All scannable instruments for an exchange as [{'symbol', 'token'}].

    NSE/BSE -> equities (main-board symbols only), NSE_INDICES -> indices,
    NFO/MCX -> nearest-expiry futures, one per underlying.
    """
    from datetime import date as _date
    from app.models.instrument import Instrument

    if exchange in ('NFO', 'MCX'):
        today = _date.today()
        best = {}
        for r in kite.instruments(exchange):
            if r.get('instrument_type') != 'FUT':
                continue
            expiry = r.get('expiry')
            if expiry and expiry < today:
                continue
            name = r.get('name') or r['tradingsymbol']
            prev = best.get(name)
            if prev is None or (expiry and prev.get('expiry') and expiry < prev['expiry']):
                best[name] = r
        rows = [{'symbol': r['tradingsymbol'], 'token': r['instrument_token']}
                for r in best.values()]
        return sorted(rows, key=lambda x: x['symbol'])

    if exchange == 'NSE_INDICES':
        insts = Instrument.query.filter_by(exchange='NSE_INDICES').all()
        if insts:
            rows = [{'symbol': i.tradingsymbol, 'token': i.instrument_token} for i in insts]
        else:
            rows = [{'symbol': r['tradingsymbol'], 'token': r['instrument_token']}
                    for r in kite.instruments('NSE') if r.get('segment') == 'INDICES']
        return sorted(rows, key=lambda x: x['symbol'])

    # NSE / BSE equities; skip series-suffixed symbols (e.g. -BE, -SM)
    insts = Instrument.query.filter_by(exchange=exchange, instrument_type='EQ').all()
    if insts:
        rows = [{'symbol': i.tradingsymbol, 'token': i.instrument_token}
                for i in insts if '-' not in i.tradingsymbol]
    else:
        rows = [{'symbol': r['tradingsymbol'], 'token': r['instrument_token']}
                for r in kite.instruments(exchange)
                if r.get('instrument_type') == 'EQ' and '-' not in r['tradingsymbol']]
    return sorted(rows, key=lambda x: x['symbol'])


@admin_swing_zones_bp.post('/api/admin/swing-scanner/run')
@admin_required
def run_swing_level_scan():
    from app.services import swing_level_scanner as scanner

    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    config_id = data.get('swing_config_id')
    if not config_id:
        return jsonify({'error': 'swing_config_id required'}), 400
    swing_config = SwingZoneConfig.query.get_or_404(int(config_id))

    exchange = (data.get('exchange') or 'NSE').upper()
    if exchange not in _SCANNER_EXCHANGES:
        return jsonify({'error': f'exchange must be one of {_SCANNER_EXCHANGES}'}), 400

    candle_size = swing_config.candle_size
    start_date_str = (data.get('start_date') or '').strip()
    end_date_str = (data.get('end_date') or '').strip()
    if start_date_str and end_date_str:
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format, expected YYYY-MM-DD'}), 400
        if start_date >= end_date:
            return jsonify({'error': 'start_date must be before end_date'}), 400
        max_days = _MAX_FETCH_DAYS.get(candle_size, 400) - _BUFFER_DAYS.get(candle_size, 40)
        if (end_date - start_date).days > max_days:
            return jsonify({'error': f'Date range too large for {candle_size} candles (max {max_days} days)'}), 400
    else:
        end_date = datetime.now(_IST).date()
        start_date = end_date - timedelta(days=swing_config.period_days)

    if scanner.has_running_scan():
        return jsonify({'error': 'A scan is already running — wait for it to finish or cancel it'}), 409

    kite_cfg = KiteConfig.query.filter_by(user_id=user_id).first()
    if not (kite_cfg and kite_cfg.is_connected and kite_cfg.access_token_encrypted):
        kite_cfg = KiteConfig.query.filter_by(is_connected=True).first()
    if not (kite_cfg and kite_cfg.access_token_encrypted):
        return jsonify({'error': 'No connected Kite account available'}), 400

    try:
        from kiteconnect import KiteConnect
        kite = KiteConnect(api_key=decrypt(kite_cfg.api_key_encrypted))
        kite.set_access_token(decrypt(kite_cfg.access_token_encrypted))

        universe = _build_scan_universe(kite, exchange)
        if not universe:
            return jsonify({'error': f'No instruments found for {exchange} — sync instruments first'}), 400

        run = scanner.start_scan(
            kite, universe, swing_config.to_dict(), exchange,
            start_date, end_date,
            _KITE_INTERVAL.get(candle_size, '60minute'),
            _BUFFER_DAYS.get(candle_size, 40),
            strict=bool(data.get('strict')),
        )
        return jsonify({'run': run}), 202

    except Exception as exc:
        logger.exception("Swing level scan start failed config=%s user=%s: %s", config_id, user_id, exc)
        return jsonify({'error': str(exc)}), 500


@admin_swing_zones_bp.get('/api/admin/swing-scanner/latest')
@admin_required
def get_latest_swing_level_scan():
    from app.services import swing_level_scanner as scanner
    return jsonify({'run': scanner.get_latest_run()}), 200


@admin_swing_zones_bp.get('/api/admin/swing-scanner/<int:run_id>')
@admin_required
def get_swing_level_scan(run_id):
    from app.services import swing_level_scanner as scanner
    run = scanner.get_run(run_id)
    if not run:
        return jsonify({'error': 'Scan run not found'}), 404
    return jsonify({'run': run}), 200


@admin_swing_zones_bp.post('/api/admin/swing-scanner/<int:run_id>/cancel')
@admin_required
def cancel_swing_level_scan(run_id):
    from app.services import swing_level_scanner as scanner
    if not scanner.cancel_run(run_id):
        return jsonify({'error': 'Scan run not found'}), 404
    return jsonify({'message': 'Cancellation requested'}), 200


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
