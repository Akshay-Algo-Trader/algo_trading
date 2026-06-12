# AlgoTrader

Algorithmic trading platform: Flask backend (MySQL via SQLAlchemy/Flask-Migrate) + React/Vite frontend (Tailwind, Zustand, react-router). Zerodha Kite Connect for live market data/orders.

## Architecture

- **Customer API** — `backend/app/__init__.py` (`create_app`), runs via `run.py` on port 5000 (`/api/...`)
- **Admin API** — `backend/app/admin_app.py` (`create_admin_app`), runs via `run_admin.py` on port 8000 (`/admin/...`)
- **Frontend** — `frontend/src`, Vite dev server on port 5173, proxies API calls to :5000
- Both Flask apps share `app/models`, `app/services`, `app/extensions.py` (db, jwt, cors)

## Key directories

- `backend/app/models/` — SQLAlchemy models (Strategy, CandlePattern, SwingZoneConfig, FvgZoneConfig, ZoneConfig, PaperOrder/Position, LiveOrder, VirtualAccount, KiteConfig, etc.)
- `backend/app/routes/admin/` and `backend/app/routes/customer/` — Flask blueprints, mirror each other for shared features (strategies, backtest, zones)
- `backend/app/services/` — business logic: `trading_engine.py` (order execution), `swing_zone_detector.py` / `swing_breakout.py`, `fvg_zone_detector.py`, `zone_detector.py`, `kite_service.py`, `scheduler.py` (APScheduler background jobs)
- `backend/migrations/versions/` — Alembic migrations (Flask-Migrate)
- `frontend/src/pages/admin/` and `frontend/src/pages/customer/` — mirrored admin/customer UI

## Domain concepts

- **Strategy** — user-configurable trading strategy (entry conditions, indicator settings, trade filters, candle patterns, swing-level rules)
- **Candle Patterns** — admin-defined price-action patterns used as strategy entry signals
- **Zones** — FVG (4H/1H/30M/15M), Support/Resistance (4H), Swing High/Low (4H) detection configs, scanned and stored as `*ZoneScanResult`
- **Backtest** — runs strategies against historical candles/options (last 3 months for option contracts, format e.g. `APOLLOHOSP25JUL7600CE`)
- **Paper vs Live** — `PaperOrder`/`PaperPosition`/`VirtualAccount` for simulated trading; `LiveOrder` + `kite_service.py` for real Zerodha orders

## Running locally

- Backend: `./start-backend.sh` (port 5000), admin: `cd backend && python run_admin.py` (port 8000)
- Frontend: `./start-frontend.sh` (port 5173)
- Backend tests: `cd backend && pytest`
- DB migrations: `cd backend && flask db migrate -m "..."` / `flask db upgrade`
