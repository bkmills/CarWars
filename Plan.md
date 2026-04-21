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
    game.js           — all game logic (~830 lines, single script)
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

---

## Roadmap

### 🔲 v0.3 — Phase-Based Simultaneous Movement
*Compendium pp. 6–7 — Movement Chart, 5 phases per turn*

Both cars move simultaneously in each of 5 phases per turn, rather than fully alternating.  
Speed determines which phases a car moves in (the Movement Chart table).

Key changes:
- New `PHASE_CHART` lookup: speed → array of 5 booleans (move this phase?)
- Turn loop: for each of phases 1–5, all cars that move in that phase advance 1 square (faster car first)
- Speed declaration still happens upfront (both players declare before any movement)
- Fire still happens at end of all 5 movement phases
- **Biggest architectural change** — `GameState` turn loop needs full redesign

### 🔲 v0.3 — 1×2 Car Footprint
*Compendium counters: 1" × ½" = 4 sq × 2 sq at our scale*

- Each car occupies a **front square** and a **rear square**
- `car.x / car.y` = front square; rear square derived from facing
- Collision detection checks both squares for both cars
- `_drawCar()` renders an elongated 1×2 counter with arrow on front
- `getHitFacing()` checks which square was struck to assign front/rear hits correctly

### 🔲 v0.4 — Full Maneuver Types
*Compendium pp. 9–11*

| Maneuver | DC | Notes |
|----------|----|-------|
| Bend 1–15° | D1 | |
| Bend 16–30° | D2 | |
| Bend 31–45° | D3 | current default (one grid step) |
| Bend 46–60° | D4 | |
| Bend 61–75° | D5 | |
| Bend 76–90° | D6 | right-angle turn |
| Drift | D1 | ¼ sq lateral, same facing |
| Steep Drift | D3 | ¼–½ sq lateral |
| Swerve | D(bend+1) | drift + opposite bend same phase |
| Bootlegger | D7 | reverse direction, 20–35 speed only |

UI: player selects maneuver type before each step

### 🔲 v0.4 — Car Variety
- Road Warrior: speed 12, HC 4, Rocket ×1 (3d6, range 24, single shot)
- Car selection screen before match
- Different accel / top-speed profiles

### 🔲 v0.5 — Arena Options
- Selectable starting layouts (head-on, side-by-side, drag strip)
- Road boundary walls with collision
- Debris tokens from destroyed tires

### 🔲 Future
- 3+ car free-for-all
- AI opponent (basic threat-angle targeting)
- Persistent driver prestige between matches
- Mobile touch support

---

## Source Material
*Car Wars Compendium, Second Edition* — Steve Jackson Games, 1998.  
Fan project for personal use. Not affiliated with or endorsed by Steve Jackson Games.
