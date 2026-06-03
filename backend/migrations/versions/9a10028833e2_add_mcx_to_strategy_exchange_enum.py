"""add_mcx_to_strategy_exchange_enum

Revision ID: 9a10028833e2
Revises: 93c218990913
Create Date: 2026-06-03 18:31:29.950032

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9a10028833e2'
down_revision = '93c218990913'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE strategies MODIFY COLUMN exchange ENUM('NSE','BSE','MCX') NOT NULL"
    )


def downgrade():
    op.execute(
        "ALTER TABLE strategies MODIFY COLUMN exchange ENUM('NSE','BSE') NOT NULL"
    )
