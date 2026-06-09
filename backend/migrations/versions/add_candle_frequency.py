"""Add candle_frequency to candle_patterns table.

Revision ID: 3f7e8c9d4a2b
Revises: 2f6a7c8e9b1d
Create Date: 2026-06-05 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3f7e8c9d4a2b'
down_revision = '2f6a7c8e9b1d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('candle_patterns', sa.Column('candle_frequency', sa.String(20), nullable=False, server_default='day'))


def downgrade():
    op.drop_column('candle_patterns', 'candle_frequency')
