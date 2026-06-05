"""add_option_config_to_strategies

Revision ID: d4f1a09c7b21
Revises: c2e7d4a91b08
Create Date: 2026-06-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = 'd4f1a09c7b21'
down_revision = 'c2e7d4a91b08'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('strategies', schema=None) as batch_op:
        batch_op.add_column(sa.Column('option_config', mysql.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('strategies', schema=None) as batch_op:
        batch_op.drop_column('option_config')
