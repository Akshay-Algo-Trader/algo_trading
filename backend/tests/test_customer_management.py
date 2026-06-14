import pytest
from tests.conftest import get_token, get_admin_token


@pytest.fixture(scope='module')
def admin_token(app, admin_user):
    return get_admin_token(app, admin_user)


@pytest.fixture(scope='module')
def customer_token(client, customer_user):
    return get_token(client, 'customer@test.com', 'Customer@123')


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


class TestUserDetail:
    def test_get_user_detail(self, client, admin_token, customer_user):
        resp = client.get(f'/api/admin/users/{customer_user}', headers=_auth(admin_token))
        assert resp.status_code == 200
        u = resp.get_json()['user']
        assert u['id'] == customer_user
        assert u['virtual_account'] is not None
        assert 'kite_connected' in u

    def test_get_user_404(self, client, admin_token):
        resp = client.get('/api/admin/users/99999999', headers=_auth(admin_token))
        assert resp.status_code == 404


class TestUserOrders:
    def test_orders_shape(self, client, admin_token, customer_user):
        resp = client.get(f'/api/admin/users/{customer_user}/orders', headers=_auth(admin_token))
        assert resp.status_code == 200
        assert isinstance(resp.get_json()['orders'], list)


class TestVirtualMoney:
    def test_set_then_adjust_logs_ledger(self, client, admin_token, customer_user):
        # Baseline
        r = client.post(f'/api/admin/users/{customer_user}/virtual/set',
                        headers=_auth(admin_token), json={'balance': 100000, 'note': 'baseline'})
        assert r.status_code == 200
        assert r.get_json()['virtual_account']['balance'] == 100000

        # Credit
        r = client.post(f'/api/admin/users/{customer_user}/virtual/adjust',
                        headers=_auth(admin_token), json={'amount': 25000, 'note': 'topup'})
        assert r.status_code == 200
        assert r.get_json()['virtual_account']['balance'] == 125000

        # Debit
        r = client.post(f'/api/admin/users/{customer_user}/virtual/adjust',
                        headers=_auth(admin_token), json={'amount': -5000})
        assert r.status_code == 200
        assert r.get_json()['virtual_account']['balance'] == 120000

        # Ledger reflects the latest debit and records the acting admin's email
        r = client.get(f'/api/admin/users/{customer_user}/virtual/transactions', headers=_auth(admin_token))
        assert r.status_code == 200
        txns = r.get_json()['transactions']
        assert len(txns) >= 3
        latest = txns[0]
        assert latest['amount'] == -5000
        assert latest['balance_after'] == 120000
        assert latest['kind'] == 'withdraw'
        assert latest['created_by_email'] == 'admin@test.com'

    def test_adjust_zero_rejected(self, client, admin_token, customer_user):
        r = client.post(f'/api/admin/users/{customer_user}/virtual/adjust',
                        headers=_auth(admin_token), json={'amount': 0})
        assert r.status_code == 400

    def test_adjust_overdraw_rejected(self, client, admin_token, customer_user):
        client.post(f'/api/admin/users/{customer_user}/virtual/set',
                    headers=_auth(admin_token), json={'balance': 1000})
        r = client.post(f'/api/admin/users/{customer_user}/virtual/adjust',
                        headers=_auth(admin_token), json={'amount': -5000})
        assert r.status_code == 400

    def test_set_negative_rejected(self, client, admin_token, customer_user):
        r = client.post(f'/api/admin/users/{customer_user}/virtual/set',
                        headers=_auth(admin_token), json={'balance': -1})
        assert r.status_code == 400

    def test_reset_logs_ledger(self, client, admin_token, customer_user):
        r = client.post(f'/api/admin/users/{customer_user}/reset-virtual', headers=_auth(admin_token))
        assert r.status_code == 200
        acct = r.get_json()['virtual_account']
        assert acct['balance'] == acct['initial_balance']

        r = client.get(f'/api/admin/users/{customer_user}/virtual/transactions', headers=_auth(admin_token))
        assert 'reset' in [t['kind'] for t in r.get_json()['transactions']]

    def test_customer_blocked_from_adjust(self, client, customer_token, customer_user):
        r = client.post(f'/api/admin/users/{customer_user}/virtual/adjust',
                        headers=_auth(customer_token), json={'amount': 100})
        assert r.status_code == 403
