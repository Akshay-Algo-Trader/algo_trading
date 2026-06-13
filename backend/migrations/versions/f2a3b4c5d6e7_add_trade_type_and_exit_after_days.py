"""add trade_type and exit_after_days to strategies

Adds intraday/swing trade-type classification and an optional max-holding-days
cap for swing trades. Existing rows default to 'swing' with no cap, preserving
the current "hold until SL/TP/period-end" behaviour.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2a3b4c5d6e7'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('strategies', sa.Column('trade_type', sa.String(length=20),
                                          nullable=False, server_default='swing'))
    op.add_column('strategies', sa.Column('exit_after_days', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('strategies', 'exit_after_days')
    op.drop_column('strategies', 'trade_type')
