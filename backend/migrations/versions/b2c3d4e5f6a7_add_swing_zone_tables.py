"""add swing zone tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'swing_zone_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('zone_type', sa.String(20), nullable=False, server_default='both'),
        sa.Column('candle_size', sa.String(20), nullable=False, server_default='4hour'),
        sa.Column('period_days', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('swing_left_bars', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('swing_right_bars', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('min_reactions', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('atr_buffer_multiplier', sa.Float(), nullable=False, server_default='0.3'),
        sa.Column('cluster_atr_factor', sa.Float(), nullable=False, server_default='0.3'),
        sa.Column('min_strength_score', sa.Integer(), nullable=False, server_default='4'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_swing_zone_configs_name', 'swing_zone_configs', ['name'], unique=True)
    op.create_index('ix_swing_zone_configs_created_by', 'swing_zone_configs', ['created_by'])

    op.create_table(
        'swing_zone_scan_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('swing_config_id', sa.Integer(), nullable=False),
        sa.Column('instrument', sa.String(50), nullable=False),
        sa.Column('exchange', sa.String(50), nullable=False),
        sa.Column('candle_size', sa.String(20), nullable=False),
        sa.Column('period_days', sa.Integer(), nullable=False),
        sa.Column('period_from', sa.String(30), nullable=False),
        sa.Column('period_to', sa.String(30), nullable=False),
        sa.Column('zones_detected', mysql.JSON(), nullable=False),
        sa.Column('total_zones', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('scanned_by', sa.Integer(), nullable=False),
        sa.Column('scanned_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['swing_config_id'], ['swing_zone_configs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['scanned_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_swing_zone_scan_results_swing_config_id', 'swing_zone_scan_results', ['swing_config_id'])
    op.create_index('ix_swing_zone_scan_results_instrument', 'swing_zone_scan_results', ['instrument'])
    op.create_index('ix_swing_zone_scan_results_scanned_by', 'swing_zone_scan_results', ['scanned_by'])


def downgrade():
    op.drop_table('swing_zone_scan_results')
    op.drop_table('swing_zone_configs')
