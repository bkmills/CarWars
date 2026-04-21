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
| **SPEED** | Set your speed for the turn (limited by acceleration stat) |
| **MOVE** | Move square-by-square up to your speed |
| **FIRE** | Fire weapons at the enemy car, then end your turn |

### Movement
- Cars move on a **44 × 32** square grid (each square ≈ 15 ft)
- 8-directional facing (N, NE, E, SE, S, SW, W, NW)
- You can only turn **±45°** per square moved — no reversals or u-turns
- Diagonal moves are allowed and auto-set facing

### Handling & Control
- Each car has a **Handling Class (HC)** and a **Handling Status (HS)**
- HS starts equal to HC at the beginning of combat
- Every **45° turn** is a D3 bend maneuver → costs 3 HS
- Emergency braking beyond your accel stat also costs HS
- When HS drops, cross-reference the **Control Table** (speed vs. HS):
  - **Safe** — no problem
  - **Number** — roll 1d6, meet or beat it or lose control
  - **XX** — loss of control is unavoidable
- Losing control: car spins 90°, speed halved
- HS **recovers by HC** at the end of every turn (capped at max HC)

### Acceleration
- Each car has an **accel** stat (currently 3 squares/turn)
- You cannot accelerate more than your accel stat in one turn
- Decelerating more than your accel stat triggers a D-class maneuver

### Combat
- Weapons fire in a **±45° front arc**
- **To-hit**: roll 2d6, need 7+ (modified by range and target speed)
- Damage applied to the **hit facing** (front / back / left / right)
- When armor reaches 0 on a facing → **breach** → next hit triggers a **critical**
- Criticals (d6): tire (HC−1), engine (max speed × 0.75), driver wound
- **Win condition**: both armor facings breached OR driver takes 2 hits

---

## Controls

| Input | Action |
|-------|--------|
| Click blue square | Move car |
| Arrow keys / WASD | Move car |
| `+` / `−` buttons | Adjust target speed |
| Enter | Confirm speed / End turn |
| Space | End turn (fire phase) |
| `Z` / `X` | Zoom in / out |
| Mouse wheel | Zoom in / out |
| `F` | Toggle fullscreen |

---

## Cars (v0.2)

Both cars are identical in v0.2 — differentiated only by color:

| Stat | Value |
|------|-------|
| Max Speed | 15 |
| Accel | 3 |
| HC | 3 |
| Armor (F/B/L/R) | 4 / 3 / 3 / 3 |
| Weapon | Machine Gun — 1d6 dmg, ROF 2, range 8, 20 rounds |

---

## Architecture

Single-file vanilla JS — no ES modules, no bundler. Required because Chromium blocks ES6 modules on `file://` URLs.

```
CarWars/
├── index.html       # Layout and DOM structure
├── css/
│   └── style.css    # Dark retro styling
└── js/
    └── game.js      # All game logic (~830 lines)
```

Key classes in `game.js`:

| Class | Responsibility |
|-------|---------------|
| `Car` | State: position, speed, armor, HS, weapons |
| `GameState` | Turn logic, phases, movement, combat |
| `Grid` | Canvas rendering (cars, highlights, fire lines) |
| `UI` | Sidebar DOM updates, action log |

---

## Roadmap

See [Plan.md](Plan.md) for the full development plan.

**v0.1** ✅ — Playable duel, phases, fire arcs, armor, criticals  
**v0.2** ✅ — Accel limits, handling status, control table, momentum, zoom  
**v0.3** 🔲 — 5-phase simultaneous movement, 1×2 car footprint  
**v0.4** 🔲 — More car variety, proper maneuver types (drift, swerve, bootlegger)  

---

## Source Material

Rules derived from the *Car Wars Compendium, Second Edition* (Steve Jackson Games, 1998).  
This project is a fan implementation for personal use — not affiliated with or endorsed by Steve Jackson Games.
