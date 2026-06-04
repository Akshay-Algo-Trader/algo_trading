import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'

// Admin
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './layouts/AdminLayout'
import Dashboard   from './pages/admin/Dashboard'
import Customers   from './pages/admin/Customers'
import Strategies      from './pages/admin/Strategies'
import StrategyEdit    from './pages/admin/StrategyEdit'
import CandlePatterns  from './pages/admin/CandlePatterns'
import KiteConfig  from './pages/admin/KiteConfig'
import Sessions    from './pages/admin/Sessions'
import Orders      from './pages/admin/Orders'
import Logs        from './pages/admin/Logs'

// Customer
import CustomerLogin     from './pages/customer/Login'
import CustomerSignup    from './pages/customer/Signup'
import CustomerLayout    from './layouts/CustomerLayout'
import CustomerDashboard  from './pages/customer/Dashboard'
import CustomerMarket     from './pages/customer/Market'
import CustomerStrategies from './pages/customer/Strategies'
import CustomerPortfolio  from './pages/customer/Portfolio'
import CustomerHistory    from './pages/customer/History'

function RequireAdminAuth() {
  const token = localStorage.getItem('access_token')
  if (!token) return <Navigate to="/admin/login" replace />
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
          <Route path="strategies"          element={<Strategies />} />
          <Route path="strategies/:id/edit" element={<StrategyEdit />} />
          <Route path="candle-patterns"     element={<CandlePatterns />} />
          <Route path="kite-config" element={<KiteConfig />} />
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
          <Route path="/portfolio"  element={<CustomerPortfolio />} />
          <Route path="/history"    element={<CustomerHistory />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
