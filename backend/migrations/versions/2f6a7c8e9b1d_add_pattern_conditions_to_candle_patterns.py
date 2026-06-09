"""Add entry_conditions, indicator_settings, and trade_filters to candle_patterns.

This migration adds the pattern definition fields that were previously only on
Strategy. Now CandlePattern can be used directly for pattern scanning without
needing a strategy.

Revision ID: 2f6a7c8e9b1d
Revises: ea7f1c9b2d3e
Create Date: 2026-06-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = '2f6a7c8e9b1d'
down_revision = 'ea7f1c9b2d3e'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('candle_patterns', schema=None) as batch_op:
        batch_op.add_column(sa.Column('entry_conditions', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('indicator_settings', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('trade_filters', mysql.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('candle_patterns', schema=None) as batch_op:
        batch_op.drop_column('trade_filters')
        batch_op.drop_column('indicator_settings')
        batch_op.drop_column('entry_conditions')
