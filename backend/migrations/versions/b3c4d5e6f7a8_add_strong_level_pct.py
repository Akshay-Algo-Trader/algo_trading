"""add strong_level_pct to swing zone configs

Revision ID: b3c4d5e6f7a8
Revises: d4e5f6a7b8c9
Create Date: 2026-06-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b3c4d5e6f7a8'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('swing_zone_configs',
        sa.Column('strong_level_pct', sa.Float(), nullable=False, server_default='0.5'))


def downgrade():
    op.drop_column('swing_zone_configs', 'strong_level_pct')
