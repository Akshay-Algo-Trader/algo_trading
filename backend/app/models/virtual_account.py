from app.extensions import db
from datetime import datetime, timezone


class VirtualAccount(db.Model):
    """Virtual account with virtual money for paper trading"""
    __tablename__ = 'virtual_accounts'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True, index=True)
    balance = db.Column(db.Float, nullable=False, default=100000.0)  # Current balance
    initial_balance = db.Column(db.Float, nullable=False, default=100000.0)  # Starting balance
    total_realised_pnl = db.Column(db.Float, nullable=False, default=0.0)  # Total realised profit/loss
    reset_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'balance': self.balance,
            'initial_balance': self.initial_balance,
            'total_realised_pnl': self.total_realised_pnl,
            'reset_at': self.reset_at.isoformat(),
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<VirtualAccount user_id={self.user_id} balance={self.balance}>'
