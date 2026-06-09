from app.extensions import db
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy.dialects.mysql import JSON


class OrderType(Enum):
    """Order type enumeration"""
    MARKET = 'MARKET'
    LIMIT = 'LIMIT'


class Exchange(Enum):
    """Exchange enumeration"""
    NSE = 'NSE'
    BSE = 'BSE'
    MCX = 'MCX'


class Strategy(db.Model):
    """Strategy definitions for automated trading"""
    __tablename__ = 'strategies'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True, index=True)
    description = db.Column(db.Text, nullable=True)
    instrument = db.Column(db.String(50), nullable=False)  # e.g., NIFTY50
    exchange = db.Column(db.Enum(Exchange), nullable=False)
    order_type = db.Column(db.Enum(OrderType), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    entry_condition = db.Column(JSON, nullable=False)  # JSON condition for entry
    exit_condition = db.Column(JSON, nullable=False)  # JSON condition for exit
    stop_loss_pct = db.Column(db.Float, nullable=False)  # Stop loss percentage
    take_profit_pct = db.Column(db.Float, nullable=False)  # Take profit percentage
    stop_loss_rules = db.Column(JSON, nullable=True)
    target_rules = db.Column(JSON, nullable=True)
    timeframes = db.Column(JSON, nullable=True)
    entry_conditions = db.Column(JSON, nullable=True)
    indicator_settings = db.Column(JSON, nullable=True)
    trade_filters = db.Column(JSON, nullable=True)
    candle_pattern_id = db.Column(db.Integer, db.ForeignKey('candle_patterns.id'), nullable=True, index=True)
    option_config = db.Column(JSON, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user_strategies = db.relationship('UserStrategy', backref='strategy', cascade='all, delete-orphan')
    trading_sessions = db.relationship('TradingSession', backref='strategy', cascade='all, delete-orphan')
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'instrument': self.instrument,
            'exchange': self.exchange.value,
            'order_type': self.order_type.value,
            'quantity': self.quantity,
            'entry_condition': self.entry_condition,
            'exit_condition': self.exit_condition,
            'stop_loss_pct': self.stop_loss_pct,
            'take_profit_pct': self.take_profit_pct,
            'stop_loss_rules': self.stop_loss_rules,
            'target_rules': self.target_rules,
            'timeframes': self.timeframes,
            'entry_conditions': self.entry_conditions,
            'indicator_settings': self.indicator_settings,
            'trade_filters': self.trade_filters,
            'candle_pattern_id': self.candle_pattern_id,
            'candle_pattern': self.candle_pattern.to_dict() if self.candle_pattern else None,
            'option_config': self.option_config,
            'is_active': self.is_active,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat(),
            'assigned_user_ids': [us.user_id for us in self.user_strategies],
        }
    
    def __repr__(self):
        return f'<Strategy {self.name}>'
