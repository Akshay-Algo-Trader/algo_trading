from app.extensions import db
from datetime import datetime, timezone


class PaperPosition(db.Model):
    """Open paper trading positions"""
    __tablename__ = 'paper_positions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    symbol = db.Column(db.String(50), nullable=False, index=True)  # e.g., NIFTY50
    exchange = db.Column(db.String(10), nullable=False)  # NSE or BSE
    quantity = db.Column(db.Integer, nullable=False)  # Open quantity
    avg_buy_price = db.Column(db.Float, nullable=False)  # Average buy price
    current_price = db.Column(db.Float, nullable=False)  # Current market price
    unrealised_pnl = db.Column(db.Float, nullable=False, default=0.0)  # Unrealised profit/loss
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Composite unique constraint on user_id and symbol
    __table_args__ = (db.UniqueConstraint('user_id', 'symbol', name='uq_user_symbol_position'),)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'symbol': self.symbol,
            'exchange': self.exchange,
            'quantity': self.quantity,
            'avg_buy_price': self.avg_buy_price,
            'current_price': self.current_price,
            'unrealised_pnl': self.unrealised_pnl,
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<PaperPosition user_id={self.user_id} symbol={self.symbol} qty={self.quantity}>'
