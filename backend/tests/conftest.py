import os
import pytest

os.environ['ENCRYPTION_KEY'] = 'test-encryption-key-32-chars-1234'
os.environ['DATABASE_URL'] = 'mysql+mysqldb://akshay:akshay%40123@172.26.116.195:3306/algotrader'

from app import create_app
from app.extensions import db as _db
from app.models import User, UserRole, VirtualAccount


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
    with app.app_context():
        user = User.query.filter_by(email='admin@test.com').first()
        if not user:
            user = User(email='admin@test.com', role=UserRole.ADMIN)
            user.set_password('Admin@123')
            db.session.add(user)
            db.session.commit()
        return user.id


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
