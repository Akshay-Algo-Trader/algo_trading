"""
APScheduler jobs for AlgoTrader.

Job 1 — daily 15:31 IST : stop all active trading sessions (market close)
Job 2 — daily 09:14 IST : remind admins to refresh Kite tokens before market open
Job 3 — every 60s       : check daily loss limit per user, auto-stop sessions
"""

import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))

# Configurable daily loss limit as a fraction of initial virtual balance (e.g. 0.05 = 5%)
DAILY_LOSS_LIMIT_FRACTION = 0.05


def _stop_all_sessions(app):
    """Job 1 — stop all ACTIVE sessions at market close."""
    with app.app_context():
        from datetime import datetime, timezone
        from app.extensions import db
        from app.models import TradingSession, SessionStatus

        active = TradingSession.query.filter_by(status=SessionStatus.ACTIVE).all()
        count = 0
        for session in active:
            session.status = SessionStatus.STOPPED
            session.stopped_at = datetime.now(timezone.utc)
            session.auto_stop_reason = "Market closed at 15:30 IST"
            count += 1

        if count:
            db.session.commit()
            logger.info("Market close: stopped %d active trading session(s)", count)
        else:
            logger.info("Market close job ran — no active sessions to stop")


def _remind_token_refresh(app):
    """Job 2 — log reminder before market open that Kite tokens may need refreshing."""
    with app.app_context():
        from app.models import KiteConfig, User, UserRole
        from app.services.kite_service import kite_service

        stale_users = []
        configs = KiteConfig.query.filter_by(is_connected=True).all()
        for cfg in configs:
            if not kite_service.is_token_valid(cfg.user_id):
                stale_users.append(cfg.user_id)
                kite_service.refresh_token_if_needed(cfg.user_id)

        if stale_users:
            logger.warning(
                "Pre-market token check: %d user(s) have stale Kite tokens and need manual re-login: %s",
                len(stale_users), stale_users,
            )
        else:
            logger.info("Pre-market token check: all Kite tokens are valid")


def _check_loss_limits(app):
    """Job 3 — auto-stop sessions where user has breached daily loss limit."""
    with app.app_context():
        from datetime import date
        from app.extensions import db
        from app.models import (
            TradingSession, SessionStatus, SessionMode,
            PaperOrder, VirtualAccount
        )
        from app.models.paper_order import PaperOrderStatus, PaperOrderType

        active_paper = TradingSession.query.filter_by(
            status=SessionStatus.ACTIVE,
            mode=SessionMode.PAPER,
        ).all()

        today_utc_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        for session in active_paper:
            account = VirtualAccount.query.filter_by(user_id=session.user_id).first()
            if not account:
                continue

            # Sum today's paper P&L as (fill_price - trigger_price) * qty for fills
            today_orders = PaperOrder.query.filter(
                PaperOrder.user_id == session.user_id,
                PaperOrder.status == PaperOrderStatus.FILLED,
                PaperOrder.fill_time >= today_utc_start,
            ).all()

            daily_pnl = 0.0
            for o in today_orders:
                if o.fill_price and o.trigger_price:
                    multiplier = 1 if o.transaction_type == PaperOrderType.BUY else -1
                    daily_pnl += multiplier * (o.fill_price - o.trigger_price) * o.quantity

            loss_limit = account.initial_balance * DAILY_LOSS_LIMIT_FRACTION
            if daily_pnl < -loss_limit:
                session.status = SessionStatus.STOPPED
                session.stopped_at = datetime.now(timezone.utc)
                session.auto_stop_reason = (
                    f"Daily loss limit breached: ₹{abs(daily_pnl):.2f} > ₹{loss_limit:.2f}"
                )
                logger.warning(
                    "Auto-stopped session %d for user %d: daily loss ₹%.2f",
                    session.id, session.user_id, abs(daily_pnl),
                )

        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception("Error committing loss-limit check")


def create_scheduler(app) -> BackgroundScheduler:
    """
    Create and start the APScheduler instance.
    Call this once from the app factory.
    Returns the running scheduler.
    """
    scheduler = BackgroundScheduler(timezone="Asia/Kolkata")

    # Job 1: stop all sessions at 15:31 IST daily (Mon–Fri)
    scheduler.add_job(
        func=_stop_all_sessions,
        trigger=CronTrigger(day_of_week="mon-fri", hour=15, minute=31, timezone="Asia/Kolkata"),
        args=[app],
        id="market_close_stop_sessions",
        name="Stop all sessions at market close",
        replace_existing=True,
        misfire_grace_time=120,
    )

    # Job 2: remind about token refresh at 09:14 IST daily (Mon–Fri)
    scheduler.add_job(
        func=_remind_token_refresh,
        trigger=CronTrigger(day_of_week="mon-fri", hour=9, minute=14, timezone="Asia/Kolkata"),
        args=[app],
        id="pre_market_token_check",
        name="Pre-market Kite token refresh reminder",
        replace_existing=True,
        misfire_grace_time=120,
    )

    # Job 3: check daily loss limits every 60 seconds
    scheduler.add_job(
        func=_check_loss_limits,
        trigger=IntervalTrigger(seconds=60),
        args=[app],
        id="loss_limit_check",
        name="Check daily loss limits",
        replace_existing=True,
        misfire_grace_time=30,
    )

    scheduler.start()
    logger.info("APScheduler started with %d jobs", len(scheduler.get_jobs()))
    return scheduler
