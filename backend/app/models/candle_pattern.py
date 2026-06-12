from app.extensions import db
from datetime import datetime, timezone
from sqlalchemy.dialects.mysql import JSON


class CandlePattern(db.Model):
    __tablename__ = 'candle_patterns'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True, index=True)
    description = db.Column(db.Text, nullable=True)
    pattern_type = db.Column(db.String(50), nullable=False)  # bullish_breakout, bearish_breakout, etc.
    direction = db.Column(db.String(10), nullable=False, default='bullish')  # bullish / bearish
    market = db.Column(db.String(100), nullable=True)
    candle_frequency = db.Column(db.String(20), nullable=False, default='day', server_default='day')  # day, 60, 15, 5, 240, etc. (in minutes)
    entry_conditions = db.Column(JSON, nullable=True)  # Candle pattern matching conditions
    indicator_settings = db.Column(JSON, nullable=True)  # Indicator filters (RSI, MACD, etc.)
    trade_filters = db.Column(JSON, nullable=True)  # Trade filters (trend, day-of-week, etc.)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'pattern_type': self.pattern_type,
            'direction': self.direction,
            'market': self.market,
            'candle_frequency': self.candle_frequency,
            'entry_conditions': self.entry_conditions,
            'indicator_settings': self.indicator_settings,
            'trade_filters': self.trade_filters,
            'is_active': self.is_active,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<CandlePattern {self.name}>'
