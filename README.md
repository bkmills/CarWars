# Car Wars — Digital Duel

A browser-based implementation of the **Steve Jackson Games** *Car Wars* tabletop combat system. Two cars enter. One car leaves.

> Runs directly from `index.html` — no server, no build step, no dependencies.

---

## How to Play

1. Clone or download the repo
2. Open `index.html` in Chrome, Edge, or Brave
3. Play hotseat — each player takes a turn on the same machine

---

## Rules Overview

Each turn has three phases:

| Phase | What happens |
|-------|-------------|
| **SPEED** | Both players declare speed for the turn (limited by acceleration stat) |
| **MOVE** | 5 movement phases — cars move simultaneously, faster car first each phase |
| **FIRE** | Each player fires weapons at the enemy car, then the turn ends |

### Movement
- Cars move on a **44 × 32** square grid (each square ≈ 15 ft / ¼ inch)
- 8-directional facing (N, NE, E, SE, S, SW, W, NW)
- Each car occupies a **1×2 footprint** (front square + rear square)
- Speed determines which of the 5 phases a car moves in (Compendium Movement Chart)
- Faster car moves first each phase; coin flip on ties

### Maneuvers
Each maneuver has a Difficulty Class (DC) that drains Handling Status (HS):

| Maneuver | DC | Description |
|----------|----|-------------|
| Straight | 0 | No facing change |
| Bend 45° | D3 | One 45° facing step |
| Bend 90° | D6 | Two 45° steps; requires HS ≥ 6 |
| Drift | D1 | Lateral slide, facing unchanged |
| Steep Drift | D3 | Larger lateral slide |
| Bootlegger | D7 | 180° reversal; only at speed 2–3 |

One maneuver allowed per phase per car. Move highlights are colour-coded: **cyan** = straight, **green** = D1 drift, **blue** = D3 bend, **orange** = D6 bend.

### Handling & Control
- Each car has a **Handling Class (HC)** and a **Handling Status (HS)**
- HS starts equal to HC; every maneuver drains HS by its DC
- Emergency braking (decel beyond accel stat) also costs HS
- When HS drops, cross-reference the **Control Table** (speed vs. HS):
  - **Safe** — no problem
  - **Number** — roll 1d6, meet or beat it or lose control
  - **XX** — loss of control unavoidable
- Losing control: car spins 90°, speed halved
- HS recovers by HC at the end of every turn

### Component Damage
When armor on a facing is **breached**, overflow damage hits an internal component (1d6 per facing):

| Facing | Possible hits |
|--------|--------------|
| Front | Engine, Machine Gun, Driver |
| Back | Engine, Rear tires, Driver |
| Left | Front-L tire, Rear-L tire, Engine |
| Right | Front-R tire, Rear-R tire, Engine |

| Component | DP | Destroyed effect |
|-----------|-----|-----------------|
| Engine | 3 | Car disabled |
| Each tire (×4) | 1 | HC −1; HC=0 → car destroyed |
| Machine Gun | 3 | Cannot fire |

Repeated hits to an already-breached facing deal full damage directly to components.

### Combat
- The Machine Gun fires in a **±45° front arc**
- **To-hit**: roll 2d6, need 7+ (modified by range and target speed)
- **Win condition**: engine destroyed, all 4 armor facings breached, OR driver takes 2 hits

---

## Controls

| Input | Action |
|-------|--------|
| Click blue square | Move car (mouse) |
| ↑ | Move forward |
| ← / → | Bend 45° left / right (D3) |
| Shift+← / Shift+→ | Drift left / right (D1) |
| Enter | Confirm speed / End move |
| Space | End move / End turn |
| `+` / `−` buttons | Adjust target speed |
| `Z` / `X` | Zoom in / out |
| Mouse wheel | Zoom in / out |
| `F` | Toggle fullscreen |

---

## Cars (v0.4)

Both cars are identical — differentiated only by color:

| Stat | Value |
|------|-------|
| Max Speed | 15 |
| Accel | 3 |
| HC | 3 |
| Armor (F/B/L/R) | 4 / 3 / 3 / 3 |
| Engine | 3 DP |
| Tires | 4 × 1 DP |
| Weapon | Machine Gun — 1d6 dmg, ROF 2, range 8, 20 rds, 3 DP |

---

## Architecture

Single-file vanilla JS — no ES modules, no bundler. Required because Chromium blocks ES6 modules on `file://` URLs.

```
CarWars/
├── index.html       # Layout and DOM structure
├── css/
│   └── style.css    # Dark retro styling
└── js/
    └── game.js      # All game logic (~1200 lines)
```

Key classes in `game.js`:

| Class | Responsibility |
|-------|---------------|
| `Car` | State: position, facing, speed, armor, components, weapons, HS |
| `GameState` | Turn loop, 5-phase movement, simultaneous order, combat |
| `Grid` | Canvas rendering (cars, move highlights, fire lines) |
| `UI` | Sidebar DOM updates, action log |

---

## Roadmap

See [Plan.md](Plan.md) for the full development plan.

**v0.1** ✅ — Playable duel, phases, fire arcs, armor, criticals  
**v0.2** ✅ — Accel limits, handling status, control table, momentum, zoom  
**v0.3** ✅ — 5-phase simultaneous movement, 1×2 car footprint  
**v0.4** ✅ — Full maneuver types, facing-relative keyboard, component damage system  
**v0.4** 🔲 — Car variety (Road Warrior, car selection screen)  
**v0.5** 🔲 — Arena options (walls, debris, starting layouts)  
**Future** 🔲 — Free movement, AI opponent, 3+ cars, mobile support  

---

## Source Material

Rules derived from the *Car Wars Compendium, Second Edition* (Steve Jackson Games, 1998).  
This project is a fan implementation for personal use — not affiliated with or endorsed by Steve Jackson Games.
