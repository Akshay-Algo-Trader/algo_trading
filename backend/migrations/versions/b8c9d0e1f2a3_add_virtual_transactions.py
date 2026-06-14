"""add virtual_transactions ledger

Audit ledger of admin adjustments to a customer's virtual (paper) balance:
one row per top-up / withdrawal / set-balance / reset, recording the signed
amount, the resulting balance, the kind, an optional note and which admin
performed it.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-14 07:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'virtual_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('balance_after', sa.Float(), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_virtual_transactions_user_id'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_virtual_transactions_user_id', 'virtual_transactions', ['user_id'])


def downgrade():
    op.drop_index('ix_virtual_transactions_user_id', table_name='virtual_transactions')
    op.drop_table('virtual_transactions')
