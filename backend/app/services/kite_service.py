"""
KiteService — singleton that manages all Zerodha Kite Connect interactions.

Usage:
    from app.services.kite_service import kite_service
    kite = kite_service.get_kite(user_id)
"""

import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from typing import Optional

from flask import current_app
from kiteconnect import KiteConnect

from app.extensions import db
from app.models import KiteConfig, AuditLog
from app.services.encryption import decrypt, encrypt


def _snap_to_tick(price: float, tick: float) -> float:
    if not tick or tick <= 0:
        return round(price, 2)
    snapped = round(round(price / tick) * tick, 10)
    decimals = len(str(tick).rstrip('0').split('.')[-1]) if '.' in str(tick) else 0
    return round(snapped, decimals)


def _get_tick_size(symbol: str, exchange: str) -> float:
    from app.models.instrument import Instrument
    inst = Instrument.query.filter_by(tradingsymbol=symbol, exchange=exchange).first()
    if inst and inst.tick_size and inst.tick_size > 0:
        return float(inst.tick_size)
    return 0.05

logger = logging.getLogger(__name__)

# IST = UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))

# Per-user deque of order timestamps for rate-limit tracking (10 orders/second)
_order_timestamps: dict[int, deque] = defaultdict(lambda: deque(maxlen=50))

# Per-user configurable max order value (₹); override via user kite config
DEFAULT_MAX_ORDER_VALUE = 500_000.0


class _KiteService:
    """Manages KiteConnect sessions, order placement, and market data."""

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                    #
    # ------------------------------------------------------------------ #

    def _config(self, user_id: int) -> KiteConfig:
        cfg = KiteConfig.query.filter_by(user_id=user_id).first()
        if not cfg:
            raise ValueError(f"No Kite config found for user {user_id}")
        return cfg

    @staticmethod
    def _is_market_open() -> bool:
        """True if NSE/BSE regular session is active (9:15–15:30 IST, Mon–Fri)."""
        now = datetime.now(IST)
        if now.weekday() >= 5:
            return False
        open_time = now.replace(hour=9, minute=15, second=0, microsecond=0)
        close_time = now.replace(hour=15, minute=30, second=0, microsecond=0)
        return open_time <= now <= close_time

    def _audit(self, user_id: int, event: str, mode: Optional[str] = None,
                payload: Optional[dict] = None, response: Optional[dict] = None):
        try:
            log = AuditLog(
                user_id=user_id,
                event_type=event,
                mode=mode,
                payload=payload,
                response=response,
            )
            db.session.add(log)
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception("Failed to write audit log")

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def get_kite(self, user_id: int) -> KiteConnect:
        """Return an authenticated KiteConnect instance for the user."""
        cfg = self._config(user_id)
        if not cfg.api_key_encrypted:
            raise ValueError(f"Kite API key not configured for user {user_id}")
        if not cfg.access_token_encrypted:
            raise ValueError(f"No access token for user {user_id}. Login via Kite first.")

        api_key = decrypt(cfg.api_key_encrypted)
        access_token = decrypt(cfg.access_token_encrypted)

        kite = KiteConnect(api_key=api_key)
        kite.set_access_token(access_token)
        return kite

    def generate_login_url(self, user_id: int) -> str:
        """Return the Kite OAuth redirect URL for the user."""
        cfg = self._config(user_id)
        if not cfg.api_key_encrypted:
            raise ValueError(f"Kite API key not configured for user {user_id}")
        api_key = decrypt(cfg.api_key_encrypted)
        kite = KiteConnect(api_key=api_key)
        return kite.login_url()

    def handle_callback(self, user_id: int, request_token: str) -> dict:
        """
        Exchange request_token for access_token, encrypt and store it.
        Returns the session data dict from Kite.
        """
        cfg = self._config(user_id)
        api_key = decrypt(cfg.api_key_encrypted)
        api_secret = decrypt(cfg.api_secret_encrypted)

        kite = KiteConnect(api_key=api_key)
        session_data = kite.generate_session(request_token, api_secret=api_secret)

        cfg.access_token_encrypted = encrypt(session_data["access_token"])
        cfg.token_generated_at = datetime.now(timezone.utc)
        cfg.is_connected = True
        db.session.commit()

        self._audit(user_id, "KITE_TOKEN_REFRESHED", payload={"request_token": request_token[:10] + "..."})
        logger.info("Kite access token refreshed for user %s", user_id)
        return session_data

    def is_token_valid(self, user_id: int) -> bool:
        """
        Kite access tokens expire daily at midnight IST.
        Returns True if the token was generated today (IST calendar date).
        """
        cfg = self._config(user_id)
        if not cfg.token_generated_at or not cfg.access_token_encrypted:
            return False
        generated_ist = cfg.token_generated_at.astimezone(IST)
        today_ist = datetime.now(IST).date()
        return generated_ist.date() == today_ist

    def refresh_token_if_needed(self, user_id: int):
        """
        Kite tokens cannot be auto-refreshed (requires user browser login).
        This method logs a reminder and marks the config as disconnected.
        """
        if not self.is_token_valid(user_id):
            cfg = self._config(user_id)
            cfg.is_connected = False
            db.session.commit()
            self._audit(user_id, "KITE_TOKEN_STALE",
                        response={"action": "manual_login_required"})
            logger.warning(
                "Kite token for user %s is stale. Manual re-login required at Kite login URL.",
                user_id,
            )

    def place_order(self, user_id: int, params: dict, session_id: Optional[int] = None) -> str:
        """
        Place a live order on Kite with compliance checks.

        params keys: symbol, exchange, transaction_type, order_type,
                     quantity, price (optional), product, variety

        Returns kite_order_id string.
        Raises ValueError on compliance failure.
        """
        # --- Compliance: reject paper mode ---
        mode = params.get("mode", "live")
        if mode == "paper":
            raise ValueError("Paper orders must be routed through the paper engine, not KiteService.")

        # --- Compliance: rate limit (10 orders / second per user) ---
        now_ts = time.monotonic()
        timestamps = _order_timestamps[user_id]
        # Remove timestamps older than 1 second
        while timestamps and now_ts - timestamps[0] > 1.0:
            timestamps.popleft()
        if len(timestamps) >= 10:
            raise ValueError("Rate limit exceeded: max 10 orders per second per user.")
        timestamps.append(now_ts)

        # --- Compliance: max order value ---
        quantity = int(params.get("quantity", 0))
        price = float(params.get("price") or 0.0)
        order_value = quantity * price
        max_value = float(params.get("max_order_value", DEFAULT_MAX_ORDER_VALUE))
        if price > 0 and order_value > max_value:
            raise ValueError(
                f"Order value ₹{order_value:,.2f} exceeds per-user limit ₹{max_value:,.2f}."
            )

        # --- Token validity ---
        if not self.is_token_valid(user_id):
            raise ValueError(f"Kite token for user {user_id} is stale. Please re-login.")

        kite = self.get_kite(user_id)

        # --- AMO guard: MIS orders cannot be placed outside market hours ---
        variety = params.get("variety", kite.VARIETY_REGULAR)
        product = params.get("product", kite.PRODUCT_MIS)
        if variety == kite.VARIETY_REGULAR and not self._is_market_open():
            if product == kite.PRODUCT_MIS:
                raise ValueError(
                    "Market is closed (9:15 AM – 3:30 PM IST, Mon–Fri). "
                    "MIS (intraday) orders cannot be placed as AMO. "
                    "Wait for market hours or use CNC/NRML product."
                )
            variety = kite.VARIETY_AMO
            logger.info("Market closed — upgrading to AMO for %s:%s", params["exchange"], params["symbol"])

        # --- Market protection: Zerodha API does not allow MARKET orders via API.
        #     Convert to LIMIT with a slippage buffer so the order fills immediately. ---
        order_type_str = params["order_type"].upper()
        exchange = params["exchange"]
        symbol = params["symbol"]
        tick = _get_tick_size(symbol, exchange)
        market_protection_pct = float(params.get("market_protection_pct", 0.005))  # 0.5% default
        if order_type_str == "MARKET" and not price:
            ltp_key = f"{exchange}:{symbol}"
            ltp_data = kite.ltp([ltp_key])
            ltp = ltp_data[ltp_key]["last_price"]
            txn = params["transaction_type"].upper()
            raw = ltp * (1 + market_protection_pct) if txn == "BUY" else ltp * (1 - market_protection_pct)
            price = _snap_to_tick(raw, tick)
            order_type_str = "LIMIT"
            logger.info("Converted MARKET order to LIMIT@%.2f (tick=%.2f) for %s:%s", price, tick, exchange, symbol)
        elif order_type_str == "LIMIT" and price:
            price = _snap_to_tick(price, tick)

        # --- Place with retry (max 3, exponential backoff) ---
        last_exc = None
        for attempt in range(1, 4):
            try:
                kite_order_id = kite.place_order(
                    variety=variety,
                    exchange=params["exchange"],
                    tradingsymbol=params["symbol"],
                    transaction_type=params["transaction_type"].upper(),
                    quantity=quantity,
                    order_type=order_type_str,
                    product=product,
                    price=price if price else None,
                    tag=params.get("tag"),
                )
                self._audit(user_id, "ORDER_PLACED", mode="live",
                            payload={k: v for k, v in params.items() if k != "max_order_value"},
                            response={"kite_order_id": str(kite_order_id)})
                return str(kite_order_id)

            except Exception as exc:
                last_exc = exc
                logger.warning("Order attempt %d failed for user %s: %s", attempt, user_id, exc)
                if attempt < 3:
                    time.sleep(2 ** attempt)  # 2s, 4s

        self._audit(user_id, "ORDER_FAILED", mode="live",
                    payload=params, response={"error": str(last_exc)})
        raise RuntimeError(f"Order failed after 3 attempts: {last_exc}") from last_exc

    def get_positions(self, user_id: int) -> dict:
        """Return kite.positions() for the user."""
        return self.get_kite(user_id).positions()

    def get_holdings(self, user_id: int) -> list:
        """Return kite.holdings() for the user."""
        return self.get_kite(user_id).holdings()

    def get_ltp(self, user_id: int, symbols: list[str]) -> dict:
        """
        Return last traded prices for a list of symbols.
        symbols format: ["NSE:INFY", "BSE:RELIANCE"]
        """
        return self.get_kite(user_id).ltp(symbols)

    # ------------------------------------------------------------------ #
    #  Instrument master                                                   #
    # ------------------------------------------------------------------ #

    def load_instruments(self, user_id: int, exchanges: list[str] = None) -> int:
        """
        Fetch instrument list from Kite and upsert into the instruments table.
        Returns number of records upserted.
        """
        from app.models.instrument import Instrument

        exchanges = exchanges or ["NSE", "BSE", "NFO"]
        kite = self.get_kite(user_id)

        total = 0
        for exchange in exchanges:
            try:
                records = kite.instruments(exchange)
            except Exception as exc:
                logger.warning("Could not fetch instruments for %s: %s", exchange, exc)
                continue

            for r in records:
                existing = Instrument.query.filter_by(
                    instrument_token=r["instrument_token"],
                    exchange=exchange,
                ).first()
                if existing:
                    existing.tradingsymbol = r.get("tradingsymbol", "")
                    existing.name = r.get("name", "")
                    existing.instrument_type = r.get("instrument_type", "")
                    existing.segment = r.get("segment", "")
                    existing.lot_size = r.get("lot_size")
                    existing.tick_size = r.get("tick_size")
                    existing.last_price = r.get("last_price")
                else:
                    inst = Instrument(
                        instrument_token=r["instrument_token"],
                        tradingsymbol=r.get("tradingsymbol", ""),
                        exchange=exchange,
                        name=r.get("name", ""),
                        instrument_type=r.get("instrument_type", ""),
                        segment=r.get("segment", ""),
                        lot_size=r.get("lot_size"),
                        tick_size=r.get("tick_size"),
                        last_price=r.get("last_price"),
                    )
                    db.session.add(inst)
                total += 1

            db.session.commit()
            logger.info("Upserted %d instruments for %s", len(records), exchange)

        return total

    def lookup_token(self, tradingsymbol: str, exchange: str = "NSE") -> Optional[int]:
        """Return instrument_token for a tradingsymbol, or None if not found."""
        from app.models.instrument import Instrument
        inst = Instrument.query.filter_by(
            tradingsymbol=tradingsymbol, exchange=exchange
        ).first()
        return inst.instrument_token if inst else None


# Module-level singleton
kite_service = _KiteService()
