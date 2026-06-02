import pytest
from tests.conftest import get_token


@pytest.fixture(scope='module')
def admin_token(client, admin_user):
    return get_token(client, 'admin@test.com', 'Admin@123')


@pytest.fixture(scope='module')
def customer_token(client, customer_user):
    return get_token(client, 'customer@test.com', 'Customer@123')


class TestListUsers:
    def test_admin_can_list_users(self, client, admin_token):
        resp = client.get('/api/admin/users',
                          headers={'Authorization': f'Bearer {admin_token}'})
        assert resp.status_code == 200
        assert 'users' in resp.get_json()

    def test_customer_cannot_list_users(self, client, customer_token):
        resp = client.get('/api/admin/users',
                          headers={'Authorization': f'Bearer {customer_token}'})
        assert resp.status_code == 403

    def test_unauthenticated_cannot_list_users(self, client):
        resp = client.get('/api/admin/users')
        assert resp.status_code == 401


class TestCreateUser:
    def test_create_user_success(self, client, admin_token):
        resp = client.post('/api/admin/users',
                           headers={'Authorization': f'Bearer {admin_token}'},
                           json={
                               'email': 'newcustomer@test.com',
                               'password': 'Pass@123',
                               'virtual_balance': 50000
                           })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['user']['email'] == 'newcustomer@test.com'
        assert data['user']['role'] == 'customer'

    def test_create_user_duplicate_email(self, client, admin_token):
        resp = client.post('/api/admin/users',
                           headers={'Authorization': f'Bearer {admin_token}'},
                           json={'email': 'newcustomer@test.com', 'password': 'Pass@123'})
        assert resp.status_code == 409

    def test_create_user_missing_fields(self, client, admin_token):
        resp = client.post('/api/admin/users',
                           headers={'Authorization': f'Bearer {admin_token}'},
                           json={'email': 'incomplete@test.com'})
        assert resp.status_code == 400


class TestUpdateUser:
    def test_toggle_active(self, client, admin_token, customer_user, app):
        resp = client.put(f'/api/admin/users/{customer_user}',
                          headers={'Authorization': f'Bearer {admin_token}'},
                          json={'is_active': False})
        assert resp.status_code == 200
        assert resp.get_json()['user']['is_active'] is False

        # Restore
        client.put(f'/api/admin/users/{customer_user}',
                   headers={'Authorization': f'Bearer {admin_token}'},
                   json={'is_active': True})


class TestResetVirtual:
    def test_reset_virtual_account(self, client, admin_token, customer_user):
        resp = client.post(f'/api/admin/users/{customer_user}/reset-virtual',
                           headers={'Authorization': f'Bearer {admin_token}'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['virtual_account']['total_realised_pnl'] == 0.0
