# Swing Level — Architecture & Flow

The **Swing Level** feature detects support/resistance (S&R) price levels from swing
pivots, identifies *strong* level clusters and the level *nearest* to price, and uses
the combined **"Strong + Nearest"** condition as the entry signal for breakout trading.
One shared rule set powers four surfaces: the admin chart, the bulk scanner, the
backtest simulator, and the live/paper trading engine — so what you see on the chart
is exactly what trades.

---

## 1. Core Concepts

| Concept | Definition | Where computed |
|---|---|---|
| **Swing level (pivot)** | A candle whose high is strictly greater than `pivot_bars` candles on each side → RESISTANCE; mirror for lows → SUPPORT | `swing_zone_detector.detect_sr_levels()` |
| **Alternating filter** | R and S levels must alternate chronologically; consecutive same-type levels keep the stronger one (higher R / lower S) | `swing_zone_detector._filter_alternating()` |
| **Classification by LTP** | A level's final type is decided by current price: above LTP → RESISTANCE, at/below → SUPPORT | `swing_breakout.classify_by_ltp()` |
| **Nearest levels** | Closest RESISTANCE above price and closest SUPPORT below price | `swing_breakout.find_nearest_levels()` |
| **Strong level (cluster)** | ≥ 2 same-type levels within `strong_level_pct`% of each other. Resistance cluster line = MAX price; support cluster line = MIN price | `swing_breakout.find_strong_levels()` |
| **Strong + Nearest** | The nearest level is a *member* of a strong cluster (or, in `strict` mode, *is* the cluster's line price). This is the tradeable setup | `swing_level_scanner._evaluate_instrument()` / `swing_breakout.evaluate_breakout()` |
| **Last-level bias** | The most recently formed level sets trade direction: RESISTANCE → bullish (buy), SUPPORT → bearish (sell) | `swing_breakout.find_last_level()` |
| **Breakout entry** | Price crosses through the strong cluster's line between the previous tick/candle and the current one, in the bias direction | `swing_breakout.evaluate_breakout()` |

---

## 2. Component Architecture

```mermaid
graph TB
    subgraph Frontend ["Frontend (React / Vite)"]
        SZE["SwingZoneEdit / SwingZoneNew<br/>(config CRUD)"]
        SZS["SwingZoneScan<br/>(single-instrument scan)"]
        SZSD["SwingZoneScanDetail<br/>(saved result viewer)"]
        SLS["SwingLevelScanner<br/>(bulk exchange scan, polls progress)"]
        CHART["SwingZoneChart.jsx<br/>(lightweight-charts; JS level analysis)"]
        SZS --> CHART
        SZSD --> CHART
    end

    subgraph AdminAPI ["Admin API (Flask :8000)"]
        ROUTES["routes/admin/swing_zones.py<br/>config CRUD · scan · scan-history<br/>swing-scanner run/status/cancel · chart-candles"]
    end

    subgraph Services ["Shared Services (backend/app/services)"]
        DET["swing_zone_detector.py<br/>fetch_candles_for_swing_config()<br/>detect_sr_levels()"]
        BRK["swing_breakout.py<br/>classify_by_ltp · find_nearest_levels<br/>find_strong_levels · evaluate_breakout<br/>(Python port of SwingZoneChart.jsx)"]
        SCAN["swing_level_scanner.py<br/>background thread + in-memory run registry"]
        ENGINE["trading_engine.py<br/>TradingEngine (paper/live sessions)"]
    end

    subgraph Backtest ["Backtest (admin + customer routes)"]
        SIM["_simulate_swing_breakout()<br/>_simulate_swing_breakout_options()"]
    end

    subgraph Data ["MySQL"]
        CFG[("SwingZoneConfig")]
        RES[("SwingZoneScanResult<br/>(max 20 per config)")]
        STRAT[("Strategy<br/>swing_zone_config_id FK")]
    end

    KITE["Zerodha Kite Connect<br/>historical_data · ltp · instruments"]

    SZE & SZS & SZSD & SLS --> ROUTES
    ROUTES --> DET & SCAN
    ROUTES --> CFG & RES
    SCAN --> DET & BRK
    SIM --> DET & BRK
    ENGINE --> DET & BRK
    STRAT --> CFG
    ENGINE --> STRAT
    SIM --> STRAT
    DET & SCAN & ENGINE & SIM --> KITE
```

**Key design choice — single source of truth for the rule:**
[swing_breakout.py](backend/app/services/swing_breakout.py) is an explicit Python port
of the level-analysis helpers in
[SwingZoneChart.jsx](frontend/src/components/admin/SwingZoneChart.jsx). The scanner,
backtester, and live engine all import it, guaranteeing chart ↔ scan ↔ backtest ↔ live
parity.

---

## 3. Data Model

```mermaid
erDiagram
    User ||--o{ SwingZoneConfig : "created_by"
    SwingZoneConfig ||--o{ SwingZoneScanResult : "swing_config_id"
    SwingZoneConfig ||--o{ Strategy : "swing_zone_config_id (nullable)"
    Strategy ||--o{ TradingSession : "runs as"

    SwingZoneConfig {
        int id PK
        string name UK
        string candle_size "1min..4hour (default 4hour)"
        int period_days "1/7/10/30/60/90"
        int pivot_bars "default 5"
        float strong_level_pct "0.1/0.5/1.0/1.5/2.0"
        bool is_active
    }
    SwingZoneScanResult {
        int id PK
        string instrument
        string exchange
        json levels_detected "[{price,type,date}]"
        int total_levels
        string period_from_to
        datetime scanned_at
    }
    Strategy {
        int id PK
        int swing_zone_config_id FK
        json stop_loss_rules
        json target_rules
        json option_config
    }
```

- `SwingZoneConfig` is the reusable detection recipe (admin-managed).
- `SwingZoneScanResult` stores per-instrument scan snapshots; history is capped at
  **20 rows per config** (oldest trimmed on insert).
- A `Strategy` links to one config via `swing_zone_config_id`
  (migration `c5d6e7f8a9b0_swing_level_strategies.py`); the engine and backtest refuse
  to run a strategy without it.
- Bulk-scanner runs are **not persisted** — they live in an in-memory registry
  (last 5 runs) inside `swing_level_scanner.py`.

---

## 4. Level-Detection Pipeline

Every surface runs the same pipeline over candles:

```mermaid
flowchart LR
    A["Kite historical_data<br/>(+ buffer days lookback)"] --> B{"candle_size<br/>== 4hour?"}
    B -- yes --> C["_aggregate_to_4h()"]
    B -- no --> D
    C --> D["detect_sr_levels(candles, pivot_bars)"]
    D --> E["pivot highs → RESISTANCE<br/>pivot lows → SUPPORT"]
    E --> F["_filter_alternating()<br/>(R/S must alternate; keep stronger)"]
    F --> G["classify_by_ltp(levels, price)<br/>re-type by current price"]
    G --> H["find_nearest_levels()"]
    G --> I["find_strong_levels(strong_level_pct)<br/>cluster ≥2 levels within pct"]
    H & I --> J{"Strong + Nearest?<br/>nearest ∈ cluster.members<br/>(strict: nearest == cluster line)"}
```

Candle fetching (`fetch_candles_for_swing_config`) adds an interval-specific
**buffer** before the report window so pivots near the window start have lookback
context, and clamps to Kite's per-interval max range:

| candle_size | Kite interval | buffer days | max fetch days |
|---|---|---|---|
| 1min | minute | 3 | 60 |
| 5min | 5minute | 5 | 100 |
| 15min | 15minute | 7 | 200 |
| 30min | 30minute | 10 | 200 |
| 1hour | 60minute | 15 | 400 |
| 4hour | 60minute → aggregated | 40 | 400 |

---

## 5. Flow 1 — Single-Instrument Scan (Admin)

`POST /api/admin/swing-zones/<config_id>/scan` — synchronous; result persisted and
rendered on `SwingZoneScan` → `SwingZoneChart`.

```mermaid
sequenceDiagram
    actor Admin
    participant UI as SwingZoneScan.jsx
    participant API as admin/swing_zones.py
    participant Kite as Kite Connect
    participant DET as swing_zone_detector
    participant DB as MySQL

    Admin->>UI: pick config + instrument (+ optional date range)
    UI->>API: POST /swing-zones/:id/scan
    API->>API: resolve dates (explicit range or period_days back from today)
    API->>DB: load connected KiteConfig (user's, else any)
    API->>Kite: historical_data(token, start − buffer, end)
    API->>API: 4H aggregate if needed · filter to report window
    API->>DET: detect_sr_levels(report_candles, pivot_bars)
    API->>DB: upsert SwingZoneScanResult (trim history to 20)
    API-->>UI: { scan_result, summary {R count, S count, period} }
    UI->>API: GET /swing-zones/chart-candles
    UI->>UI: SwingZoneChart — draws levels,<br/>strong lines, nearest markers (JS twins of swing_breakout.py)
```

---

## 6. Flow 2 — Bulk Swing-Level Scanner (Background)

Scans **every instrument on an exchange** for the Strong + Nearest setup.
Asynchronous because Kite's historical API is rate-limited (~3 req/s), so a full
NSE scan takes minutes.

```mermaid
flowchart TD
    A["POST /api/admin/swing-scanner/run<br/>{swing_config_id, exchange, dates?, strict?}"] --> B{"scan already<br/>running?"}
    B -- yes --> B409["409 Conflict"]
    B -- no --> C["_build_scan_universe(exchange)<br/>NSE/BSE: EQ main-board · NSE_INDICES: indices<br/>NFO/MCX: nearest-expiry FUT per underlying"]
    C --> D["start_scan() — register run in _runs{},<br/>spawn daemon thread, return 202 + snapshot"]

    D --> E["_scan_worker (thread)"]
    E --> F["bulk LTP fetch (batches of 400)"]
    F --> G{"for each instrument<br/>(0.35s delay = rate limit)"}
    G --> H["fetch candles → 4H aggregate →<br/>filter to window → detect_sr_levels"]
    H --> I["classify_by_ltp(LTP) ·<br/>find_nearest · find_strong"]
    I --> J{"nearest R or S sits on a<br/>strong cluster?<br/>(strict: == cluster line)"}
    J -- yes --> K["record match: side, price,<br/>strong_price, cluster_size, distance_pct"]
    J -- no --> G
    K --> G
    G -- "done / cancelled" --> L["run.status = completed | cancelled<br/>(keep last 5 runs in memory)"]

    M["SwingLevelScanner.jsx<br/>polls GET /swing-scanner/latest every few s"] -.-> D
    M -.-> L
    N["POST /swing-scanner/:id/cancel"] -.-> G
```

A match means: *this instrument's next obstacle in price is also a strong wall* —
the chart's merged **"Strong + Nearest"** line — i.e. a candidate for the breakout
strategy.

---

## 7. Flow 3 — Live / Paper Trading Engine

`TradingEngine` (one thread per active `TradingSession`) owns the full
**monitor → breakout entry → multi-target exit** lifecycle. It polls LTP every 3 s
(WebSocket ticker when available, REST fallback) and caches swing candles for 5 min.

```mermaid
stateDiagram-v2
    [*] --> monitoring : session start<br/>(strategy must have swing_zone_config)

    state monitoring {
        [*] --> fetch : every 3s tick
        fetch : fetch/cached candles → drop developing candle
        fetch --> detect : detect_sr_levels(closed candles)
        detect --> log : log level snapshot<br/>(last level, nearest R/S, strong flags)
        log --> evalbrk : evaluate_breakout(levels, strong_pct,<br/>prev_ltp, ltp)
    }

    monitoring --> monitoring : no signal /<br/>candle-size filter fails
    monitoring --> in_position : breakout signal →<br/>(options - resolve CE/PE, use premium)<br/>_build_trade_plan → place entry order<br/>(paper - PaperOrder · live - kite_service)

    state in_position {
        [*] --> watch : every 3s tick
        watch : update high/low water marks
        watch --> be : break-even latch (lift SL to entry)
        be --> exits
        state exits {
            sl : 1 SL / structure stop → exit ALL
            tg : 2 multi-target partials (T1..Tn)
            pb : 3 partial book (50% at level)
            tp : 4 final TP when targets done
        }
    }

    in_position --> exited : remaining qty = 0
    exited --> [*] : session STOPPED (auto_stop_reason=executed)<br/>state persisted to TradingSession.plan_state
```

The breakout decision itself (shared with backtest):

```mermaid
flowchart TD
    A["evaluate_breakout(levels, strong_pct, prev_price, price)"] --> B["last level = most recent pivot<br/>RESISTANCE → bullish · SUPPORT → bearish"]
    B --> C["classify levels by prev_price<br/>(pre-breakout state — broken level would<br/>flip sides if classified by current price)"]
    C --> D["nearest level on the bias side<br/>+ strong clusters on that side"]
    D --> E{"nearest on a strong cluster?"}
    E -- no --> X["no entry"]
    E -- yes --> F{"crossed the cluster line?<br/>bullish: prev < line ≤ price<br/>bearish: prev > line ≥ price"}
    F -- no --> X
    F -- yes --> G["signal {direction, level_price,<br/>nearest_price, cluster_size, last_level}"]
```

**Options mode:** if `strategy.option_config.enabled`, the breakout is detected on the
underlying, then the engine resolves the CE/PE contract (strike selection + expiry
policy), swaps its LTP subscription to the option, and builds the trade plan against
the **premium** — always a long position (BUY to enter, SELL to exit).

---

## 8. Flow 4 — Backtest Simulation

`POST /api/{admin|customer}/backtest/strategies/<id>/run` →
`_simulate_swing_breakout` (equity/futures) or `_simulate_swing_breakout_options`.

```mermaid
flowchart TD
    A["fetch_candles_for_swing_config<br/>(period + extra days + buffer)"] --> B["walk forward i = 1..N−1"]
    B --> C["rolling window: candles within<br/>period_days ending at candle i"]
    C --> D["detect_sr_levels(window)"]
    D --> E["evaluate_breakout(levels, strong_pct,<br/>close[i−1], close[i])  ← same fn as live"]
    E -- no signal --> B
    E -- signal --> F["record detection ·<br/>candle-size filter"]
    F --> G{"options mode?"}
    G -- no --> H["enter at next candle's OPEN<br/>_build_trade_plan → _simulate_exits<br/>(SL · targets · partial book · TP)"]
    G -- yes --> I["resolve_option_contract as of detection<br/>fetch premium daily candles to expiry<br/>simulate long-option exits on premium<br/>(unresolvable → skipped_dates)"]
    H & I --> J["record trade {entry, fills, exit,<br/>pnl, direction, level_price}"]
    J --> K["jump i past the last fill<br/>(no double-entry)"]
    K --> B
```

Because the simulator calls the same `detect_sr_levels` + `evaluate_breakout` pair as
the engine, backtest results are a faithful candle-granularity replay of live behavior
(live uses tick LTP instead of candle closes — the only intentional difference).

---

## 9. API Surface

All under the Admin app (`:8000`), `@admin_required`:

| Method & Path | Purpose |
|---|---|
| `GET/POST /api/admin/swing-zones` | List / create configs |
| `GET/PUT/DELETE /api/admin/swing-zones/<id>` | Read / update / delete a config |
| `POST /api/admin/swing-zones/<id>/scan` | Synchronous single-instrument scan (persists result) |
| `GET /api/admin/swing-zones/<id>/scan-history` | Last 20 scan results |
| `GET /api/admin/swing-zones/<id>/scan/<result_id>` | One saved result (+ `strong_level_pct` for chart) |
| `GET /api/admin/swing-zones/chart-candles` | OHLC for the chart (IST-shifted timestamps, 4H grouping) |
| `POST /api/admin/swing-scanner/run` | Start bulk background scan (202; 409 if one is running) |
| `GET /api/admin/swing-scanner/latest` / `/<run_id>` | Poll run progress + matches |
| `POST /api/admin/swing-scanner/<run_id>/cancel` | Request cancellation |

Frontend pages: [SwingZoneEdit.jsx](frontend/src/pages/admin/SwingZoneEdit.jsx) /
[SwingZoneNew.jsx](frontend/src/pages/admin/SwingZoneNew.jsx) (config CRUD),
[SwingZoneScan.jsx](frontend/src/pages/admin/SwingZoneScan.jsx) +
[SwingZoneScanDetail.jsx](frontend/src/pages/admin/SwingZoneScanDetail.jsx) (scan & chart),
[SwingLevelScanner.jsx](frontend/src/pages/admin/SwingLevelScanner.jsx) (bulk scanner with
progress bar, match table, strict toggle).

---

## 10. Cross-Cutting Concerns & Constraints

- **Rate limiting** — bulk scanner sleeps 0.35 s between historical calls (~3 req/s
  Kite limit) and bulk-fetches LTPs in batches of 400.
- **Closed candles only** — the live engine drops the developing candle before pivot
  detection, so signals never form on an unfinished bar.
- **Pre-breakout classification** — `evaluate_breakout` classifies levels by
  `prev_price`, not current price, because at the crossing tick the broken level would
  have already flipped from RESISTANCE to SUPPORT (or vice-versa).
- **Validation gates** — `strong_level_pct ∈ {0.1, 0.5, 1.0, 1.5, 2.0}`,
  date ranges clamped per interval, one bulk scan at a time, minimum
  `pivot_bars × 2 + 1` candles to detect anything.
- **Resilience** — engine state persists to `TradingSession.plan_state` on every
  meaningful change; active sessions are re-instantiated on Flask restart. Scanner
  runs, by contrast, are deliberately ephemeral (in-memory, last 5).
- **JS/Python duplication** — `SwingZoneChart.jsx` and `swing_breakout.py` implement
  the same math twice. Any change to clustering/nearest/classification logic **must be
  made in both** or the chart will disagree with the scanner/engine.
