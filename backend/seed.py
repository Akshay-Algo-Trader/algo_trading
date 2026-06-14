"""
Seed script to create initial data for the AlgoTrader application
Run with: flask shell < seed.py
Or: python3 seed.py
"""

from app import create_app, db
from app.models import AdminUser
import os


def seed_database():
    """Create seed data"""

    # Create admin user (admins live in the admin_users table, not users)
    admin_email = 'admin@algotrader.com'

    existing_admin = AdminUser.query.filter_by(email=admin_email).first()
    if existing_admin:
        print(f'✓ Admin user already exists: {admin_email}')
        return

    admin_user = AdminUser(
        email=admin_email,
        is_active=True,
        session_timeout_minutes=60,
    )
    admin_user.set_password('Admin@123')

    try:
        db.session.add(admin_user)
        db.session.commit()
        print(f'✓ Created admin user: {admin_email}')
    except Exception as e:
        db.session.rollback()
        print(f'✗ Error creating admin user: {str(e)}')
        raise


if __name__ == '__main__':
    # Get Flask app context
    config_name = os.getenv('FLASK_ENV', 'development')
    app = create_app(config_name)
    
    with app.app_context():
        print('Seeding database...')
        seed_database()
        print('Database seeding completed!')
