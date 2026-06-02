from app.extensions import db
from datetime import datetime, timezone
from enum import Enum


class TransactionType(Enum):
    """Transaction type enumeration"""
    BUY = 'BUY'
    SELL = 'SELL'


class OrderStatus(Enum):
    """Order status enumeration"""
    PENDING = 'PENDING'
    OPEN = 'OPEN'
    PARTIALLY_FILLED = 'PARTIALLY_FILLED'
    FILLED = 'FILLED'
    CANCELLED = 'CANCELLED'
    REJECTED = 'REJECTED'
    EXPIRED = 'EXPIRED'


class OrderType(Enum):
    """Order type enumeration"""
    MARKET = 'MARKET'
    LIMIT = 'LIMIT'


class LiveOrder(db.Model):
    """Real Zerodha orders"""
    __tablename__ = 'live_orders'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    session_id = db.Column(db.Integer, db.ForeignKey('trading_sessions.id'), nullable=True, index=True)
    kite_order_id = db.Column(db.String(50), unique=True, nullable=False, index=True)  # From Zerodha
    symbol = db.Column(db.String(50), nullable=False)  # e.g., NIFTY50
    exchange = db.Column(db.String(10), nullable=False)  # NSE or BSE
    transaction_type = db.Column(db.Enum(TransactionType), nullable=False)  # BUY or SELL
    order_type = db.Column(db.Enum(OrderType), nullable=False)  # MARKET or LIMIT
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False)
    status = db.Column(db.Enum(OrderStatus), nullable=False, default=OrderStatus.PENDING)
    tag = db.Column(db.String(100), nullable=True)  # For order identification
    placed_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'session_id': self.session_id,
            'kite_order_id': self.kite_order_id,
            'symbol': self.symbol,
            'exchange': self.exchange,
            'transaction_type': self.transaction_type.value,
            'order_type': self.order_type.value,
            'quantity': self.quantity,
            'price': self.price,
            'status': self.status.value,
            'tag': self.tag,
            'placed_at': self.placed_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<LiveOrder kite_order_id={self.kite_order_id} symbol={self.symbol}>'
