from app.extensions import db
from datetime import datetime, timezone
from enum import Enum


class SessionMode(Enum):
    """Trading session mode"""
    LIVE = 'live'
    PAPER = 'paper'


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
    mode = db.Column(db.Enum(SessionMode), nullable=False)  # live or paper
    status = db.Column(db.Enum(SessionStatus), nullable=False, default=SessionStatus.ACTIVE)
    started_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    stopped_at = db.Column(db.DateTime(timezone=True), nullable=True)
    auto_stop_reason = db.Column(db.String(255), nullable=True)  # Reason for auto-stop if any
    
    # Relationships
    live_orders = db.relationship('LiveOrder', backref='session', cascade='all, delete-orphan')
    paper_orders = db.relationship('PaperOrder', backref='session', cascade='all, delete-orphan')
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'strategy_id': self.strategy_id,
            'mode': self.mode.value,
            'status': self.status.value,
            'started_at': self.started_at.isoformat(),
            'stopped_at': self.stopped_at.isoformat() if self.stopped_at else None,
            'auto_stop_reason': self.auto_stop_reason
        }
    
    def __repr__(self):
        return f'<TradingSession user_id={self.user_id} mode={self.mode.value} status={self.status.value}>'
