from app.extensions import db
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy.dialects.mysql import JSON


class SessionMode(Enum):
    """Trading session mode"""
    LIVE = 'live'
    PAPER = 'paper'
    REPLAY = 'replay'  # paper-style simulation replayed over historical candles


class SessionStatus(Enum):
    """Trading session status"""
    ACTIVE = 'active'
    STOPPED = 'stopped'
    COMPLETED = 'completed'


class TradingSession(db.Model):
    """Live or paper trading session"""
    __tablename__ = 'trading_sessions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    strategy_id = db.Column(db.Integer, db.ForeignKey('strategies.id'), nullable=False, index=True)
    mode = db.Column(db.Enum(SessionMode), nullable=False)  # live, paper or replay
    status = db.Column(db.Enum(SessionStatus), nullable=False, default=SessionStatus.ACTIVE)
    started_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    stopped_at = db.Column(db.DateTime(timezone=True), nullable=True)
    auto_stop_reason = db.Column(db.String(255), nullable=True)  # Reason for auto-stop if any

    # Replay mode — the historical start point the virtual clock begins at
    replay_start_at = db.Column(db.DateTime(timezone=True), nullable=True)

    # ── Backend-executor state (persisted so a refresh / restart loses nothing) ──
    phase            = db.Column(db.String(32), nullable=False, default='monitoring')   # monitoring | in_position | exited | error
    pattern_detected = db.Column(db.Boolean, nullable=False, default=False)
    last_ltp         = db.Column(db.Float, nullable=True)
    entry_price      = db.Column(db.Float, nullable=True)
    plan_state       = db.Column(JSON, nullable=True)   # serialized plan (targets, sl, partial_book, remaining, hwm/lwm, etc.)

    # Relationships
    live_orders     = db.relationship('LiveOrder', backref='session', cascade='all, delete-orphan')
    paper_orders    = db.relationship('PaperOrder', backref='session', cascade='all, delete-orphan')
    execution_logs  = db.relationship('ExecutionLog', backref='session', cascade='all, delete-orphan', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'strategy_id': self.strategy_id,
            'mode': self.mode.value,
            'status': self.status.value,
            'started_at': self.started_at.isoformat(),
            'stopped_at': self.stopped_at.isoformat() if self.stopped_at else None,
            'auto_stop_reason': self.auto_stop_reason,
            'replay_start_at': self.replay_start_at.isoformat() if self.replay_start_at else None,
            'phase':            self.phase,
            'pattern_detected': self.pattern_detected,
            'last_ltp':         self.last_ltp,
            'entry_price':      self.entry_price,
            'plan_state':       self.plan_state,
        }

    def __repr__(self):
        return f'<TradingSession user_id={self.user_id} mode={self.mode.value} status={self.status.value}>'
