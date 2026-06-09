"""refactor swing zones to support/resistance levels

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    # swing_zone_configs already has pivot_bars; old zone/ATR/scoring columns already dropped

    # swing_zone_scan_results: clear stale data, swap column names
    op.execute('DELETE FROM swing_zone_scan_results')
    op.add_column('swing_zone_scan_results',
        sa.Column('levels_detected', mysql.JSON(), nullable=False))
    op.add_column('swing_zone_scan_results',
        sa.Column('total_levels', sa.Integer(), nullable=False, server_default='0'))
    op.drop_column('swing_zone_scan_results', 'zones_detected')
    op.drop_column('swing_zone_scan_results', 'total_zones')


def downgrade():
    op.add_column('swing_zone_configs',
        sa.Column('zone_type', sa.String(20), nullable=False, server_default='both'))
    op.add_column('swing_zone_configs',
        sa.Column('quality_filter_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('swing_zone_configs',
        sa.Column('min_reactions', sa.Integer(), nullable=False, server_default='2'))
    op.add_column('swing_zone_configs',
        sa.Column('atr_buffer_multiplier', sa.Float(), nullable=False, server_default='0.3'))
    op.add_column('swing_zone_configs',
        sa.Column('cluster_atr_factor', sa.Float(), nullable=False, server_default='0.3'))
    op.add_column('swing_zone_configs',
        sa.Column('min_strength_score', sa.Integer(), nullable=False, server_default='4'))
    op.drop_column('swing_zone_configs', 'pivot_bars')

    op.execute('DELETE FROM swing_zone_scan_results')
    op.add_column('swing_zone_scan_results',
        sa.Column('zones_detected', mysql.JSON(), nullable=False))
    op.add_column('swing_zone_scan_results',
        sa.Column('total_zones', sa.Integer(), nullable=False, server_default='0'))
    op.drop_column('swing_zone_scan_results', 'levels_detected')
    op.drop_column('swing_zone_scan_results', 'total_levels')
