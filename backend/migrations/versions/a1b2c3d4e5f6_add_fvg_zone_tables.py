"""add fvg zone tables

Revision ID: a1b2c3d4e5f6
Revises: f8a5c6b9d1e2
Create Date: 2026-06-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = 'a1b2c3d4e5f6'
down_revision = 'f8a5c6b9d1e2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'fvg_zone_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('fvg_type', sa.String(20), nullable=False, server_default='both'),
        sa.Column('candle_size', sa.String(20), nullable=False, server_default='1hour'),
        sa.Column('period_days', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('impulse_multiplier', sa.Float(), nullable=False, server_default='1.5'),
        sa.Column('min_gap_pct', sa.Float(), nullable=False, server_default='0.05'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fvg_zone_configs_name', 'fvg_zone_configs', ['name'], unique=True)
    op.create_index('ix_fvg_zone_configs_created_by', 'fvg_zone_configs', ['created_by'])

    op.create_table(
        'fvg_zone_scan_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('fvg_config_id', sa.Integer(), nullable=False),
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
        sa.ForeignKeyConstraint(['fvg_config_id'], ['fvg_zone_configs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['scanned_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fvg_zone_scan_results_fvg_config_id', 'fvg_zone_scan_results', ['fvg_config_id'])
    op.create_index('ix_fvg_zone_scan_results_instrument', 'fvg_zone_scan_results', ['instrument'])
    op.create_index('ix_fvg_zone_scan_results_scanned_by', 'fvg_zone_scan_results', ['scanned_by'])


def downgrade():
    op.drop_table('fvg_zone_scan_results')
    op.drop_table('fvg_zone_configs')
