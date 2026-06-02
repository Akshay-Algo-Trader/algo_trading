from app.extensions import db


class Instrument(db.Model):
    """NSE/BSE instrument master cached from Kite API"""
    __tablename__ = 'instruments'

    id = db.Column(db.Integer, primary_key=True)
    instrument_token = db.Column(db.Integer, nullable=False, index=True)
    tradingsymbol = db.Column(db.String(50), nullable=False, index=True)
    exchange = db.Column(db.String(10), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=True)
    instrument_type = db.Column(db.String(20), nullable=True)
    segment = db.Column(db.String(20), nullable=True)
    lot_size = db.Column(db.Integer, nullable=True)
    tick_size = db.Column(db.Float, nullable=True)
    last_price = db.Column(db.Float, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('instrument_token', 'exchange', name='uq_instrument_token_exchange'),
    )

    def to_dict(self):
        return {
            'instrument_token': self.instrument_token,
            'tradingsymbol': self.tradingsymbol,
            'exchange': self.exchange,
            'name': self.name,
            'instrument_type': self.instrument_type,
            'segment': self.segment,
            'lot_size': self.lot_size,
            'tick_size': self.tick_size,
        }

    def __repr__(self):
        return f'<Instrument {self.exchange}:{self.tradingsymbol}>'
