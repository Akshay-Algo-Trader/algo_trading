import pytest
from tests.conftest import get_token


class TestLogin:
    def test_login_success(self, client, admin_user, app):
        resp = client.post('/api/auth/login', json={
            'email': 'admin@test.com',
            'password': 'Admin@123'
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'access_token' in data
        assert 'refresh_token' in data
        assert data['user']['role'] == 'admin'

    def test_login_wrong_password(self, client, admin_user):
        resp = client.post('/api/auth/login', json={
            'email': 'admin@test.com',
            'password': 'wrong'
        })
        assert resp.status_code == 401

    def test_login_missing_fields(self, client):
        resp = client.post('/api/auth/login', json={'email': 'admin@test.com'})
        assert resp.status_code == 400

    def test_login_unknown_email(self, client):
        resp = client.post('/api/auth/login', json={
            'email': 'nobody@test.com',
            'password': 'whatever'
        })
        assert resp.status_code == 401


class TestMe:
    def test_me_returns_profile(self, client, admin_user, app):
        token = get_token(client, 'admin@test.com', 'Admin@123')
        resp = client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.get_json()['user']['email'] == 'admin@test.com'

    def test_me_requires_auth(self, client):
        resp = client.get('/api/auth/me')
        assert resp.status_code == 401


class TestRefresh:
    def test_refresh_returns_new_token(self, client, admin_user):
        login = client.post('/api/auth/login', json={
            'email': 'admin@test.com',
            'password': 'Admin@123'
        }).get_json()
        refresh_token = login['refresh_token']
        resp = client.post('/api/auth/refresh',
                           headers={'Authorization': f'Bearer {refresh_token}'})
        assert resp.status_code == 200
        assert 'access_token' in resp.get_json()


class TestLogout:
    def test_logout_returns_200(self, client, admin_user):
        token = get_token(client, 'admin@test.com', 'Admin@123')
        resp = client.post('/api/auth/logout',
                           headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
