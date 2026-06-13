"""
SessionManager — singleton that owns all active TradingEngine instances.

Routes engage the manager via current_app.session_manager. Each session
owns one engine, which owns one background thread. The manager handles
the bookkeeping of starting / stopping / status / shutdown.

Engines are the new ``TradingEngine`` class (paper + live, rich rules)
defined in app.services.trading_engine.
"""

import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)


class _SessionManager:
    """Manages the lifecycle of active TradingEngine instances."""

    def __init__(self):
        self._sessions: dict[int, object] = {}  # session_id → engine
        self._lock = threading.Lock()
        self._app = None

    def init_app(self, app):
        self._app = app
        app.session_manager = self
        logger.info("SessionManager initialised on app '%s'", app.name)

    # ------------------------------------------------------------------ #
    #  Session lifecycle                                                   #
    # ------------------------------------------------------------------ #

    def start_session(self, user_id: int, strategy_id: int, mode: str, session_id: int):
        """
        Spawn the engine for an already-persisted TradingSession row.

        Mode must be 'paper' or 'live'.
        """
        if self._app is None:
            raise RuntimeError("SessionManager.init_app() has not been called")
        if mode not in ("paper", "live"):
            raise ValueError(f"Unknown trading mode: '{mode}'")

        with self._lock:
            if session_id in self._sessions:
                return self._sessions[session_id]

            from app.services.trading_engine import TradingEngine
            engine = TradingEngine(user_id, strategy_id, session_id, mode, self._app)
            engine.start()
            self._sessions[session_id] = engine

        logger.info(
            "Session started: id=%d user=%d strategy=%d mode=%s",
            session_id, user_id, strategy_id, mode,
        )
        return engine

    def stop_session(self, session_id: int, reason: Optional[str] = None) -> bool:
        with self._lock:
            engine = self._sessions.pop(session_id, None)
        if engine is None:
            return False
        try:
            engine.stop(reason=reason)
        except Exception:
            logger.exception("Engine.stop() raised for session %d", session_id)
        return True

    def get_session_status(self, session_id: int) -> Optional[dict]:
        engine = self._sessions.get(session_id)
        return engine.get_status() if engine else None

    def get_engine(self, session_id: int):
        return self._sessions.get(session_id)

    def is_active(self, session_id: int) -> bool:
        engine = self._sessions.get(session_id)
        if engine is None:
            return False
        # Engine may have self-completed (full TP / SL / structural exit).
        # Prune it eagerly so callers see a consistent view.
        if not getattr(engine, 'is_running', False):
            with self._lock:
                self._sessions.pop(session_id, None)
            return False
        return True

    def active_session_ids(self) -> list[int]:
        with self._lock:
            return list(self._sessions.keys())

    def stop_all(self, reason: str = "server_shutdown"):
        with self._lock:
            ids = list(self._sessions.keys())
        for sid in ids:
            self.stop_session(sid, reason=reason)


# Module-level singleton — shared across the application process
session_manager = _SessionManager()
