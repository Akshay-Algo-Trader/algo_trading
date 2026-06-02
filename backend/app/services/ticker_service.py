"""
KiteTickerService — manages Kite WebSocket connections for real-time ticks.

One WebSocket connection is maintained per unique api_key (not per user),
so multiple users sharing the same api_key share a single connection.

Usage:
    from app.services.ticker_service import ticker_service
    ticker_service.subscribe([256265, 408065])   # instrument tokens
    ltp = ticker_service.get_ltp(256265)
"""

import logging
import threading
import time
from typing import Optional

from kiteconnect import KiteTicker

from app.services.encryption import decrypt

logger = logging.getLogger(__name__)


class _KiteTickerService:
    """
    Maintains one KiteTicker WebSocket per unique api_key.
    Stores latest LTP in an in-memory dict keyed by instrument_token.
    """

    def __init__(self):
        self._lock = threading.Lock()
        # api_key → KiteTicker instance
        self._tickers: dict[str, KiteTicker] = {}
        # api_key → set of subscribed tokens
        self._subscriptions: dict[str, set[int]] = {}
        # instrument_token → latest LTP
        self._ltp: dict[int, float] = {}
        # api_key → access_token (for reconnects)
        self._credentials: dict[str, str] = {}
        # api_key → reconnect attempt count
        self._reconnect_attempts: dict[str, int] = {}

    # ------------------------------------------------------------------ #
    #  Internal                                                            #
    # ------------------------------------------------------------------ #

    def _make_ticker(self, api_key: str, access_token: str) -> KiteTicker:
        ticker = KiteTicker(api_key, access_token, reconnect=False)

        def on_ticks(ws, ticks):
            for tick in ticks:
                token = tick.get("instrument_token")
                ltp = tick.get("last_price")
                if token is not None and ltp is not None:
                    self._ltp[token] = ltp

        def on_connect(ws, response):
            logger.info("KiteTicker connected for api_key=%s", api_key[:8])
            self._reconnect_attempts[api_key] = 0
            tokens = list(self._subscriptions.get(api_key, set()))
            if tokens:
                ws.subscribe(tokens)
                ws.set_mode(ws.MODE_LTP, tokens)

        def on_close(ws, code, reason):
            logger.warning("KiteTicker closed for api_key=%s: %s %s", api_key[:8], code, reason)
            self._schedule_reconnect(api_key)

        def on_error(ws, code, reason):
            logger.error("KiteTicker error for api_key=%s: %s %s", api_key[:8], code, reason)

        ticker.on_ticks = on_ticks
        ticker.on_connect = on_connect
        ticker.on_close = on_close
        ticker.on_error = on_error
        return ticker

    def _schedule_reconnect(self, api_key: str):
        attempts = self._reconnect_attempts.get(api_key, 0)
        # Exponential backoff: 2, 4, 8, 16, 32, max 60 seconds
        delay = min(2 ** (attempts + 1), 60)
        self._reconnect_attempts[api_key] = attempts + 1
        logger.info("KiteTicker reconnect in %ds for api_key=%s", delay, api_key[:8])

        def _reconnect():
            time.sleep(delay)
            with self._lock:
                access_token = self._credentials.get(api_key)
                if not access_token:
                    return
                # Close old ticker if still referenced
                old = self._tickers.pop(api_key, None)
                if old:
                    try:
                        old.close()
                    except Exception:
                        pass
                ticker = self._make_ticker(api_key, access_token)
                self._tickers[api_key] = ticker
            ticker.connect(threaded=True)

        threading.Thread(target=_reconnect, daemon=True, name=f"kite-reconnect-{api_key[:8]}").start()

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def connect(self, api_key: str, access_token: str):
        """
        Start a WebSocket connection for the given api_key/access_token pair.
        Idempotent — does nothing if a live connection already exists.
        """
        with self._lock:
            if api_key in self._tickers:
                return  # already connected
            self._credentials[api_key] = access_token
            self._reconnect_attempts[api_key] = 0
            ticker = self._make_ticker(api_key, access_token)
            self._tickers[api_key] = ticker
        ticker.connect(threaded=True)
        logger.info("KiteTicker connection started for api_key=%s", api_key[:8])

    def connect_for_user(self, kite_config) -> None:
        """
        Convenience: connect using a KiteConfig model instance.
        Decrypts credentials internally.
        """
        if not kite_config.api_key_encrypted or not kite_config.access_token_encrypted:
            raise ValueError("KiteConfig missing api_key or access_token")
        api_key = decrypt(kite_config.api_key_encrypted)
        access_token = decrypt(kite_config.access_token_encrypted)
        self.connect(api_key, access_token)

    def subscribe(self, tokens: list[int], api_key: Optional[str] = None):
        """
        Subscribe to instrument tokens.
        If api_key is None, subscribes on ALL active connections.
        """
        with self._lock:
            keys = [api_key] if api_key else list(self._tickers.keys())
            for key in keys:
                self._subscriptions.setdefault(key, set()).update(tokens)
                ticker = self._tickers.get(key)
                if ticker:
                    try:
                        ticker.subscribe(tokens)
                        ticker.set_mode(ticker.MODE_LTP, tokens)
                    except Exception as exc:
                        logger.warning("Subscribe failed for api_key=%s: %s", key[:8], exc)

    def unsubscribe(self, tokens: list[int], api_key: Optional[str] = None):
        """Remove subscription for the given tokens."""
        with self._lock:
            keys = [api_key] if api_key else list(self._tickers.keys())
            for key in keys:
                subs = self._subscriptions.get(key, set())
                subs.difference_update(tokens)
                ticker = self._tickers.get(key)
                if ticker:
                    try:
                        ticker.unsubscribe(tokens)
                    except Exception as exc:
                        logger.warning("Unsubscribe failed for api_key=%s: %s", key[:8], exc)
        # Clear stale LTP entries
        for token in tokens:
            self._ltp.pop(token, None)

    def get_ltp(self, instrument_token: int) -> Optional[float]:
        """Return the latest LTP from the in-memory store, or None if not yet received."""
        return self._ltp.get(instrument_token)

    def get_all_ltp(self) -> dict[int, float]:
        """Return a snapshot of the entire in-memory LTP dict."""
        return dict(self._ltp)

    def disconnect(self, api_key: Optional[str] = None):
        """Disconnect one or all WebSocket connections."""
        with self._lock:
            keys = [api_key] if api_key else list(self._tickers.keys())
            for key in keys:
                ticker = self._tickers.pop(key, None)
                self._credentials.pop(key, None)
                self._subscriptions.pop(key, None)
                if ticker:
                    try:
                        ticker.close()
                    except Exception:
                        pass

    @property
    def active_connections(self) -> list[str]:
        """List of api_keys with active WebSocket connections."""
        return list(self._tickers.keys())


# Module-level singleton — shared across live and paper engines
ticker_service = _KiteTickerService()
