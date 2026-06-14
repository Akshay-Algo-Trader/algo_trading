from app.extensions import db
from datetime import datetime, timezone
from sqlalchemy.dialects.mysql import JSON


class SwingZoneScanResult(db.Model):
    __tablename__ = 'swing_zone_scan_results'

    id = db.Column(db.Integer, primary_key=True)
    swing_config_id = db.Column(db.Integer, db.ForeignKey('swing_zone_configs.id'), nullable=False, index=True)
    instrument = db.Column(db.String(50), nullable=False, index=True)
    exchange = db.Column(db.String(50), nullable=False)
    candle_size = db.Column(db.String(20), nullable=False)
    period_days = db.Column(db.Integer, nullable=False)
    period_from = db.Column(db.String(30), nullable=False)
    period_to = db.Column(db.String(30), nullable=False)
    levels_detected = db.Column(JSON, nullable=False)
    total_levels = db.Column(db.Integer, nullable=False, default=0)
    scanned_by = db.Column(db.Integer, db.ForeignKey('admin_users.id'), nullable=False, index=True)
    scanned_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'swing_config_id': self.swing_config_id,
            'instrument': self.instrument,
            'exchange': self.exchange,
            'candle_size': self.candle_size,
            'period_days': self.period_days,
            'period': {
                'from': self.period_from,
                'to': self.period_to,
            },
            'levels_detected': self.levels_detected or [],
            'total_levels': self.total_levels,
            'scanned_by': self.scanned_by,
            'scanned_at': self.scanned_at.isoformat(),
        }

    def __repr__(self):
        return f'<SwingZoneScanResult {self.instrument} {self.candle_size} {self.period_days}d>'
