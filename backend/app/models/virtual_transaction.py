from app.extensions import db
from datetime import datetime, timezone


class VirtualTransaction(db.Model):
    """Audit ledger of admin adjustments to a customer's virtual (paper) balance.

    One row per admin action (top-up, withdrawal, set-balance, reset). `amount`
    is the signed delta applied and `balance_after` is the resulting balance, so
    the ledger fully reconstructs how a balance reached its current value.
    """
    __tablename__ = 'virtual_transactions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    amount = db.Column(db.Float, nullable=False)            # signed delta (+ credit / − debit)
    balance_after = db.Column(db.Float, nullable=False)     # balance once this txn applied
    kind = db.Column(db.String(20), nullable=False)         # topup | withdraw | set | reset
    note = db.Column(db.String(255), nullable=True)
    created_by = db.Column(db.Integer, nullable=True)       # AdminUser id that performed it
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'amount': self.amount,
            'balance_after': self.balance_after,
            'kind': self.kind,
            'note': self.note,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<VirtualTransaction user_id={self.user_id} amount={self.amount} kind={self.kind}>'
