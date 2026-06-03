from app.extensions import db
from datetime import datetime, timezone
from enum import Enum


class PaperOrderStatus(Enum):
    """Paper order status enumeration"""
    PENDING = 'PENDING'
    FILLED = 'FILLED'
    CANCELLED = 'CANCELLED'


class PaperOrderType(Enum):
    """Paper order type enumeration"""
    BUY = 'BUY'
    SELL = 'SELL'


class PaperOrderCategory(Enum):
    """Paper order category enumeration"""
    MARKET = 'MARKET'
    LIMIT = 'LIMIT'


class PaperOrder(db.Model):
    """Simulated paper trading orders"""
    __tablename__ = 'paper_orders'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    session_id = db.Column(db.Integer, db.ForeignKey('trading_sessions.id'), nullable=True, index=True)
    symbol = db.Column(db.String(50), nullable=False)  # e.g., NIFTY50
    exchange = db.Column(db.String(10), nullable=False)  # NSE or BSE
    transaction_type = db.Column(db.Enum(PaperOrderType), nullable=False)  # BUY or SELL
    order_type = db.Column(db.Enum(PaperOrderCategory), nullable=False)  # MARKET or LIMIT
    quantity = db.Column(db.Integer, nullable=False)
    trigger_price = db.Column(db.Float, nullable=False)  # Price at which order was placed
    fill_price = db.Column(db.Float, nullable=True)  # Price at which order was filled
    fill_time = db.Column(db.DateTime(timezone=True), nullable=True)  # When the order was filled
    status = db.Column(db.Enum(PaperOrderStatus), nullable=False, default=PaperOrderStatus.PENDING)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'session_id': self.session_id,
            'symbol': self.symbol,
            'exchange': self.exchange,
            'transaction_type': self.transaction_type.value,
            'order_type': self.order_type.value,
            'quantity': self.quantity,
            'price': self.fill_price,
            'trigger_price': self.trigger_price,
            'fill_price': self.fill_price,
            'fill_time': self.fill_time.isoformat() if self.fill_time else None,
            'status': self.status.value,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<PaperOrder symbol={self.symbol} transaction_type={self.transaction_type.value}>'
