from app.extensions import db
from datetime import datetime, timezone


class ExecutionLog(db.Model):
    """Per-tick log lines emitted by the TradingEngine for one session.

    Persisted so a browser refresh / app restart never loses the trade story.
    """
    __tablename__ = 'execution_logs'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('trading_sessions.id'), nullable=False, index=True)
    ts = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    severity = db.Column(db.String(16), nullable=False, default='info')  # info | success | warn | error
    message = db.Column(db.Text, nullable=False)

    def to_dict(self):
        return {
            'id':       self.id,
            'ts':       self.ts.isoformat(),
            'severity': self.severity,
            'message':  self.message,
        }

    def __repr__(self):
        return f'<ExecutionLog session={self.session_id} {self.severity}>'
