"""
Seed script to create initial data for the AlgoTrader application
Run with: flask shell < seed.py
Or: python3 seed.py
"""

from app import create_app, db
from app.models import User, UserRole, VirtualAccount
import os


def seed_database():
    """Create seed data"""
    
    # Create admin user
    admin_email = 'admin@algotrader.com'
    
    # Check if admin already exists
    existing_admin = User.query.filter_by(email=admin_email).first()
    if existing_admin:
        print(f'✓ Admin user already exists: {admin_email}')
        return
    
    # Create admin user
    admin_user = User(
        email=admin_email,
        role=UserRole.ADMIN,
        is_active=True
    )
    admin_user.set_password('Admin@123')
    
    # Create virtual account for admin
    virtual_account = VirtualAccount(
        user=admin_user,
        balance=100000.0,
        initial_balance=100000.0,
        total_realised_pnl=0.0
    )
    
    try:
        db.session.add(admin_user)
        db.session.add(virtual_account)
        db.session.commit()
        print(f'✓ Created admin user: {admin_email}')
        print(f'✓ Created virtual account with balance: ₹100,000')
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
