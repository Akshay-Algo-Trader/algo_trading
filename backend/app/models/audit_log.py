from app.extensions import db
from datetime import datetime, timezone
from sqlalchemy.dialects.mysql import JSON


class AuditLog(db.Model):
    """Audit log for all API calls and order events"""
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)  # Nullable for system events
    event_type = db.Column(db.String(100), nullable=False, index=True)  # e.g., 'ORDER_PLACED', 'LOGIN', 'API_CALL'
    mode = db.Column(db.String(10), nullable=True)  # 'live' or 'paper'
    payload = db.Column(JSON, nullable=True)  # Request data
    response = db.Column(JSON, nullable=True)  # Response data
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'event_type': self.event_type,
            'mode': self.mode,
            'payload': self.payload,
            'response': self.response,
            'created_at': self.created_at.isoformat()
        }
    
    def __repr__(self):
        return f'<AuditLog event_type={self.event_type} user_id={self.user_id}>'
