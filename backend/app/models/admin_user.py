from app.extensions import db
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash


class AdminUser(db.Model):
    """Admin accounts, managed separately from customer `users`."""
    __tablename__ = 'admin_users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    # How long this admin's JWT stays valid before re-login is required.
    session_timeout_minutes = db.Column(db.Integer, nullable=False, default=60)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Check password against hash"""
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'is_active': self.is_active,
            'session_timeout_minutes': self.session_timeout_minutes,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<AdminUser {self.email}>'
