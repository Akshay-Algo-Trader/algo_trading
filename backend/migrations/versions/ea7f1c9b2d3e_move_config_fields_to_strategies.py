"""move config fields from candle_patterns to strategies

Revision ID: ea7f1c9b2d3e
Revises: d4f1a09c7b21
Create Date: 2026-06-05 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = 'ea7f1c9b2d3e'
down_revision = 'd4f1a09c7b21'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add 4 columns to strategies table
    with op.batch_alter_table('strategies', schema=None) as batch_op:
        batch_op.add_column(sa.Column('timeframes', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('entry_conditions', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('indicator_settings', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('trade_filters', mysql.JSON(), nullable=True))

    # 2. Copy existing data from linked patterns into strategies
    op.execute("""
        UPDATE strategies s
        JOIN candle_patterns cp ON s.candle_pattern_id = cp.id
        SET
            s.timeframes = cp.timeframes,
            s.entry_conditions = cp.entry_conditions,
            s.indicator_settings = cp.indicator_settings,
            s.trade_filters = cp.trade_filters
    """)

    # 3. Drop 6 columns from candle_patterns table
    with op.batch_alter_table('candle_patterns', schema=None) as batch_op:
        batch_op.drop_column('timeframes')
        batch_op.drop_column('entry_conditions')
        batch_op.drop_column('stop_loss_rules')
        batch_op.drop_column('target_rules')
        batch_op.drop_column('indicator_settings')
        batch_op.drop_column('trade_filters')


def downgrade():
    # 1. Add 6 columns back to candle_patterns
    with op.batch_alter_table('candle_patterns', schema=None) as batch_op:
        batch_op.add_column(sa.Column('timeframes', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('entry_conditions', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('stop_loss_rules', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('target_rules', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('indicator_settings', mysql.JSON(), nullable=True))
        batch_op.add_column(sa.Column('trade_filters', mysql.JSON(), nullable=True))

    # 2. Copy data back from strategies to patterns
    op.execute("""
        UPDATE candle_patterns cp
        JOIN strategies s ON s.candle_pattern_id = cp.id
        SET
            cp.timeframes = s.timeframes,
            cp.entry_conditions = s.entry_conditions,
            cp.indicator_settings = s.indicator_settings,
            cp.trade_filters = s.trade_filters
    """)

    # 3. Drop 4 columns from strategies
    with op.batch_alter_table('strategies', schema=None) as batch_op:
        batch_op.drop_column('timeframes')
        batch_op.drop_column('entry_conditions')
        batch_op.drop_column('indicator_settings')
        batch_op.drop_column('trade_filters')
