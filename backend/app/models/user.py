from app.extensions import db
from datetime import datetime, timezone
from enum import Enum
from werkzeug.security import generate_password_hash, check_password_hash


class UserRole(Enum):
    """User role enumeration"""
    ADMIN = 'admin'
    CUSTOMER = 'customer'


class User(db.Model):
    """User model for authentication and profile"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum(UserRole), nullable=False, default=UserRole.CUSTOMER)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    kite_config = db.relationship('KiteConfig', uselist=False, backref='user', cascade='all, delete-orphan')
    virtual_account = db.relationship('VirtualAccount', uselist=False, backref='user', cascade='all, delete-orphan')
    virtual_transactions = db.relationship('VirtualTransaction', backref='user', cascade='all, delete-orphan')
    sessions = db.relationship('TradingSession', backref='user', cascade='all, delete-orphan')
    live_orders = db.relationship('LiveOrder', backref='user', cascade='all, delete-orphan')
    paper_orders = db.relationship('PaperOrder', backref='user', cascade='all, delete-orphan')
    strategies = db.relationship('UserStrategy', backref='user', cascade='all, delete-orphan')
    paper_positions = db.relationship('PaperPosition', backref='user', cascade='all, delete-orphan')
    audit_logs = db.relationship('AuditLog', backref='user', cascade='all, delete-orphan')
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check password against hash"""
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        """Convert user to dictionary"""
        return {
            'id': self.id,
            'email': self.email,
            'role': self.role.value,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat()
        }
    
    def __repr__(self):
        return f'<User {self.email}>'
