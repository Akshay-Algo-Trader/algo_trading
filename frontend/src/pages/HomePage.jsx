import { Link } from 'react-router-dom';

const CANDLE_PATTERNS = [
  {
    name: 'Breakout A — Bullish',
    direction: 'bullish',
    market: 'Nifty / Sensex Options',
    timeframes: '1D · 4H · 1H · 30M · 15M · 5M · 3M',
    description: '2–3 day consolidation breakout. Enter above range on 3M/5M close. ATM near-expiry options.',
    rules: [
      '3-day highs within 0.15%–0.4% of each other',
      'Daily close near day\'s high (0.10%–0.50%)',
      'No resistance within 0.5% above range',
      'Ascending CPR · Price above TC · RSI 57–70',
    ],
    targets: ['Nifty: 18–20 pts (T1), 35–40 pts (T2)', 'Sensex: 50 pts (T1), 100 pts (T2)', 'Index: 0.30% (T1), 0.45% (T2)'],
  },
  {
    name: 'Breakout A — Bearish',
    direction: 'bearish',
    market: 'Nifty / Sensex Options',
    timeframes: '1D · 4H · 1H · 30M · 15M · 5M · 3M',
    description: '2–3 day consolidation breakdown. Enter below range on 3M/5M close. ATM near-expiry options.',
    rules: [
      '3-day lows within 0.15%–0.4% of each other',
      'Daily close near day\'s low (0.10%–0.50%)',
      'No support within 0.5% below range',
      'Descending CPR · Price below BC · RSI 30–45',
    ],
    targets: ['Nifty: 18–20 pts (T1), 35–40 pts (T2)', 'Sensex: 50 pts (T1), 100 pts (T2)', 'Index: 0.30% (T1), 0.45% (T2)'],
  },
];

function PatternCard({ pattern }) {
  const isBullish = pattern.direction === 'bullish';
  return (
    <div className={`bg-white rounded-xl shadow-lg overflow-hidden border-t-4 ${isBullish ? 'border-green-500' : 'border-red-500'}`}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-gray-900 text-lg leading-tight">{pattern.name}</h3>
          <span className={`flex-shrink-0 ml-3 text-xs px-2.5 py-1 rounded-full font-semibold ${isBullish ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {isBullish ? '▲ Bullish' : '▼ Bearish'}
          </span>
        </div>

        <p className="text-sm text-gray-500 mb-1 font-medium">{pattern.market}</p>
        <p className="text-xs text-gray-400 mb-4">{pattern.timeframes}</p>
        <p className="text-sm text-gray-700 mb-4 leading-relaxed">{pattern.description}</p>

        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Setup Rules</p>
          <ul className="space-y-1">
            {pattern.rules.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className={`mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${isBullish ? 'bg-green-400' : 'bg-red-400'}`} />
                {r}
              </li>
            ))}
          </ul>
        </div>

        <div className={`rounded-lg p-3 ${isBullish ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Targets</p>
          {pattern.targets.map((t, i) => (
            <p key={i} className={`text-xs font-medium ${isBullish ? 'text-green-700' : 'text-red-700'}`}>{t}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

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
          Automate your trading strategies with advanced candle patterns and real-time market data
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-2xl font-bold mb-3">Fast Execution</h3>
            <p className="text-blue-100">Execute trades in milliseconds with our optimized infrastructure</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-2xl font-bold mb-3">Real-time Analytics</h3>
            <p className="text-blue-100">Monitor your portfolio and strategies with live charts and metrics</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8">
            <div className="text-4xl mb-4">🕯️</div>
            <h3 className="text-2xl font-bold mb-3">Candle Patterns</h3>
            <p className="text-blue-100">Proven candle pattern strategies that auto-execute entry and exit rules</p>
          </div>
        </div>

        <div className="mt-16 space-x-4">
          <button className="bg-white text-blue-600 px-8 py-3 rounded-lg font-bold hover:bg-blue-50 transition">
            Get Started
          </button>
          <button className="border-2 border-white text-white px-8 py-3 rounded-lg font-bold hover:bg-white hover:bg-opacity-10 transition">
            Learn More
          </button>
        </div>
      </div>

      {/* Candle Patterns Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-2">Pattern Library</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Candle Patterns</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Professionally designed trading patterns for Nifty and Sensex options. Each pattern includes
              precise entry, stop loss, and target rules — automated by the execution engine.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {CANDLE_PATTERNS.map(p => (
              <PatternCard key={p.name} pattern={p} />
            ))}
          </div>

          {/* CPR Info Box */}
          <div className="mt-12 bg-blue-50 rounded-2xl p-8 max-w-4xl mx-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">CPR Indicator Filter</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-700">
              <div>
                <p className="font-semibold text-green-700 mb-2">Bullish CPR Conditions</p>
                <ul className="space-y-1 text-gray-600">
                  <li>• Today's CPR above yesterday's CPR</li>
                  <li>• Price opens above TC</li>
                  <li>• First 15M/30M candle closes above TC</li>
                  <li>• RSI in 57–70 range</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-red-700 mb-2">Bearish CPR Conditions</p>
                <ul className="space-y-1 text-gray-600">
                  <li>• Today's CPR below yesterday's CPR</li>
                  <li>• Price opens below BC</li>
                  <li>• First 15M/30M candle closes below BC</li>
                  <li>• RSI in 30–45 range</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-2">Narrow CPR</p>
                <p className="text-gray-600">(TC − BC) &lt; 0.25% of previous day's range, or below 20-day average CPR width. Best for trending trades.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-2">Trade Filters</p>
                <ul className="space-y-1 text-gray-600">
                  <li>• Avoid 1–2 days after 2–3 consecutive losses</li>
                  <li>• Avoid 4th day after 3 consecutive trend days</li>
                  <li>• Exit if adverse move &gt; 0.35% (Nifty) / 0.21% (Sensex)</li>
                </ul>
              </div>
            </div>
          </div>
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
