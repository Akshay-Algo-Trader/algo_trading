import os
import pytest

os.environ['ENCRYPTION_KEY'] = 'test-encryption-key-32-chars-1234'
os.environ['DATABASE_URL'] = 'mysql+mysqldb://akshay:akshay%40123@172.26.116.195:3306/algotrader'

from app import create_app
from app.extensions import db as _db
from app.models import User, UserRole, VirtualAccount, AdminUser
from flask_jwt_extended import create_access_token


@pytest.fixture(scope='session')
def app():
    app = create_app('development')
    app.config['TESTING'] = True
    app.config['JWT_SECRET_KEY'] = 'test-jwt-secret'

    with app.app_context():
        _db.create_all()
        yield app


@pytest.fixture(scope='session')
def client(app):
    return app.test_client()


@pytest.fixture(scope='session')
def db(app):
    return _db


@pytest.fixture(scope='session')
def admin_user(db, app):
    """An admin in the admin_users table (admins are separate from customers)."""
    with app.app_context():
        admin = AdminUser.query.filter_by(email='admin@test.com').first()
        if not admin:
            admin = AdminUser(email='admin@test.com', is_active=True, session_timeout_minutes=60)
            admin.set_password('Admin@123')
            db.session.add(admin)
            db.session.commit()
        return admin.id


@pytest.fixture(scope='session')
def customer_user(db, app):
    with app.app_context():
        user = User.query.filter_by(email='customer@test.com').first()
        if not user:
            user = User(email='customer@test.com', role=UserRole.CUSTOMER)
            user.set_password('Customer@123')
            db.session.add(user)
            db.session.flush()
            account = VirtualAccount(user_id=user.id, balance=100000.0, initial_balance=100000.0)
            db.session.add(account)
            db.session.commit()
        return user.id


def get_token(client, email, password):
    resp = client.post('/api/auth/login', json={'email': email, 'password': password})
    return resp.get_json()['access_token']


def get_admin_token(app, admin_id):
    """Mint an admin JWT directly (admin login lives on the separate admin app)."""
    with app.app_context():
        return create_access_token(identity=str(admin_id), additional_claims={'actor': 'admin'})
