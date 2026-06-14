"""Custom Flask CLI commands (Magento2-style).

Usage (run from backend/ with the venv active):

    flask admin:user:create --admin-email=admin@example.com --admin-password=Secret@123

Omit options to be prompted interactively (password is hidden + confirmed).
"""
import re
import click
from flask.cli import with_appcontext

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def register_commands(app):
    """Attach custom CLI commands to a Flask app."""
    app.cli.add_command(admin_user_create)


@click.command('admin:user:create')
@click.option('--admin-email', 'email', required=True, prompt='Admin email',
              help='Admin email, used as the login username.')
@click.option('--admin-password', 'password', required=True, prompt='Admin password',
              hide_input=True, confirmation_prompt=True,
              help='Admin password (min 8 characters).')
@click.option('--session-timeout', 'timeout', default=60, show_default=True, type=int,
              help='Session timeout in minutes (how long this admin stays logged in).')
@with_appcontext
def admin_user_create(email, password, timeout):
    """Create a new admin user in the admin_users table."""
    from app.extensions import db
    from app.models import AdminUser

    email = email.strip().lower()

    if not EMAIL_RE.match(email):
        raise click.BadParameter(f'Invalid email address: {email}', param_hint='--admin-email')
    if len(password) < 8:
        raise click.BadParameter('Password must be at least 8 characters.', param_hint='--admin-password')

    if AdminUser.query.filter_by(email=email).first():
        click.echo(click.style(f'Admin already exists: {email}', fg='yellow'))
        return

    admin = AdminUser(email=email, is_active=True, session_timeout_minutes=timeout)
    admin.set_password(password)
    db.session.add(admin)

    try:
        db.session.commit()
    except Exception as exc:  # pragma: no cover - surface DB errors to the operator
        db.session.rollback()
        raise click.ClickException(f'Failed to create admin user: {exc}')

    click.echo(click.style(f'Created admin user: {email}', fg='green'))
    click.echo(f'  Session timeout: {timeout} min')
    click.echo('Log in at /admin/login using this email as the username.')
