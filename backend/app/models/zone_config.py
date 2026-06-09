from app.extensions import db
from datetime import datetime, timezone
from sqlalchemy.dialects.mysql import JSON


class ZoneConfig(db.Model):
    __tablename__ = 'zone_configs'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True, index=True)
    description = db.Column(db.Text, nullable=True)
    fvg_settings = db.Column(JSON, nullable=True)
    sr_settings = db.Column(JSON, nullable=True)
    swing_settings = db.Column(JSON, nullable=True)
    confluence_settings = db.Column(JSON, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        default_fvg_tf = {
            'enabled': False,
            'lookback_candles': 100,
            'min_gap_pct': 0.1,
            'max_gap_pct': 2.0,
            'gap_fill_tolerance_pct': 0.1,
        }
        default_fvg = {
            '4H': {**default_fvg_tf, 'lookback_candles': 50, 'min_gap_pct': 0.2, 'max_gap_pct': 3.0, 'gap_fill_tolerance_pct': 0.15},
            '1H': {**default_fvg_tf},
            '30M': {**default_fvg_tf},
            '15M': {**default_fvg_tf},
        }
        default_sr = {
            'lookback_candles': 200,
            'touch_count_min': 3,
            'price_tolerance_pct': 0.25,
            'zone_width_pct': 0.5,
        }
        default_swing = {
            'lookback_candles': 100,
            'swing_left_bars': 5,
            'swing_right_bars': 5,
            'min_swing_pct': 0.5,
        }
        default_confluence = {
            'enabled': False,
            'timeframes': ['1H', '30M', '15M'],
            'overlap_min_pct': 0.03,
            'overlap_max_pct': 0.23,
            'require_all_timeframes': False,
        }

        fvg = default_fvg.copy()
        if self.fvg_settings:
            for tf, settings in self.fvg_settings.items():
                if tf in fvg and settings:
                    fvg[tf].update(settings)

        sr = default_sr.copy()
        if self.sr_settings:
            sr.update(self.sr_settings)

        swing = default_swing.copy()
        if self.swing_settings:
            swing.update(self.swing_settings)

        confluence = default_confluence.copy()
        if self.confluence_settings:
            confluence.update(self.confluence_settings)

        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'fvg_settings': fvg,
            'sr_settings': sr,
            'swing_settings': swing,
            'confluence_settings': confluence,
            'is_active': self.is_active,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<ZoneConfig {self.name}>'
