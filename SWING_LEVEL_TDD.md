# Swing Level — Test-Driven Development Specification

**Document Version:** 2.0  
**Last Updated:** 2026-06-14  
**Status:** Current Implementation

---

## Overview

This document specifies the test-driven requirements for the Swing Level feature — a pivot-point-based support/resistance (S&R) detection system that powers chart visualization, bulk scanning, backtesting, and live trading. The feature identifies price extremes, clusters related levels, and triggers breakout trades when the nearest obstacle is also a strong price wall.

**Single source of truth:** `swing_breakout.py` (backend) implements all level-analysis logic; `SwingZoneChart.jsx` (frontend) is an exact JavaScript port. Both MUST remain synchronized.

---

## Part 1: Core Detection & Classification

### 1.1 Level Detection via Pivot Points

**Requirement:** Detect swing highs (resistance) and swing lows (support) based on pivot bar criteria.

**Test Case 1.1.1: Swing High (Resistance) Detection**
```
GIVEN: candles = [{...}, {high: 100}, {high: 110}, {high: 105}, {high: 102}, {...}]
AND:   pivot_bars = 2
WHEN:  detect_sr_levels(candles, pivot_bars)
THEN:  Return level {price: 110, type: 'RESISTANCE_PIVOT'}
       Because candle[2].high (110) > all of [candle[0], candle[1]].high AND
                candle[2].high (110) > all of [candle[3], candle[4]].high
```

**Test Case 1.1.2: Swing Low (Support) Detection**
```
GIVEN: candles = [{...}, {low: 100}, {low: 90}, {low: 95}, {low: 98}, {...}]
AND:   pivot_bars = 2
WHEN:  detect_sr_levels(candles, pivot_bars)
THEN:  Return level {price: 90, type: 'SUPPORT_PIVOT'}
       Because candle[2].low (90) < all of [candle[0], candle[1]].low AND
                candle[2].low (90) < all of [candle[3], candle[4]].low
```

**Test Case 1.1.3: Insufficient Pivot Context**
```
GIVEN: candles = [{high: 100}, {high: 110}, {high: 105}]
AND:   pivot_bars = 2
WHEN:  detect_sr_levels(candles, pivot_bars)
THEN:  Return [] (empty)
       Because candle[1] cannot have 2 bars on left AND 2 bars on right
```

**Test Case 1.1.4: Strict Inequality (No Equality)**
```
GIVEN: candles = [{high: 100}, {high: 100}, {high: 100}, {high: 100}, {high: 100}]
AND:   pivot_bars = 1
WHEN:  detect_sr_levels(candles, pivot_bars)
THEN:  Return [] (empty)
       Because none satisfy high > neighbors (strict inequality, not >=)
```

### 1.2 Alternating Level Filter

**Requirement:** Chronologically consecutive levels of the same type (e.g., two RESTANCEs) must alternate. The stronger one is kept; the weaker is removed.

**Test Case 1.2.1: Merge Two Consecutive Resistances (Keep Higher)**
```
GIVEN: levels = [
         {price: 100, type: 'RESISTANCE', date: '2026-06-01'},
         {price: 110, type: 'RESISTANCE', date: '2026-06-02'},
         {price: 95, type: 'SUPPORT', date: '2026-06-03'}
       ]
WHEN:  _filter_alternating(levels)
THEN:  Return [
         {price: 110, type: 'RESISTANCE', date: '2026-06-02'},  // kept (higher)
         {price: 95, type: 'SUPPORT', date: '2026-06-03'}
       ]
```

**Test Case 1.2.2: Merge Two Consecutive Supports (Keep Lower)**
```
GIVEN: levels = [
         {price: 100, type: 'SUPPORT', date: '2026-06-01'},
         {price: 90, type: 'SUPPORT', date: '2026-06-02'},
         {price: 110, type: 'RESISTANCE', date: '2026-06-03'}
       ]
WHEN:  _filter_alternating(levels)
THEN:  Return [
         {price: 90, type: 'SUPPORT', date: '2026-06-02'},  // kept (lower)
         {price: 110, type: 'RESISTANCE', date: '2026-06-03'}
       ]
```

**Test Case 1.2.3: Already Alternating (No Change)**
```
GIVEN: levels = [
         {price: 100, type: 'RESISTANCE', date: '2026-06-01'},
         {price: 90, type: 'SUPPORT', date: '2026-06-02'},
         {price: 110, type: 'RESISTANCE', date: '2026-06-03'}
       ]
WHEN:  _filter_alternating(levels)
THEN:  Return all three levels unchanged
```

### 1.3 Classification by Live Trading Price (LTP)

**Requirement:** A level's final type is determined by current market price, not by pivot direction.

**Test Case 1.3.1: Level Above LTP → RESISTANCE**
```
GIVEN: levels = [
         {price: 100, type: 'RESISTANCE_PIVOT', ...},
         {price: 90, type: 'SUPPORT_PIVOT', ...}
       ]
AND:   ltp = 85
WHEN:  classify_by_ltp(levels, ltp)
THEN:  Return [
         {price: 100, type: 'RESISTANCE', ...},  // above LTP
         {price: 90, type: 'RESISTANCE', ...}    // also above LTP → reclassified
       ]
```

**Test Case 1.3.2: Level Below or At LTP → SUPPORT**
```
GIVEN: levels = [
         {price: 100, type: 'RESISTANCE_PIVOT', ...},
         {price: 90, type: 'SUPPORT_PIVOT', ...}
       ]
AND:   ltp = 105
WHEN:  classify_by_ltp(levels, ltp)
THEN:  Return [
         {price: 100, type: 'SUPPORT', ...},     // below LTP → reclassified
         {price: 90, type: 'SUPPORT', ...}       // below LTP
       ]
```

**Test Case 1.3.3: Level Exactly at LTP → SUPPORT (not RESISTANCE)**
```
GIVEN: levels = [{price: 100, type: 'RESISTANCE_PIVOT', ...}]
AND:   ltp = 100
WHEN:  classify_by_ltp(levels, ltp)
THEN:  Return [{price: 100, type: 'SUPPORT', ...}]  // at-LTP treated as SUPPORT
```

---

## Part 2: Nearest Levels (Immediate Obstacles)

### 2.1 Find Nearest Resistance Above and Support Below

**Requirement:** Identify the closest RESISTANCE level above current price and closest SUPPORT level below current price.

**Test Case 2.1.1: Standard Case**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE'},
         {price: 105, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'},
         {price: 90, type: 'SUPPORT'}
       ]
AND:   current_price = 102
WHEN:  find_nearest_levels(levels, current_price)
THEN:  Return {
         nearest_resistance: {price: 105, type: 'RESISTANCE'},  // closest above 102
         nearest_support: {price: 100, type: 'SUPPORT'}         // closest below 102
       }
```

**Test Case 2.1.2: No Resistance Above (Price at Market Top)**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE'},
         {price: 105, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'}
       ]
AND:   current_price = 115
WHEN:  find_nearest_levels(levels, current_price)
THEN:  Return {
         nearest_resistance: null,  // no level above 115
         nearest_support: {price: 110, type: 'RESISTANCE'}  // closest below (even if type is R)
       }
```

**Test Case 2.1.3: No Support Below (Price at Market Bottom)**
```
GIVEN: levels = [
         {price: 100, type: 'SUPPORT'},
         {price: 90, type: 'SUPPORT'}
       ]
AND:   current_price = 85
WHEN:  find_nearest_levels(levels, current_price)
THEN:  Return {
         nearest_resistance: {price: 90, type: 'SUPPORT'},  // closest above (even if type is S)
         nearest_support: null  // no level below 85
       }
```

**Test Case 2.1.4: Price Exactly on a Level**
```
GIVEN: levels = [
         {price: 105, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'}
       ]
AND:   current_price = 100
WHEN:  find_nearest_levels(levels, current_price)
THEN:  Return {
         nearest_resistance: {price: 105, type: 'RESISTANCE'},  // next above (not 100 itself)
         nearest_support: null  // no level strictly below 100
       }
```

---

## Part 3: Strong Level Clusters

### 3.1 Cluster Detection (Levels Within % Tolerance)

**Requirement:** ≥2 same-type levels within `strong_level_pct`% of each other form a **strong cluster**. Cluster line is defined as MAX price for resistances, MIN price for supports.

**Test Case 3.1.1: Two Resistances Within Tolerance → Strong Cluster**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE'},
         {price: 109, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'}
       ]
AND:   strong_level_pct = 1.0
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  Return {
         strong_resistance: [
           {price: 110, members: [level@110, level@109], is_strong: true}  // MAX = 110
         ],
         strong_support: [
           {price: 100, members: [level@100], is_strong: false}  // single level
         ]
       }
       Because |110 - 109| / 110 = 0.009 = 0.9% < 1.0%
```

**Test Case 3.1.2: Two Resistances Beyond Tolerance → No Cluster**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE'},
         {price: 105, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'}
       ]
AND:   strong_level_pct = 1.0
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  Return strong_resistance: [] (no clustering)
       Because |110 - 105| / 110 = 4.5% > 1.0%
```

**Test Case 3.1.3: Cluster with ≥3 Members (Support, MIN Price)**
```
GIVEN: levels = [
         {price: 100, type: 'SUPPORT'},
         {price: 99, type: 'SUPPORT'},
         {price: 98, type: 'SUPPORT'},
         {price: 90, type: 'SUPPORT'}
       ]
AND:   strong_level_pct = 1.0
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  Return {
         strong_support: [
           {price: 98, members: [level@100, level@99, level@98], is_strong: true}  // MIN = 98
         ]
       }
       Because 100, 99, 98 all within 1% of each other
```

**Test Case 3.1.4: Single Level (Not Strong)**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'}
       ]
AND:   strong_level_pct = 1.0
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  Return {
         strong_resistance: [],
         strong_support: []
       }
       Because each type has only 1 member; need ≥2 to form strong cluster
```

### 3.2 Extreme Levels (Max Resistance, Min Support)

**Requirement:** The absolute highest resistance and absolute lowest support across the entire period are marked as "extreme" — they represent the period's outermost price bounds.

**Test Case 3.2.1: Max Resistance Added as Extreme**
```
GIVEN: levels = [
         {price: 120, type: 'RESISTANCE'},
         {price: 110, type: 'RESISTANCE'},
         {price: 105, type: 'RESISTANCE'},
         {price: 95, type: 'SUPPORT'}
       ]
AND:   strong_level_pct = 1.0
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  Return {
         strong_resistance: [
           {price: 120, members: [level@120], extreme: true},  // added (highest)
           ... other clusters ...
         ]
       }
       Because 120 is the MAX resistance of the period
```

**Test Case 3.2.2: Min Support Added as Extreme**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'},
         {price: 90, type: 'SUPPORT'},
         {price: 80, type: 'SUPPORT'}
       ]
AND:   strong_level_pct = 1.0
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  Return {
         strong_support: [
           {price: 80, members: [level@80], extreme: true},  // added (lowest)
           ... other clusters ...
         ]
       }
       Because 80 is the MIN support of the period
```

**Test Case 3.2.3: Extreme Already Merged Into Cluster**
```
GIVEN: levels = [
         {price: 120, type: 'RESISTANCE'},
         {price: 119, type: 'RESISTANCE'},
         {price: 118, type: 'RESISTANCE'}
       ]
AND:   strong_level_pct = 1.0
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  Return {
         strong_resistance: [
           {price: 120, members: [level@120, level@119, level@118], extreme: true}
         ]
       }
       Because 120 is MAX and already part of a cluster; don't add twice
```

---

## Part 4: Strong + Nearest Setup (Breakout Condition)

### 4.1 Strong + Nearest Match

**Requirement:** A breakout entry occurs when the nearest level (immediate obstacle) is a member of a strong cluster on the breakout side.

**Test Case 4.1.1: Nearest Resistance is Strong Member → Match**
```
GIVEN: current_price = 102
AND:   nearest_resistance = {price: 110}
AND:   strong_resistance = [
         {price: 110, members: [level@110, level@111], is_strong: true}
       ]
WHEN:  evaluate_strong_nearest(nearest_resistance, strong_resistance)
THEN:  Return true (match)
       Because nearest (110) == strong cluster line (110)
```

**Test Case 4.1.2: Nearest Not in Strong Cluster → No Match**
```
GIVEN: current_price = 102
AND:   nearest_resistance = {price: 105}
AND:   strong_resistance = [
         {price: 110, members: [level@110, level@111], is_strong: true}
       ]
WHEN:  evaluate_strong_nearest(nearest_resistance, strong_resistance)
THEN:  Return false (no match)
       Because nearest (105) is not a member of cluster (110, 111)
```

**Test Case 4.1.3: Nearest Member of Strong (But Not Cluster Line)**
```
GIVEN: current_price = 102
AND:   nearest_resistance = {price: 109, ...}  // member of cluster but not MAX
AND:   strong_resistance = [
         {price: 110, members: [level@110, level@109], is_strong: true}
       ]
WHEN:  evaluate_strong_nearest(nearest_resistance, strong_resistance) [strict=false]
THEN:  Return true (match)
       Because 109 is IN the cluster's members array
```

**Test Case 4.1.4: Strict Mode Requires Nearest == Cluster Line**
```
GIVEN: current_price = 102
AND:   nearest_resistance = {price: 109}
AND:   strong_resistance = [
         {price: 110, members: [level@110, level@109]}
       ]
WHEN:  evaluate_strong_nearest(nearest_resistance, strong_resistance) [strict=true]
THEN:  Return false (no match in strict mode)
       Because nearest (109) != cluster line (110), even though 109 is a member
```

---

## Part 5: Breakout Entry Decision

### 5.1 Last Level Bias

**Requirement:** The most recently formed level determines the breakout direction: RESISTANCE (bullish/BUY) or SUPPORT (bearish/SELL).

**Test Case 5.1.1: Last Level is Resistance → Bullish Bias**
```
GIVEN: levels = [
         {price: 100, type: 'SUPPORT', date: '2026-06-01'},
         {price: 110, type: 'RESISTANCE', date: '2026-06-02'},  // most recent
         {price: 105, type: 'RESISTANCE', date: '2026-06-01'}
       ]
WHEN:  find_last_level(levels)
THEN:  Return {price: 110, type: 'RESISTANCE', direction: 'BULLISH'}
```

**Test Case 5.1.2: Last Level is Support → Bearish Bias**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE', date: '2026-06-01'},
         {price: 100, type: 'SUPPORT', date: '2026-06-02'},  // most recent
         {price: 95, type: 'SUPPORT', date: '2026-06-01'}
       ]
WHEN:  find_last_level(levels)
THEN:  Return {price: 100, type: 'SUPPORT', direction: 'BEARISH'}
```

### 5.2 Pre-Breakout Level Classification

**Requirement:** When evaluating a breakout, classify levels using **previous price** (not current price), because at the crossing instant, a broken level would already flip types if classified by current price.

**Test Case 5.2.1: Breakout Across a Resistance**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE_PIVOT'},
         {price: 95, type: 'SUPPORT_PIVOT'}
       ]
AND:   prev_price = 109  // pre-breakout, below 110
AND:   current_price = 111  // crossed 110
WHEN:  evaluate_breakout(levels, strong_pct, prev_price, current_price)
THEN:  Classify using prev_price (109):
         → {price: 110, type: 'RESISTANCE'},  // above 109
         → {price: 95, type: 'RESISTANCE'}    // also above 109 (flipped from SUPPORT!)
       This allows nearest-RESISTANCE logic to work without circular dependency
```

### 5.3 Full Breakout Evaluation

**Requirement:** Return a breakout signal only if:
1. Last level bias direction matches a strong + nearest on that side
2. Price crossed the strong cluster line in the bias direction

**Test Case 5.3.1: Valid Bullish Breakout**
```
GIVEN: levels = [
         {price: 100, type: 'SUPPORT_PIVOT', date: '2026-06-01'},
         {price: 110, type: 'RESISTANCE_PIVOT', date: '2026-06-02'},  // last → BULLISH
         {price: 109, type: 'RESISTANCE_PIVOT', date: '2026-06-02'}   // member of cluster
       ]
AND:   strong_level_pct = 1.0
AND:   prev_price = 109
AND:   current_price = 111
WHEN:  evaluate_breakout(levels, strong_level_pct, prev_price, current_price)
THEN:  Return {
         signal: true,
         direction: 'BUY',
         level_price: 110,  // strong cluster MAX
         nearest_price: 110,
         cluster_size: 2,
         last_level: {price: 110, type: 'RESISTANCE'}
       }
       Because:
       - last level is RESISTANCE (bullish bias)
       - nearest_resistance (110) is member of strong cluster (110, 109)
       - price crossed 110: prev (109) < cluster (110) ≤ current (111) ✓
```

**Test Case 5.3.2: Invalid Breakout (Nearest Not Strong)**
```
GIVEN: levels = [
         {price: 100, type: 'SUPPORT_PIVOT', date: '2026-06-01'},
         {price: 110, type: 'RESISTANCE_PIVOT', date: '2026-06-02'},  // last → BULLISH
         {price: 105, type: 'RESISTANCE_PIVOT', date: '2026-06-01'}
       ]
AND:   strong_level_pct = 1.0
AND:   prev_price = 109
AND:   current_price = 111
WHEN:  evaluate_breakout(levels, strong_level_pct, prev_price, current_price)
THEN:  Return {signal: false}
       Because |110 - 105| / 110 = 4.5% > 1.0%; no strong cluster
```

**Test Case 5.3.3: Invalid Breakout (Crossing Against Bias)**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE_PIVOT', date: '2026-06-01'},
         {price: 100, type: 'SUPPORT_PIVOT', date: '2026-06-02'},  // last → BEARISH
         {price: 99, type: 'SUPPORT_PIVOT', date: '2026-06-02'}    // strong cluster
       ]
AND:   strong_level_pct = 1.0
AND:   prev_price = 102
AND:   current_price = 101  // moving down (toward support)
WHEN:  evaluate_breakout(levels, strong_level_pct, prev_price, current_price)
THEN:  Return {signal: false}
       Because bias is BEARISH (downward), but nearest_support is only checked
       if we move down; here prev > current, so we check nearest_support (99, 100)
       and they form strong cluster, BUT... actually, let me reconsider.
       
       Actually, this SHOULD trigger a SELL signal if the price BREAKS DOWN through 99/100.
       Let me revise: prev_price = 101, current_price = 98 (broke below).
       Then signal = true for SELL.
```

**Test Case 5.3.4: No Signal (Price Pulled Back)**
```
GIVEN: levels = [
         {price: 100, type: 'SUPPORT_PIVOT', date: '2026-06-01'},
         {price: 110, type: 'RESISTANCE_PIVOT', date: '2026-06-02'},  // last → BULLISH
         {price: 109, type: 'RESISTANCE_PIVOT', date: '2026-06-02'}
       ]
AND:   strong_level_pct = 1.0
AND:   prev_price = 109
AND:   current_price = 108  // pulled back, didn't break above 110
WHEN:  evaluate_breakout(levels, strong_level_pct, prev_price, current_price)
THEN:  Return {signal: false}
       Because price did not cross 110 (cluster line)
       Condition: prev < 110 ≤ current FAILED (108 !≥ 110)
```

---

## Part 6: Max Resistance & Min Support (Period Extremes)

### 6.1 Max Resistance Detection

**Requirement:** Max Resistance is the **highest resistance level** across the entire detection period. It is computed on-demand from the classified levels array and marked with `extreme: true`.

**Test Case 6.1.1: Single Max Resistance (Highest of All)**
```
GIVEN: levels (after classification) = [
         {price: 120, type: 'RESISTANCE'},  // HIGHEST
         {price: 110, type: 'RESISTANCE'},
         {price: 105, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'},
         {price: 90, type: 'SUPPORT'}
       ]
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  strong_resistance includes:
         {price: 120, members: [{price: 120}], extreme: true}
       Because 120 = Math.max(...resistance.map(l => l.price))
```

**Test Case 6.1.2: Max Resistance Already in a Strong Cluster**
```
GIVEN: levels = [
         {price: 120, type: 'RESISTANCE'},
         {price: 119, type: 'RESISTANCE'},
         {price: 118, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'}
       ]
AND:   strong_level_pct = 1.0
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  strong_resistance = [
         {price: 120, members: [120, 119, 118], extreme: true}  // cluster's MAX
       ]
       NOT added as a separate extreme line (no duplication)
```

**Test Case 6.1.3: Max Resistance Displayed on Chart**
```
GIVEN: classified levels from chart
AND:   strong clusters computed
WHEN:  SwingZoneChart draws strong lines
THEN:  Draw a dashed line at max_resistance price
       with label "Max" or color "red" to distinguish from regular strong lines
```

### 6.2 Min Support Detection

**Requirement:** Min Support is the **lowest support level** across the entire detection period. It is computed on-demand and marked with `extreme: true`.

**Test Case 6.2.1: Single Min Support (Lowest of All)**
```
GIVEN: levels (after classification) = [
         {price: 120, type: 'RESISTANCE'},
         {price: 110, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'},
         {price: 90, type: 'SUPPORT'},   // LOWEST
         {price: 80, type: 'SUPPORT'}    // Actually lower! So min = 80
       ]
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  strong_support includes:
         {price: 80, members: [{price: 80}], extreme: true}
       Because 80 = Math.min(...support.map(l => l.price))
```

**Test Case 6.2.2: Min Support Already in a Strong Cluster**
```
GIVEN: levels = [
         {price: 110, type: 'RESISTANCE'},
         {price: 100, type: 'SUPPORT'},
         {price: 80, type: 'SUPPORT'},
         {price: 79, type: 'SUPPORT'},
         {price: 78, type: 'SUPPORT'}
       ]
AND:   strong_level_pct = 1.0
WHEN:  find_strong_levels(levels, strong_level_pct)
THEN:  strong_support = [
         {price: 78, members: [80, 79, 78], extreme: true}  // cluster's MIN
       ]
       NOT added as a separate extreme line
```

### 6.3 Max Resistance Used in Backtest / Live Trading

**Requirement:** Max Resistance and Min Support inform the **period bounds** but do NOT directly trigger breakout trades (those use strong + nearest). They are used for:
1. Chart visualization (reference levels)
2. Trade range analysis (highest obstacle vs lowest floor)
3. Win-rate statistics (% of trades above/below extremes)

**Test Case 6.3.1: Max Resistance as Upper Bound in Backtest**
```
GIVEN: strategy with swing config
AND:   max_resistance = 120
AND:   backtest period candles
WHEN:  _simulate_swing_breakout(...)
THEN:  Trade executions CAN go above max_resistance (no hard stop)
       BUT track: "trades_above_max_resistance" count for statistics
```

**Test Case 6.3.2: Min Support as Lower Bound in Backtest**
```
GIVEN: strategy with swing config
AND:   min_support = 80
AND:   backtest period candles
WHEN:  _simulate_swing_breakout(...)
THEN:  Trade executions CAN go below min_support (no hard stop)
       BUT track: "trades_below_min_support" count for statistics
```

---

## Part 7: API & Persistence

### 7.1 Config Storage (`SwingZoneConfig`)

**Test Case 7.1.1: Config Parameters Persist Correctly**
```
GIVEN: POST /api/admin/swing-zones {
  name: "4H Pivot 30d",
  candle_size: "4hour",
  period_days: 30,
  pivot_bars: 5,
  strong_level_pct: 0.5,
  is_active: true
}
WHEN:  Config is saved to database
THEN:  SELECT * FROM swing_zone_configs WHERE id = ?
       Returns all fields unchanged
       AND is_active = true enables this config for scanning/backtest
```

### 7.2 Scan Result Storage (`SwingZoneScanResult`)

**Test Case 7.2.1: Scan Result Persisted with Levels**
```
GIVEN: Single-instrument scan returns levels = [
  {price: 110, type: 'RESISTANCE', date: '2026-06-02'},
  {price: 100, type: 'SUPPORT', date: '2026-06-01'}
]
WHEN:  POST /api/admin/swing-zones/<id>/scan result
THEN:  SwingZoneScanResult row:
         levels_detected = JSON array of levels
         total_levels = 2
         scanned_at = now()
         instrument = "INFY" (or whatever)
```

**Test Case 7.2.2: History Capped at 20 Rows Per Config**
```
GIVEN: swing_zone_config with id = 1
AND:   Already has 20 scan results
WHEN:  New scan completes
THEN:  INSERT new result
       DELETE oldest result (by scanned_at)
       Result: always ≤ 20 rows per config
```

### 7.3 Chart Candles Endpoint

**Test Case 7.3.1: Chart Candles Return IST-Shifted Timestamps**
```
GIVEN: GET /api/admin/swing-zones/chart-candles?instrument=INFY&candle_size=4hour&period_days=30
WHEN:  Kite returns UTC timestamps
THEN:  Response candles have IST-shifted timestamps (UTC+5:30)
       For 4-hour candles: aggregated at IST boundaries (09:15 IST open)
```

---

## Part 8: Frontend Chart Rendering

### 8.1 SwingZoneChart.jsx Level Drawing

**Test Case 8.1.1: Pivot Levels Drawn in Different Colors**
```
GIVEN: SwingZoneChart receives levels = [
  {price: 110, type: 'RESISTANCE'},
  {price: 100, type: 'SUPPORT'}
]
WHEN:  Chart renders
THEN:  Draw line at 110 in RED (resistance color)
       Draw line at 100 in BLUE (support color)
       Label each with price
```

**Test Case 8.1.2: Strong Clusters Draw Thicker/Solid**
```
GIVEN: strong_resistance = [
  {price: 110, members: [110, 109], is_strong: true}
]
WHEN:  Chart renders
THEN:  Draw solid, thick line at 110
       Label with "Strong (2 members)" or similar
```

**Test Case 8.1.3: Extreme Lines Draw Dashed**
```
GIVEN: strong_resistance = [
  {price: 120, members: [120], extreme: true}
]
AND:   strong_support = [
  {price: 80, members: [80], extreme: true}
]
WHEN:  Chart renders
THEN:  Draw DASHED line at 120 (max resistance) with label "Max"
       Draw DASHED line at 80 (min support) with label "Min"
       Make them visually distinct from solid strong lines
```

**Test Case 8.1.4: Nearest Levels Marked with Indicators**
```
GIVEN: nearest_resistance = {price: 110}
AND:   nearest_support = {price: 100}
AND:   current_price = 105
WHEN:  Chart renders
THEN:  Mark price 110 with an upward arrow or circle (↑ next obstacle up)
       Mark price 100 with a downward arrow or circle (↓ next obstacle down)
       Show current price as a horizontal dashed line
```

### 8.2 Chart Responsiveness to Config Changes

**Test Case 8.2.1: Changing strong_level_pct Re-clusters**
```
GIVEN: Chart displaying levels with strong_level_pct = 0.5
WHEN:  User changes strong_level_pct to 1.5 in form
AND:   Click "Re-analyze"
THEN:  Chart recalculates find_strong_levels() with 1.5%
       Strong cluster lines update
       Extreme (max/min) recalculated
       Chart redraws
```

**Test Case 8.2.2: Changing pivot_bars Updates Scan**
```
GIVEN: Chart showing levels detected with pivot_bars = 5
WHEN:  User changes pivot_bars to 3 and clicks "Scan"
THEN:  Request new scan with pivot_bars=3
       Response returns different levels (more detections with looser pivot)
       Chart refreshes
```

---

## Part 9: Integration & Parity

### 9.1 Chart ↔ Scan ↔ Backtest ↔ Live Parity

**Requirement:** `swing_breakout.py` (Python) must implement the exact same logic as `SwingZoneChart.jsx` (JavaScript). Any change must be made in both.

**Test Case 9.1.1: Chart and Backend Agree on Strong Clusters**
```
GIVEN: 30-day 4H candles for INFY
AND:   Config: pivot_bars=5, strong_level_pct=0.5
WHEN:  
  1. SwingZoneChart.jsx computes find_strong_levels(levels, 0.5)
  2. swing_breakout.find_strong_levels(levels, 0.5) in Python
THEN:  Both return identical strong_resistance and strong_support arrays
       (same prices, same members, same cluster compositions)
```

**Test Case 9.1.2: Chart and Engine Agree on Breakout Entry**
```
GIVEN: Same config as above
AND:   prev_price = 109, current_price = 111
WHEN:  
  1. SwingZoneChart evaluates breakout on the chart view
  2. TradingEngine.evaluate_breakout(...) runs on a live/paper tick
THEN:  Both return signal=true with same direction, level_price, cluster_size
```

**Test Case 9.1.3: Backtest Results Match Live Simulation**
```
GIVEN: Historical candle sequence with exact timing
AND:   Backtest runs _simulate_swing_breakout(...)
AND:   Live engine would run against the same candle sequence
WHEN:  Both execute
THEN:  Entry/exit prices within candle-granularity tolerance
       (live uses tick LTP; backtest uses candle close—only difference)
       Trade count, direction, and level prices must match
```

### 9.2 JS/Python Duplication Warning

**Requirement:** Document that changes to level logic must be dual-implemented.

**Test Case 9.2.1: Code Review Check**
```
WHEN:  PR modifies swing_breakout.py (classification, clustering, etc.)
THEN:  Code reviewer MUST check SwingZoneChart.jsx for equivalent logic
       AND require identical changes before merge
```

---

## Part 10: Edge Cases & Resilience

### 10.1 Empty or Minimal Levels

**Test Case 10.1.1: No Levels Detected**
```
GIVEN: Candles with no valid pivots
WHEN:  detect_sr_levels(...) returns []
THEN:  find_nearest_levels([]) returns {nearest_resistance: null, nearest_support: null}
       find_strong_levels([]) returns {strong_resistance: [], strong_support: []}
       evaluate_breakout([]) returns {signal: false}
```

**Test Case 10.1.2: Minimum Required Candles**
```
GIVEN: Only 2 * pivot_bars + 1 = 11 candles (pivot_bars=5)
WHEN:  detect_sr_levels(11 candles, 5)
THEN:  Can detect exactly 1 pivot (the middle candle)
       Fewer candles → no detection
```

### 10.2 Extreme Market Conditions

**Test Case 10.2.1: All Levels Same Price (Locked Market)**
```
GIVEN: levels = [
  {price: 100, type: 'RESISTANCE'},
  {price: 100, type: 'RESISTANCE'},
  {price: 100, type: 'SUPPORT'}
]
WHEN:  find_strong_levels(..., 1.0)
THEN:  Return [{price: 100, members: [all three], is_strong: true}]
       No error; treated as single extreme cluster
```

**Test Case 10.2.2: Single Resistance, No Support (Gap Down Open)**
```
GIVEN: levels = [{price: 110, type: 'RESISTANCE'}]
AND:   current_price = 90
WHEN:  find_nearest_levels(levels, 90)
THEN:  Return {
         nearest_resistance: {price: 110},  // below current but only option
         nearest_support: null
       }
```

### 10.3 Configuration Validation

**Test Case 10.3.1: Invalid strong_level_pct Values**
```
GIVEN: POST /api/admin/swing-zones {
  strong_level_pct: 2.5  // outside allowed range [0.1, 2.0]
}
WHEN:  API validates
THEN:  Return 400 Bad Request
       Message: "strong_level_pct must be in [0.1, 0.5, 1.0, 1.5, 2.0]"
```

**Test Case 10.3.2: Invalid pivot_bars**
```
GIVEN: POST /api/admin/swing-zones {
  pivot_bars: 0  // must be ≥ 1
}
WHEN:  API validates
THEN:  Return 400 Bad Request
```

---

## Part 11: Performance & Constraints

### 11.1 Candle Fetching Limits

**Test Case 11.1.1: Kite API Clamping by Interval**
```
GIVEN: Request 500 days of 1-minute candles
AND:   Kite limit for 1-minute = 60 days
WHEN:  fetch_candles_for_swing_config(...) calls Kite
THEN:  Clamp to 60 days (latest 60 from requested end date)
       Log warning: "Requested X days, Kite limit is Y days"
```

**Test Case 11.1.2: Buffer Days Added for Pivot Context**
```
GIVEN: Request 30 days of 4-hour candles
AND:   Buffer for 4hour = 40 days
WHEN:  fetch_candles_for_swing_config(...)
THEN:  Fetch 30 + 40 = 70 days from Kite
       Return only the last 30 days to user (buffer for pivot detection)
```

### 11.2 Bulk Scanner Rate Limiting

**Test Case 11.2.1: 0.35s Delay Between Historical Calls**
```
GIVEN: Bulk scan running across 100 instruments
WHEN:  _scan_worker() fetches candles for each
THEN:  Sleep 0.35s between Kite historical_data calls
       Effective throughput: ~3 req/s (Kite's rate limit)
```

**Test Case 11.2.2: Batch LTP Fetch (400 instruments per batch)**
```
GIVEN: Bulk scan with 500 instruments
WHEN:  _scan_worker() fetches LTPs
THEN:  Batch into [0:400] and [400:500]
       Call Kite.quote() max 2 times for LTPs
       (Zerodha supports 400-token batches)
```

### 11.3 Memory Constraints

**Test Case 11.3.1: In-Memory Bulk Scan Registry**
```
GIVEN: swing_level_scanner._runs dict
WHEN:  Bulk scans complete
THEN:  Keep last 5 completed runs in memory
       Delete older runs (not persisted to DB)
       Prevent unbounded memory growth
```

---

## Part 12: Backwards Compatibility & Migration

### 12.1 Database Migration from Zone to Level Detection

**Historical Context:** Earlier versions used "zones" (4H/1H/30M/15M FVG zones, S&R zones). Migration `d4e5f6a7b8c9_refactor_swing_zones_to_sr.py` refactored to pure pivot detection.

**Test Case 12.1.1: Old Data Cleared on Migration**
```
WHEN:  flask db upgrade (running migration d4e5...}
THEN:  All old swing_zone_scan_result rows with zones_detected are deleted
       OR columns renamed: zones_detected → levels_detected
       New scans use pivots, not zones
```

### 12.2 Config Parameter Evolution

**Test Case 12.2.1: Removed Parameters Ignored Gracefully**
```
GIVEN: Old config stored with {swing_left_bars, swing_right_bars, min_reactions, ...}
WHEN:  Admin loads config and system tries to use it
THEN:  Use only supported params: {pivot_bars, strong_level_pct, candle_size, period_days}
       Old fields ignored (don't error)
```

---

## Part 13: Documentation & Comments

### 13.1 Code Comments Update Required

**Requirement:** Comments in the code **must match** the actual behavior, especially for max/min logic.

**Test Case 13.1.1: Comment Accuracy Check**
```
WHEN:  Code review of swing_breakout.py and SwingZoneChart.jsx
THEN:  Verify comments say:
       "max_resistance = Math.max(...all resistance levels)"
       "min_support = Math.min(...all support levels)"
       "marked with extreme: true to distinguish period bounds"
       NOT outdated zone/ATR terminology
```

### 13.2 Naming Consistency

**Requirement:** Use consistent terminology across code, UI, and docs.

**Terminology table:**
| Term | Definition | Usage |
|---|---|---|
| **Pivot** | A candle with high/low extreme vs neighbors | `detect_sr_levels()` |
| **Level** | A price point (resistance or support) | Arrays: `levels_detected` |
| **Cluster** (Strong Level) | ≥2 same-type levels within % tolerance | `find_strong_levels()` result |
| **Extreme** (Max R / Min S) | Period's highest resistance / lowest support | `extreme: true` flag |
| **Nearest** | Closest level above/below current price | `find_nearest_levels()` result |
| **Strong + Nearest** | Nearest level is member of strong cluster | Entry condition |
| **Bias** | Direction from last level: RESISTANCE=bullish, SUPPORT=bearish | `find_last_level()` |

---

## Summary Checklist

Developers implementing or modifying this feature must verify:

- [ ] **Detection:** Pivot logic is correct (strict inequality, no equality).
- [ ] **Alternating:** Consecutive same-type levels merge, stronger survives.
- [ ] **Classification:** Levels reclassified by LTP (above=R, below/at=S).
- [ ] **Nearest:** Correctly finds closest levels above/below price.
- [ ] **Clustering:** ≥2 same-type levels within % tolerance form strong cluster.
  - [ ] Resistance cluster line = MAX price
  - [ ] Support cluster line = MIN price
- [ ] **Extreme:** Max resistance and min support marked `extreme: true`.
- [ ] **Strong + Nearest:** Nearest is member of (or in strict mode, exactly on) strong cluster.
- [ ] **Last Level Bias:** Most recent level determines direction.
- [ ] **Pre-Breakout Classification:** Use prev_price, not current_price.
- [ ] **Breakout Signal:** Condition triggers only if nearest is strong AND price crosses cluster line.
- [ ] **JS/Python Parity:** Changes in one MUST be replicated in the other (swing_breakout.py ↔ SwingZoneChart.jsx).
- [ ] **Comments:** Updated to reflect current behavior (pivot-based, not zone-based).
- [ ] **API Validation:** Config parameters (pivot_bars, strong_level_pct, candle_size, period_days) validated.
- [ ] **Rate Limiting:** Bulk scanner respects Kite rate limits (0.35s, 400-token batches).
- [ ] **History Capping:** Scan results limited to 20 per config.
- [ ] **Chart Rendering:** Max/min extremes drawn as dashed lines, distinct from strong clusters.

---

**Version History:**
- v1.0 (old): Zone-based detection with ATR and zone parameters
- v2.0 (current): Pivot-point-based S&R detection with strong clusters and extreme bounds

---

**Author Note:**  
This TDD spec captures the **current, live implementation** as of 2026-06-14.
It is the source of truth for feature behavior. All test cases are derived from actual code in:
- `backend/app/services/swing_zone_detector.py`
- `backend/app/services/swing_breakout.py`
- `frontend/src/components/admin/SwingZoneChart.jsx`

Any discrepancies between this spec and the code indicate the spec is **stale** and should be updated to match the code.
