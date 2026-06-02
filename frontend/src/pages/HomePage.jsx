import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800">
      {/* Navigation */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">AlgoTrader</h1>
          <div className="space-x-4">
            <Link to="/" className="text-gray-700 hover:text-blue-600 font-semibold">
              Home
            </Link>
            <a href="http://localhost:8000/admin/login" className="text-gray-700 hover:text-blue-600 font-semibold">
              Admin Login
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-20 text-center text-white">
        <h2 className="text-5xl font-bold mb-6">Algorithmic Trading Platform</h2>
        <p className="text-xl mb-8 text-blue-100">
          Automate your trading strategies with advanced algorithms and real-time market data
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          {/* Feature 1 */}
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-2xl font-bold mb-3">Fast Execution</h3>
            <p className="text-blue-100">
              Execute trades in milliseconds with our optimized infrastructure
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-2xl font-bold mb-3">Real-time Analytics</h3>
            <p className="text-blue-100">
              Monitor your portfolio and strategies with live charts and metrics
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-2xl font-bold mb-3">Secure & Reliable</h3>
            <p className="text-blue-100">
              Bank-grade security with encrypted connections and data protection
            </p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="mt-16 space-x-4">
          <button className="bg-white text-blue-600 px-8 py-3 rounded-lg font-bold hover:bg-blue-50 transition">
            Get Started
          </button>
          <button className="border-2 border-white text-white px-8 py-3 rounded-lg font-bold hover:bg-white hover:bg-opacity-10 transition">
            Learn More
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-white bg-opacity-5 py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-center text-white">
          <div>
            <div className="text-4xl font-bold">10K+</div>
            <p className="text-blue-100">Active Traders</p>
          </div>
          <div>
            <div className="text-4xl font-bold">$500M+</div>
            <p className="text-blue-100">Assets Managed</p>
          </div>
          <div>
            <div className="text-4xl font-bold">99.9%</div>
            <p className="text-blue-100">Uptime</p>
          </div>
          <div>
            <div className="text-4xl font-bold">24/7</div>
            <p className="text-blue-100">Support</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-blue-900 text-blue-100 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p>&copy; 2026 AlgoTrader. All rights reserved.</p>
          <p className="mt-2 text-sm">Backend API: http://localhost:5000/api/health</p>
        </div>
      </footer>
    </div>
  );
}
