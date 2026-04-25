// game.js — Car Wars v0.1 (single-file, no ES modules required)
// Open index.html directly in any browser — no server needed.

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const FACING_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// dx,dy unit vectors for 8 facings (canvas: y increases downward)
const FACING_VEC = [
  [ 0, -1],  // 0: N
  [ 1, -1],  // 1: NE
  [ 1,  0],  // 2: E
  [ 1,  1],  // 3: SE
  [ 0,  1],  // 4: S
  [-1,  1],  // 5: SW
  [-1,  0],  // 6: W
  [-1, -1],  // 7: NW
];

const PHASE = { SPEED: 'SPEED', MOVE: 'MOVE', FIRE: 'FIRE' };

// Control table: row index = Math.ceil(speed/10) - 1  (5-10 mph→row 0 … 95-100 mph→row 9)
// col index 0 = HS 0, 1 = HS -1, ..., 6 = HS -6
// Values: 0 = safe, -1 = XX (crash unavoidable), 2-6 = roll needed (need ≥ value on 1d6)
// Source: Car Wars Compendium p.8
const CONTROL_TABLE = [
  //         hs: 0    -1   -2   -3   -4   -5   -6
  /*  5-10  */ [0,   0,   0,   0,   0,   0,   2],
  /* 15-20  */ [0,   0,   0,   0,   0,   2,   3],
  /* 25-30  */ [0,   0,   0,   0,   0,   2,   4],
  /* 35-40  */ [0,   0,   0,   0,   2,   3,   4],
  /* 45-50  */ [0,   0,   0,   2,   3,   4,   5],
  /* 55-60  */ [0,   0,   2,   3,   4,   4,   5],
  /* 65-70  */ [0,   0,   2,   3,   4,   5,   6],
  /* 75-80  */ [0,   0,   3,   4,   5,   5,   6],
  /* 85-90  */ [0,   2,   3,   5,   5,   6,  -1],
  /* 95-100 */ [0,   2,   4,   5,   6,   6,  -1],
];

// Collision modifier per speed band (future use). Index matches CONTROL_TABLE rows.
const CONTROL_MODIFIER = [-3, -2, -1, 0, 1, 1, 2, 2, 2, 3];

// car.x,y = front-LEFT square of car body.
// Right perpendicular from facing (fdx,fdy): rx = -fdy, ry = fdx.
// Car occupies 4 rows along facing axis × 2 columns (axis + right-offset) = 8 squares.
function carSquaresForPos(x, y, facing) {
  const [fdx, fdy] = FACING_VEC[facing];
  const rx = -fdy, ry = fdx;
  const squares = [];
  for (let i = 0; i < 4; i++) {
    squares.push({ x: x - i*fdx,    y: y - i*fdy    });
    squares.push({ x: x - i*fdx+rx, y: y - i*fdy+ry });
  }
  return squares;
}
function carSquares(car) { return carSquaresForPos(car.x, car.y, car.facing); }

// Given a maneuver key string, return [nx, ny] destination or null (no geometry validation).
// In reverse mode all forward movement components are negated; DC+1 is handled by getMoveInfo.
function destForManeuver(key, car, halfMovePhase) {
  const f = car.facing;
  const [fdx, fdy] = FACING_VEC[f];
  const rx = -fdy, ry = fdx;
  const lx = fdy, ly = -fdx;
  const bf = car.reverse ? -1 : 1;  // direction of travel multiplier
  const fv = i => FACING_VEC[((f + i) % 8 + 8) % 8];
  switch (key) {
    case 'straight':   { const s = halfMovePhase ? 2 : 4; return [car.x + s*bf*fdx,     car.y + s*bf*fdy    ]; }
    case 'drift-l':    return [car.x + 4*bf*fdx + lx,                 car.y + 4*bf*fdy + ly               ];
    case 'drift-r':    return [car.x + 4*bf*fdx + rx,                 car.y + 4*bf*fdy + ry               ];
    case 'steep-l':    return [car.x + 4*bf*fdx + 2*lx,               car.y + 4*bf*fdy + 2*ly             ];
    case 'steep-r':    return [car.x + 4*bf*fdx + 2*rx,               car.y + 4*bf*fdy + 2*ry             ];
    case 'bend45-l':   { const v = fv(-1); return [car.x + 4*bf*v[0], car.y + 4*bf*v[1]]; }
    case 'bend45-r':   { const v = fv(+1); return [car.x + 4*bf*v[0], car.y + 4*bf*v[1]]; }
    case 'bend90-l':   { const v = fv(-2); return [car.x + 4*bf*v[0], car.y + 4*bf*v[1]]; }
    case 'bend90-r':   { const v = fv(+2); return [car.x + 4*bf*v[0], car.y + 4*bf*v[1]]; }
    case 'swerve45-l': { const v = fv(-1); return [car.x + rx + 4*bf*v[0], car.y + ry + 4*bf*v[1]]; }
    case 'swerve45-r': { const v = fv(+1); return [car.x + lx + 4*bf*v[0], car.y + ly + 4*bf*v[1]]; }
    case 'swerve90-l': { const v = fv(-2); return [car.x + rx + 4*bf*v[0], car.y + ry + 4*bf*v[1]]; }
    case 'swerve90-r': { const v = fv(+2); return [car.x + lx + 4*bf*v[0], car.y + ly + 4*bf*v[1]]; }
    default: return null;
  }
}

// Movement Chart (Compendium p.7): indexed by speed/5 (0=0mph … 15=75mph).
// Values per phase: 0=no move, 0.5=half-inch straight only (no maneuver),
//   1=one-inch full move (maneuver OK), 1.5=1"+½" (full then forced ½" straight),
//   2=two-inch (two sequential full moves, one maneuver per phase).
// Each row total × 4 squares = total squares per turn (1"=4 squares, ½"=2 squares).
const PHASE_CHART = [
  /*  0  0mph */ [0,   0,   0,   0,   0  ],
  /*  1  5mph */ [0.5, 0,   0,   0,   0  ],
  /*  2 10mph */ [1,   0,   0,   0,   0  ],
  /*  3 15mph */ [1,   0,   0.5, 0,   0  ],
  /*  4 20mph */ [1,   0,   1,   0,   0  ],
  /*  5 25mph */ [1,   0,   1,   0,   0.5],
  /*  6 30mph */ [1,   0,   1,   0,   1  ],
  /*  7 35mph */ [1,   0.5, 1,   0,   1  ],
  /*  8 40mph */ [1,   1,   1,   0,   1  ],
  /*  9 45mph */ [1,   1,   1,   0.5, 1  ],
  /* 10 50mph */ [1,   1,   1,   1,   1  ],
  /* 11 55mph */ [1.5, 1,   1,   1,   1  ],
  /* 12 60mph */ [2,   1,   1,   1,   1  ],
  /* 13 65mph */ [2,   1,   1.5, 1,   1  ],
  /* 14 70mph */ [2,   1,   2,   1,   1  ],
  /* 15 75mph */ [2,   1,   2,   1,   1.5],
];

const GRID_COLS = 64;
const GRID_ROWS = 44;
const BASE_SQ   = 20;
let   SQ        = 20;   // pixels per grid square (mutable for zoom)

// ═══════════════════════════════════════════════════════════════
// CAR CLASS & DEFINITIONS
// ═══════════════════════════════════════════════════════════════

class Car {
  constructor(cfg) {
    this.id       = cfg.id;
    this.name     = cfg.name;
    this.color    = cfg.color;
    this.x        = cfg.x;
    this.y        = cfg.y;
    this.facing   = cfg.facing;
    this.maxSpeed = cfg.maxSpeed;
    this.speed    = 0;
    this.accel    = cfg.accel;
    this.hc       = cfg.hc;
    this.handlingStatus = cfg.hc;
    this.armor    = { ...cfg.armor };
    this.maxArmor = { ...cfg.armor };
    this.breached = { front: false, back: false, left: false, right: false };
    this.driverHits = 0;
    this.alive    = true;
    this.weapons  = cfg.weapons.map(w => ({
      ...w, shotsThisTurn: 0,
      dp: w.dp || 3, maxDp: w.dp || 3, destroyed: false,
    }));
    this.reverse    = false;
    this.crashPending  = null;  // { type, dir } — skid applied at start of car's next move
    this.spinout       = null;  // { dir, rotDir } — ongoing spinout
    this.fireModifier  = 0;     // 0=normal, -3=*, -6=**, 999=no aimed fire
    this.maneuverUsedThisPhase = false;
    const edp = cfg.engineDp || 3;
    this.components = {
      engine: { dp: edp, maxDp: edp, destroyed: false },
      tires: {
        frontLeft:  { dp: 1, maxDp: 1, destroyed: false },
        frontRight: { dp: 1, maxDp: 1, destroyed: false },
        rearLeft:   { dp: 1, maxDp: 1, destroyed: false },
        rearRight:  { dp: 1, maxDp: 1, destroyed: false },
      },
    };
  }

  isDestroyed() {
    if (!this.alive || this.driverHits >= 2) return true;
    const a = this.armor;
    return a.front <= 0 && a.back <= 0 && a.left <= 0 && a.right <= 0;
  }
}

const CAR_DEFS = [
  {
    id: 1, name: 'Killer Kart', color: '#e74c3c',
    // E-facing: front-left at (4,21); right-perp = S(0,1) → body rows 21-22
    x: 4, y: 21, facing: 2,
    maxSpeed: 75, accel: 15, hc: 3,
    armor: { front: 4, back: 3, left: 3, right: 3 },
    weapons: [
      { name: 'Machine Gun', type: 'mg', range: 32,
        damageDice: 1, damageSides: 6, rof: 2, ammo: 20, dp: 3 },
    ],
  },
  {
    id: 2, name: 'Killer Kart', color: '#3498db',
    // W-facing: front-left at (59,22); right-perp = N(0,-1) → body rows 21-22
    x: 59, y: 22, facing: 6,
    maxSpeed: 75, accel: 15, hc: 3,
    armor: { front: 4, back: 3, left: 3, right: 3 },
    weapons: [
      { name: 'Machine Gun', type: 'mg', range: 32,
        damageDice: 1, damageSides: 6, rof: 2, ammo: 20, dp: 3 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// COMBAT FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function rollDice(num, sides) {
  const rolls = [];
  for (let i = 0; i < num; i++) rolls.push(Math.floor(Math.random() * sides) + 1);
  return { total: rolls.reduce((a, b) => a + b, 0), rolls };
}

// ── Handling / Control ───────────────────────────────────────────

function decelDC(extraDecel) {
  // extraDecel in mph beyond safe decel (car.accel = 15 mph)
  if (extraDecel <=  5) return 1;
  if (extraDecel <= 10) return 2;
  if (extraDecel <= 15) return 3;
  if (extraDecel <= 25) return 5;
  return 7;
}

function applyManeuver(car, dc, msgs, preFacing) {
  if (car.isDestroyed()) return;
  const pre = preFacing !== undefined ? preFacing : car.facing;
  car.handlingStatus = Math.max(-6, car.handlingStatus - dc);
  msgs.push('D' + dc + ' maneuver \u2192 HS: ' + car.handlingStatus);
  checkControl(car, msgs, dc, pre);
}

function checkControl(car, msgs, crashDC, preFacing) {
  if (car.speed === 0 || car.handlingStatus >= 1) return;
  const bandIdx = Math.max(0, Math.min(9, Math.ceil(car.speed / 10) - 1));
  const hsCol   = Math.min(6, -car.handlingStatus);
  const needed  = CONTROL_TABLE[bandIdx][hsCol];
  if (needed === 0) return;
  const dc  = crashDC   !== undefined ? crashDC   : 0;
  const pre = preFacing !== undefined ? preFacing : car.facing;
  if (needed === -1) {
    msgs.push(car.name + ' \u2014 XX: loss of control!');
    crashTable1(car, dc, pre, msgs);
    return;
  }
  const roll = Math.floor(Math.random() * 6) + 1;
  msgs.push(car.name + ' control roll: need ' + needed + '+, rolled ' + roll +
            ' \u2192 ' + (roll >= needed ? 'OK' : 'LOSE CONTROL!'));
  if (roll < needed) crashTable1(car, dc, pre, msgs);
}

function _applyTireDamage(car, dmg, msgs) {
  const pairs = [
    ['frontLeft',  'FL Tire'],
    ['frontRight', 'FR Tire'],
    ['rearLeft',   'RL Tire'],
    ['rearRight',  'RR Tire'],
  ];
  for (const [key, label] of pairs) {
    const t = car.components.tires[key];
    if (t.destroyed) continue;
    t.dp = Math.max(0, t.dp - dmg);
    if (t.dp <= 0) {
      t.dp = 0; t.destroyed = true;
      _onComponentDestroyed(car, label, msgs);
    }
  }
}

// Crash Table 1 (Skids & Rolls) — Compendium p.14.
// Roll = 2d6 + CONTROL_MODIFIER[bandIdx] + (crashDC - 3).
function crashTable1(car, crashDC, preFacing, msgs) {
  const bandIdx = Math.max(0, Math.min(9, Math.ceil(car.speed / 10) - 1));
  const mod     = CONTROL_MODIFIER[bandIdx] + (crashDC - 3);
  const roll    = rollDice(2, 6).total;
  const total   = Math.max(2, roll + mod);
  const modStr  = mod !== 0 ? (mod > 0 ? '+' : '') + mod : '';
  msgs.push(car.name + ' — Crash Table 1: 2d6=' + roll + modStr + '=' + total);

  if (total <= 2) {
    // Trivial skid: ¼" in pre-maneuver dir. *
    car.crashPending = { type: 'trivial', dir: preFacing };
    car.fireModifier = Math.min(car.fireModifier, -3);
    msgs.push('\u25b6 Trivial skid (*) — \u00bc" skid next move, aimed fire \u22123');
  } else if (total <= 4) {
    // Minor skid: ½" in pre-maneuver dir, speed -5. **
    car.crashPending = { type: 'minor', dir: preFacing };
    car.speed = Math.max(0, car.speed - 5);
    car.fireModifier = Math.min(car.fireModifier, -6);
    msgs.push('\u25b6 Minor skid (**) — \u00bd" skid next move, speed \u22125 mph \u2192 ' + car.speed + ' mph, aimed fire \u22126');
  } else if (total <= 6) {
    // Moderate skid: ¾", tires -1, speed -10, trivial next. **
    car.crashPending = { type: 'moderate', dir: preFacing };
    car.speed = Math.max(0, car.speed - 10);
    car.fireModifier = Math.min(car.fireModifier, -6);
    _applyTireDamage(car, 1, msgs);
    msgs.push('\u25b6 Moderate skid (**) — \u00be" skid next move, tires \u22121 DP, speed \u221210 mph \u2192 ' + car.speed + ' mph, aimed fire \u22126');
  } else if (total <= 8) {
    // Severe skid: 1", tires -2, speed -20, minor next. ***
    car.crashPending = { type: 'severe', dir: preFacing };
    car.speed = Math.max(0, car.speed - 20);
    car.fireModifier = 999;
    _applyTireDamage(car, 2, msgs);
    msgs.push('\u25b6 Severe skid (***) — 1" skid next move, tires \u22122 DP, speed \u221220 mph \u2192 ' + car.speed + ' mph, no aimed fire');
  } else if (total <= 10) {
    // Spinout: 90° spin, 1"/phase in pre-man dir, tires -1d, decel 20/turn. ***
    const rotDir  = Math.random() < 0.5 ? 2 : -2;
    const tireRoll = rollDice(1, 6).total;
    car.spinout = { dir: preFacing, rotDir };
    car.fireModifier = 999;
    _applyTireDamage(car, tireRoll, msgs);
    msgs.push('\u25b6 SPINOUT (***) — 90\xb0 spin + 1"/phase, tires \u2212' + tireRoll + ' DP, decel 20 mph/turn, no aimed fire');
  } else if (total <= 14) {
    // Roll: car rolls over, 1d damage each facing, decel 20/turn. ***
    const rotDir = Math.random() < 0.5 ? 2 : -2;
    car.spinout  = { dir: preFacing, rotDir };
    car.fireModifier = 999;
    for (const face of ['front', 'back', 'left', 'right']) {
      const d = rollDice(1, 6).total;
      msgs.push(...applyDamage(car, d, face));
    }
    if (total >= 13) msgs.push('\u25b6 ROLLS OVER — FIRE CHECK: ' + (Math.floor(Math.random() * 6) + 1 >= 4 ? 'BURNING!' : 'no fire'));
    msgs.push('\u25b6 CAR ROLLS (***) — 1d dmg all facings, decel 20 mph/turn, no aimed fire');
  } else {
    // Vault: vaults into air, 3d tires, 1d each facing. ***
    const rotDir = Math.random() < 0.5 ? 2 : -2;
    car.spinout  = { dir: preFacing, rotDir };
    car.fireModifier = 999;
    _applyTireDamage(car, rollDice(3, 6).total, msgs);
    for (const face of ['front', 'back', 'left', 'right']) {
      msgs.push(...applyDamage(car, rollDice(1, 6).total, face));
    }
    msgs.push('\u25b6 VAULT (***) — 3d tire dmg, 1d all facings, no aimed fire');
  }
}

function checkFireArc(attacker, target, weapon) {
  const dx   = target.x - attacker.x;
  const dy   = target.y - attacker.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return { canFire: false, reason: 'Same square' };

  const [fdx, fdy] = FACING_VEC[attacker.facing];
  const dot = (dx * fdx + dy * fdy) / dist;

  if (dot < 0.707) return { canFire: false, reason: 'Target not in front arc (\xB145\xB0)' };
  if (dist > weapon.range) return { canFire: false, reason: 'Out of range (' + dist.toFixed(1) + ' sq, max ' + weapon.range + ')' };

  return { canFire: true, dist };
}

function calcToHit(target, dist, fireModifier) {
  if (fireModifier >= 999) return 999;
  let toHit = 7;
  toHit += Math.max(0, Math.floor((dist - 4) / 4));
  if (target.speed === 0) toHit -= 1;
  if (fireModifier) toHit -= fireModifier;  // -3 → +3, -6 → +6 (harder)
  return Math.max(2, Math.min(12, toHit));
}

function getHitFacing(targetFacing, fromX, fromY, toX, toY) {
  const dx  = fromX - toX;
  const dy  = fromY - toY;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return 'front';

  const [fdx, fdy] = FACING_VEC[targetFacing];
  const cos   = (dx * fdx + dy * fdy) / mag;
  const cross = dx * fdy - dy * fdx;

  if (cos  >  0.707) return 'front';
  if (cos  < -0.707) return 'back';
  return cross > 0 ? 'left' : 'right';
}

function applyDamage(car, damage, hitFacing) {
  const msgs = [];
  if (car.breached[hitFacing]) {
    msgs.push(car.name + "'s " + hitFacing + ' already BREACHED \u2014 internal hit!');
    hitComponent(car, hitFacing, damage, msgs);
  } else {
    const prevArmor = car.armor[hitFacing];
    car.armor[hitFacing] = Math.max(0, car.armor[hitFacing] - damage);
    if (car.armor[hitFacing] === 0) {
      car.breached[hitFacing] = true;
      const overflow = Math.max(1, damage - prevArmor);
      msgs.push(car.name + "'s " + hitFacing + ' armor BREACHED!' +
        (overflow > 1 ? ' (' + overflow + ' overflow)' : ''));
      hitComponent(car, hitFacing, overflow, msgs);
    }
  }
  return msgs;
}

// Component hit tables per facing (1d6)
const COMP_TABLE = {
  front: [null,'engine','engine','weapon','weapon','driver','driver'],
  back:  [null,'engine','engine','engine','tire-rl','tire-rr','driver'],
  left:  [null,'tire-fl','tire-fl','tire-rl','tire-rl','engine','engine'],
  right: [null,'tire-fr','tire-fr','tire-rr','tire-rr','engine','engine'],
};

function hitComponent(car, facing, damage, msgs) {
  const roll   = Math.floor(Math.random() * 6) + 1;
  const result = COMP_TABLE[facing][roll];
  msgs.push('Internal roll: ' + roll + ' \u2192 ' + result.replace('-',' ').toUpperCase());

  if (result === 'driver') {
    car.driverHits++;
    if (car.driverHits >= 2) {
      car.alive = false;
      msgs.push('DRIVER KILLED \u2014 ' + car.name + ' is OUT!');
    } else {
      msgs.push('Driver wounded! (' + car.driverHits + '/2 hits)');
    }
    return;
  }

  let comp, label;
  if (result === 'engine') {
    comp  = car.components.engine;
    label = 'Engine';
  } else if (result === 'weapon') {
    const w = car.weapons.find(wp => !wp.destroyed);
    if (!w) { msgs.push('No weapons left to hit'); return; }
    comp  = w;
    label = w.name;
  } else {
    const tireKey = { 'tire-fl':'frontLeft','tire-fr':'frontRight',
                      'tire-rl':'rearLeft', 'tire-rr':'rearRight' }[result];
    comp  = car.components.tires[tireKey];
    label = result.replace('tire-','').toUpperCase() + ' Tire';
  }

  if (comp.destroyed) {
    msgs.push(label + ' already destroyed \u2014 no effect');
    return;
  }
  comp.dp = Math.max(0, comp.dp - damage);
  if (comp.dp <= 0) {
    comp.dp        = 0;
    comp.destroyed = true;
    _onComponentDestroyed(car, label, msgs);
  } else {
    msgs.push(label + ': ' + comp.dp + '/' + comp.maxDp + ' DP remaining');
  }
}

function _onComponentDestroyed(car, label, msgs) {
  msgs.push('\u26a0 ' + label + ' DESTROYED!');
  if (label === 'Engine') {
    car.maxSpeed = 0;
    car.speed    = 0;
    car.alive    = false;
    msgs.push(car.name + ' engine out \u2014 car disabled!');
  } else if (label.endsWith('Tire')) {
    car.hc = Math.max(0, car.hc - 1);
    if (car.handlingStatus > car.hc) car.handlingStatus = car.hc;
    msgs.push(car.name + ' tire blown! HC \u2192 ' + car.hc);
    if (car.hc === 0) {
      car.alive = false;
      msgs.push(car.name + ' lost all tires \u2014 destroyed!');
    }
  } else {
    msgs.push(car.name + "'s " + label + ' is out of action!');
  }
}

// ═══════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════

class GameState {
  constructor() {
    this.cars            = CAR_DEFS.map(def => new Car(def));
    this.activeIdx       = 0;
    this.phase           = PHASE.SPEED;
    this.turn            = 1;
    this.movesRemaining  = 0;
    this.gameOver        = false;
    this.winner          = null;
    // Move sub-state
    this.movePhase       = 0;      // 1-5
    this.moveOrder       = [];
    this.moveOrderPos    = 0;
    this.halfMovePhase   = false;  // current move is a ½" straight-only move
    this.halfMovePending = false;  // after the current full move, a forced ½" follows (1½" phase)
    this.selectedManeuver = null;  // key of maneuver chosen in sidebar; null = choosing
  }

  // Set movesRemaining + half-move flags from a PHASE_CHART cell value.
  _setPhaseMove(car, phIdx) {
    const v = PHASE_CHART[car.speed / 5][phIdx];
    if (v === 0.5) {
      this.movesRemaining  = 1;
      this.halfMovePhase   = true;
      this.halfMovePending = false;
    } else if (v === 1.5) {
      this.movesRemaining  = 2;   // full move first, then forced ½"
      this.halfMovePhase   = false;
      this.halfMovePending = true;
    } else if (v === 2) {
      this.movesRemaining  = 2;
      this.halfMovePhase   = false;
      this.halfMovePending = false;
    } else if (v === 1) {
      this.movesRemaining  = 1;
      this.halfMovePhase   = false;
      this.halfMovePending = false;
    } else {
      this.movesRemaining  = 0;
      this.halfMovePhase   = false;
      this.halfMovePending = false;
    }
  }

  get activeCar() { return this.cars[this.activeIdx]; }
  get enemyCar()  { return this.cars[1 - this.activeIdx]; }

  // ── Speed declaration (both players declare before movement) ────

  // signedSpeed: positive = forward, negative = reverse.
  // car.speed always stores the magnitude; car.reverse stores direction.
  setSpeed(signedSpeed) {
    const car         = this.activeCar;
    const prevMag     = car.speed;
    const prevReverse = car.reverse;
    const msgs        = [];

    const wantReverse = signedSpeed < 0;
    let   wantMag     = Math.abs(signedSpeed);

    // Direction switch requires stopping first
    if (wantReverse !== prevReverse && prevMag > 0) {
      msgs.push(car.name + ': must reach 0 mph before switching direction');
      wantMag = 0;
    }

    const revMax      = Math.floor(car.maxSpeed / 5);
    const maxMag      = wantReverse ? revMax : car.maxSpeed;
    const maxThisTurn = Math.min(maxMag, prevMag + car.accel);
    if (wantMag > maxThisTurn) {
      wantMag = maxThisTurn;
      msgs.push('Accel limit: max ' + (wantReverse ? '\u2212' : '') + wantMag + ' mph this turn');
    }
    wantMag = Math.max(0, Math.min(maxMag, wantMag));

    car.speed   = wantMag;
    car.reverse = wantReverse && wantMag > 0;

    const decelAmt = prevMag - wantMag;
    if (decelAmt > car.accel) {
      const dc = decelDC(decelAmt - car.accel);
      msgs.push(car.name + ' emergency brake \u2212' + decelAmt + ' mph (D' + dc + ')');
      applyManeuver(car, dc, msgs, car.facing);
      this._checkDestroyed(msgs);
    }
    msgs.unshift(car.name + ' sets speed to ' +
      (car.reverse ? '\u2212' : '') + car.speed + ' mph' +
      (car.reverse ? ' (REVERSE)' : ''));

    if (this.activeIdx === 0) {
      this.activeIdx      = 1;
      this.movesRemaining = 0;
    } else {
      msgs.push(...this._enterMovePhase());
    }
    return msgs;
  }

  // ── Movement ────────────────────────────────────────────────────

  _enterMovePhase() {
    this.phase     = PHASE.MOVE;
    this.movePhase = 1;
    return this._startMovePhase();
  }

  _startMovePhase() {
    const msgs = [];
    // Advance past phases where no car moves
    while (this.movePhase <= 5) {
      const phIdx = this.movePhase - 1;
      this.moveOrder = [];
      for (let i = 0; i < this.cars.length; i++) {
        const car = this.cars[i];
        if (!car.isDestroyed() && car.speed > 0 && PHASE_CHART[car.speed / 5][phIdx] > 0) {
          this.moveOrder.push(i);
        }
      }
      if (this.moveOrder.length > 0) break;
      this.movePhase++;
    }

    if (this.movePhase > 5 || this.moveOrder.length === 0) {
      this._enterFirePhase();
      return msgs;
    }

    // Resolve move order — tie gets a coin flip
    if (this.moveOrder.length === 2 &&
        this.cars[this.moveOrder[0]].speed === this.cars[this.moveOrder[1]].speed) {
      if (Math.random() < 0.5) this.moveOrder.reverse();
      msgs.push('Ph' + this.movePhase + ' tie \u2014 coin flip: ' +
                this.cars[this.moveOrder[0]].name + ' moves first');
    } else {
      this.moveOrder.sort((a, b) => this.cars[b].speed - this.cars[a].speed);
    }

    this.moveOrderPos                    = 0;
    this.activeIdx                       = this.moveOrder[0];
    this.activeCar.maneuverUsedThisPhase = false;

    this._setPhaseMove(this.activeCar, this.movePhase - 1);
    const crashMsgs = this._applyCrashEffects();
    if (crashMsgs.length > 0) {
      msgs.push(...crashMsgs);
      if (this.movesRemaining <= 0) msgs.push(...this._advanceMover());
    }
    return msgs;
  }

  _advanceMover() {
    this.moveOrderPos++;
    if (this.moveOrderPos < this.moveOrder.length) {
      this.activeIdx                       = this.moveOrder[this.moveOrderPos];
      this.activeCar.maneuverUsedThisPhase = false;
      this._setPhaseMove(this.activeCar, this.movePhase - 1);
      const crashMsgs = this._applyCrashEffects();
      if (crashMsgs.length > 0 && this.movesRemaining <= 0) {
        return [...crashMsgs, ...this._advanceMover()];
      }
      return crashMsgs;
    } else {
      this.movePhase++;
      return this._startMovePhase();
    }
  }

  // Returns { maneuverDC, newFacing, isDrift } or null if the move is illegal.
  // Full move = 1" = 4 squares; half-move = ½" = 2 squares (straight only, no maneuver).
  // In reverse: movement direction is negated; all maneuver DCs are +1.
  getMoveInfo(col, row) {
    if (this.phase !== PHASE.MOVE || this.movesRemaining <= 0) return null;
    const car = this.activeCar;
    const f   = car.facing;
    const [fdx, fdy] = FACING_VEC[f];
    const bf  = car.reverse ? -1 : 1;  // forward direction multiplier
    const rDC = car.reverse ? 1 : 0;   // DC penalty for reverse

    const _checkPos = (cx, cy, facing) => {
      const sqs = carSquaresForPos(cx, cy, facing);
      for (const sq of sqs)
        if (sq.x < 0 || sq.x >= GRID_COLS || sq.y < 0 || sq.y >= GRID_ROWS) return false;
      const eSqs = carSquares(this.enemyCar);
      for (const ns of sqs) for (const es of eSqs)
        if (ns.x === es.x && ns.y === es.y) return false;
      return true;
    };

    if (this.halfMovePhase) {
      if (col !== car.x + 2*bf*fdx || row !== car.y + 2*bf*fdy) return null;
      if (!_checkPos(col, row, f)) return null;
      return { maneuverDC: 0, newFacing: f, isDrift: false };
    }

    const rx = -fdy, ry =  fdx;
    const lx =  fdy, ly = -fdx;
    const dc = col - car.x, dr = row - car.y;

    // Straight
    if (dc === 4*bf*fdx && dr === 4*bf*fdy) {
      if (!_checkPos(col, row, f)) return null;
      return { maneuverDC: 0, newFacing: f, isDrift: false };
    }

    if (!car.maneuverUsedThisPhase) {
      // Drift D1 (D2 in reverse)
      if ((dc === 4*bf*fdx+lx && dr === 4*bf*fdy+ly) || (dc === 4*bf*fdx+rx && dr === 4*bf*fdy+ry)) {
        if (!_checkPos(col, row, f)) return null;
        return { maneuverDC: 1+rDC, newFacing: f, isDrift: true };
      }
      // Steep Drift D3 (D4 in reverse)
      if ((dc === 4*bf*fdx+2*lx && dr === 4*bf*fdy+2*ly) || (dc === 4*bf*fdx+2*rx && dr === 4*bf*fdy+2*ry)) {
        if (!_checkPos(col, row, f)) return null;
        return { maneuverDC: 3+rDC, newFacing: f, isDrift: true };
      }
      // Bends: 4 sq in new facing direction (negated in reverse)
      const bends = [
        { nf: (f-1+8)%8, cost: 3 }, { nf: (f+1)%8,   cost: 3 },
        { nf: (f-2+8)%8, cost: 6 }, { nf: (f+2)%8,   cost: 6 },
      ];
      for (const b of bends) {
        const [bx, by] = FACING_VEC[b.nf];
        if (dc === 4*bf*bx && dr === 4*bf*by) {
          if (!_checkPos(col, row, b.nf)) return null;
          return { maneuverDC: b.cost+rDC, newFacing: b.nf, isDrift: false };
        }
      }
      // Swerves: lateral offset + bend (negated in reverse)
      const swerves = [
        { latX: rx, latY: ry, nf: (f-1+8)%8, cost: 4 },
        { latX: lx, latY: ly, nf: (f+1)%8,   cost: 4 },
        { latX: rx, latY: ry, nf: (f-2+8)%8, cost: 7 },
        { latX: lx, latY: ly, nf: (f+2)%8,   cost: 7 },
      ];
      for (const s of swerves) {
        const [bx, by] = FACING_VEC[s.nf];
        if (dc === s.latX + 4*bf*bx && dr === s.latY + 4*bf*by) {
          if (!_checkPos(col, row, s.nf)) return null;
          return { maneuverDC: s.cost+rDC, newFacing: s.nf, isDrift: false, isSwerve: true };
        }
      }
    }

    return null;
  }

  canMoveTo(col, row) { return this.getMoveInfo(col, row) !== null; }

  // Returns true if the active car has at least one legal destination this sub-move.
  hasValidMoves() {
    if (this.phase !== PHASE.MOVE || this.movesRemaining <= 0) return false;
    const car = this.activeCar;
    const f   = car.facing;
    const [fdx, fdy] = FACING_VEC[f];
    const bf  = car.reverse ? -1 : 1;
    const rx = -fdy, ry = fdx;
    const lx = fdy, ly = -fdx;
    const fv = i => FACING_VEC[((f + i) % 8 + 8) % 8];
    const candidates = this.halfMovePhase ? [
      [car.x + 2*bf*fdx, car.y + 2*bf*fdy],
    ] : [
      [car.x + 4*bf*fdx,               car.y + 4*bf*fdy              ],
      [car.x + 4*bf*fdx + lx,          car.y + 4*bf*fdy + ly         ],
      [car.x + 4*bf*fdx + rx,          car.y + 4*bf*fdy + ry         ],
      [car.x + 4*bf*fdx + 2*lx,        car.y + 4*bf*fdy + 2*ly       ],
      [car.x + 4*bf*fdx + 2*rx,        car.y + 4*bf*fdy + 2*ry       ],
      [car.x + 4*bf*fv(-1)[0],         car.y + 4*bf*fv(-1)[1]        ],
      [car.x + 4*bf*fv(+1)[0],         car.y + 4*bf*fv(+1)[1]        ],
      [car.x + 4*bf*fv(-2)[0],         car.y + 4*bf*fv(-2)[1]        ],
      [car.x + 4*bf*fv(+2)[0],         car.y + 4*bf*fv(+2)[1]        ],
      [car.x + rx + 4*bf*fv(-1)[0],    car.y + ry + 4*bf*fv(-1)[1]   ],
      [car.x + lx + 4*bf*fv(+1)[0],    car.y + ly + 4*bf*fv(+1)[1]   ],
      [car.x + rx + 4*bf*fv(-2)[0],    car.y + ry + 4*bf*fv(-2)[1]   ],
      [car.x + lx + 4*bf*fv(+2)[0],    car.y + ly + 4*bf*fv(+2)[1]   ],
    ];
    return candidates.some(([c, r]) => this.getMoveInfo(c, r) !== null);
  }

  moveActiveCar(col, row) {
    const info       = this.getMoveInfo(col, row);
    const car        = this.activeCar;
    const wasHalf    = this.halfMovePhase;
    const origFacing = car.facing;
    this.selectedManeuver = null;
    car.x      = col;
    car.y      = row;
    car.facing = info.newFacing;
    this.movesRemaining--;

    // After the full move in a 1½" phase, the next sub-move becomes a forced ½" straight.
    if (this.halfMovePending && this.movesRemaining === 1) {
      this.halfMovePhase   = true;
      this.halfMovePending = false;
    }

    const msgs = [];
    if (info.maneuverDC > 0) {
      const label = info.isSwerve
        ? (info.maneuverDC === 4 ? 'Swerve 45\xB0' : 'Swerve 90\xB0')
        : info.isDrift
          ? (info.maneuverDC === 1 ? 'Drift' : 'Steep Drift')
          : (info.maneuverDC === 3 ? 'Bend 45\xB0' : 'Bend 90\xB0');
      car.maneuverUsedThisPhase = true;
      applyManeuver(car, info.maneuverDC, msgs, origFacing);
      this._checkDestroyed(msgs);
      msgs.unshift(car.name + ' \u2192 (' + col + ',' + row + ') Ph' + this.movePhase +
                   ' [' + label + ' D' + info.maneuverDC + '] facing ' + FACING_NAMES[car.facing]);
    } else if (wasHalf) {
      msgs.push(car.name + ' \u2192 (' + col + ',' + row + ') Ph' + this.movePhase +
                ' [\xBD" straight] facing ' + FACING_NAMES[car.facing]);
    } else {
      msgs.push(car.name + ' \u2192 (' + col + ',' + row + ') Ph' + this.movePhase +
                ' facing ' + FACING_NAMES[car.facing]);
    }

    if (this.movesRemaining <= 0 || car.isDestroyed()) msgs.push(...this._advanceMover());
    return msgs;
  }

  endMove() {
    return this._advanceMover();
  }

  // Apply any pending crash effects for the active car at the start of its move.
  // Returns log messages. Sets movesRemaining=0 when the car's movement is consumed.
  _applyCrashEffects() {
    const car  = this.activeCar;
    const msgs = [];

    if (car.spinout) {
      const { dir, rotDir } = car.spinout;
      car.facing = (car.facing + rotDir + 8) % 8;
      const [fdx, fdy] = FACING_VEC[dir];
      car.x = Math.max(0, Math.min(GRID_COLS - 1, car.x + 4 * fdx));
      car.y = Math.max(0, Math.min(GRID_ROWS - 1, car.y + 4 * fdy));
      msgs.push(car.name + ' SPINOUT \u2014 facing \u2192 ' + FACING_NAMES[car.facing] +
                ', slides 1" \u2192 (' + car.x + ',' + car.y + ')');
      this.movesRemaining = 0;
      this._checkDestroyed(msgs);
      return msgs;
    }

    if (car.crashPending) {
      const { type, dir } = car.crashPending;
      car.crashPending = null;
      const [fdx, fdy]  = FACING_VEC[dir];
      const [cfx, cfy]  = FACING_VEC[car.facing];
      const sizeLabel   = { trivial: '\u00bc"', minor: '\u00bd"', moderate: '\u00be"', severe: '1"' };
      let skidSq = 0, afterSq = 0;

      if (type === 'trivial')  { skidSq = 1; afterSq = 3; }
      else if (type === 'minor')    { skidSq = 2; afterSq = 2;
        car.speed = Math.max(0, car.speed - 5);
        msgs.push(car.name + ' minor skid \u2014 speed \u22125 mph \u2192 ' + car.speed + ' mph');
      } else if (type === 'moderate') { skidSq = 3; afterSq = 1;
        car.crashPending = { type: 'trivial', dir };  // trivial skid next phase
      } else if (type === 'severe') { skidSq = 4; afterSq = 0;
        car.crashPending = { type: 'minor', dir };    // minor skid next phase
      }

      car.x = Math.max(0, Math.min(GRID_COLS - 1, car.x + skidSq * fdx));
      car.y = Math.max(0, Math.min(GRID_ROWS - 1, car.y + skidSq * fdy));
      msgs.push(car.name + ' ' + type + ' skid ' + sizeLabel[type] + ' \u2192 (' + car.x + ',' + car.y + ')');

      if (afterSq > 0) {
        car.x = Math.max(0, Math.min(GRID_COLS - 1, car.x + afterSq * cfx));
        car.y = Math.max(0, Math.min(GRID_ROWS - 1, car.y + afterSq * cfy));
        const afterLabel = afterSq === 1 ? '\u00bc"' : afterSq === 2 ? '\u00bd"' : '\u00be"';
        msgs.push(car.name + ' forced ' + afterLabel + ' straight \u2192 (' + car.x + ',' + car.y + ')');
      }

      this.movesRemaining = 0;
      this._checkDestroyed(msgs);
      return msgs;
    }

    return msgs;
  }

  _checkDestroyed(msgs) {
    for (let i = 0; i < this.cars.length; i++) {
      if (this.cars[i].isDestroyed() && !this.gameOver) {
        this.gameOver = true;
        this.winner   = this.cars[1 - i];
        msgs.push('\u2605 ' + this.winner.name + ' WINS!');
        return;
      }
    }
  }

  // ── Special maneuvers ───────────────────────────────────────────

  canBootlegger() {
    const car = this.activeCar;
    return this.phase === PHASE.MOVE &&
           this.movesRemaining > 0 &&
           !car.maneuverUsedThisPhase &&
           !this.halfMovePhase &&
           car.speed >= 15 && car.speed <= 25;
  }

  doBootlegger() {
    this.selectedManeuver = null;
    const car        = this.activeCar;
    const preFacing  = car.facing;
    const msgs = [car.name + ' \u2014 BOOTLEGGER!'];
    car.maneuverUsedThisPhase = true;
    applyManeuver(car, 7, msgs, preFacing);
    this._checkDestroyed(msgs);
    if (!car.isDestroyed()) {
      car.facing = (car.facing + 4) % 8;
      car.speed  = 0;
      msgs.push(car.name + ' reversed \u2192 facing ' + FACING_NAMES[car.facing] + ', speed 0');
    }
    this.movesRemaining = 0;
    msgs.push(...this._advanceMover());
    return msgs;
  }

  // ── Fire ────────────────────────────────────────────────────────

  _enterFirePhase() {
    this.phase     = PHASE.FIRE;
    this.activeIdx = 0;
    this.cars[0].weapons.forEach(w => { w.shotsThisTurn = 0; });
  }

  fireWeapon(idx) {
    const attacker = this.activeCar;
    const target   = this.enemyCar;
    const weapon   = attacker.weapons[idx];

    if (!weapon)                        return { hit: false, messages: ['No such weapon'] };
    if (weapon.destroyed)               return { hit: false, messages: [weapon.name + ' is destroyed!'] };
    if (weapon.ammo <= 0)               return { hit: false, messages: [weapon.name + ' is out of ammo!'] };
    if (weapon.shotsThisTurn >= weapon.rof)
                                        return { hit: false, messages: [weapon.name + ' ROF limit reached'] };

    if (attacker.fireModifier >= 999)    return { hit: false, messages: ['No aimed fire this turn (***)'] };

    const arcCheck = checkFireArc(attacker, target, weapon);
    if (!arcCheck.canFire)              return { hit: false, messages: [arcCheck.reason] };

    const dist    = arcCheck.dist;
    const toHit   = calcToHit(target, dist, attacker.fireModifier);
    const diceRes = rollDice(2, 6);
    const hit     = diceRes.total >= toHit;

    weapon.shotsThisTurn++;
    weapon.ammo--;

    const msgs = [
      attacker.name + ' fires ' + weapon.name + ' at ' + target.name,
      'Range ' + dist.toFixed(1) + ' | Need ' + toHit + '+ | Roll ' +
        diceRes.rolls.join('+') + '=' + diceRes.total + ' \u2192 ' + (hit ? 'HIT!' : 'miss'),
    ];

    if (hit) {
      const hitFacing = getHitFacing(target.facing, attacker.x, attacker.y, target.x, target.y);
      const dmgRes    = rollDice(weapon.damageDice, weapon.damageSides);
      msgs.push('Hits ' + target.name + "'s " + hitFacing + '! Dmg: ' +
                dmgRes.rolls.join('+') + '=' + dmgRes.total);
      msgs.push(...applyDamage(target, dmgRes.total, hitFacing));
      if (target.isDestroyed()) {
        this.gameOver = true;
        this.winner   = attacker;
        msgs.push('\u2605 ' + attacker.name + ' WINS! \u2605');
      }
    }
    return { hit, messages: msgs };
  }

  // Called when active player ends their fire turn
  endFire() {
    const msgs = [];
    if (this.activeIdx === 0 && !this.gameOver) {
      // P1 done — P2 fires
      this.activeIdx = 1;
      this.cars[1].weapons.forEach(w => { w.shotsThisTurn = 0; });
      msgs.push('--- ' + this.activeCar.name + ' (P2) fires ---');
    } else {
      // P2 done — end turn
      this._endTurnFinal();
    }
    return msgs;
  }

  _endTurnFinal() {
    for (const car of this.cars) {
      if (car.spinout) {
        car.speed = Math.max(0, car.speed - 20);
        if (car.speed === 0) car.spinout = null;
      }
      car.fireModifier   = 0;
      car.handlingStatus = Math.min(car.hc, car.handlingStatus + car.hc);
    }
    this.turn++;
    this.activeIdx      = 0;
    this.phase          = PHASE.SPEED;
    this.movesRemaining = 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// GRID RENDERER
// ═══════════════════════════════════════════════════════════════

class Grid {
  constructor(canvas, gameState) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.gs     = gameState;
    this.resize();
  }

  resize() {
    this.canvas.width  = GRID_COLS * SQ;
    this.canvas.height = GRID_ROWS * SQ;
  }

  render() {
    this._bg();
    this._gridLines();
    this._highlights();
    this._cars();
  }

  _bg() {
    this.ctx.fillStyle = '#0f0f1e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _gridLines() {
    const ctx = this.ctx;
    for (let c = 0; c <= GRID_COLS; c++) {
      ctx.strokeStyle = c % 4 === 0 ? '#252545' : '#181830';
      ctx.lineWidth   = c % 4 === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(c*SQ, 0); ctx.lineTo(c*SQ, GRID_ROWS*SQ); ctx.stroke();
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      ctx.strokeStyle = r % 4 === 0 ? '#252545' : '#181830';
      ctx.lineWidth   = r % 4 === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(0, r*SQ); ctx.lineTo(GRID_COLS*SQ, r*SQ); ctx.stroke();
    }
  }

  _highlights() {
    const { gs } = this;
    if (gs.phase === PHASE.MOVE && gs.movesRemaining > 0) this._moveMoves();
    if (gs.phase === PHASE.FIRE) this._fireTarget();
    this._activeOutline();
  }

  _moveMoves() {
    const ctx = this.ctx;
    const gs  = this.gs;
    const sel = gs.selectedManeuver;
    const car = gs.activeCar;
    const f   = car.facing;
    const [fdx, fdy] = FACING_VEC[f];
    const rx = -fdy, ry =  fdx;
    const lx =  fdy, ly = -fdx;
    const colors = {
      0: ['rgba(0,200,255,0.12)', 'rgba(0,200,255,0.38)'],
      1: ['rgba(0,230,120,0.18)', 'rgba(0,230,120,0.55)'],
      3: ['rgba(0,140,255,0.18)', 'rgba(0,140,255,0.55)'],
      4: ['rgba(180,0,255,0.18)', 'rgba(180,0,255,0.60)'],
      6: ['rgba(255,140,0,0.18)', 'rgba(255,140,0,0.55)'],
      7: ['rgba(255,50,50,0.18)', 'rgba(255,50,50,0.60)'],
    };

    let dests;
    if (sel && sel !== 'bootlegger') {
      // Show only the selected maneuver's destination
      const d = destForManeuver(sel, car, gs.halfMovePhase);
      dests = d ? [{ nx: d[0], ny: d[1] }] : [];
    } else {
      dests = gs.halfMovePhase ? [
        { nx: car.x + 2*fdx, ny: car.y + 2*fdy },
      ] : [
        { nx: car.x + 4*fdx,                               ny: car.y + 4*fdy                               },
        { nx: car.x + 4*fdx + lx,                          ny: car.y + 4*fdy + ly                          },
        { nx: car.x + 4*fdx + rx,                          ny: car.y + 4*fdy + ry                          },
        { nx: car.x + 4*fdx + 2*lx,                        ny: car.y + 4*fdy + 2*ly                        },
        { nx: car.x + 4*fdx + 2*rx,                        ny: car.y + 4*fdy + 2*ry                        },
        { nx: car.x + 4*FACING_VEC[(f-1+8)%8][0],         ny: car.y + 4*FACING_VEC[(f-1+8)%8][1]          },
        { nx: car.x + 4*FACING_VEC[(f+1)%8][0],           ny: car.y + 4*FACING_VEC[(f+1)%8][1]            },
        { nx: car.x + 4*FACING_VEC[(f-2+8)%8][0],         ny: car.y + 4*FACING_VEC[(f-2+8)%8][1]          },
        { nx: car.x + 4*FACING_VEC[(f+2)%8][0],           ny: car.y + 4*FACING_VEC[(f+2)%8][1]            },
        { nx: car.x + rx + 4*FACING_VEC[(f-1+8)%8][0],    ny: car.y + ry + 4*FACING_VEC[(f-1+8)%8][1]     },
        { nx: car.x + lx + 4*FACING_VEC[(f+1)%8][0],      ny: car.y + ly + 4*FACING_VEC[(f+1)%8][1]       },
        { nx: car.x + rx + 4*FACING_VEC[(f-2+8)%8][0],    ny: car.y + ry + 4*FACING_VEC[(f-2+8)%8][1]     },
        { nx: car.x + lx + 4*FACING_VEC[(f+2)%8][0],      ny: car.y + ly + 4*FACING_VEC[(f+2)%8][1]       },
      ];
    }

    const seen = new Set();
    for (const { nx, ny } of dests) {
      const key = nx + ',' + ny;
      if (seen.has(key)) continue;
      seen.add(key);
      const info = gs.getMoveInfo(nx, ny);
      if (!info) continue;
      const [fill, stroke] = colors[info.maneuverDC] || colors[0];
      ctx.fillStyle   = fill;
      ctx.fillRect(nx*SQ, ny*SQ, SQ, SQ);
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = 1;
      ctx.strokeRect(nx*SQ+0.5, ny*SQ+0.5, SQ-1, SQ-1);
    }
  }

  _fireTarget() {
    const ctx    = this.ctx;
    const atk    = this.gs.activeCar;
    const enemy  = this.gs.enemyCar;
    let canFire  = false;
    for (const w of atk.weapons) {
      if (w.ammo > 0 && w.shotsThisTurn < w.rof && checkFireArc(atk, enemy, w).canFire) {
        canFire = true; break;
      }
    }

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = canFire ? 'rgba(255,180,0,0.7)' : 'rgba(180,40,40,0.5)';
    ctx.beginPath();
    ctx.moveTo((atk.x+0.5)*SQ, (atk.y+0.5)*SQ);
    ctx.lineTo((enemy.x+0.5)*SQ, (enemy.y+0.5)*SQ);
    ctx.stroke();
    ctx.restore();

    if (canFire) {
      for (const sq of carSquares(enemy)) {
        ctx.fillStyle = 'rgba(255,180,0,0.15)';
        ctx.fillRect(sq.x*SQ, sq.y*SQ, SQ, SQ);
        ctx.strokeStyle = 'rgba(255,180,0,0.75)';
        ctx.lineWidth   = 2;
        ctx.strokeRect(sq.x*SQ+1, sq.y*SQ+1, SQ-2, SQ-2);
      }
    }
  }

  _activeOutline() {
    const car = this.gs.activeCar;
    this.ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    this.ctx.lineWidth   = 1.5;
    for (const sq of carSquares(car)) {
      this.ctx.strokeRect(sq.x*SQ+1, sq.y*SQ+1, SQ-2, SQ-2);
    }
  }

  _cars() {
    for (const car of this.gs.cars) this._drawCar(car);
  }

  _drawCar(car) {
    const ctx = this.ctx;
    const [fdx, fdy] = FACING_VEC[car.facing];
    const rx = -fdy, ry = fdx;   // right perp

    // Visual center of 2×4 body:
    //   1.5 squares back along axis from front-left, 0.5 squares right
    const midX = (car.x - 1.5*fdx + 0.5*rx + 0.5) * SQ;
    const midY = (car.y - 1.5*fdy + 0.5*ry + 0.5) * SQ;
    const angle   = Math.atan2(fdy, fdx);
    const halfLen = 2 * SQ;   // half of 4-square length
    const halfW   = SQ;       // half of 2-square width

    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angle);

    if (car.isDestroyed()) {
      ctx.fillStyle = '#444';
      ctx.fillRect(-halfLen, -halfW, halfLen * 2, halfW * 2);
      ctx.strokeStyle = '#777'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-halfLen, -halfW); ctx.lineTo(halfLen,  halfW);
      ctx.moveTo( halfLen, -halfW); ctx.lineTo(-halfLen, halfW);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Body
    ctx.fillStyle = car.color;
    ctx.fillRect(-halfLen, -halfW, halfLen * 2, halfW * 2);

    // Divider at midpoint (front half / rear half)
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, -halfW); ctx.lineTo(0, halfW);
    ctx.stroke();

    // Arrow on front half
    const arrTip  = halfLen * 0.82;
    const arrBase = halfLen * 0.18;
    const arrHW   = halfW * 0.45;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle   = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(arrBase, 0); ctx.lineTo(arrTip - arrHW * 0.9, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrTip, 0);
    ctx.lineTo(arrTip - arrHW, -arrHW * 0.65);
    ctx.lineTo(arrTip - arrHW,  arrHW * 0.65);
    ctx.closePath();
    ctx.fill();

    // Car ID in rear half
    ctx.fillStyle    = 'rgba(0,0,0,0.8)';
    ctx.font         = 'bold ' + Math.max(8, Math.round(SQ * 0.55)) + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(car.id, -halfLen * 0.52, 0);

    ctx.restore();
  }

  screenToGrid(clientX, clientY) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = (GRID_COLS * SQ) / rect.width;
    const scaleY = (GRID_ROWS * SQ) / rect.height;
    return {
      col: Math.floor((clientX - rect.left) * scaleX / SQ),
      row: Math.floor((clientY - rect.top)  * scaleY / SQ),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// UI (DOM sidebar)
// ═══════════════════════════════════════════════════════════════

// Returns a human-readable safe speed range string for the given car state.
function _safeRangeStr(car) {
  const revMax = Math.floor(car.maxSpeed / 5);
  const s = (v) => (v < 0 ? '\u2212' + (-v) : String(v));
  if (car.speed === 0) {
    return s(-Math.min(revMax, car.accel)) + '\u2013' + s(Math.min(car.maxSpeed, car.accel)) + ' mph';
  } else if (car.reverse) {
    const hi = Math.min(revMax, car.speed + car.accel);
    const lo = Math.max(0, car.speed - car.accel);
    return s(-hi) + '\u2013' + s(-lo) + ' mph';
  } else {
    return s(Math.max(0, car.speed - car.accel)) + '\u2013' + s(Math.min(car.maxSpeed, car.speed + car.accel)) + ' mph';
  }
}

class UI {
  constructor(gs) {
    this.gs       = gs;
    this.logLines = [];
  }

  update() {
    const { gs } = this;
    this._panel(gs.cars[0]);
    this._panel(gs.cars[1]);
    this._header();
    this._controls();
    this._weaponInfo();
  }

  _panel(car) {
    const n = car.id;
    for (const f of ['front','back','left','right']) {
      const el = document.getElementById('c'+n+'-'+f);
      if (!el) continue;
      el.textContent = Math.max(0, car.armor[f]);
      el.className   = 'armor-val' + (car.breached[f] ? ' breached' : '');
    }
    const dr = document.getElementById('c'+n+'-driver');
    if (dr) {
      if (car.driverHits >= 2)               { dr.textContent='DEAD';    dr.style.color='#e74c3c'; }
      else if (!car.alive)                   { dr.textContent='OK';      dr.style.color='#aaa'; }
      else if (car.driverHits===1)           { dr.textContent='WOUNDED'; dr.style.color='#f39c12'; }
      else                                   { dr.textContent='OK';      dr.style.color='#2ecc71'; }
    }
    setText('c'+n+'-speed-cur', (car.reverse ? '\u2212' : '') + car.speed);
    setText('c'+n+'-speed-max', car.maxSpeed);
    setText('c'+n+'-hc', car.hc);
    const hsEl = document.getElementById('c'+n+'-hs');
    if (hsEl) {
      hsEl.textContent = car.handlingStatus;
      hsEl.style.color = car.handlingStatus > 0 ? '#2ecc71' : car.handlingStatus === 0 ? '#f39c12' : '#e74c3c';
    }
    // Engine
    const engEl = document.getElementById('c'+n+'-engine-dp');
    if (engEl) {
      const eng = car.components.engine;
      if (eng.destroyed)       { engEl.textContent = 'DEAD';                engEl.style.color = '#e74c3c'; }
      else if (eng.dp < eng.maxDp) { engEl.textContent = eng.dp+'/'+eng.maxDp; engEl.style.color = '#f39c12'; }
      else                     { engEl.textContent = eng.dp+'/'+eng.maxDp; engEl.style.color = '#2ecc71'; }
    }
    // Tires (FL FR RL RR)
    const tireKeys = { fl:'frontLeft', fr:'frontRight', rl:'rearLeft', rr:'rearRight' };
    for (const [k, prop] of Object.entries(tireKeys)) {
      const el = document.getElementById('c'+n+'-tire-'+k);
      if (el) el.style.color = car.components.tires[prop].destroyed ? '#e74c3c' : '#2ecc71';
    }
    // Weapons
    car.weapons.forEach((w, i) => {
      setText('c'+n+'-w'+i+'-ammo', w.ammo <= 0 ? 'EMPTY' : w.ammo);
      const dpEl = document.getElementById('c'+n+'-w'+i+'-dp');
      if (dpEl) {
        if (w.destroyed)          { dpEl.textContent = 'DEAD';            dpEl.style.color = '#e74c3c'; }
        else if (w.dp < w.maxDp)  { dpEl.textContent = w.dp+'/'+w.maxDp; dpEl.style.color = '#f39c12'; }
        else                      { dpEl.textContent = w.dp+'/'+w.maxDp; dpEl.style.color = '#2ecc71'; }
      }
    });
    const panel = document.getElementById('panel-'+n);
    if (panel) {
      panel.classList.toggle('destroyed', car.isDestroyed());
      panel.classList.toggle('active', this.gs.activeIdx === n - 1);
    }
  }

  _header() {
    const { gs } = this;
    setText('turn-num',    gs.turn);
    setText('active-name', gs.activeCar.name);
    const phaseText = gs.phase === PHASE.MOVE
      ? 'MOVE ' + gs.movePhase + '/5'
      : gs.phase;
    setText('phase-label', phaseText);
    setText('moves-left',  gs.movesRemaining);
  }

  _controls() {
    const { gs } = this;
    showEl('speed-controls', gs.phase === PHASE.SPEED);
    showEl('move-controls',  gs.phase === PHASE.MOVE);
    showEl('fire-controls',  gs.phase === PHASE.FIRE);
    const car = gs.activeCar;
    setText('speed-max-hint',   car.maxSpeed);
    setText('speed-rev-hint',   Math.floor(car.maxSpeed / 5));
    setText('speed-range-hint', _safeRangeStr(car));
    // Move-controls
    if (gs.phase === PHASE.MOVE) {
      const el = document.getElementById('move-phase-info');
      if (el) el.textContent = 'Phase ' + gs.movePhase + ' of 5  \u2014  ' + gs.activeCar.name;
      const hasMoves = gs.movesRemaining > 0;
      showEl('maneuver-menu', hasMoves);
      if (hasMoves) this._updateManeuverMenu();
      // Bootlegger confirm — only when bootlegger is the selected maneuver
      showEl('do-bootlegger', gs.selectedManeuver === 'bootlegger');
      // End Move only when genuinely blocked
      const endMoveBtn = document.getElementById('end-move');
      if (endMoveBtn) {
        const stuck = gs.movesRemaining > 0 && !gs.hasValidMoves();
        showEl('end-move', stuck);
        if (stuck) endMoveBtn.textContent = 'Blocked \u2014 Skip Move';
      }
    }
    // Fire-controls end button label
    const endBtn = document.getElementById('end-turn');
    if (endBtn && gs.phase === PHASE.FIRE) {
      endBtn.textContent = gs.activeIdx === 0 ? 'End P1 Fire \u2192' : 'End Turn \u2192';
    }
    // Tint primary action buttons to match active player
    const isP2 = gs.activeIdx === 1;
    ['set-speed', 'end-move', 'end-turn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.toggle('p2', isP2);
    });
  }

  _updateManeuverMenu() {
    const gs  = this.gs;
    const car = gs.activeCar;
    const menu = document.getElementById('maneuver-menu');
    if (!menu) return;
    menu.querySelectorAll('[data-man]').forEach(btn => {
      const key = btn.dataset.man;
      let enabled;
      if (key === 'bootlegger') {
        enabled = gs.canBootlegger();
      } else {
        const d = destForManeuver(key, car, gs.halfMovePhase);
        enabled = d !== null && gs.getMoveInfo(d[0], d[1]) !== null;
      }
      btn.disabled = !enabled;
      btn.classList.toggle('selected', gs.selectedManeuver === key);
    });
  }

  _weaponInfo() {
    if (this.gs.phase !== PHASE.FIRE) return;
    const car   = this.gs.activeCar;
    const lines = car.weapons.map(w => {
      const shots = w.rof - w.shotsThisTurn;
      return w.name + ': ' + (w.ammo>0 && shots>0 ? shots+' shot(s) left' : 'no shots');
    });
    setText('weapon-info', lines.join(' | '));
  }

  log(messages) {
    if (!messages || (Array.isArray(messages) && messages.length === 0)) return;
    if (typeof messages === 'string') messages = [messages];
    // System separator lines (start with ---) get neutral styling
    const cls = messages[0] && String(messages[0]).startsWith('---')
      ? 'sys'
      : 'p' + (this.gs.activeIdx + 1);
    messages.forEach(m => this.logLines.push({ h: esc(m), c: cls }));
    this.logLines = this.logLines.slice(-80);
    const el = document.getElementById('action-log');
    if (el) {
      el.innerHTML = this.logLines
        .map(l => '<div class="log-line ' + l.c + '">' + l.h + '</div>')
        .join('');
      el.scrollTop = el.scrollHeight;
    }
  }

  showGameOver(winner) {
    const ov = document.getElementById('game-over');
    const mg = document.getElementById('game-over-msg');
    if (ov) ov.style.display = 'flex';
    if (mg) mg.textContent   = winner.name + ' WINS!';
  }
}

function setText(id, val) { const e=document.getElementById(id); if(e) e.textContent=val; }
function showEl(id, v)    { const e=document.getElementById(id); if(e) e.style.display=v?'block':'none'; }
function esc(s)           { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ═══════════════════════════════════════════════════════════════
// MAIN — wire everything together
// ═══════════════════════════════════════════════════════════════

(function() {
  const canvas = document.getElementById('game-canvas');
  const gs     = new GameState();
  const grid   = new Grid(canvas, gs);
  const ui     = new UI(gs);

  let selectedSpeed = 0;
  let zoomLevel = 1.0;
  const ZOOM_STEP = 0.25, ZOOM_MIN = 0.5, ZOOM_MAX = 3.0;

  function setZoom(z) {
    zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    SQ = Math.round(BASE_SQ * zoomLevel);
    grid.resize();
    render();
    document.getElementById('zoom-level').textContent = Math.round(zoomLevel * 100) + '%';
  }

  function render() {
    grid.render();
    ui.update();
  }

  function syncSpeed() {
    const car        = gs.activeCar;
    const wantRev    = selectedSpeed < 0;
    const wantMag    = Math.abs(selectedSpeed);
    const sign       = selectedSpeed < 0 ? '\u2212' : '';
    setText('speed-select-val', sign + wantMag + ' mph');
    setText('speed-range-hint', _safeRangeStr(car));
    const el = document.getElementById('speed-select-val');
    if (el) {
      // Red if direction switch while moving; red if emergency decel; orange if over accel cap
      const dirSwitch = wantRev !== car.reverse && car.speed > 0;
      const revMax    = Math.floor(car.maxSpeed / 5);
      const maxMag    = wantRev ? revMax : car.maxSpeed;
      const maxSafe   = Math.min(maxMag, car.speed + car.accel);
      const minSafe   = Math.max(0, car.speed - car.accel);
      let color = '';
      if (dirSwitch)         color = '#e74c3c';
      else if (wantMag > maxSafe) color = '#f39c12';
      else if (!wantRev && wantMag < minSafe) color = '#e74c3c';
      el.style.color = color;
    }
  }

  // ── Canvas click ────────────────────────────────────────────
  canvas.addEventListener('click', function(e) {
    if (gs.gameOver) return;
    const { col, row } = grid.screenToGrid(e.clientX, e.clientY);

    if (gs.phase === PHASE.MOVE) {
      const sel = gs.selectedManeuver;
      if (sel && sel !== 'bootlegger' && sel !== 'straight') {
        const d = destForManeuver(sel, gs.activeCar, gs.halfMovePhase);
        if (d && d[0] === col && d[1] === row && gs.canMoveTo(col, row)) {
          ui.log(gs.moveActiveCar(col, row));
          if (gs.gameOver) ui.showGameOver(gs.winner);
          render();
        }
      }
      return;
    }

    if (gs.phase === PHASE.FIRE) {
      const enemy = gs.enemyCar;
      const hitEnemy = carSquares(enemy).some(sq => sq.x === col && sq.y === row);
      if (!hitEnemy) return;
      let fired = false;
      for (let i = 0; i < gs.activeCar.weapons.length; i++) {
        const w = gs.activeCar.weapons[i];
        if (w.ammo > 0 && w.shotsThisTurn < w.rof) {
          const res = gs.fireWeapon(i);
          ui.log(res.messages);
          fired = true;
          break;
        }
      }
      if (!fired) ui.log('No weapons available.');
      if (gs.gameOver) ui.showGameOver(gs.winner);
      render();
    }
  });

  // ── Speed controls ──────────────────────────────────────────
  document.getElementById('speed-down').addEventListener('click', function() {
    const car    = gs.activeCar;
    const revMax = Math.floor(car.maxSpeed / 5);
    // Can only go into negative (reverse) territory if currently stopped
    const minAllowed = (!car.reverse && car.speed > 0) ? 0 : -revMax;
    selectedSpeed = Math.max(minAllowed, selectedSpeed - 5);
    syncSpeed();
  });
  document.getElementById('speed-up').addEventListener('click', function() {
    const car        = gs.activeCar;
    const maxFwd     = Math.min(car.maxSpeed, car.speed + car.accel);
    // Can only go into positive (forward) territory if currently stopped
    const maxAllowed = (car.reverse && car.speed > 0) ? 0 : maxFwd;
    selectedSpeed = Math.min(maxAllowed, selectedSpeed + 5);
    syncSpeed();
  });
  document.getElementById('set-speed').addEventListener('click', function() {
    ui.log(gs.setSpeed(selectedSpeed));
    if (gs.phase === PHASE.SPEED) {
      // P2 now declaring — init selector to P2's current signed speed
      const c = gs.activeCar;
      selectedSpeed = c.reverse ? -c.speed : c.speed;
      syncSpeed();
    }
    render();
  });

  // ── Move controls ───────────────────────────────────────────
  document.getElementById('end-move').addEventListener('click', function() {
    gs.selectedManeuver = null;
    ui.log(gs.endMove());
    render();
  });
  document.getElementById('do-bootlegger').addEventListener('click', function() {
    ui.log(gs.doBootlegger());
    if (gs.gameOver) ui.showGameOver(gs.winner);
    render();
  });
  document.getElementById('maneuver-menu').addEventListener('click', function(e) {
    if (gs.phase !== PHASE.MOVE || gs.movesRemaining <= 0) return;
    const btn = e.target.closest('[data-man]');
    if (!btn || btn.disabled) return;
    const key = btn.dataset.man;
    if (key === 'bootlegger') {
      gs.selectedManeuver = (gs.selectedManeuver === 'bootlegger') ? null : 'bootlegger';
      render();
      return;
    }
    const d = destForManeuver(key, gs.activeCar, gs.halfMovePhase);
    if (d && gs.canMoveTo(d[0], d[1])) {
      ui.log(gs.moveActiveCar(d[0], d[1]));
      if (gs.gameOver) ui.showGameOver(gs.winner);
      render();
    }
  });

  // ── Fire / End Turn ─────────────────────────────────────────
  document.getElementById('end-turn').addEventListener('click', doEndFire);

  function doEndFire() {
    const msgs = gs.endFire();
    ui.log(msgs);
    if (gs.phase === PHASE.SPEED) {
      const c = gs.activeCar;
      selectedSpeed = c.reverse ? -c.speed : c.speed;
      syncSpeed();
      ui.log('--- Turn ' + gs.turn + ': P1 & P2 set speeds ---');
    }
    render();
  }

  // ── Fullscreen ──────────────────────────────────────────────
  document.getElementById('fullscreen-btn').addEventListener('click', function() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(function() {});
    }
  });

  document.getElementById('zoom-in-btn').addEventListener('click', function()  { setZoom(zoomLevel + ZOOM_STEP); });
  document.getElementById('zoom-out-btn').addEventListener('click', function() { setZoom(zoomLevel - ZOOM_STEP); });

  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    setZoom(zoomLevel + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }, { passive: false });

  // ── New game ────────────────────────────────────────────────
  document.getElementById('restart-btn').addEventListener('click', function() {
    location.reload();
  });

  // ── Keyboard shortcuts ───────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (gs.gameOver) return;

    if (e.key === 'f' || e.key === 'F') {
      document.getElementById('fullscreen-btn').click();
      return;
    }
    if (e.key === 'z' || e.key === 'Z') { setZoom(zoomLevel + ZOOM_STEP); return; }
    if (e.key === 'x' || e.key === 'X') { setZoom(zoomLevel - ZOOM_STEP); return; }

    if (gs.phase === PHASE.MOVE) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const car = gs.activeCar;
        const [fdx, fdy] = FACING_VEC[car.facing];
        const step = gs.halfMovePhase ? 2 : 4;
        const nx = car.x + step*fdx;
        const ny = car.y + step*fdy;
        if (gs.canMoveTo(nx, ny)) {
          gs.selectedManeuver = null;
          ui.log(gs.moveActiveCar(nx, ny));
          if (gs.gameOver) ui.showGameOver(gs.winner);
          render();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (gs.halfMovePhase) return;
        const car = gs.activeCar;
        const [fdx, fdy] = FACING_VEC[car.facing];
        const lx = fdy, ly = -fdx;
        const rx2 = -fdy, ry2 = fdx;
        let nx, ny;
        if (e.shiftKey) {
          if (e.key === 'ArrowLeft') { nx = car.x + 4*fdx + lx; ny = car.y + 4*fdy + ly; }
          else                       { nx = car.x + 4*fdx + rx2; ny = car.y + 4*fdy + ry2; }
        } else {
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          const turnFacing = (car.facing + dir + 8) % 8;
          const [bx, by] = FACING_VEC[turnFacing];
          nx = car.x + 4*bx;
          ny = car.y + 4*by;
        }
        if (gs.canMoveTo(nx, ny)) {
          gs.selectedManeuver = null;
          ui.log(gs.moveActiveCar(nx, ny));
          if (gs.gameOver) ui.showGameOver(gs.winner);
          render();
        }
      }
    }

    if (gs.phase === PHASE.SPEED) {
      if (e.key === '+' || e.key === '=') {
        const car = gs.activeCar;
        const maxFwd = Math.min(car.maxSpeed, car.speed + car.accel);
        const maxAllowed = (car.reverse && car.speed > 0) ? 0 : maxFwd;
        selectedSpeed = Math.min(maxAllowed, selectedSpeed + 5);
        syncSpeed();
      }
      if (e.key === '-') {
        const car = gs.activeCar;
        const revMax = Math.floor(car.maxSpeed / 5);
        const minAllowed = (!car.reverse && car.speed > 0) ? 0 : -revMax;
        selectedSpeed = Math.max(minAllowed, selectedSpeed - 5);
        syncSpeed();
      }
      if (e.key === 'Enter') {
        ui.log(gs.setSpeed(selectedSpeed));
        if (gs.phase === PHASE.SPEED) {
          const c = gs.activeCar;
          selectedSpeed = c.reverse ? -c.speed : c.speed;
          syncSpeed();
        }
        render();
      }
    }

    if (gs.phase === PHASE.FIRE && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      doEndFire();
    }
  });

  // ── Boot ────────────────────────────────────────────────────
  ui.log('Car Wars v0.5 \u2014 2\xD74 counter, mph speed, 2-sq moves');
  ui.log('P1: Killer Kart (red) \u2014 Machine Gun');
  ui.log('P2: Killer Kart (blue) \u2014 Machine Gun');
  ui.log('Set speed (0\u201375 mph) and press GO!');
  render();
})();
