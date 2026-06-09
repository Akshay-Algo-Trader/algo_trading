"""add quality_filter_enabled to swing_zone_configs, drop unused bar columns

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('swing_zone_configs',
        sa.Column('quality_filter_enabled', sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.drop_column('swing_zone_configs', 'swing_left_bars')
    op.drop_column('swing_zone_configs', 'swing_right_bars')


def downgrade():
    op.add_column('swing_zone_configs',
        sa.Column('swing_left_bars', sa.Integer(), nullable=False, server_default='5')
    )
    op.add_column('swing_zone_configs',
        sa.Column('swing_right_bars', sa.Integer(), nullable=False, server_default='5')
    )
    op.drop_column('swing_zone_configs', 'quality_filter_enabled')
