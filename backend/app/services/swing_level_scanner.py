"""Bulk swing-level scanner — scans every instrument in an exchange against a
saved SwingZoneConfig and reports instruments whose NEAREST level (relative to
LTP) sits on the same price line as a STRONG level cluster, i.e. the
"Strong + Nearest" merged line drawn by SwingZoneChart.

Runs in a background thread (Kite historical API is rate-limited to ~3 req/s,
so a full-exchange scan can take minutes). Progress is kept in an in-memory
run registry polled by the frontend.
"""

import logging
import time
import threading
from datetime import datetime, timezone

from app.services.swing_zone_detector import detect_sr_levels, _aggregate_to_4h
from app.services.swing_breakout import (
    classify_by_ltp,
    find_nearest_levels,
    find_strong_levels,
)

logger = logging.getLogger(__name__)

_runs = {}
_runs_lock = threading.Lock()
_next_run_id = 1

_HISTORICAL_DELAY = 0.35  # stay under Kite's 3 req/s historical-data limit
_LTP_BATCH_SIZE = 400


def _snapshot(run):
    snap = {k: v for k, v in run.items() if k != 'cancel'}
    snap['matches'] = list(run['matches'])
    return snap


def get_run(run_id):
    with _runs_lock:
        run = _runs.get(run_id)
        return _snapshot(run) if run else None


def get_latest_run():
    with _runs_lock:
        if not _runs:
            return None
        return _snapshot(_runs[max(_runs.keys())])


def cancel_run(run_id):
    with _runs_lock:
        run = _runs.get(run_id)
        if not run:
            return False
        if run['status'] == 'running':
            run['cancel'] = True
        return True


def has_running_scan():
    with _runs_lock:
        return any(r['status'] == 'running' for r in _runs.values())


def start_scan(kite, universe, config, exchange, start_date, end_date,
               kite_interval, buffer_days, strict=False):
    """Launch a background scan. `universe` is a list of
    {'symbol', 'token'} dicts; `config` is SwingZoneConfig.to_dict().
    Returns the public snapshot of the new run."""
    global _next_run_id
    with _runs_lock:
        run_id = _next_run_id
        _next_run_id += 1
        _runs[run_id] = {
            'id': run_id,
            'status': 'running',
            'cancel': False,
            'exchange': exchange,
            'config': {
                'id': config['id'],
                'name': config['name'],
                'candle_size': config['candle_size'],
                'pivot_bars': config['pivot_bars'],
                'strong_level_pct': config['strong_level_pct'],
            },
            'period': {'from': start_date.isoformat(), 'to': end_date.isoformat()},
            'strict': bool(strict),
            'total': len(universe),
            'done': 0,
            'errors': 0,
            'matches': [],
            'error': None,
            'started_at': datetime.now(timezone.utc).isoformat(),
            'finished_at': None,
        }
        # Keep only the 5 most recent runs in memory
        for old_id in sorted(_runs.keys())[:-5]:
            if _runs[old_id]['status'] != 'running':
                del _runs[old_id]
        snapshot = _snapshot(_runs[run_id])

    thread = threading.Thread(
        target=_scan_worker,
        args=(run_id, kite, universe, config, exchange, start_date, end_date,
              kite_interval, buffer_days, strict),
        daemon=True,
        name=f'swing-scan-{run_id}',
    )
    thread.start()
    return snapshot


def _fetch_ltp_map(kite, universe, exchange):
    """Bulk-fetch LTPs for the universe. Indices live on the NSE quote feed."""
    quote_exchange = 'NSE' if exchange == 'NSE_INDICES' else exchange
    ltp_map = {}
    symbols = [u['symbol'] for u in universe]
    for i in range(0, len(symbols), _LTP_BATCH_SIZE):
        batch = symbols[i:i + _LTP_BATCH_SIZE]
        try:
            data = kite.ltp([f'{quote_exchange}:{s}' for s in batch])
            for key, q in data.items():
                ltp_map[key.split(':', 1)[1]] = q.get('last_price')
        except Exception as exc:
            logger.warning("Swing scanner LTP batch failed (%d symbols): %s", len(batch), exc)
    return ltp_map


def _scan_worker(run_id, kite, universe, config, exchange, start_date, end_date,
                 kite_interval, buffer_days, strict=False):
    from datetime import timedelta

    pivot_bars = int(config['pivot_bars'])
    strong_pct = config.get('strong_level_pct')
    is_4h = config['candle_size'] == '4hour'

    fetch_from = (start_date - timedelta(days=buffer_days)).strftime('%Y-%m-%d')
    fetch_to = end_date.strftime('%Y-%m-%d')
    start_filter = start_date.strftime('%Y-%m-%d')

    try:
        ltp_map = _fetch_ltp_map(kite, universe, exchange)

        for inst in universe:
            with _runs_lock:
                run = _runs.get(run_id)
                if not run or run['cancel']:
                    break

            match = None
            try:
                raw = kite.historical_data(inst['token'], fetch_from, fetch_to, kite_interval)
                candles = [{
                    'date': c['date'].strftime('%Y-%m-%d %H:%M:%S'),
                    'open': c['open'], 'high': c['high'],
                    'low': c['low'], 'close': c['close'],
                    'volume': c.get('volume', 0),
                } for c in raw]
                if is_4h:
                    candles = _aggregate_to_4h(candles)

                if len(candles) >= pivot_bars * 2 + 1:
                    report = [c for c in candles if c['date'][:10] >= start_filter] or candles
                    levels = detect_sr_levels(report, pivot_bars=pivot_bars)
                    ltp = ltp_map.get(inst['symbol'])
                    if ltp is None:
                        ltp = report[-1]['close']
                    match = _evaluate_instrument(levels, ltp, strong_pct, strict=strict)
                    if match:
                        match.update({'instrument': inst['symbol'], 'ltp': ltp})
            except Exception as exc:
                logger.warning("Swing scanner failed for %s:%s: %s", exchange, inst['symbol'], exc)
                with _runs_lock:
                    if run_id in _runs:
                        _runs[run_id]['errors'] += 1

            with _runs_lock:
                if run_id in _runs:
                    _runs[run_id]['done'] += 1
                    if match:
                        _runs[run_id]['matches'].append(match)

            time.sleep(_HISTORICAL_DELAY)

        with _runs_lock:
            if run_id in _runs:
                run = _runs[run_id]
                run['status'] = 'cancelled' if run['cancel'] else 'completed'
                run['finished_at'] = datetime.now(timezone.utc).isoformat()

    except Exception as exc:
        logger.exception("Swing scanner run %s crashed: %s", run_id, exc)
        with _runs_lock:
            if run_id in _runs:
                _runs[run_id]['status'] = 'error'
                _runs[run_id]['error'] = str(exc)
                _runs[run_id]['finished_at'] = datetime.now(timezone.utc).isoformat()


def _evaluate_instrument(levels, ltp, strong_pct, strict=False):
    """Match when the nearest level (above or below LTP) is part of a strong
    cluster — the nearest line and the strong line sit on the same price band
    (the chart's 'Strong + Nearest' case).

    strict=True narrows the rule to the exact merged line: the nearest level
    must BE the strong cluster's line price, not just one of its members."""
    classified = classify_by_ltp(levels, ltp)
    nearest = find_nearest_levels(classified, ltp)
    strong = find_strong_levels(classified, strong_pct)

    def hit_for(nearest_level, clusters, side):
        if not nearest_level:
            return None
        for cluster in clusters:
            if strict:
                matched = cluster['price'] == nearest_level['price']
            else:
                matched = any(m['price'] == nearest_level['price'] for m in cluster['members'])
            if matched:
                return {
                    'side': side,
                    'price': nearest_level['price'],
                    'strong_price': cluster['price'],
                    'cluster_size': len(cluster['members']),
                    'distance_pct': round(abs(nearest_level['price'] - ltp) / ltp * 100, 2) if ltp else None,
                }
        return None

    hits = [h for h in (
        hit_for(nearest['nearest_resistance'], strong['strong_resistance'], 'RESISTANCE'),
        hit_for(nearest['nearest_support'], strong['strong_support'], 'SUPPORT'),
    ) if h]

    if not hits:
        return None
    return {'levels': hits, 'total_levels': len(levels)}
