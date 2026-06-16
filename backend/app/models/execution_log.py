from app.extensions import db
from datetime import datetime, timezone, timedelta


class ExecutionLog(db.Model):
    """Per-tick log lines emitted by the TradingEngine for one session.

    Persisted so a browser refresh / app restart never loses the trade story.
    """
    __tablename__ = 'execution_logs'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('trading_sessions.id'), nullable=False, index=True)
    ts = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    virtual_ts = db.Column(db.String(19), nullable=True)  # For replay mode: 'YYYY-MM-DD HH:MM:SS' in IST
    severity = db.Column(db.String(16), nullable=False, default='info')  # info | success | warn | error
    message = db.Column(db.Text, nullable=False)

    def to_dict(self):
        # For replay mode, use virtual_ts (the chart/replay time)
        # For live/paper mode, use the actual log timestamp
        if self.virtual_ts:
            # Replay mode: virtual_ts is already in IST as 'YYYY-MM-DD HH:MM:SS'
            ts_str = f"{self.virtual_ts}".replace(' ', 'T')
        else:
            # Live/Paper mode: convert actual timestamp to IST
            try:
                ist = timezone(timedelta(hours=5, minutes=30))
                if self.ts.tzinfo is None:
                    ts_utc = self.ts.replace(tzinfo=timezone.utc)
                else:
                    ts_utc = self.ts
                ts_ist = ts_utc.astimezone(ist)
                ts_str = ts_ist.strftime('%Y-%m-%dT%H:%M:%S')
            except Exception:
                ts_str = self.ts.isoformat() if self.ts else ''

        return {
            'id':       self.id,
            'ts':       ts_str,
            'severity': self.severity,
            'message':  self.message,
        }

    def __repr__(self):
        return f'<ExecutionLog session={self.session_id} {self.severity}>'
