"""
SessionManager — singleton that owns all active trading engine instances.

Usage::

    # In create_app():
    from app.services.session_manager import session_manager
    session_manager.init_app(app)

    # In route handlers:
    from flask import current_app
    current_app.session_manager.start_session(user_id, strategy_id, 'paper', session_id)
    current_app.session_manager.stop_session(session_id)
"""

import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)


class _SessionManager:
    """Manages the lifecycle of active PaperTradingEngine (and future LiveTradingEngine) instances."""

    def __init__(self):
        self._sessions: dict[int, object] = {}  # session_id → engine instance
        self._lock = threading.Lock()
        self._app = None

    def init_app(self, app):
        """
        Wire this manager to a Flask app.
        Sets app.session_manager so routes can reach it via current_app.session_manager.
        """
        self._app = app
        app.session_manager = self
        logger.info("SessionManager initialised on app '%s'", app.name)

    # ------------------------------------------------------------------ #
    #  Session lifecycle                                                   #
    # ------------------------------------------------------------------ #

    def start_session(
        self,
        user_id: int,
        strategy_id: int,
        mode: str,
        session_id: int,
    ):
        """
        Instantiate the appropriate engine, call start(), and register it.

        Args:
            user_id: owner of the session.
            strategy_id: strategy to execute.
            mode: 'paper' or 'live'.
            session_id: ID of an already-persisted TradingSession row.

        Returns:
            The started engine instance.

        Raises:
            ValueError: if session_id is already active or mode is unknown.
            NotImplementedError: if mode == 'live' (Phase 6).
        """
        if self._app is None:
            raise RuntimeError("SessionManager.init_app() has not been called")

        with self._lock:
            if session_id in self._sessions:
                raise ValueError(f"Session {session_id} is already active")

            if mode == "paper":
                from app.services.paper_engine import PaperTradingEngine
                engine = PaperTradingEngine(user_id, strategy_id, session_id, self._app)
            elif mode == "live":
                raise NotImplementedError(
                    "LiveTradingEngine is not yet implemented (Phase 6)"
                )
            else:
                raise ValueError(f"Unknown trading mode: '{mode}'")

            engine.start()
            self._sessions[session_id] = engine

        logger.info(
            "Session started: session_id=%d user=%d strategy=%d mode=%s",
            session_id, user_id, strategy_id, mode,
        )
        return engine

    def stop_session(self, session_id: int, reason: Optional[str] = None) -> bool:
        """
        Stop an active engine and remove it from the registry.

        Args:
            session_id: the session to stop.
            reason: optional auto_stop_reason written to the DB.

        Returns:
            True if the session was found and stopped, False if not active.
        """
        with self._lock:
            engine = self._sessions.pop(session_id, None)

        if engine is None:
            logger.warning("stop_session called for unknown session_id=%d", session_id)
            return False

        engine.stop(reason=reason)
        logger.info("Session stopped: session_id=%d", session_id)
        return True

    def get_session_status(self, session_id: int) -> Optional[dict]:
        """
        Return the engine's current state dict, or None if not active.
        """
        engine = self._sessions.get(session_id)
        if engine is None:
            return None
        return engine.get_status()

    def active_session_ids(self) -> list[int]:
        """Return a snapshot of all currently active session IDs."""
        with self._lock:
            return list(self._sessions.keys())

    def stop_all(self, reason: str = "server_shutdown"):
        """Stop every active session (called on graceful shutdown)."""
        with self._lock:
            ids = list(self._sessions.keys())
        for sid in ids:
            self.stop_session(sid, reason=reason)


# Module-level singleton — shared across the entire application process
session_manager = _SessionManager()
