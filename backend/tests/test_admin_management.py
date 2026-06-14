import base64
import json
import pytest
from tests.conftest import get_token, get_admin_token


@pytest.fixture(scope='module')
def admin_token(app, admin_user):
    return get_admin_token(app, admin_user)


@pytest.fixture(scope='module')
def customer_token(client, customer_user):
    return get_token(client, 'customer@test.com', 'Customer@123')


def _cleanup(app, db, email):
    from app.models import AdminUser
    with app.app_context():
        a = AdminUser.query.filter_by(email=email).first()
        if a:
            db.session.delete(a)
            db.session.commit()


class TestActorClaim:
    def test_customer_blocked_from_admin_users(self, client, customer_token):
        resp = client.get('/api/admin/admin-users',
                          headers={'Authorization': f'Bearer {customer_token}'})
        assert resp.status_code == 403

    def test_admin_can_list(self, client, admin_token):
        resp = client.get('/api/admin/admin-users',
                          headers={'Authorization': f'Bearer {admin_token}'})
        assert resp.status_code == 200
        assert 'admins' in resp.get_json()


class TestCreateAndPassword:
    def test_create_then_change_password(self, client, admin_token, app, db):
        email = 'mgmt_target@test.com'
        _cleanup(app, db, email)

        # create
        resp = client.post('/api/admin/admin-users',
                           headers={'Authorization': f'Bearer {admin_token}'},
                           json={'email': email, 'password': 'Target@123', 'session_timeout_minutes': 30})
        assert resp.status_code == 201
        target_id = resp.get_json()['admin']['id']

        # acting admin's WRONG current password → 401
        bad = client.post(f'/api/admin/admin-users/{target_id}/change-password',
                          headers={'Authorization': f'Bearer {admin_token}'},
                          json={'current_password': 'WRONG', 'new_password': 'BrandNew@123'})
        assert bad.status_code == 401

        # acting admin's correct current password → 200
        ok = client.post(f'/api/admin/admin-users/{target_id}/change-password',
                         headers={'Authorization': f'Bearer {admin_token}'},
                         json={'current_password': 'Admin@123', 'new_password': 'BrandNew@123'})
        assert ok.status_code == 200

        _cleanup(app, db, email)

    def test_short_password_rejected(self, client, admin_token, app, db):
        email = 'mgmt_short@test.com'
        _cleanup(app, db, email)
        resp = client.post('/api/admin/admin-users',
                           headers={'Authorization': f'Bearer {admin_token}'},
                           json={'email': email, 'password': 'short'})
        assert resp.status_code == 400


class TestPerAdminTimeout:
    def test_timeout_baked_into_login_token(self, client, app, db):
        from app.models import AdminUser
        email = 'mgmt_timeout@test.com'
        _cleanup(app, db, email)
        with app.app_context():
            a = AdminUser(email=email, is_active=True, session_timeout_minutes=1)
            a.set_password('Timeout@123')
            db.session.add(a)
            db.session.commit()
            from flask_jwt_extended import create_access_token, decode_token
            from datetime import timedelta
            token = create_access_token(identity=str(a.id), additional_claims={'actor': 'admin'},
                                        expires_delta=timedelta(minutes=a.session_timeout_minutes))
            claims = decode_token(token)
            assert claims['exp'] - claims['iat'] == 60
        _cleanup(app, db, email)


class TestSelfProtection:
    def test_cannot_delete_self(self, client, admin_token, admin_user):
        resp = client.delete(f'/api/admin/admin-users/{admin_user}',
                             headers={'Authorization': f'Bearer {admin_token}'})
        assert resp.status_code == 400
