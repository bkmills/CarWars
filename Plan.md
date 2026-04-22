# Car Wars — Development Plan

Browser-playable digital version of **Car Wars** (Steve Jackson Games, Compendium 2nd Ed.).  
Hotseat 2-car duel. No server, no build step — open `index.html` and play.

---

## Architecture

**Plain HTML5 + CSS + JavaScript — no ES modules, no dependencies.**  
ES6 modules are blocked by Chromium on `file://` URLs, so all logic lives in a single `js/game.js`.

```
CarWars/
  index.html          — layout: canvas left, sidebar right
  css/style.css       — dark retro styling
  js/
    game.js           — all game logic (~1200 lines, single script)
    Car.js            — (scratch) Car class draft
    Combat.js         — (scratch) combat draft
    GameState.js      — (scratch) state draft
    Grid.js           — (scratch) renderer draft
    UI.js             — (scratch) UI draft
    main.js           — (scratch) entry point draft
```

---

## Status

### ✅ v0.1 — Baseline Duel
- 44 × 32 square canvas grid (20 px/sq = ¼" per square, 1" heavy gridlines)
- Two pre-built cars (red P1, blue P2) — Machine Gun, Armor 4/3/3/3, HC 3, top speed 15
- Turn phases: **SPEED → MOVE → FIRE** → next player
- Click-to-move on canvas; arrow keys / WASD also work
- 8-directional facing (N, NE, E, SE, S, SW, W, NW) with arrow indicator
- To-hit: 2d6 ≥ 7, range band modifier, stationary −1 bonus
- Fire arc: ±45° front arc check; dashed targeting line on canvas
- Armor by facing (front/back/left/right), breach flag shown in red
- Criticals on breach (1d6): tire (HC−1), engine (max speed × 0.75), driver wound
- Win condition: driver takes 2 hits OR all 4 armor facings breached
- Fullscreen toggle (F key / button), hotseat play, New Game restart

### ✅ v0.2 — Momentum & Handling (Compendium Ch. 2, pp. 6–11)
- **Accel/decel limits** — `accel: 3` stat; `+` button hard-capped at `prevSpeed + accel`
- **Emergency braking** — decelerating beyond accel stat triggers a D-class maneuver
- **Handling Status (HS)** — starts at HC; drains on maneuvers, caps at HC
- **45° bend = D3** — each facing change costs 3 HS (Compendium p.9 bend table)
- **Control Table** — cross-indexes speed × HS; safe / number (1d6 roll) / XX crash
- **Loss of control** — 90° spin, speed halved, remaining moves cancelled
- **HS recovery** — both cars recover HC points of HS at end of each turn
- **Movement momentum** — `canMoveTo()` enforces ±45° max turn per step; no reversals
- **Action log** — newest entries at bottom, auto-scroll, 40-line rolling history
- **Speed UI** — selected speed colour-codes red (emergency decel) / green (safe) / orange (over accel cap); safe range hint shown
- **HS display** — shown per car panel, colour-coded green / yellow / red
- **Map zoom** — Z/X keys, mouse wheel, sidebar −/+/% buttons; 50–300%, game area scrollable

### ✅ v0.3 — Simultaneous Movement & 1×2 Footprint (Compendium pp. 6–7)
- **Phase-based movement** — 5 phases per turn; `PHASE_CHART` table (speed 0–15) distributes squares across phases matching the Compendium Movement Chart at ×10 mph scale
- **Simultaneous movement** — both cars declare speed upfront; faster car moves first each phase; coin-flip tie-break (logged)
- **1×2 car footprint** — each car occupies a front square + rear square derived from facing; `rearSquare(car)` helper; collision detection checks both squares
- **Elongated counter rendering** — `_drawCar()` draws a 1×2 body with direction arrow on front half

### ✅ v0.4 — Full Maneuver Types & Component Damage

#### Maneuvers (Compendium pp. 9–11)
Grid-representable maneuvers implemented (D1/D2 bends require sub-square precision; deferred to free-movement phase):

| Maneuver | DC | Notes |
|----------|----|-------|
| Straight | D0 | no facing change |
| Bend 45° | D3 | one facing step left or right |
| Bend 90° | D6 | two facing steps; only available when HS ≥ 6 |
| Drift | D1 | lateral slide, facing unchanged |
| Steep Drift | D3 | lateral slide at higher cost |
| Bootlegger | D7 | 180° reversal; speed 2–3 only |

- **Maneuver mode toggle** — Bend / Drift buttons in sidebar; move highlights colour-coded (cyan=D0, green=D1, blue=D3, orange=D6)
- **One maneuver per phase per car** — `maneuverUsedThisPhase` flag resets each phase / each car turn

#### Facing-relative keyboard controls
- ↑ — move forward in current facing direction
- ← / → — D3 bend left / right
- Shift+← / Shift+→ — D1 drift left / right
- Enter / Space — end move phase

#### Component Damage System
Each component has DP; when armor is breached, overflow damage hits an internal component via a facing-specific hit table (1d6):

| Facing | Roll 1–2 | Roll 3–4 | Roll 5–6 |
|--------|----------|----------|----------|
| Front | Engine | Machine Gun | Driver |
| Back | Engine | Rear-L / Rear-R Tire | Driver |
| Left | FL / RL Tire | RL Tire | Engine |
| Right | FR / RR Tire | RR Tire | Engine |

**Component stats (Killer Kart):**

| Component | DP | Effect when destroyed |
|-----------|----|-----------------------|
| Engine | 3 | Car disabled (speed 0, alive=false) |
| Each Tire (×4) | 1 | HC −1; HC=0 → car destroyed |
| Machine Gun | 3 | Cannot fire |

- Sidebar panels show Engine DP (green/yellow/red), MG DP + ammo, and four tire status squares (■ = OK green, ■ = destroyed red)
- Repeated hits to already-breached facing deal full damage to components

#### UI improvements
- Sidebar widened to 440 px; all fonts enlarged for readability
- Action log entries colour-coded by player (P1 red, P2 blue, system gray)
- Primary action button (GO / End Move / End Turn) colours match the active player

---

## Roadmap

### 🔲 v0.4 — Car Variety
- Road Warrior: speed 12, HC 4, Rocket ×1 (3d6, range 24, single shot)
- Car selection screen before match
- Different accel / top-speed profiles

### 🔲 v0.5 — Arena Options
- Selectable starting layouts (head-on, side-by-side, drag strip)
- Road boundary walls with collision
- Debris tokens from destroyed tires

### 🔲 Future
- Free movement — sub-square precision enabling D1/D2 bends, swerves, and all Compendium maneuver types
- 3+ car free-for-all
- AI opponent (basic threat-angle targeting)
- Persistent driver prestige between matches
- Mobile touch support

---

## Source Material
*Car Wars Compendium, Second Edition* — Steve Jackson Games, 1998.  
Fan project for personal use. Not affiliated with or endorsed by Steve Jackson Games.
