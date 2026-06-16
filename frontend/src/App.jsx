import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'

// Admin
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './layouts/AdminLayout'
import Dashboard   from './pages/admin/Dashboard'
import Customers   from './pages/admin/Customers'
import CustomerEdit from './pages/admin/CustomerEdit'
import AdminUsers  from './pages/admin/AdminUsers'
import Strategies      from './pages/admin/Strategies'
import StrategyEdit    from './pages/admin/StrategyEdit'
import SwingZones        from './pages/admin/SwingZones'
import SwingZoneNew      from './pages/admin/SwingZoneNew'
import SwingZoneEdit     from './pages/admin/SwingZoneEdit'
import SwingZoneScanDetail from './pages/admin/SwingZoneScanDetail'
import SwingLevelScanner from './pages/admin/SwingLevelScanner'
import KiteConfig  from './pages/admin/KiteConfig'
import Sessions    from './pages/admin/Sessions'
import Orders      from './pages/admin/Orders'
import Logs        from './pages/admin/Logs'
import AdminBacktest from './pages/admin/Backtest'

// Customer
import CustomerLogin     from './pages/customer/Login'
import CustomerSignup    from './pages/customer/Signup'
import CustomerLayout    from './layouts/CustomerLayout'
import CustomerDashboard  from './pages/customer/Dashboard'
import CustomerMarket     from './pages/customer/Market'
import CustomerStrategies from './pages/customer/Strategies'
import CustomerReplay     from './pages/customer/Replay'
import CustomerPortfolio  from './pages/customer/Portfolio'
import CustomerHistory    from './pages/customer/History'
import CustomerBacktest   from './pages/customer/Backtest'

// Decode a JWT payload (base64url) without verifying its signature. Used only
// to decide which shell to render — the backend re-checks the `actor` claim on
// every /api/admin/* request, so this is a UX gate, not a security boundary.
function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

function RequireAdminAuth() {
  const token = localStorage.getItem('access_token')
  // Require an admin-actor token (mirrors the backend's admin_required). A
  // leftover customer token must not load the admin shell — otherwise every
  // /api/admin/* call 403s and the pages just show "Failed to load".
  if (!token || decodeJwt(token)?.actor !== 'admin') {
    return <Navigate to="/admin/login" replace />
  }
  return <AdminLayout />
}

function RequireCustomerAuth() {
  const token = localStorage.getItem('access_token')
  if (!token) return <Navigate to="/login" replace />
  return <CustomerLayout />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<HomePage />} />

        {/* Admin auth */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Admin protected */}
        <Route path="/admin" element={<RequireAdminAuth />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"   element={<Dashboard />} />
          <Route path="customers"   element={<Customers />} />
          <Route path="customers/:id/edit" element={<CustomerEdit />} />
          <Route path="admin-users" element={<AdminUsers />} />
          <Route path="strategies"          element={<Strategies />} />
          <Route path="strategies/:id/edit" element={<StrategyEdit />} />
          <Route path="swing-zones"                        element={<SwingZones />} />
          <Route path="swing-zones/new"                   element={<SwingZoneNew />} />
          <Route path="swing-zones/:id/edit"              element={<SwingZoneEdit />} />
          <Route path="swing-zones/:id/scan/:resultId"    element={<SwingZoneScanDetail />} />
          <Route path="swing-scan"                         element={<SwingLevelScanner />} />
          <Route path="kite-config" element={<KiteConfig />} />
          <Route path="backtest"    element={<AdminBacktest />} />
          <Route path="sessions"    element={<Sessions />} />
          <Route path="orders"      element={<Orders />} />
          <Route path="logs"        element={<Logs />} />
        </Route>

        {/* Customer auth */}
        <Route path="/login"  element={<CustomerLogin />} />
        <Route path="/signup" element={<CustomerSignup />} />

        {/* Customer protected */}
        <Route element={<RequireCustomerAuth />}>
          <Route path="/dashboard"  element={<CustomerDashboard />} />
          <Route path="/market"     element={<CustomerMarket />} />
          <Route path="/strategies" element={<CustomerStrategies />} />
          <Route path="/replay"     element={<CustomerReplay />} />
          <Route path="/portfolio"  element={<CustomerPortfolio />} />
          <Route path="/history"    element={<CustomerHistory />} />
          <Route path="/backtest"   element={<CustomerBacktest />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
