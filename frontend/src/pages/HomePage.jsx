import { Link } from 'react-router-dom';

const FEATURES = [
  {
    title: 'Swing Level Strategies',
    desc: 'Configurable swing high/low detection on 4H structure drives precise, rule-based entries and exits — no guesswork.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8M21 7v5m0-5h-5" />
    ),
  },
  {
    title: 'Real-time Market Data',
    desc: 'Live quotes and order execution through Zerodha Kite Connect, wired straight into your strategy engine.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    ),
  },
  {
    title: 'Historical Backtesting',
    desc: 'Validate any strategy against months of historical candles and option contracts before risking real capital.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l3-3 3 3 5-5" />
    ),
  },
  {
    title: 'Paper & Live Trading',
    desc: 'Run a strategy on a virtual account to prove it out, then promote it to live orders with a single switch.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
];

const STEPS = [
  { n: '01', title: 'Configure', desc: 'Define swing-level rules, entry conditions and trade filters for your strategy.' },
  { n: '02', title: 'Backtest', desc: 'Replay against historical data and review trades on an interactive chart.' },
  { n: '03', title: 'Paper Trade', desc: 'Deploy to a virtual account and track live performance risk-free.' },
  { n: '04', title: 'Go Live', desc: 'Promote to real orders on Zerodha when the edge is proven.' },
];

function NavLinks({ className = '' }) {
  return (
    <div className={className}>
      <Link to="/" className="text-sm font-medium text-slate-200 hover:text-white transition-colors">
        Home
      </Link>
      <Link to="/login" className="text-sm font-medium text-slate-200 hover:text-white transition-colors">
        Customer Login
      </Link>
      <Link
        to="/admin/login"
        className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-400 px-4 py-2 rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
      >
        Admin Login
      </Link>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-950/70 border-b border-white/5">
        <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 font-extrabold text-sm">
              AT
            </span>
            <span className="text-lg font-bold tracking-tight">AlgoTrader</span>
          </Link>
          <NavLinks className="flex items-center gap-6" />
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute top-20 right-0 w-[400px] h-[400px] rounded-full bg-teal-500/10 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-28 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Automated swing-level trading
          </span>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] max-w-4xl mx-auto">
            Trade with discipline,
            <span className="block bg-gradient-to-r from-emerald-300 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
              powered by algorithms.
            </span>
          </h1>

          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Design rule-based strategies on swing structure, validate them against years of history,
            and execute on live markets through Zerodha — all from one platform.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/login"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold transition-colors shadow-lg shadow-emerald-500/25"
            >
              Customer Login
            </Link>
            <Link
              to="/admin/login"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl border border-white/15 hover:border-white/30 hover:bg-white/5 text-white font-semibold transition-colors"
            >
              Admin Login
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-emerald-400 uppercase tracking-widest mb-3">Platform</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything you need to trade systematically</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-emerald-400/30 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-300 mb-5 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  {f.icon}
                </svg>
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-emerald-400 uppercase tracking-widest mb-3">Workflow</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">From idea to live in four steps</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-white/10 bg-slate-900/40 p-6">
                <span className="text-4xl font-extrabold text-white/10">{s.n}</span>
                <h3 className="font-semibold text-lg mt-3 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative max-w-7xl mx-auto px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent p-12 text-center">
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl mx-auto">
              Ready to put your strategy on autopilot?
            </h2>
            <p className="mt-4 text-slate-400 max-w-xl mx-auto">
              Sign in to your trading account, or access the admin console to manage strategies and configurations.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/login"
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold transition-colors shadow-lg shadow-emerald-500/25"
              >
                Customer Login
              </Link>
              <Link
                to="/admin/login"
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl border border-white/15 hover:border-white/30 hover:bg-white/5 text-white font-semibold transition-colors"
              >
                Admin Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 font-extrabold text-xs">
              AT
            </span>
            <span className="font-semibold">AlgoTrader</span>
          </div>
          <NavLinks className="flex items-center gap-6" />
          <p className="text-sm text-slate-500">&copy; 2026 AlgoTrader. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
