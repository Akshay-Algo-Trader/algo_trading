"""add replay session mode + replay_start_at

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-15 18:25:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c9d0e1f2a3b4'
down_revision = 'b8c9d0e1f2a3'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE trading_sessions MODIFY COLUMN mode ENUM('LIVE','PAPER','REPLAY') NOT NULL"
    )
    op.add_column(
        'trading_sessions',
        sa.Column('replay_start_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column('trading_sessions', 'replay_start_at')
    # Drop any replay rows first so the narrowed enum stays valid.
    op.execute("DELETE FROM trading_sessions WHERE mode = 'REPLAY'")
    op.execute(
        "ALTER TABLE trading_sessions MODIFY COLUMN mode ENUM('LIVE','PAPER') NOT NULL"
    )
