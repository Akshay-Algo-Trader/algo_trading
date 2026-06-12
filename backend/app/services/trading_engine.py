"""
TradingEngine — server-side strategy execution.

Replaces the browser-based useStrategyExecutor with a backend thread that
owns the full swing-level breakout → entry → multi-target exit lifecycle for
both paper and live modes.

State is persisted to the database on every meaningful change so that:
  - Refreshing the browser never loses the trade story.
  - Killing the Flask process and restarting can resume active sessions
    (the manager re-instantiates engines for any TradingSession that is
    still ACTIVE at startup).

Order placement:
  - paper mode → PaperOrder + PaperPosition + VirtualAccount mutations
  - live mode  → kite_service.place_order(), tracked as LiveOrder rows

LTP source:
  - ticker_service (Kite WebSocket) when available
  - kite.ltp() REST fallback otherwise

The engine intentionally re-uses the simulation helpers from the backtest
module so backtest and live behave identically.
"""

import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from app.extensions import db
from app.models import (
    AuditLog,
    ExecutionLog,
    Instrument,
    KiteConfig,
    LiveOrder,
    PaperOrder,
    PaperPosition,
    Strategy,
    TradingSession,
    VirtualAccount,
)
from app.models.live_order import OrderStatus as LiveOrderStatus
from app.models.live_order import OrderType as LiveOrderType
from app.models.live_order import TransactionType as LiveTransactionType
from app.models.paper_order import (
    PaperOrderCategory,
    PaperOrderStatus,
    PaperOrderType,
)
from app.models.trading_session import SessionMode, SessionStatus
from app.routes.customer.backtest import (
    _build_trade_plan,
    _check_candle_size,
    _j,
)
from app.services.encryption import decrypt
from app.services.option_resolver import meta_for as _option_meta_for, resolve_option_contract
from app.services.swing_breakout import (
    classify_by_ltp,
    evaluate_breakout,
    find_last_level,
    find_nearest_levels,
    find_strong_levels,
)
from app.services.swing_zone_detector import detect_sr_levels, fetch_candles_for_swing_config
from app.services.ticker_service import ticker_service

logger = logging.getLogger(__name__)

_POLL_SECONDS = 3            # how often the engine checks LTP / runs eval
_CANDLE_CACHE_TTL_SEC = 300  # 5 min — swing candles refresh
_BROKERAGE_FLAT = 20.0
_LOG_RING_PER_SESSION = 300  # cap on persisted log lines per session (per-tick monitoring snapshots)


def _split_qty(remaining, targets_left):
    if targets_left <= 0:
        return remaining
    if targets_left == 1:
        return remaining
    return max(1, remaining // targets_left)


class TradingEngine:
    """One engine per active session — paper or live."""

    def __init__(self, user_id: int, strategy_id: int, session_id: int, mode: str, app):
        self.user_id = user_id
        self.strategy_id = strategy_id
        self.session_id = session_id
        self.mode = mode  # 'paper' | 'live'
        self._app = app

        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None

        # Loaded at start()
        self._symbol: Optional[str] = None
        self._exchange: Optional[str] = None
        self._quantity: int = 0
        self._stop_loss_pct: float = 0
        self._take_profit_pct: float = 0
        self._stop_loss_rules: dict = {}
        self._target_rules: dict = {}
        self._strategy_dict: dict = {}
        self._swing_config: dict = {}
        self._direction: str = 'bullish'
        self._instrument_token: Optional[int] = None

        # Options mode (resolved at entry when strategy.option_config.enabled)
        self._option_config: Optional[dict] = None
        self._resolved_contract: Optional[dict] = None

        # In-memory mutable state — also serialised into TradingSession.plan_state
        self._phase: str = 'monitoring'
        self._pattern_detected: bool = False
        self._prev_ltp: Optional[float] = None
        self._entry_price: Optional[float] = None
        self._plan: Optional[dict] = None
        self._hwm: float = 0
        self._lwm: float = 0
        self._remaining_qty: int = 0
        self._total_qty: int = 0
        self._break_even_triggered: bool = False
        self._targets_hit: set = set()
        self._partial_booked: bool = False

        # Candle cache
        self._candles_cache: list = []
        self._candles_cache_ts: float = 0

        # Throttle DB persistence of LTP changes
        self._last_persisted_ltp: Optional[float] = None
        self._last_persisted_ltp_at: float = 0

    # ──────────────────────────────────────────────────────────────────────
    #  Lifecycle
    # ──────────────────────────────────────────────────────────────────────

    def start(self):
        with self._lock:
            if self._running:
                return

            with self._app.app_context():
                self._hydrate_from_db()

            self._running = True

        self._thread = threading.Thread(
            target=self._eval_loop,
            daemon=True,
            name=f"engine-{self.mode}-{self.session_id}",
        )
        self._thread.start()
        logger.info(
            "TradingEngine started: mode=%s session=%d user=%d strategy=%d",
            self.mode, self.session_id, self.user_id, self.strategy_id,
        )

    def stop(self, reason: Optional[str] = None):
        with self._lock:
            if not self._running:
                return
            self._running = False

        if self._thread and self._thread.is_alive() and threading.current_thread() is not self._thread:
            self._thread.join(timeout=5)

        if self._instrument_token:
            try:
                ticker_service.unsubscribe([self._instrument_token])
            except Exception:
                logger.warning("ticker_service.unsubscribe failed for session %d", self.session_id, exc_info=True)

        with self._app.app_context():
            session = db.session.get(TradingSession, self.session_id)
            if session and session.status == SessionStatus.ACTIVE:
                session.status = SessionStatus.STOPPED
                session.stopped_at = datetime.now(timezone.utc)
                if reason:
                    session.auto_stop_reason = reason
                db.session.commit()
            self._log(f"Engine stopped — {reason or 'manual'}", 'warn')

        logger.info("TradingEngine stopped: session=%d reason=%s", self.session_id, reason or 'manual')

    def get_status(self) -> dict:
        return {
            'session_id':       self.session_id,
            'mode':             self.mode,
            'phase':            self._phase,
            'pattern_detected': self._pattern_detected,
            'last_ltp':         self._prev_ltp,
            'entry_price':      self._entry_price,
            'plan_state':       self._serialize_plan_state(),
        }

    @property
    def is_running(self) -> bool:
        return self._running

    # ──────────────────────────────────────────────────────────────────────
    #  Hydration — strategy + ticker subscription + resume
    # ──────────────────────────────────────────────────────────────────────

    def _hydrate_from_db(self):
        session = db.session.get(TradingSession, self.session_id)
        if not session:
            raise ValueError(f'TradingSession {self.session_id} not found')

        strategy = db.session.get(Strategy, self.strategy_id)
        if not strategy:
            raise ValueError(f'Strategy {self.strategy_id} not found')

        self._strategy_dict = strategy.to_dict()

        # If option_config.enabled, monitoring watches the underlying index;
        # the option contract is only resolved at entry. Otherwise use the
        # strategy's configured instrument/exchange directly.
        opt_cfg = self._strategy_dict.get('option_config') or {}
        if isinstance(opt_cfg, dict) and opt_cfg.get('enabled'):
            self._option_config = opt_cfg
            meta = _option_meta_for(opt_cfg.get('underlying') or '')
            if not meta:
                raise ValueError(f"Unknown underlying in option_config: {opt_cfg.get('underlying')!r}")
            self._symbol = meta['underlying_symbol']
            self._exchange = meta['underlying_exchange']
        else:
            self._option_config = None
            self._symbol = strategy.instrument
            self._exchange = strategy.exchange.value

        # Restore previously-resolved contract (resume case)
        plan_state_preview = session.plan_state or {}
        prev_contract = (plan_state_preview or {}).get('resolved_contract') if isinstance(plan_state_preview, dict) else None
        if prev_contract:
            self._resolved_contract = prev_contract
            self._symbol = prev_contract['tradingsymbol']
            self._exchange = prev_contract['exchange']

        self._quantity = int(strategy.quantity or 0)
        self._stop_loss_pct = float(strategy.stop_loss_pct or 0)
        self._take_profit_pct = float(strategy.take_profit_pct or 0)
        self._stop_loss_rules = _j(strategy.stop_loss_rules, {}) or {}
        self._target_rules    = _j(strategy.target_rules, {}) or {}

        if not strategy.swing_zone_config:
            raise ValueError(f'Strategy {self.strategy_id} has no Swing Zone Config configured')
        self._swing_config = strategy.swing_zone_config.to_dict()

        # Resume in-memory state from persisted columns
        self._phase = session.phase or 'monitoring'
        self._pattern_detected = bool(session.pattern_detected)
        self._prev_ltp = session.last_ltp
        self._entry_price = session.entry_price
        plan_state = session.plan_state or None
        if plan_state and self._phase in ('in_position',):
            self._restore_plan_state(plan_state)
        else:
            self._plan = None
            self._total_qty = 0
            self._remaining_qty = 0

        # Try resolving instrument token & subscribing to ticker
        if self._resolved_contract:
            self._instrument_token = int(self._resolved_contract['instrument_token'])
        else:
            try:
                inst = Instrument.query.filter_by(tradingsymbol=self._symbol, exchange=self._exchange).first()
                self._instrument_token = inst.instrument_token if inst else None
            except Exception:
                self._instrument_token = None

        if self._instrument_token:
            try:
                cfg = KiteConfig.query.filter_by(user_id=self.user_id).first()
                if cfg and cfg.is_connected and cfg.access_token_encrypted:
                    ticker_service.connect_for_user(cfg)
                    ticker_service.subscribe([self._instrument_token])
            except Exception:
                logger.warning(
                    "Ticker subscribe failed for session %d (symbol=%s); falling back to REST",
                    self.session_id, self._symbol, exc_info=True,
                )

        sc = self._swing_config
        self._log(
            f"Engine started — watching {self._symbol} on {self._exchange}"
            f" | Swing Zone: {sc.get('name')} ({sc.get('candle_size')}, {sc.get('period_days')}d, "
            f"pivot={sc.get('pivot_bars')}, strong={sc.get('strong_level_pct')}%)",
            'info',
        )

    # ──────────────────────────────────────────────────────────────────────
    #  Plan-state serialization (for DB round-trip)
    # ──────────────────────────────────────────────────────────────────────

    def _serialize_plan_state(self) -> Optional[dict]:
        if not self._plan:
            # Still surface the resolved contract during monitoring → in_position
            # transition so the customer UI can render it before the plan persists.
            if self._resolved_contract:
                return {'resolved_contract': self._resolved_contract}
            return None
        sl = self._current_sl_price()
        return {
            'resolved_contract': self._resolved_contract,
            'direction':    self._plan['direction'],
            'sign':         self._plan['sign'],
            'entry_price':  self._plan['entry_price'],
            'det_candle_low':  self._plan['det_candle_low'],
            'det_candle_high': self._plan['det_candle_high'],
            'sl':           sl,
            'final_tp':     self._plan['final_tp_price'],
            'base_sl_dist': self._plan['base_sl_dist'],
            'base_tp_dist': self._plan['base_tp_dist'],
            'trail_pct':    self._plan['trail_pct'],
            'break_even_pct': self._plan['break_even_pct'],
            'exit_below_first_candle': self._plan['exit_below_first_candle'],
            'atr_used':     self._plan['atr_used'],
            'targets': [{
                'index': t['index'], 'pct': t['pct'], 'price': t['price'],
                'hit':   t['index'] in self._targets_hit,
            } for t in self._plan['targets']],
            'partial_book': (
                {**self._plan['partial_book'], 'booked': self._partial_booked}
                if self._plan['partial_book'] else None
            ),
            'hwm':              self._hwm,
            'lwm':              self._lwm,
            'remaining':        self._remaining_qty,
            'total':            self._total_qty,
            'break_even_triggered': self._break_even_triggered,
        }

    def _restore_plan_state(self, st: dict):
        targets = []
        for t in (st.get('targets') or []):
            targets.append({
                'index': t['index'], 'pct': t['pct'], 'price': t['price'],
            })
        partial_book = None
        pb = st.get('partial_book')
        if pb:
            partial_book = {'pct': pb['pct'], 'price': pb['price'], 'fraction': pb.get('fraction', 0.5)}
            self._partial_booked = bool(pb.get('booked'))

        self._plan = {
            'direction':    st['direction'],
            'sign':         st['sign'],
            'entry_price':  st['entry_price'],
            'det_candle_low':  st['det_candle_low'],
            'det_candle_high': st['det_candle_high'],
            'base_sl_dist': st['base_sl_dist'],
            'base_tp_dist': st['base_tp_dist'],
            'initial_sl_price': st['entry_price'] - st['sign'] * st['base_sl_dist'],
            'final_tp_price':   st['final_tp'],
            'trail_pct':    st.get('trail_pct'),
            'break_even_pct': st.get('break_even_pct'),
            'exit_below_first_candle': bool(st.get('exit_below_first_candle')),
            'atr_used':     bool(st.get('atr_used')),
            'targets':      targets,
            'partial_book': partial_book,
        }
        self._hwm = float(st.get('hwm') or st['entry_price'])
        self._lwm = float(st.get('lwm') or st['entry_price'])
        self._total_qty = int(st.get('total') or 0)
        self._remaining_qty = int(st.get('remaining') or 0)
        self._break_even_triggered = bool(st.get('break_even_triggered'))
        self._targets_hit = {t['index'] for t in (st.get('targets') or []) if t.get('hit')}
        self._direction = st['direction']

    # ──────────────────────────────────────────────────────────────────────
    #  DB writers
    # ──────────────────────────────────────────────────────────────────────

    def _log(self, message: str, severity: str = 'info'):
        try:
            db.session.add(ExecutionLog(
                session_id=self.session_id,
                severity=severity,
                message=message,
            ))
            db.session.commit()

            # Trim oldest if over cap
            count_q = ExecutionLog.query.filter_by(session_id=self.session_id)
            excess = count_q.count() - _LOG_RING_PER_SESSION
            if excess > 0:
                ids_to_delete = [r.id for r in count_q.order_by(ExecutionLog.id.asc()).limit(excess).all()]
                ExecutionLog.query.filter(ExecutionLog.id.in_(ids_to_delete)).delete(synchronize_session=False)
                db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception("Failed to write ExecutionLog for session %d", self.session_id)

    def _persist_session_state(self, *, ltp_changed=False):
        try:
            session = db.session.get(TradingSession, self.session_id)
            if not session:
                return
            session.phase = self._phase
            session.pattern_detected = self._pattern_detected
            session.entry_price = self._entry_price
            session.plan_state = self._serialize_plan_state()
            if ltp_changed:
                session.last_ltp = self._prev_ltp
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception("Failed to persist session state for %d", self.session_id)

    # ──────────────────────────────────────────────────────────────────────
    #  Price source
    # ──────────────────────────────────────────────────────────────────────

    def _get_ltp(self) -> Optional[float]:
        # Prefer WebSocket-backed cache
        if self._instrument_token:
            v = ticker_service.get_ltp(self._instrument_token)
            if v is not None:
                return float(v)
        # REST fallback
        cfg = KiteConfig.query.filter_by(user_id=self.user_id).first()
        if not (cfg and cfg.is_connected and cfg.access_token_encrypted):
            return None
        try:
            from kiteconnect import KiteConnect
            kite = KiteConnect(api_key=decrypt(cfg.api_key_encrypted))
            kite.set_access_token(decrypt(cfg.access_token_encrypted))
            data = kite.ltp([f"{self._exchange}:{self._symbol}"])
            return float(data[f"{self._exchange}:{self._symbol}"]["last_price"])
        except Exception:
            logger.warning("LTP REST fetch failed for %s:%s", self._exchange, self._symbol, exc_info=True)
            return None

    def _get_swing_candles(self) -> list:
        now = time.time()
        if self._candles_cache and (now - self._candles_cache_ts) < _CANDLE_CACHE_TTL_SEC:
            return self._candles_cache
        cfg = KiteConfig.query.filter_by(user_id=self.user_id).first()
        if not (cfg and cfg.is_connected and cfg.access_token_encrypted):
            return []
        try:
            from kiteconnect import KiteConnect
            kite = KiteConnect(api_key=decrypt(cfg.api_key_encrypted))
            kite.set_access_token(decrypt(cfg.access_token_encrypted))
            candles = fetch_candles_for_swing_config(kite, self._swing_config, self._symbol, self._exchange)
            self._candles_cache = candles
            self._candles_cache_ts = now
            return candles
        except Exception:
            logger.warning("Swing candle fetch failed for session %d", self.session_id, exc_info=True)
            return []

    # ──────────────────────────────────────────────────────────────────────
    #  Eval loop
    # ──────────────────────────────────────────────────────────────────────

    def _eval_loop(self):
        with self._app.app_context():
            while self._running:
                try:
                    self._tick()
                except Exception:
                    logger.exception("Eval loop error: session=%d", self.session_id)
                    try:
                        db.session.rollback()
                    except Exception:
                        pass
                time.sleep(_POLL_SECONDS)

    def _tick(self):
        ltp = self._get_ltp()
        if ltp is None:
            return

        ltp_changed = self._prev_ltp != ltp
        prev_ltp = self._prev_ltp

        if self._phase == 'monitoring':
            self._eval_monitoring(ltp, prev_ltp)
        elif self._phase == 'in_position':
            self._eval_in_position(ltp)
        # exited / error: nothing to do but keep status alive until stop

        self._prev_ltp = ltp

        # Throttle LTP persistence to avoid heavy write load
        now = time.time()
        if ltp_changed and (now - self._last_persisted_ltp_at > 5 or self._phase != 'monitoring'):
            self._persist_session_state(ltp_changed=True)
            self._last_persisted_ltp = ltp
            self._last_persisted_ltp_at = now

    # ──────────────────────────────────────────────────────────────────────
    #  Monitoring → entry
    # ──────────────────────────────────────────────────────────────────────

    def _eval_monitoring(self, ltp: float, prev_ltp: Optional[float]):
        # ── Live-recompute S&R levels and log a snapshot every tick ──────────
        candles = self._get_swing_candles()
        # Drop the developing latest candle — detect only on closed candles
        closed_candles = candles[:-1] if candles else []

        pivot_bars = int(self._swing_config.get('pivot_bars') or 5)
        if len(closed_candles) < pivot_bars * 2 + 1:
            self._log(
                f"Monitoring {self._symbol} @ ₹{ltp:,.2f} — gathering candles for swing-level "
                f"detection ({len(closed_candles)}/{pivot_bars * 2 + 1})",
                'info',
            )
            return

        levels = detect_sr_levels(closed_candles, pivot_bars)
        self._log_level_snapshot(ltp, levels)

        if prev_ltp is None:
            return

        signal = evaluate_breakout(levels, self._swing_config.get('strong_level_pct'), prev_ltp, ltp)
        if not signal:
            return

        det_candle = closed_candles[-1]

        # ── Pre-entry candle-size filter ─────────────────────────────────────
        if not _check_candle_size(self._strategy_dict, det_candle):
            return

        self._direction = signal['direction']
        last_level = signal['last_level']
        strong_level_type = 'RESISTANCE' if signal['direction'] == 'bullish' else 'SUPPORT'
        self._log(
            f"Breakout signal: {signal['direction']} thru strong {strong_level_type} "
            f"₹{signal['level_price']} (nearest level ₹{signal['nearest_price']} on strong line, "
            f"cluster of {signal['cluster_size']}; last level: {last_level['type']} @ ₹{last_level['price']}) "
            f"@ LTP ₹{ltp}",
            'success',
        )
        self._pattern_detected = True

        # Options leg: resolve the actual CE/PE contract, swap the engine over to
        # it, and use the option premium (not the index LTP) as the entry price.
        # The position is always long, so the trade plan is built bullish-side.
        entry_price = ltp
        plan_direction = self._direction
        plan_det_candle = det_candle
        if self._option_config:
            opt = self._swap_to_option_contract(ltp)
            if not opt:
                return
            opt_ltp = self._poll_option_ltp()
            if opt_ltp is None:
                self._log("Option resolved but premium LTP unavailable — aborting entry", 'error')
                return
            entry_price = opt_ltp
            plan_direction = 'bullish'
            plan_det_candle = {'low': 0.0, 'high': float('inf'), 'close': opt_ltp}

        plan = _build_trade_plan(self._strategy_dict, closed_candles or [], entry_price, plan_det_candle, plan_direction)

        success = self._place_entry_order(entry_price, plan)
        if not success:
            return

        self._plan = plan
        self._hwm = entry_price
        self._lwm = entry_price
        self._total_qty = self._quantity
        self._remaining_qty = self._quantity
        self._targets_hit = set()
        self._partial_booked = False
        self._break_even_triggered = False
        self._entry_price = entry_price
        self._phase = 'in_position'

        # Compose informative log
        sl_src = f'ATR×{self._stop_loss_rules.get("atr_multiplier")}' if plan['atr_used'] else f'{self._stop_loss_pct}%'
        ladder = ''
        if plan['targets']:
            ladder = ' | targets: ' + ', '.join(f"T{t['index']+1}@{t['pct']}%" for t in plan['targets'])
        elif plan['partial_book']:
            ladder = f" | partial-book 50% @ {plan['partial_book']['pct']}%"
        side = self._entry_side()
        self._log(f"{side} {self._quantity}×{self._symbol} @ ₹{entry_price} | SL {sl_src}{ladder}", 'success')

        self._persist_session_state()

    def _log_level_snapshot(self, ltp: float, levels: list):
        """Per-tick monitoring log — current LTP, last-formed level (trade bias),
        and the nearest level on each side of price, flagged when it sits on a
        strong cluster (the scanner's strong + nearest condition the entry
        rule now requires)."""
        last = find_last_level(levels)
        if not last:
            self._log(f"Monitoring {self._symbol} @ ₹{ltp:,.2f} — no swing levels detected yet", 'info')
            return

        bias = 'bullish' if last['type'] == 'RESISTANCE' else 'bearish'
        classified = classify_by_ltp(levels, ltp)
        strong = find_strong_levels(classified, self._swing_config.get('strong_level_pct'))
        nearest = find_nearest_levels(classified, ltp)

        def describe(nearest_level, clusters):
            if not nearest_level:
                return None
            cluster = next(
                (c for c in clusters
                 if any(m['price'] == nearest_level['price'] for m in c['members'])),
                None,
            )
            text = f"₹{nearest_level['price']:,.2f}"
            if cluster:
                text += f" (on strong line ₹{cluster['price']:,.2f})"
            return text

        parts = [
            f"Monitoring {self._symbol} @ ₹{ltp:,.2f}",
            f"last level {last['type']} @ ₹{last['price']:,.2f} (bias {bias})",
        ]
        res = describe(nearest['nearest_resistance'], strong['strong_resistance'])
        sup = describe(nearest['nearest_support'], strong['strong_support'])
        if res:
            parts.append(f"nearest resistance {res}")
        if sup:
            parts.append(f"nearest support {sup}")
        self._log(' | '.join(parts), 'info')

    # ──────────────────────────────────────────────────────────────────────
    #  In-position → exits
    # ──────────────────────────────────────────────────────────────────────

    def _eval_in_position(self, ltp: float):
        plan = self._plan
        if not plan or self._remaining_qty <= 0:
            return

        direction = plan['direction']
        sign = plan['sign']
        entry = plan['entry_price']

        # Water marks
        if direction == 'bullish':
            self._hwm = max(self._hwm, ltp)
        else:
            self._lwm = min(self._lwm, ltp)

        # Break-even latch
        if plan['break_even_pct'] and plan['break_even_pct'] > 0 and not self._break_even_triggered:
            be_trigger = entry * (1 + sign * plan['break_even_pct'] / 100)
            triggered = (ltp >= be_trigger) if direction == 'bullish' else (ltp <= be_trigger)
            if triggered:
                self._break_even_triggered = True
                self._log(f"Break-even armed — SL lifted to entry ₹{entry:.2f}", 'success')

        sl = self._current_sl_price()

        # 1) SL / structural-violation — full remaining
        sl_hit     = (ltp <= sl) if direction == 'bullish' else (ltp >= sl)
        struct_hit = False
        struct_price = None
        if plan['exit_below_first_candle']:
            if direction == 'bullish' and ltp < plan['det_candle_low']:
                struct_hit = True
                struct_price = plan['det_candle_low']
            elif direction == 'bearish' and ltp > plan['det_candle_high']:
                struct_hit = True
                struct_price = plan['det_candle_high']

        if sl_hit or struct_hit:
            reason = 'Stop Loss'
            if sl_hit and struct_hit:
                if direction == 'bullish':
                    reason = 'Stop Loss' if sl >= struct_price else 'Structure stop (entry-candle low)'
                else:
                    reason = 'Stop Loss' if sl <= struct_price else 'Structure stop (entry-candle high)'
            elif struct_hit:
                reason = 'Structure stop (entry-candle low)' if direction == 'bullish' else 'Structure stop (entry-candle high)'
            self._log(f'{reason} @ ₹{ltp:.2f}', 'warn')
            self._place_exit_order(self._remaining_qty, ltp, reason='stop')
            self._remaining_qty = 0
            self._complete_session(ltp)
            return

        # 2) Multi-target partial exits
        for t in plan['targets']:
            if t['index'] in self._targets_hit:
                continue
            hit = (ltp >= t['price']) if direction == 'bullish' else (ltp <= t['price'])
            if not hit:
                continue
            left = sum(1 for tt in plan['targets'] if tt['index'] not in self._targets_hit)
            qty = min(self._remaining_qty, _split_qty(self._remaining_qty, left))
            if qty <= 0:
                self._targets_hit.add(t['index'])
                continue
            ok = self._place_exit_order(qty, ltp, reason=f'target_t{t["index"] + 1}')
            if ok:
                self._remaining_qty -= qty
                self._targets_hit.add(t['index'])
                self._log(f"T{t['index']+1} hit ({t['pct']}%) — exited {qty}×{self._symbol} @ ₹{ltp:.2f}", 'success')
                if self._remaining_qty <= 0:
                    self._complete_session(ltp)
                    return

        # 3) Partial book (50% at a single level)
        if plan['partial_book'] and not self._partial_booked:
            pb = plan['partial_book']
            hit = (ltp >= pb['price']) if direction == 'bullish' else (ltp <= pb['price'])
            if hit:
                qty = max(1, int(self._total_qty * pb.get('fraction', 0.5)))
                qty = min(qty, self._remaining_qty)
                ok = self._place_exit_order(qty, ltp, reason='partial_book')
                if ok:
                    self._remaining_qty -= qty
                    self._partial_booked = True
                    self._log(f"Partial booked ({pb['pct']}%) — exited {qty}×{self._symbol} @ ₹{ltp:.2f}", 'success')
                    if self._remaining_qty <= 0:
                        self._complete_session(ltp)
                        return

        # 4) Final TP (when no targets pending)
        all_targets_done = (not plan['targets']) or len(self._targets_hit) == len(plan['targets'])
        if all_targets_done and self._remaining_qty > 0:
            tp_hit = (ltp >= plan['final_tp_price']) if direction == 'bullish' else (ltp <= plan['final_tp_price'])
            if tp_hit:
                self._log(f"Take Profit hit @ ₹{ltp:.2f}", 'success')
                self._place_exit_order(self._remaining_qty, ltp, reason='take_profit')
                self._remaining_qty = 0
                self._complete_session(ltp)
                return

        # Persist plan-state if any leg fired (SL trail / break-even may have updated SL)
        self._persist_session_state(ltp_changed=True)

    def _complete_session(self, ltp: float):
        self._phase = 'exited'
        self._persist_session_state(ltp_changed=True)
        self._log(f"Session complete — final LTP ₹{ltp:.2f}", 'success')
        # Mark the session row stopped — stop the engine thread on next loop iteration
        try:
            session = db.session.get(TradingSession, self.session_id)
            if session and session.status == SessionStatus.ACTIVE:
                session.status = SessionStatus.STOPPED
                session.stopped_at = datetime.now(timezone.utc)
                session.auto_stop_reason = 'executed'
                db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception("Failed to mark session %d as stopped", self.session_id)
        self._running = False

    # ──────────────────────────────────────────────────────────────────────
    #  Order placement — paper vs live
    # ──────────────────────────────────────────────────────────────────────

    def _entry_side(self) -> str:
        # Long options only — never short CE/PE
        if self._option_config:
            return 'BUY'
        return 'BUY' if self._direction == 'bullish' else 'SELL'

    def _exit_side(self) -> str:
        if self._option_config:
            return 'SELL'
        return 'SELL' if self._direction == 'bullish' else 'BUY'

    def _swap_to_option_contract(self, underlying_ltp: float) -> Optional[dict]:
        """Resolve CE/PE contract, unsubscribe underlying, subscribe option."""
        cfg = self._option_config or {}
        cfg_get = cfg.get
        try:
            from kiteconnect import KiteConnect
            kcfg = KiteConfig.query.filter_by(user_id=self.user_id).first()
            if not (kcfg and kcfg.is_connected and kcfg.access_token_encrypted):
                self._log("Cannot resolve option — Kite not connected", 'error')
                return None
            kite = KiteConnect(api_key=decrypt(kcfg.api_key_encrypted))
            kite.set_access_token(decrypt(kcfg.access_token_encrypted))
            contract = resolve_option_contract(
                underlying=cfg_get('underlying') or 'NIFTY',
                direction=self._direction,
                strike_selection=cfg_get('strike_selection') or 'ATM',
                expiry=cfg_get('expiry') or 'current_week',
                ltp_at_entry=underlying_ltp,
                kite=kite,
            )
        except Exception as exc:
            self._log(f"Option resolution failed: {exc}", 'error')
            return None

        if not contract:
            self._log(
                f"No option contract found for {cfg_get('underlying')} "
                f"{cfg_get('strike_selection')} {cfg_get('expiry')} "
                f"@ underlying ₹{underlying_ltp:.2f}",
                'error',
            )
            return None

        prev_token = self._instrument_token
        self._symbol = contract['tradingsymbol']
        self._exchange = contract['exchange']
        self._instrument_token = int(contract['instrument_token'])
        self._resolved_contract = contract

        try:
            if prev_token:
                ticker_service.unsubscribe([prev_token])
        except Exception:
            logger.warning("Failed to unsubscribe underlying token %s", prev_token, exc_info=True)
        try:
            ticker_service.subscribe([self._instrument_token])
        except Exception:
            logger.warning("Failed to subscribe option token %s", self._instrument_token, exc_info=True)

        self._log(
            f"Option resolved: {contract['tradingsymbol']} ({contract['exchange']}, "
            f"strike {contract['strike']}, expiry {contract['expiry']})",
            'info',
        )
        return contract

    def _poll_option_ltp(self, attempts: int = 4, delay_seconds: float = 0.5) -> Optional[float]:
        """WebSocket may not have warmed for the new token yet — retry briefly."""
        for _ in range(attempts):
            v = self._get_ltp()
            if v is not None:
                return v
            time.sleep(delay_seconds)
        return None

    def _place_entry_order(self, ltp: float, plan: dict) -> bool:
        return self._place_order(self._entry_side(), self._quantity, ltp, tag='entry')

    def _place_exit_order(self, qty: int, ltp: float, *, reason: str) -> bool:
        return self._place_order(self._exit_side(), qty, ltp, tag=f'exit_{reason}')

    def _place_order(self, txn_type: str, qty: int, price: float, *, tag: str) -> bool:
        if qty <= 0:
            return False
        try:
            if self.mode == 'paper':
                return self._place_paper(txn_type, qty, price, tag=tag)
            else:
                return self._place_live(txn_type, qty, price, tag=tag)
        except Exception as exc:
            logger.exception("Order placement failed: session=%d tag=%s", self.session_id, tag)
            self._log(f"Order failed ({tag}): {exc}", 'error')
            return False

    # ─── Paper order path ──────────────────────────────────────────────────

    def _place_paper(self, txn_type: str, qty: int, price: float, *, tag: str) -> bool:
        now = datetime.now(timezone.utc)
        account = VirtualAccount.query.filter_by(user_id=self.user_id).first()
        if not account:
            self._log("Paper trade failed — no virtual account", 'error')
            return False

        if txn_type == 'BUY':
            cost = price * qty
            if account.balance < cost:
                self._log(f"Insufficient virtual balance (need ₹{cost:,.2f}, have ₹{account.balance:,.2f})", 'error')
                return False
            account.balance = round(account.balance - cost, 2)

            # Add or update position
            pos = PaperPosition.query.filter_by(user_id=self.user_id, symbol=self._symbol).first()
            if pos:
                # Weighted average buy price
                total = pos.quantity + qty
                pos.avg_buy_price = round((pos.avg_buy_price * pos.quantity + price * qty) / total, 2)
                pos.quantity = total
                pos.current_price = price
            else:
                pos = PaperPosition(
                    user_id=self.user_id, symbol=self._symbol, exchange=self._exchange,
                    quantity=qty, avg_buy_price=price, current_price=price, unrealised_pnl=0,
                )
                db.session.add(pos)
        else:  # SELL
            account.balance = round(account.balance + price * qty, 2)

            pos = PaperPosition.query.filter_by(user_id=self.user_id, symbol=self._symbol).first()
            if pos:
                realised = (price - pos.avg_buy_price) * min(qty, pos.quantity)
                account.total_realised_pnl = round((account.total_realised_pnl or 0) + realised, 2)
                pos.quantity -= qty
                if pos.quantity <= 0:
                    db.session.delete(pos)
                else:
                    pos.current_price = price

        db.session.add(PaperOrder(
            user_id=self.user_id, session_id=self.session_id,
            symbol=self._symbol, exchange=self._exchange,
            transaction_type=PaperOrderType[txn_type],
            order_type=PaperOrderCategory.MARKET,
            quantity=qty,
            trigger_price=price, fill_price=price, fill_time=now,
            status=PaperOrderStatus.FILLED,
        ))
        db.session.add(AuditLog(
            user_id=self.user_id, event_type=f"PAPER_{txn_type}", mode='paper',
            payload={'session_id': self.session_id, 'symbol': self._symbol, 'qty': qty,
                     'price': price, 'tag': tag, 'balance_after': account.balance},
        ))
        db.session.commit()
        return True

    # ─── Live order path ───────────────────────────────────────────────────

    def _place_live(self, txn_type: str, qty: int, price: float, *, tag: str) -> bool:
        from app.services.kite_service import kite_service
        try:
            kite_order_id = kite_service.place_order(self.user_id, {
                'symbol': self._symbol, 'exchange': self._exchange,
                'transaction_type': txn_type, 'order_type': 'MARKET',
                'quantity': qty, 'price': 0,
                'product': 'NRML' if self._exchange in ('MCX', 'NFO', 'BFO') else 'MIS',
                'variety': 'regular', 'tag': tag, 'mode': 'live',
            }, session_id=self.session_id)
        except (ValueError, RuntimeError) as exc:
            self._log(f"Live order rejected: {exc}", 'error')
            return False

        db.session.add(LiveOrder(
            user_id=self.user_id, session_id=self.session_id,
            kite_order_id=kite_order_id,
            symbol=self._symbol, exchange=self._exchange,
            transaction_type=LiveTransactionType[txn_type],
            order_type=LiveOrderType.MARKET,
            quantity=qty, price=price,
            status=LiveOrderStatus.OPEN, tag=tag,
        ))
        db.session.commit()
        return True

    # ──────────────────────────────────────────────────────────────────────
    #  Helpers
    # ──────────────────────────────────────────────────────────────────────

    def _current_sl_price(self) -> float:
        if not self._plan:
            return 0
        plan = self._plan
        sl = plan['initial_sl_price']
        if plan.get('trail_pct'):
            if plan['direction'] == 'bullish':
                sl = max(sl, self._hwm * (1 - plan['trail_pct'] / 100))
            else:
                sl = min(sl, self._lwm * (1 + plan['trail_pct'] / 100))
        if self._break_even_triggered:
            if plan['direction'] == 'bullish':
                sl = max(sl, plan['entry_price'])
            else:
                sl = min(sl, plan['entry_price'])
        return sl


# ──────────────────────────────────────────────────────────────────────────
#  Resume helper — called by session_manager on app startup
# ──────────────────────────────────────────────────────────────────────────

def resume_active_sessions(app):
    """Find ACTIVE TradingSessions and re-spawn engines for them."""
    with app.app_context():
        sessions = TradingSession.query.filter_by(status=SessionStatus.ACTIVE).all()
    if not sessions:
        return 0
    from app.services.session_manager import session_manager
    count = 0
    for s in sessions:
        try:
            session_manager.start_session(s.user_id, s.strategy_id, s.mode.value, s.id)
            count += 1
        except Exception:
            logger.exception("Failed to resume session %d", s.id)
    if count:
        logger.info("Resumed %d active TradingSession(s) after restart", count)
    return count
