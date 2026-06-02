"""
PaperTradingEngine — simulates order execution against real-time LTP.

Polls ticker_service at POLL_INTERVAL seconds, evaluates entry/exit
conditions, and persists paper orders, positions, and virtual account
changes to the database.  Each engine instance owns one background thread
and one instrument subscription.
"""

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from app.extensions import db
from app.models import (
    AuditLog,
    Instrument,
    PaperOrder,
    PaperPosition,
    Strategy,
    VirtualAccount,
)
from app.models.paper_order import PaperOrderCategory, PaperOrderStatus, PaperOrderType
from app.models.trading_session import SessionStatus, TradingSession
from app.services.ticker_service import ticker_service

logger = logging.getLogger(__name__)

BROKERAGE_FLAT = 20.0  # ₹20 flat deducted per round-trip sell
POLL_INTERVAL = 0.5    # seconds between LTP polls


class PaperTradingEngine:
    """
    Drives paper trading for one TradingSession.

    Lifecycle::

        engine = PaperTradingEngine(user_id, strategy_id, session_id, app)
        engine.start()   # loads strategy, subscribes to ticker, starts eval loop
        engine.stop()    # stops eval loop, unsubscribes, marks session STOPPED
    """

    def __init__(self, user_id: int, strategy_id: int, session_id: int, app):
        self.user_id = user_id
        self.strategy_id = strategy_id
        self.session_id = session_id
        self._app = app

        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._instrument_token: Optional[int] = None

        # Strategy primitives — stored separately to avoid SQLAlchemy
        # detached-instance errors when accessed from the background thread.
        self._symbol: Optional[str] = None
        self._exchange: Optional[str] = None
        self._quantity: Optional[int] = None
        self._entry_condition: Optional[dict] = None
        self._exit_condition: Optional[dict] = None
        self._stop_loss_pct: Optional[float] = None
        self._take_profit_pct: Optional[float] = None

        # Price tracking for cross-condition detection
        self._prev_ltp: Optional[float] = None
        # In-memory position flag — avoids a DB round-trip on every tick
        self._has_position: bool = False

    # ------------------------------------------------------------------ #
    #  Public lifecycle                                                    #
    # ------------------------------------------------------------------ #

    def start(self):
        """
        Load strategy, subscribe to ticker, begin the eval loop thread.
        Pushes its own app context; safe to call from any context.
        """
        with self._lock:
            if self._running:
                return

            with self._app.app_context():
                strategy = db.session.get(Strategy, self.strategy_id)
                if not strategy:
                    raise ValueError(f"Strategy {self.strategy_id} not found")

                self._symbol = strategy.instrument
                self._exchange = strategy.exchange.value
                self._quantity = strategy.quantity
                self._entry_condition = strategy.entry_condition
                self._exit_condition = strategy.exit_condition
                self._stop_loss_pct = strategy.stop_loss_pct
                self._take_profit_pct = strategy.take_profit_pct

                row = (
                    Instrument.query
                    .filter_by(tradingsymbol=self._symbol, exchange=self._exchange)
                    .with_entities(Instrument.instrument_token)
                    .first()
                )
                if not row:
                    raise ValueError(
                        f"Instrument token not found for {self._symbol} on "
                        f"{self._exchange}. Run load_instruments first."
                    )
                self._instrument_token = row[0]

                # Sync position flag in case session was resumed after a restart
                self._has_position = (
                    PaperPosition.query
                    .filter_by(user_id=self.user_id, symbol=self._symbol)
                    .first()
                ) is not None

            ticker_service.subscribe([self._instrument_token])
            self._running = True

        self._thread = threading.Thread(
            target=self._eval_loop,
            daemon=True,
            name=f"paper-{self.session_id}",
        )
        self._thread.start()
        logger.info(
            "PaperTradingEngine started: session=%d user=%d strategy=%d token=%d",
            self.session_id, self.user_id, self.strategy_id, self._instrument_token,
        )

    def stop(self, reason: Optional[str] = None):
        """
        Stop the eval loop, unsubscribe from ticker, mark session STOPPED,
        and log final P&L to audit_log.
        Pushes its own app context; safe to call from any context.
        """
        with self._lock:
            if not self._running:
                return
            self._running = False

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

        if self._instrument_token:
            ticker_service.unsubscribe([self._instrument_token])

        with self._app.app_context():
            session = db.session.get(TradingSession, self.session_id)
            if session and session.status == SessionStatus.ACTIVE:
                session.status = SessionStatus.STOPPED
                session.stopped_at = datetime.now(timezone.utc)
                if reason:
                    session.auto_stop_reason = reason

            account = VirtualAccount.query.filter_by(user_id=self.user_id).first()
            audit = AuditLog(
                user_id=self.user_id,
                event_type="SESSION_STOPPED",
                mode="paper",
                payload={
                    "session_id": self.session_id,
                    "reason": reason or "manual",
                    "final_realised_pnl": account.total_realised_pnl if account else None,
                    "final_balance": account.balance if account else None,
                },
            )
            db.session.add(audit)
            db.session.commit()

        logger.info(
            "PaperTradingEngine stopped: session=%d reason=%s",
            self.session_id, reason or "manual",
        )

    # ------------------------------------------------------------------ #
    #  State                                                               #
    # ------------------------------------------------------------------ #

    @property
    def is_running(self) -> bool:
        return self._running

    def get_status(self) -> dict:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "strategy_id": self.strategy_id,
            "running": self._running,
            "instrument_token": self._instrument_token,
            "symbol": self._symbol,
            "has_position": self._has_position,
            "last_ltp": self._prev_ltp,
        }

    # ------------------------------------------------------------------ #
    #  Eval loop (background thread)                                       #
    # ------------------------------------------------------------------ #

    def _eval_loop(self):
        with self._app.app_context():
            while self._running:
                try:
                    ltp = ticker_service.get_ltp(self._instrument_token)
                    if ltp is not None:
                        self.on_tick(ltp)
                except Exception:
                    logger.exception("Eval loop error: session=%d", self.session_id)
                    try:
                        db.session.rollback()
                    except Exception:
                        pass
                time.sleep(POLL_INTERVAL)

    def on_tick(self, ltp: float):
        """
        Evaluate all strategy conditions against the current LTP.
        Must be called within a Flask app context.

        Evaluation order:
          1. Check pending LIMIT orders for fill.
          2. If open position: update unrealised P&L, check stop-loss /
             take-profit / exit_condition.
          3. If no open position: check entry_condition.
        """
        # 1. Pending LIMIT order fills
        self._check_limit_orders(ltp)

        if self._has_position:
            position = PaperPosition.query.filter_by(
                user_id=self.user_id,
                symbol=self._symbol,
            ).first()

            if position is None:
                # DB and in-memory flag out of sync
                self._has_position = False
            else:
                sl_price = position.avg_buy_price * (1 - self._stop_loss_pct / 100)
                tp_price = position.avg_buy_price * (1 + self._take_profit_pct / 100)

                if ltp <= sl_price:
                    logger.info(
                        "Stop-loss hit: session=%d ltp=%.2f sl=%.2f",
                        self.session_id, ltp, sl_price,
                    )
                    self._simulate_sell(ltp, position)
                elif ltp >= tp_price:
                    logger.info(
                        "Take-profit hit: session=%d ltp=%.2f tp=%.2f",
                        self.session_id, ltp, tp_price,
                    )
                    self._simulate_sell(ltp, position)
                elif self._exit_condition and self._eval_condition(
                    self._exit_condition, ltp
                ):
                    logger.info(
                        "Exit condition hit: session=%d ltp=%.2f",
                        self.session_id, ltp,
                    )
                    self._simulate_sell(ltp, position)
                else:
                    # 2. Update unrealised P&L
                    position.current_price = ltp
                    position.unrealised_pnl = (
                        (ltp - position.avg_buy_price) * position.quantity
                    )
                    db.session.commit()
        else:
            # 3. Entry condition
            if self._eval_condition(self._entry_condition, ltp):
                logger.info(
                    "Entry condition hit: session=%d ltp=%.2f",
                    self.session_id, ltp,
                )
                self._simulate_buy(ltp)

        self._prev_ltp = ltp

    # ------------------------------------------------------------------ #
    #  Condition evaluation                                                #
    # ------------------------------------------------------------------ #

    def _eval_condition(self, condition: dict, ltp: float) -> bool:
        """
        Evaluate a strategy condition dict against the current LTP.

        Supported types:
            ``price_above``      — ltp > value
            ``price_below``      — ltp < value
            ``price_cross_up``   — ltp crossed above value since the last tick
            ``price_cross_down`` — ltp crossed below value since the last tick
        """
        if not condition:
            return False
        ctype = condition.get("type")
        value = condition.get("value")
        if value is None:
            return False

        prev = self._prev_ltp

        if ctype == "price_above":
            return ltp > value
        if ctype == "price_below":
            return ltp < value
        if ctype == "price_cross_up":
            return prev is not None and prev <= value < ltp
        if ctype == "price_cross_down":
            return prev is not None and prev >= value > ltp

        logger.warning(
            "Unknown condition type '%s': session=%d", ctype, self.session_id
        )
        return False

    # ------------------------------------------------------------------ #
    #  Order simulation                                                    #
    # ------------------------------------------------------------------ #

    def _simulate_buy(self, ltp: float):
        """
        Create a FILLED MARKET BUY paper_order and open a paper_position.
        Deducts cost from virtual_account.balance.
        """
        cost = ltp * self._quantity

        account = VirtualAccount.query.filter_by(user_id=self.user_id).first()
        if not account:
            logger.error("VirtualAccount not found: user=%d", self.user_id)
            return
        if account.balance < cost:
            logger.warning(
                "Insufficient balance: user=%d balance=%.2f required=%.2f",
                self.user_id, account.balance, cost,
            )
            return

        now = datetime.now(timezone.utc)
        account.balance -= cost

        db.session.add_all([
            PaperOrder(
                user_id=self.user_id,
                session_id=self.session_id,
                symbol=self._symbol,
                exchange=self._exchange,
                transaction_type=PaperOrderType.BUY,
                order_type=PaperOrderCategory.MARKET,
                quantity=self._quantity,
                trigger_price=ltp,
                fill_price=ltp,
                fill_time=now,
                status=PaperOrderStatus.FILLED,
            ),
            PaperPosition(
                user_id=self.user_id,
                symbol=self._symbol,
                exchange=self._exchange,
                quantity=self._quantity,
                avg_buy_price=ltp,
                current_price=ltp,
                unrealised_pnl=0.0,
            ),
            AuditLog(
                user_id=self.user_id,
                event_type="PAPER_BUY",
                mode="paper",
                payload={
                    "session_id": self.session_id,
                    "symbol": self._symbol,
                    "quantity": self._quantity,
                    "fill_price": ltp,
                    "cost": cost,
                    "balance_after": account.balance,
                },
            ),
        ])
        db.session.commit()

        self._has_position = True
        logger.info(
            "BUY: session=%d %s qty=%d @%.2f cost=%.2f balance=%.2f",
            self.session_id, self._symbol, self._quantity, ltp, cost, account.balance,
        )

    def _simulate_sell(
        self,
        ltp: float,
        position: Optional[PaperPosition] = None,
    ):
        """
        Fill a MARKET SELL order at current LTP.
        Realised P&L = (sell_price - buy_price) * quantity - BROKERAGE_FLAT.
        Credits proceeds to virtual_account.balance and updates total_realised_pnl.
        Deletes the paper_position record.
        """
        if position is None:
            position = PaperPosition.query.filter_by(
                user_id=self.user_id,
                symbol=self._symbol,
            ).first()
        if not position:
            self._has_position = False
            return

        quantity = position.quantity
        buy_price = position.avg_buy_price
        proceeds = ltp * quantity
        realised_pnl = (ltp - buy_price) * quantity - BROKERAGE_FLAT

        now = datetime.now(timezone.utc)

        account = VirtualAccount.query.filter_by(user_id=self.user_id).first()
        if account:
            account.balance += proceeds
            account.total_realised_pnl += realised_pnl

        db.session.add_all([
            PaperOrder(
                user_id=self.user_id,
                session_id=self.session_id,
                symbol=self._symbol,
                exchange=self._exchange,
                transaction_type=PaperOrderType.SELL,
                order_type=PaperOrderCategory.MARKET,
                quantity=quantity,
                trigger_price=ltp,
                fill_price=ltp,
                fill_time=now,
                status=PaperOrderStatus.FILLED,
            ),
            AuditLog(
                user_id=self.user_id,
                event_type="PAPER_SELL",
                mode="paper",
                payload={
                    "session_id": self.session_id,
                    "symbol": self._symbol,
                    "quantity": quantity,
                    "buy_price": buy_price,
                    "sell_price": ltp,
                    "proceeds": proceeds,
                    "realised_pnl": realised_pnl,
                    "balance_after": account.balance if account else None,
                },
            ),
        ])
        db.session.delete(position)
        db.session.commit()

        self._has_position = False
        logger.info(
            "SELL: session=%d %s qty=%d @%.2f pnl=%.2f balance=%.2f",
            self.session_id, self._symbol, quantity, ltp, realised_pnl,
            account.balance if account else 0.0,
        )

    def _update_unrealised_pnl(self, ltp: float):
        """
        Refresh current_price and unrealised_pnl on the open position.
        Inlined into on_tick() for efficiency; kept as a public method
        for external callers (e.g. tests).
        """
        position = PaperPosition.query.filter_by(
            user_id=self.user_id,
            symbol=self._symbol,
        ).first()
        if not position:
            return
        position.current_price = ltp
        position.unrealised_pnl = (ltp - position.avg_buy_price) * position.quantity
        db.session.commit()

    def _check_limit_orders(self, ltp: float):
        """
        Scan all PENDING LIMIT orders for this session and fill any whose
        price condition is met:
          - LIMIT BUY  filled when LTP <= trigger_price
          - LIMIT SELL filled when LTP >= trigger_price
        """
        pending = PaperOrder.query.filter_by(
            user_id=self.user_id,
            session_id=self.session_id,
            status=PaperOrderStatus.PENDING,
            order_type=PaperOrderCategory.LIMIT,
        ).all()

        if not pending:
            return

        now = datetime.now(timezone.utc)
        for order in pending:
            is_buy = order.transaction_type == PaperOrderType.BUY
            is_sell = order.transaction_type == PaperOrderType.SELL

            if is_buy and ltp > order.trigger_price:
                continue
            if is_sell and ltp < order.trigger_price:
                continue

            # Fill condition met
            order.fill_price = ltp
            order.fill_time = now
            order.status = PaperOrderStatus.FILLED

            order_id = order.id
            trigger_price = order.trigger_price
            tx_type = order.transaction_type.value
            order_qty = order.quantity
            order_symbol = order.symbol
            order_exchange = order.exchange

            if is_buy and not self._has_position:
                account = VirtualAccount.query.filter_by(user_id=self.user_id).first()
                cost = ltp * order_qty
                if account and account.balance >= cost:
                    account.balance -= cost
                    db.session.add(PaperPosition(
                        user_id=self.user_id,
                        symbol=order_symbol,
                        exchange=order_exchange,
                        quantity=order_qty,
                        avg_buy_price=ltp,
                        current_price=ltp,
                        unrealised_pnl=0.0,
                    ))
                    filled_ok = True
                else:
                    order.status = PaperOrderStatus.CANCELLED
                    filled_ok = False
            elif is_sell and self._has_position:
                position = PaperPosition.query.filter_by(
                    user_id=self.user_id,
                    symbol=order_symbol,
                ).first()
                if position:
                    proceeds = ltp * position.quantity
                    realised_pnl = (
                        (ltp - position.avg_buy_price) * position.quantity
                        - BROKERAGE_FLAT
                    )
                    account = VirtualAccount.query.filter_by(
                        user_id=self.user_id
                    ).first()
                    if account:
                        account.balance += proceeds
                        account.total_realised_pnl += realised_pnl
                    db.session.delete(position)
                    filled_ok = True
                else:
                    filled_ok = False
            else:
                filled_ok = False

            db.session.add(AuditLog(
                user_id=self.user_id,
                event_type="PAPER_LIMIT_FILLED" if filled_ok else "PAPER_LIMIT_CANCELLED",
                mode="paper",
                payload={
                    "order_id": order_id,
                    "transaction_type": tx_type,
                    "trigger_price": trigger_price,
                    "fill_price": ltp,
                },
            ))
            db.session.commit()

            if filled_ok:
                if is_buy:
                    self._has_position = True
                elif is_sell:
                    self._has_position = False
                logger.info(
                    "LIMIT %s filled: session=%d order=%d trigger=%.2f ltp=%.2f",
                    tx_type, self.session_id, order_id, trigger_price, ltp,
                )
