"""separate admins into admin_users table

Moves admin accounts out of the shared `users` table into a dedicated
`admin_users` table (with a per-admin session_timeout_minutes). Existing admin
rows are copied across preserving their id, the admin-owned creator FKs are
repointed to `admin_users`, and the admin rows (and their stray customer-side
dependents) are removed from `users` so `users` holds customers only.

Revision ID: a7b8c9d0e1f2
Revises: f2a3b4c5d6e7
Create Date: 2026-06-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7b8c9d0e1f2'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None

# (table, column, old constraint name → users, new constraint name → admin_users)
_FKS = [
    ('strategies', 'created_by', 'strategies_ibfk_1', 'fk_strategies_created_by_admin_users'),
    ('swing_zone_configs', 'created_by', 'swing_zone_configs_ibfk_1', 'fk_swing_zone_configs_created_by_admin_users'),
    ('swing_zone_scan_results', 'scanned_by', 'swing_zone_scan_results_ibfk_2', 'fk_swing_scan_scanned_by_admin_users'),
]

# user-owned tables whose rows must be cleared for admin ids before deleting them
_DEPENDENTS = [
    'virtual_accounts', 'kite_configs', 'trading_sessions',
    'live_orders', 'paper_orders', 'paper_positions', 'user_strategies',
]


def upgrade():
    # 1. Create the admin_users table.
    op.create_table(
        'admin_users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('session_timeout_minutes', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_admin_users_email', 'admin_users', ['email'], unique=True)

    # 2. Copy admins from users → admin_users, preserving id so creator FKs stay valid.
    op.execute("""
        INSERT INTO admin_users (id, email, password_hash, is_active, session_timeout_minutes, created_at)
        SELECT id, email, password_hash, is_active, 60, created_at
        FROM users WHERE role = 'ADMIN'
    """)

    # 3. Repoint admin-owned creator FKs from users → admin_users.
    for table, column, old_fk, new_fk in _FKS:
        op.drop_constraint(old_fk, table, type_='foreignkey')
        op.create_foreign_key(new_fk, table, 'admin_users', [column], ['id'])

    # 4. Remove admin-owned customer-side rows, then the admin rows from users.
    for table in _DEPENDENTS:
        op.execute(f"DELETE FROM {table} WHERE user_id IN (SELECT id FROM admin_users)")
    op.execute("UPDATE audit_logs SET user_id = NULL WHERE user_id IN (SELECT id FROM admin_users)")
    op.execute("DELETE FROM users WHERE role = 'ADMIN'")


def downgrade():
    # 1. Copy admins back into users (role = ADMIN), preserving id.
    op.execute("""
        INSERT INTO users (id, email, password_hash, role, is_active, created_at)
        SELECT id, email, password_hash, 'ADMIN', is_active, created_at
        FROM admin_users
    """)

    # 2. Repoint creator FKs back to users.
    for table, column, old_fk, new_fk in _FKS:
        op.drop_constraint(new_fk, table, type_='foreignkey')
        op.create_foreign_key(old_fk, table, 'users', [column], ['id'])

    # 3. Drop admin_users.
    op.drop_index('ix_admin_users_email', table_name='admin_users')
    op.drop_table('admin_users')
