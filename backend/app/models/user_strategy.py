from app.extensions import db
from datetime import datetime, timezone


class UserStrategy(db.Model):
    """Assignment of strategies to users"""
    __tablename__ = 'user_strategies'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    strategy_id = db.Column(db.Integer, db.ForeignKey('strategies.id'), nullable=False, index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    assigned_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    
    # Add composite unique constraint
    __table_args__ = (db.UniqueConstraint('user_id', 'strategy_id', name='uq_user_strategy'),)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'strategy_id': self.strategy_id,
            'is_active': self.is_active,
            'assigned_at': self.assigned_at.isoformat()
        }
    
    def __repr__(self):
        return f'<UserStrategy user_id={self.user_id} strategy_id={self.strategy_id}>'
