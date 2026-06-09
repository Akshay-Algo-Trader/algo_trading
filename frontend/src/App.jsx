import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'

// Admin
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './layouts/AdminLayout'
import Dashboard   from './pages/admin/Dashboard'
import Customers   from './pages/admin/Customers'
import Strategies      from './pages/admin/Strategies'
import StrategyEdit    from './pages/admin/StrategyEdit'
import CandlePatterns     from './pages/admin/CandlePatterns'
import CandlePatternEdit  from './pages/admin/CandlePatternEdit'
import Zones           from './pages/admin/Zones'
import ZoneEdit        from './pages/admin/ZoneEdit'
import ZoneScan        from './pages/admin/ZoneScan'
import ZoneScanDetail  from './pages/admin/ZoneScanDetail'
import FvgZones        from './pages/admin/FvgZones'
import FvgZoneEdit     from './pages/admin/FvgZoneEdit'
import FvgZoneScan     from './pages/admin/FvgZoneScan'
import FvgZoneScanDetail from './pages/admin/FvgZoneScanDetail'
import SwingZones        from './pages/admin/SwingZones'
import SwingZoneNew      from './pages/admin/SwingZoneNew'
import SwingZoneEdit     from './pages/admin/SwingZoneEdit'
import SwingZoneScanDetail from './pages/admin/SwingZoneScanDetail'
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
import CustomerPortfolio  from './pages/customer/Portfolio'
import CustomerHistory    from './pages/customer/History'
import CustomerBacktest   from './pages/customer/Backtest'

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
          <Route path="candle-patterns"              element={<CandlePatterns />} />
          <Route path="candle-patterns/:id/edit"   element={<CandlePatternEdit />} />
          <Route path="zones"                     element={<Zones />} />
          <Route path="zones/:id/edit"           element={<ZoneEdit />} />
          <Route path="zones/:id/scan"           element={<ZoneScan />} />
          <Route path="zones/:id/scan/:resultId" element={<ZoneScanDetail />} />
          <Route path="fvg-zones"                        element={<FvgZones />} />
          <Route path="fvg-zones/:id/edit"              element={<FvgZoneEdit />} />
          <Route path="fvg-zones/:id/scan"              element={<FvgZoneScan />} />
          <Route path="fvg-zones/:id/scan/:resultId"    element={<FvgZoneScanDetail />} />
          <Route path="swing-zones"                        element={<SwingZones />} />
          <Route path="swing-zones/new"                   element={<SwingZoneNew />} />
          <Route path="swing-zones/:id/edit"              element={<SwingZoneEdit />} />
          <Route path="swing-zones/:id/scan/:resultId"    element={<SwingZoneScanDetail />} />
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
          <Route path="/portfolio"  element={<CustomerPortfolio />} />
          <Route path="/history"    element={<CustomerHistory />} />
          <Route path="/backtest"   element={<CustomerBacktest />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
