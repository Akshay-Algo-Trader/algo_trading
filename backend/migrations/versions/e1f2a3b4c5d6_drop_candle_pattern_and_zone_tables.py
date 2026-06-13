"""drop candle pattern, zone and fvg zone tables

Removes the Candle Patterns, Zones (S&R/FVG confluence) and FVG Zones feature
tables. The strategy engine now depends only on Swing Levels; these features
will be reintroduced individually later. Swing-level tables are untouched.

Revision ID: e1f2a3b4c5d6
Revises: c5d6e7f8a9b0
Create Date: 2026-06-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = 'e1f2a3b4c5d6'
down_revision = 'c5d6e7f8a9b0'
branch_labels = None
depends_on = None


def upgrade():
    # Drop children (scan results) before their parent config tables.
    op.drop_table('zone_scan_results')
    op.drop_table('zone_configs')
    op.drop_table('fvg_zone_scan_results')
    op.drop_table('fvg_zone_configs')
    op.drop_table('candle_patterns')


def downgrade():
    op.create_table(
        'candle_patterns',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('pattern_type', sa.String(length=50), nullable=False),
        sa.Column('direction', sa.String(length=10), nullable=False, server_default='bullish'),
        sa.Column('market', sa.String(length=100), nullable=True),
        sa.Column('candle_frequency', sa.String(length=20), nullable=False, server_default='day'),
        sa.Column('entry_conditions', mysql.JSON(), nullable=True),
        sa.Column('indicator_settings', mysql.JSON(), nullable=True),
        sa.Column('trade_filters', mysql.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_candle_patterns_name', 'candle_patterns', ['name'], unique=True)
    op.create_index('ix_candle_patterns_created_by', 'candle_patterns', ['created_by'], unique=False)

    op.create_table(
        'zone_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('fvg_settings', mysql.JSON(), nullable=True),
        sa.Column('sr_settings', mysql.JSON(), nullable=True),
        sa.Column('swing_settings', mysql.JSON(), nullable=True),
        sa.Column('confluence_settings', mysql.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_zone_configs_name', 'zone_configs', ['name'], unique=True)
    op.create_index('ix_zone_configs_created_by', 'zone_configs', ['created_by'], unique=False)

    op.create_table(
        'zone_scan_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('zone_config_id', sa.Integer(), nullable=False),
        sa.Column('instrument', sa.String(length=50), nullable=False),
        sa.Column('exchange', sa.String(length=50), nullable=False),
        sa.Column('timeframe', sa.String(length=10), nullable=False),
        sa.Column('scan_days', sa.Integer(), nullable=False),
        sa.Column('period_from', sa.String(length=10), nullable=False),
        sa.Column('period_to', sa.String(length=10), nullable=False),
        sa.Column('zones_detected', mysql.JSON(), nullable=False),
        sa.Column('total_zones', sa.Integer(), nullable=False),
        sa.Column('scanned_by', sa.Integer(), nullable=False),
        sa.Column('scanned_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['zone_config_id'], ['zone_configs.id']),
        sa.ForeignKeyConstraint(['scanned_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_zone_scan_results_zone_config_id', 'zone_scan_results', ['zone_config_id'], unique=False)
    op.create_index('ix_zone_scan_results_instrument', 'zone_scan_results', ['instrument'], unique=False)
    op.create_index('ix_zone_scan_results_scanned_by', 'zone_scan_results', ['scanned_by'], unique=False)

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
