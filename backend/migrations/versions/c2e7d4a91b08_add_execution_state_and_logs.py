"""add_execution_state_and_logs

Revision ID: c2e7d4a91b08
Revises: 90f4f6458423
Create Date: 2026-06-04 12:00:00.000000

Adds backend-executor persistence:
- New columns on trading_sessions: phase, pattern_detected, last_ltp, entry_price, plan_state (JSON)
- New table execution_logs for per-tick persisted log lines
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = 'c2e7d4a91b08'
down_revision = '90f4f6458423'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('trading_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('phase', sa.String(length=32), nullable=False, server_default='monitoring'))
        batch_op.add_column(sa.Column('pattern_detected', sa.Boolean(), nullable=False, server_default=sa.text('0')))
        batch_op.add_column(sa.Column('last_ltp', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('entry_price', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('plan_state', mysql.JSON(), nullable=True))

    op.create_table(
        'execution_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('ts', sa.DateTime(timezone=True), nullable=False),
        sa.Column('severity', sa.String(length=16), nullable=False, server_default='info'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['trading_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_execution_logs_session_id', 'execution_logs', ['session_id'])


def downgrade():
    op.drop_index('ix_execution_logs_session_id', table_name='execution_logs')
    op.drop_table('execution_logs')

    with op.batch_alter_table('trading_sessions', schema=None) as batch_op:
        batch_op.drop_column('plan_state')
        batch_op.drop_column('entry_price')
        batch_op.drop_column('last_ltp')
        batch_op.drop_column('pattern_detected')
        batch_op.drop_column('phase')
