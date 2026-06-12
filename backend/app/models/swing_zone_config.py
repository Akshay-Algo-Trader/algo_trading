from app.extensions import db
from datetime import datetime, timezone


class SwingZoneConfig(db.Model):
    __tablename__ = 'swing_zone_configs'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True, index=True)
    description = db.Column(db.Text, nullable=True)
    candle_size = db.Column(db.String(20), nullable=False, default='4hour')
    period_days = db.Column(db.Integer, nullable=False, default=30)
    pivot_bars = db.Column(db.Integer, nullable=False, default=5)
    strong_level_pct = db.Column(db.Float, nullable=False, default=0.5)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    scan_results = db.relationship('SwingZoneScanResult', backref='swing_zone_config', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'candle_size': self.candle_size,
            'period_days': self.period_days,
            'pivot_bars': self.pivot_bars,
            'strong_level_pct': self.strong_level_pct,
            'is_active': self.is_active,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<SwingZoneConfig {self.name}>'
