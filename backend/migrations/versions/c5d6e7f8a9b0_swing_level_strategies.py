"""refactor strategies for swing-level breakout strategies

Revision ID: c5d6e7f8a9b0
Revises: b3c4d5e6f7a8
Create Date: 2026-06-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = 'c5d6e7f8a9b0'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('strategies', schema=None) as batch_op:
        batch_op.drop_constraint('strategies_ibfk_2', type_='foreignkey')
        batch_op.drop_index('ix_strategies_candle_pattern_id')
        batch_op.drop_column('candle_pattern_id')
        batch_op.drop_column('entry_condition')
        batch_op.drop_column('exit_condition')
        batch_op.drop_column('timeframes')
        batch_op.drop_column('entry_conditions')
        batch_op.drop_column('indicator_settings')
        batch_op.drop_column('trade_filters')

        batch_op.add_column(sa.Column('swing_zone_config_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_strategies_swing_zone_config_id'), ['swing_zone_config_id'], unique=False)
        batch_op.create_foreign_key(None, 'swing_zone_configs', ['swing_zone_config_id'], ['id'])


def downgrade():
    with op.batch_alter_table('strategies', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_strategies_swing_zone_config_id'))
        batch_op.drop_column('swing_zone_config_id')

        batch_op.add_column(sa.Column('trade_filters', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('indicator_settings', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('entry_conditions', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('timeframes', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('exit_condition', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('entry_condition', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('candle_pattern_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_strategies_candle_pattern_id'), ['candle_pattern_id'], unique=False)
        batch_op.create_foreign_key('strategies_ibfk_2', 'candle_patterns', ['candle_pattern_id'], ['id'])
