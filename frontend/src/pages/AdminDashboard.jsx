import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API = '';

function authHeaders() {
  const token = localStorage.getItem('access_token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function apiFetch(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/admin/login';
    return null;
  }
  return res.json();
}

function StatCard({ icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
    orange: 'text-orange-500',
  };
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm">{label}</p>
          <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
      {sub && <p className="text-gray-400 text-xs mt-2">{sub}</p>}
    </div>
  );
}

function Badge({ val, trueClass = 'bg-green-100 text-green-700', falseClass = 'bg-red-100 text-red-700', trueLabel = 'Yes', falseLabel = 'No' }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${val ? trueClass : falseClass}`}>
      {val ? trueLabel : falseLabel}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Table({ cols, rows, empty = 'No data.' }) {
  if (!rows.length) return <p className="text-gray-400 text-sm">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="bg-gray-50 text-gray-500 uppercase text-xs">
            {cols.map((c) => <th key={c} className="px-4 py-2">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows}
        </tbody>
      </table>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const TABS = ['Overview', 'Users', 'Kite', 'Sessions', 'Orders', 'Strategies', 'Logs'];

// ─── Kite Connection Manager ─────────────────────────────────────────────────

function KiteTab({ users, configs, onRefresh }) {
  const customerUsers = users.filter((u) => u.role === 'customer');
  const configMap = Object.fromEntries(configs.map((c) => [c.user_id, c]));

  const [formState, setFormState] = useState(() =>
    Object.fromEntries(configs.map((c) => [c.user_id, { api_key: c.api_key || '', api_secret: c.api_secret || '' }]))
  );
  const [saving, setSaving] = useState({});
  const [loginUrl, setLoginUrl] = useState({});  // { [userId]: url }
  const [loadingUrl, setLoadingUrl] = useState({});
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState({});

  useEffect(() => {
    setFormState(
      Object.fromEntries(configs.map((c) => [c.user_id, { api_key: c.api_key || '', api_secret: c.api_secret || '' }]))
    );
  }, [configs]);

  function getForm(userId) {
    return formState[userId] || { api_key: '', api_secret: '' };
  }

  function setField(userId, field, value) {
    setFormState((prev) => ({
      ...prev,
      [userId]: { ...getForm(userId), [field]: value },
    }));
  }

  async function handleSave(userId) {
    const { api_key, api_secret } = getForm(userId);
    if (!api_key.trim() || !api_secret.trim()) {
      setErrors((e) => ({ ...e, [userId]: 'Both API Key and API Secret are required.' }));
      return;
    }
    setSaving((s) => ({ ...s, [userId]: true }));
    setErrors((e) => ({ ...e, [userId]: null }));
    setSuccess((s) => ({ ...s, [userId]: null }));

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`/api/admin/kite/config/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ api_key: api_key.trim(), api_secret: api_secret.trim() }),
      });
      console.log(res);
      const data = await res.json();
      if (res.ok) {
        setSuccess((s) => ({ ...s, [userId]: 'Credentials saved successfully.' }));
        onRefresh();
      } else {
        setErrors((e) => ({ ...e, [userId]: data.error || 'Failed to save.' }));
      }
    } catch {
      setErrors((e) => ({ ...e, [userId]: 'Network error.' }));
    } finally {
      setSaving((s) => ({ ...s, [userId]: false }));
    }
  }

  async function handleGetLoginUrl(userId) {
    setLoadingUrl((l) => ({ ...l, [userId]: true }));
    setErrors((e) => ({ ...e, [userId]: null }));
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`/api/admin/kite/login-url/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLoginUrl((u) => ({ ...u, [userId]: data.login_url }));
      } else {
        setErrors((e) => ({ ...e, [userId]: data.error || 'Could not generate login URL.' }));
      }
    } catch {
      setErrors((e) => ({ ...e, [userId]: 'Network error.' }));
    } finally {
      setLoadingUrl((l) => ({ ...l, [userId]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Kite Connect — API Management</h2>
        <p className="text-sm text-gray-500">{configs.length} configured · {configs.filter(c => c.is_connected).length} connected</p>
      </div>

      {customerUsers.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg p-4 text-sm">
          No customer accounts found. Create customer users first.
        </div>
      )}

      <div className="space-y-4">
        {customerUsers.map((user) => {
          const cfg = configMap[user.id];
          const form = getForm(user.id);
          const url = loginUrl[user.id];

          return (
            <div key={user.id} className="bg-white rounded-lg shadow border border-gray-100">
              {/* User header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                    {user.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{user.email}</p>
                    <p className="text-xs text-gray-400">User ID: {user.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cfg ? (
                    <>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.is_connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {cfg.is_connected ? '● Connected' : '○ Disconnected'}
                      </span>
                      {cfg.api_key_masked && (
                        <span className="text-xs text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded">
                          Key: {cfg.api_key_masked}
                        </span>
                      )}
                      {cfg.token_generated_at && (
                        <span className="text-xs text-gray-400">
                          Token: {new Date(cfg.token_generated_at).toLocaleDateString()}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
                      Not configured
                    </span>
                  )}
                </div>
              </div>

              {/* Form body */}
              <div className="px-6 py-4 space-y-4">
                {errors[user.id] && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-2">
                    {errors[user.id]}
                  </div>
                )}
                {success[user.id] && (
                  <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded px-4 py-2">
                    {success[user.id]}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      API Key
                    </label>
                    <input
                      type="text"
                      placeholder={cfg?.api_key_masked ? `Current: ${cfg.api_key_masked}` : 'Enter Kite API Key'}
                      value={form.api_key}
                      onChange={(e) => setField(user.id, 'api_key', e.target.value)}
                      autoComplete="off"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      API Secret
                    </label>
                    <input
                      type="password"
                      placeholder="Enter Kite API Secret"
                      value={form.api_secret}
                      onChange={(e) => setField(user.id, 'api_secret', e.target.value)}
                      autoComplete="new-password"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleSave(user.id)}
                    disabled={saving[user.id]}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {saving[user.id] ? 'Saving…' : cfg ? '↻ Update Credentials' : '+ Save Credentials'}
                  </button>

                  {cfg && (
                    <button
                      onClick={() => handleGetLoginUrl(user.id)}
                      disabled={loadingUrl[user.id]}
                      className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      {loadingUrl[user.id] ? 'Generating…' : '🔑 Get Kite Login URL'}
                    </button>
                  )}
                </div>

                {/* Login URL display */}
                {url && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Kite OAuth Login URL</p>
                    <p className="text-xs text-gray-500">Share this URL with the user to complete Kite authentication:</p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={url}
                        className="flex-1 text-xs font-mono bg-white border border-blue-200 rounded px-3 py-2 text-gray-700 select-all"
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(url)}
                        className="text-xs bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 whitespace-nowrap"
                      >
                        Copy
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 whitespace-nowrap"
                      >
                        Open ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [kiteNotif, setKiteNotif] = useState(null); // { type: 'success'|'error', msg }
  const [tab, setTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    users: [],
    sessions: [],
    liveOrders: [],
    paperOrders: [],
    strategies: [],
    logs: [],
    kiteConfigs: [],
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [users, sessions, liveOrders, paperOrders, strategies, logs, kiteConfigs] = await Promise.all([
      apiFetch('/api/admin/users'),
      apiFetch('/api/admin/sessions'),
      apiFetch('/api/admin/orders/live'),
      apiFetch('/api/admin/orders/paper'),
      apiFetch('/api/admin/strategies'),
      apiFetch('/api/admin/logs'),
      apiFetch('/api/admin/kite/config'),
    ]);
    setData({
      users: users?.users || [],
      sessions: sessions?.sessions || [],
      liveOrders: liveOrders?.orders || [],
      paperOrders: paperOrders?.orders || [],
      strategies: strategies?.strategies || [],
      logs: logs?.logs || [],
      kiteConfigs: kiteConfigs?.configs || [],
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Handle Kite OAuth callback redirect params
  useEffect(() => {
    const kiteStatus = searchParams.get('kite_status');
    if (!kiteStatus) return;
    if (kiteStatus === 'connected') {
      setKiteNotif({ type: 'success', msg: 'Kite connected successfully!' });
      setTab('Kite');
      fetchAll();
    } else if (kiteStatus === 'error') {
      const msg = searchParams.get('kite_msg') || 'Kite login failed.';
      setKiteNotif({ type: 'error', msg });
    } else if (kiteStatus === 'failed') {
      setKiteNotif({ type: 'error', msg: 'Could not exchange Kite token. Check API Key and Secret.' });
    }
    // Remove params from URL without navigation
    setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    navigate('/admin/login');
  };

  const activeSessions = data.sessions.filter((s) => s.status === 'active').length;
  const kiteConnected = data.users.filter((u) => u.kite_connected).length;
  const activeUsers = data.users.filter((u) => u.is_active).length;

  const fmt = (iso) => iso ? new Date(iso).toLocaleString() : '—';

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Kite OAuth notification */}
      {kiteNotif && (
        <div className={`px-6 py-3 text-sm font-medium flex items-center justify-between ${kiteNotif.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          <span>{kiteNotif.type === 'success' ? '✓' : '✗'} {kiteNotif.msg}</span>
          <button onClick={() => setKiteNotif(null)} className="ml-4 opacity-75 hover:opacity-100 font-bold">✕</button>
        </div>
      )}

      {/* Top Nav */}
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">AlgoTrader Admin</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchAll}
              className="text-sm text-gray-500 hover:text-blue-600 font-medium"
            >
              ↻ Refresh
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-1.5 rounded font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-52 bg-gray-900 text-white flex-shrink-0">
          <div className="p-4 border-b border-gray-700">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Navigation</p>
          </div>
          <nav className="p-3 space-y-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`w-full text-left px-4 py-2 rounded text-sm font-medium transition-colors ${
                  tab === t ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                {{ Overview: '📊', Users: '👥', Kite: '🔗', Sessions: '🔄', Orders: '📋', Strategies: '🧠', Logs: '📝' }[t]}{' '}
                {t}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 p-8 overflow-auto">
          {loading ? (
            <Spinner />
          ) : (
            <>
              {/* OVERVIEW */}
              {tab === 'Overview' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-800">Overview</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard icon="👥" label="Total Users" value={data.users.length} sub={`${activeUsers} active`} color="blue" />
                    <StatCard icon="🔄" label="Active Sessions" value={activeSessions} sub={`of ${data.sessions.length} total`} color="green" />
                    <StatCard icon="📋" label="Live Orders" value={data.liveOrders.length} sub={`${data.paperOrders.length} paper`} color="purple" />
                    <StatCard icon="🔗" label="Kite Connected" value={kiteConnected} sub={`of ${data.users.length} users`} color="orange" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Section title="Recent Sessions">
                      <Table
                        cols={['User', 'Strategy', 'Mode', 'Status', 'Started']}
                        rows={data.sessions.slice(0, 5).map((s) => (
                          <tr key={s.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-700">{s.user_id}</td>
                            <td className="px-4 py-2 text-gray-700">{s.strategy_id}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.mode === 'live' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                {s.mode}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {s.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{fmt(s.started_at)}</td>
                          </tr>
                        ))}
                      />
                    </Section>

                    <Section title="Recent Live Orders">
                      <Table
                        cols={['Symbol', 'Type', 'Qty', 'Status', 'Placed']}
                        empty="No live orders yet."
                        rows={data.liveOrders.slice(0, 5).map((o) => (
                          <tr key={o.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-800">{o.symbol}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${o.transaction_type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {o.transaction_type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-700">{o.quantity}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{o.status}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{fmt(o.placed_at)}</td>
                          </tr>
                        ))}
                      />
                    </Section>
                  </div>
                </div>
              )}

              {/* USERS */}
              {tab === 'Users' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-800">Users ({data.users.length})</h2>
                  <Section title="All Users">
                    <Table
                      cols={['ID', 'Email', 'Role', 'Active', 'Kite', 'Joined']}
                      rows={data.users.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs">{u.id}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{u.email}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge val={u.is_active} trueLabel="Active" falseLabel="Inactive" />
                          </td>
                          <td className="px-4 py-3">
                            <Badge val={u.kite_connected} trueLabel="Connected" falseLabel="Not connected" falseClass="bg-gray-100 text-gray-500" />
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fmt(u.created_at)}</td>
                        </tr>
                      ))}
                    />
                  </Section>
                </div>
              )}

              {/* KITE */}
              {tab === 'Kite' && (
                <KiteTab users={data.users} configs={data.kiteConfigs} onRefresh={fetchAll} />
              )}

              {/* SESSIONS */}
              {tab === 'Sessions' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-800">Sessions ({data.sessions.length})</h2>
                  <Section title="All Trading Sessions">
                    <Table
                      cols={['ID', 'User', 'Strategy', 'Mode', 'Status', 'Started', 'Stopped']}
                      empty="No sessions found."
                      rows={data.sessions.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs">{s.id}</td>
                          <td className="px-4 py-3 text-gray-700">{s.user_id}</td>
                          <td className="px-4 py-3 text-gray-700">{s.strategy_id}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.mode === 'live' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                              {s.mode}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fmt(s.started_at)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fmt(s.stopped_at)}</td>
                        </tr>
                      ))}
                    />
                  </Section>
                </div>
              )}

              {/* ORDERS */}
              {tab === 'Orders' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-800">Orders</h2>
                  <Section title={`Live Orders (${data.liveOrders.length})`}>
                    <Table
                      cols={['ID', 'User', 'Symbol', 'Exchange', 'Type', 'Qty', 'Price', 'Status', 'Placed']}
                      empty="No live orders."
                      rows={data.liveOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs">{o.id}</td>
                          <td className="px-4 py-3 text-gray-700">{o.user_id}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{o.symbol}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{o.exchange}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${o.transaction_type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {o.transaction_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{o.quantity}</td>
                          <td className="px-4 py-3 text-gray-700">{o.price ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{o.status}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fmt(o.placed_at)}</td>
                        </tr>
                      ))}
                    />
                  </Section>

                  <Section title={`Paper Orders (${data.paperOrders.length})`}>
                    <Table
                      cols={['ID', 'User', 'Symbol', 'Exchange', 'Type', 'Qty', 'Fill Price', 'Status', 'Created']}
                      empty="No paper orders."
                      rows={data.paperOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs">{o.id}</td>
                          <td className="px-4 py-3 text-gray-700">{o.user_id}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{o.symbol}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{o.exchange}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${o.transaction_type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {o.transaction_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{o.quantity}</td>
                          <td className="px-4 py-3 text-gray-700">{o.fill_price ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{o.status}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fmt(o.created_at)}</td>
                        </tr>
                      ))}
                    />
                  </Section>
                </div>
              )}

              {/* STRATEGIES */}
              {tab === 'Strategies' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-800">Strategies ({data.strategies.length})</h2>
                  <Section title="All Strategies">
                    <Table
                      cols={['ID', 'Name', 'Instrument', 'Exchange', 'Order Type', 'Qty', 'SL%', 'TP%', 'Active']}
                      empty="No strategies configured."
                      rows={data.strategies.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs">{s.id}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                          <td className="px-4 py-3 text-gray-700">{s.instrument}</td>
                          <td className="px-4 py-3 text-gray-700">{s.exchange}</td>
                          <td className="px-4 py-3 text-gray-700">{s.order_type}</td>
                          <td className="px-4 py-3 text-gray-700">{s.quantity}</td>
                          <td className="px-4 py-3 text-red-600">{s.stop_loss_pct}%</td>
                          <td className="px-4 py-3 text-green-600">{s.take_profit_pct}%</td>
                          <td className="px-4 py-3">
                            <Badge val={s.is_active} trueLabel="Active" falseLabel="Inactive" />
                          </td>
                        </tr>
                      ))}
                    />
                  </Section>
                </div>
              )}

              {/* LOGS */}
              {tab === 'Logs' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-800">Audit Logs ({data.logs.length})</h2>
                  <Section title="Recent Activity">
                    <Table
                      cols={['ID', 'User', 'Event', 'Mode', 'Time']}
                      empty="No logs found."
                      rows={data.logs.map((l) => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs">{l.id}</td>
                          <td className="px-4 py-3 text-gray-700">{l.user_id ?? '—'}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{l.event_type}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{l.mode ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fmt(l.created_at)}</td>
                        </tr>
                      ))}
                    />
                  </Section>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
