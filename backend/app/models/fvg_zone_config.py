from app.extensions import db
from datetime import datetime, timezone


class FvgZoneConfig(db.Model):
    __tablename__ = 'fvg_zone_configs'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True, index=True)
    description = db.Column(db.Text, nullable=True)
    fvg_type = db.Column(db.String(20), nullable=False, default='both')  # bullish, bearish, both
    candle_size = db.Column(db.String(20), nullable=False, default='1hour')  # 15min, 30min, 1hour, 4hour
    period_days = db.Column(db.Integer, nullable=False, default=30)  # 1, 7, 10, 30, 60
    impulse_multiplier = db.Column(db.Float, nullable=False, default=1.5)
    min_gap_pct = db.Column(db.Float, nullable=False, default=0.05)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    scan_results = db.relationship('FvgZoneScanResult', backref='fvg_zone_config', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'fvg_type': self.fvg_type,
            'candle_size': self.candle_size,
            'period_days': self.period_days,
            'impulse_multiplier': self.impulse_multiplier,
            'min_gap_pct': self.min_gap_pct,
            'is_active': self.is_active,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<FvgZoneConfig {self.name}>'
