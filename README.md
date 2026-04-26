# Car Wars — Digital Duel

A browser-based implementation of the **Steve Jackson Games** *Car Wars* tabletop combat system. Two cars enter. One car leaves.

> Runs directly from `index.html` — no server, no build step, no dependencies.

---

## How to Play

1. Clone or download the repo
2. Open `index.html` in Chrome, Edge, or Brave
3. Each player builds their car (body, chassis, suspension, power plant, tires, armor, weapon)
4. Play hotseat — each player takes a turn on the same machine

---

## Car Builder

Before each match, both players build their cars using the pre-game modal. Components are drawn from the *Compendium* tables:

| Component | Options |
|-----------|---------|
| Body | Subcompact, Compact, Mid-sized, Sedan, Luxury, Station Wagon, Pickup, Camper, Van |
| Chassis | Light, Standard, Heavy, Extra Heavy (modifies max load and body cost) |
| Suspension | Light, Improved, Heavy, Off-road (determines HC) |
| Power Plant | Small–Thundercat (6 electric options; sets power factors) |
| Tires | Standard–Plasticore (5 options; Pickup/Camper/Van + X-Heavy chassis = 6 tires) |
| Armor | 6 facings: Front, Back, Left, Right, Top, Under (no per-facing cap — weight limit only) |
| Machine Gun | Optional; ammo load 0–20 shots |

The builder shows running **cost / weight / spaces** totals and live-calculates:
- **Acceleration** — based on power factors vs total weight ratio (5/10/15 mph)
- **Top Speed** — `360 × PF / (PF + weight)`, rounded down to nearest 2.5 mph
- **HC** — from suspension type × body class
- **Max Reverse** — `floor(topSpeed ÷ 5)` mph

Confirms are blocked if the car is overweight, underpowered, or over the space limit.

---

## Rules Overview

Each turn has three phases:

| Phase | What happens |
|-------|-------------|
| **SPEED** | Both players declare speed for the turn (limited by acceleration stat) |
| **MOVE** | 5 movement phases — cars move simultaneously, faster car first each phase |
| **FIRE** | Each player fires weapons at the enemy car, then the turn ends |

### Movement
- Cars move on a **64 × 44** square grid (each square = ¼ inch)
- 8-directional facing (N, NE, E, SE, S, SW, W, NW)
- Each car occupies a **2×4 footprint** (2 wide × 4 deep squares)
- Speed determines which of the 5 phases a car moves in (Compendium Movement Chart)
- Faster car moves first each phase; coin flip on ties

### Maneuvers
Select a maneuver from the sidebar panel — it executes immediately (no second click needed).
Each maneuver has a Difficulty Class (DC) that drains Handling Status (HS).
The **bend angle selector** (15°–90° in 15° steps) applies to Bend, Swerve, and Pivot.

| Maneuver | DC | Description |
|----------|----|-------------|
| Straight | D0 | No facing change |
| Drift L/R | D1 | Lateral slide, facing unchanged |
| Steep Drift L/R | D3 | Larger lateral slide (2 sq) |
| Bend L/R | D1–D6 | Facing change by selected angle (15°=D1 … 90°=D6) |
| Swerve L/R | D2–D7 | 1 sq lateral offset + bend; DC = bend DC + 1 |
| Pivot L/R | D0 | At exactly 5 mph: advance 1 sq, then rotate to selected angle |
| Bootlegger | D7 | 180° reversal; only at 15–25 mph |

All DCs are +1 in reverse. One maneuver allowed per phase per car.

### Controlled Skid
When executing a Bend or Swerve, optionally declare a **controlled skid** (¼"–1") via the Skid selector. The skid DC adds to the maneuver DC; if control is maintained the car carries extra momentum in the pre-maneuver direction on its next move.

| Skid | +DC | Fire mod | Decel | Tire dmg |
|------|-----|----------|-------|----------|
| ¼"  | +1  | −1       | 0     | 0        |
| ½"  | +2  | −3       | −5    | 0        |
| ¾"  | +3  | −6       | −5    | −1       |
| 1"  | +4  | no fire  | −10   | −2       |

### Reverse Driving
- Max reverse speed = floor(topSpeed ÷ 5) mph
- Must come to a complete stop before switching direction
- Acceleration rules are identical to forward; all maneuver DCs are +1

### Handling & Control
- Each car has a **Handling Class (HC)** and a **Handling Status (HS)**
- HS starts equal to HC; every maneuver drains HS by its DC
- Emergency braking (decel beyond accel stat) also costs HS
- When HS drops, cross-reference the **Control Table** (speed vs. HS):
  - **Safe** — no problem
  - **Number** — roll 1d6, meet or beat it or lose control
  - **XX** — loss of control unavoidable
- Losing control triggers **Crash Table 1** (see below)
- HS recovers by HC at the end of every turn

### Crash Table 1 (Skids & Rolls)
On loss of control, roll 2d6 + speed modifier + (DC − 3):

| Roll | Result | Fire penalty |
|------|--------|-------------|
| ≤ 2 | Trivial skid — ¼" next move | −3 to aimed fire |
| 3–4 | Minor skid — ½" next move, −5 mph | −6 to aimed fire |
| 5–6 | Moderate skid — ¾" next move, tires −1, −10 mph, trivial skid follows | −6 to aimed fire |
| 7–8 | Severe skid — 1" next move, tires −2, −20 mph, minor skid follows | No aimed fire |
| 9–10 | Spinout — 90° spin, 1"/phase, tires −1d, decel 20 mph/turn | No aimed fire |
| 11–14 | Roll — 1d damage all facings, decel 20 mph/turn | No aimed fire |
| 15+ | Vault — 3d tire damage, 1d all facings | No aimed fire |

### Component Damage
When armor on a facing is **breached**, overflow damage hits an internal component (1d6 per facing):

| Facing | Possible hits |
|--------|--------------|
| Front | Engine, Machine Gun, Driver |
| Back | Engine, Rear tires, Driver |
| Left | Front-L tire, Rear-L tire, Engine |
| Right | Front-R tire, Rear-R tire, Engine |
| Top | Driver, Engine, Machine Gun |
| Under | Engine, Front tires, Rear tires |

| Component | DP | Destroyed effect |
|-----------|-----|-----------------|
| Engine | varies | Car disabled |
| Each tire (×4 or ×6) | varies | HC −1; HC=0 → car destroyed |
| Machine Gun | 3 | Cannot fire |

Component DP is set by the car builder (power plant and tire type). Repeated hits to an already-breached facing deal full damage directly to components.

### Combat
- The Machine Gun fires in a **±45° front arc**
- **To-hit**: roll 2d6, need 7+ (modified by range, target speed, and attacker crash status)
- **Win condition**: engine destroyed, all armor facings breached, OR driver takes 2 hits

---

## Controls

| Input | Action |
|-------|--------|
| Sidebar maneuver button | Execute maneuver immediately |
| ↑ | Move straight forward |
| ← / → | Bend 45° left / right (D3) |
| Shift+← / Shift+→ | Drift left / right (D1) |
| Enter | Confirm speed / End move |
| Space | End move / End turn |
| `+` / `−` buttons | Adjust target speed (negative = reverse) |
| `Z` / `X` | Zoom in / out |
| Mouse wheel | Zoom in / out |
| `F` | Toggle fullscreen |

---

## Architecture

Single-file vanilla JS — no ES modules, no bundler. Required because Chromium blocks ES6 modules on `file://` URLs.

```
CarWars/
├── index.html       # Layout, DOM structure, car builder modal
├── css/
│   └── style.css    # Dark retro styling
└── js/
    └── game.js      # All game logic (~1950 lines)
```

Key symbols in `game.js`:

| Symbol | Responsibility |
|--------|---------------|
| `BUILDER_DATA` | Compendium tables: bodies, chassis, suspensions, engines, tires, MG |
| `buildCarConfig()` | Computes car stats from builder selections |
| `CarBuilder` | Modal UI: open/recalc/confirm flow for P1 then P2 |
| `Car` | State: position, facing (float degrees), speed, armor (6 facings), components, weapons, HS, crash state |
| `GameState` | Turn loop, 5-phase movement, simultaneous order, combat |
| `Grid` | Canvas rendering (cars, ghost previews, fire lines) |
| `UI` | Sidebar DOM updates, action log, maneuver menu |
| `crashTable1()` | Crash Table 1 — skids, spinouts, rolls, vaults |
| `dest*()`  | Geometry helpers — `destForBend`, `destForSwerve`, `destForPivot`, `destForDrift`, etc. |
| `game.init()` | Initialises game with two built car configs |

---

## Roadmap

**v0.1** ✅ — Playable duel, phases, fire arcs, armor, criticals  
**v0.2** ✅ — Accel limits, handling status, control table, momentum, zoom  
**v0.3** ✅ — 5-phase simultaneous movement, 2×4 car footprint  
**v0.4** ✅ — Full maneuver types, facing-relative keyboard, component damage system  
**v0.5** ✅ — Sidebar maneuver panel, reverse driving, Crash Table 1 (skids/spinouts/rolls)  
**v0.6** ✅ — Car builder (body/chassis/suspension/engine/tires/armor/weapon), 6-facing armor, variable component DP  
**v0.7** ✅ — Free movement (float-degree facing, OBB collision), Swerve, Pivot (5 mph), Controlled Skid, ghost car previews  
**v0.8** 🔲 — Arena options (walls, debris, starting layouts)  
**Future** 🔲 — Additional weapons, AI opponent, 3+ cars, mobile support  

---

## Source Material

Rules derived from the *Car Wars Compendium, Second Edition* (Steve Jackson Games, 1998).  
This project is a fan implementation for personal use — not affiliated with or endorsed by Steve Jackson Games.
