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

// Control table: row index = speed-1 (speed 1→row 0, speed 15→row 14)
// col index 0 = HS 0, 1 = HS -1, ..., 6 = HS -6
// Values: 0 = safe, -1 = XX (crash unavoidable), 2-6 = 1d6 roll needed
// Derived from Car Wars Compendium p.8 (speeds mapped at ×10 mph per speed unit)
const CONTROL_TABLE = [
  //    hs: 0    -1   -2   -3   -4   -5   -6
  /* s1  */ [0,   0,   0,   0,   0,   0,   2],
  /* s2  */ [0,   0,   0,   0,   0,   2,   3],
  /* s3  */ [0,   0,   0,   0,   0,   2,   3],
  /* s4  */ [0,   0,   0,   0,   0,   2,   4],
  /* s5  */ [0,   0,   0,   0,   2,   3,   4],
  /* s6  */ [0,   0,   0,   0,   2,   3,   4],
  /* s7  */ [0,   0,   0,   2,   3,   4,   4],
  /* s8  */ [0,   0,   0,   2,   3,   4,   5],
  /* s9  */ [0,   0,   2,   3,   4,   5,   5],
  /* s10 */ [0,   0,   2,   3,   5,   5,   6],
  /* s11 */ [0,   0,   2,   4,   5,   6,   6],
  /* s12 */ [0,   3,   4,   6,   6,  -1,  -1],
  /* s13 */ [0,   2,   3,   5,   6,  -1,  -1],
  /* s14 */ [0,   2,   4,   5,  -1,  -1,  -1],
  /* s15 */ [0,   3,   5,   6,  -1,  -1,  -1],
];

function rearSquare(car) {
  const [fdx, fdy] = FACING_VEC[car.facing];
  return { x: car.x - fdx, y: car.y - fdy };
}

// Movement Chart (Compendium p.7): speed 0-15 → squares per phase [1..5]
// Each row sums to car.speed (total squares/turn unchanged from v0.2)
const PHASE_CHART = [
  /* s0  */ [0, 0, 0, 0, 0],
  /* s1  */ [1, 0, 0, 0, 0],
  /* s2  */ [1, 0, 1, 0, 0],
  /* s3  */ [1, 0, 1, 0, 1],
  /* s4  */ [1, 1, 1, 0, 1],
  /* s5  */ [1, 1, 1, 1, 1],
  /* s6  */ [2, 1, 1, 1, 1],
  /* s7  */ [2, 1, 2, 1, 1],
  /* s8  */ [2, 1, 2, 1, 2],
  /* s9  */ [2, 2, 2, 1, 2],
  /* s10 */ [2, 2, 2, 2, 2],
  /* s11 */ [3, 2, 2, 2, 2],
  /* s12 */ [3, 2, 3, 2, 2],
  /* s13 */ [3, 2, 3, 2, 3],
  /* s14 */ [3, 3, 3, 2, 3],
  /* s15 */ [3, 3, 3, 3, 3],
];

const GRID_COLS = 44;
const GRID_ROWS = 32;
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
    x: 4, y: 15, facing: 2,   // starts facing E
    maxSpeed: 15, accel: 3, hc: 3,
    armor: { front: 4, back: 3, left: 3, right: 3 },
    weapons: [
      { name: 'Machine Gun', type: 'mg', range: 8,
        damageDice: 1, damageSides: 6, rof: 2, ammo: 20, dp: 3 },
    ],
  },
  {
    id: 2, name: 'Killer Kart', color: '#3498db',
    x: 40, y: 15, facing: 6,  // starts facing W
    maxSpeed: 15, accel: 3, hc: 3,
    armor: { front: 4, back: 3, left: 3, right: 3 },
    weapons: [
      { name: 'Machine Gun', type: 'mg', range: 8,
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
  // DC for decelerating more than safe amount (safeDecel = car.accel)
  if (extraDecel <= 1) return 1;
  if (extraDecel <= 2) return 2;
  if (extraDecel <= 3) return 3;
  if (extraDecel <= 5) return 5;
  return 7;
}

function applyManeuver(car, dc, msgs) {
  if (car.isDestroyed()) return;
  car.handlingStatus = Math.max(-6, car.handlingStatus - dc);
  msgs.push('D' + dc + ' maneuver → HS: ' + car.handlingStatus);
  checkControl(car, msgs);
}

function checkControl(car, msgs) {
  if (car.speed === 0 || car.handlingStatus >= 1) return;
  const bandIdx  = Math.max(0, Math.min(14, car.speed - 1));
  const hsCol    = Math.min(6, -car.handlingStatus);
  const needed   = CONTROL_TABLE[bandIdx][hsCol];
  if (needed === 0) return;
  if (needed === -1) {
    msgs.push(car.name + ' — XX: loss of control!');
    loseControl(car, msgs);
    return;
  }
  const roll = Math.floor(Math.random() * 6) + 1;
  msgs.push(car.name + ' control roll: need ' + needed + '+, rolled ' + roll +
            ' → ' + (roll >= needed ? 'OK' : 'LOSE CONTROL!'));
  if (roll < needed) loseControl(car, msgs);
}

function loseControl(car, msgs) {
  const dir = Math.random() < 0.5 ? 2 : -2; // 90° spin
  car.facing = (car.facing + dir + 8) % 8;
  car.speed  = Math.floor(car.speed / 2);
  msgs.push(car.name + ' spins! Facing → ' + FACING_NAMES[car.facing] +
            ', speed → ' + car.speed);
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

function calcToHit(target, dist) {
  let toHit = 7;
  toHit += Math.max(0, Math.floor((dist - 4) / 4));
  if (target.speed === 0) toHit -= 1;
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
    this.cars           = CAR_DEFS.map(def => new Car(def));
    this.activeIdx      = 0;
    this.phase          = PHASE.SPEED;
    this.turn           = 1;
    this.movesRemaining = 0;
    this.gameOver       = false;
    this.winner         = null;
    // Move sub-state
    this.movePhase      = 0;   // 1-5
    this.moveOrder      = [];  // car indices sorted faster-first for current phase
    this.moveOrderPos   = 0;
    this.maneuverMode   = 'bend';  // 'bend' | 'drift'
  }

  get activeCar() { return this.cars[this.activeIdx]; }
  get enemyCar()  { return this.cars[1 - this.activeIdx]; }

  // ── Speed declaration (both players declare before movement) ────

  setSpeed(speed) {
    const car       = this.activeCar;
    const prevSpeed = car.speed;
    const msgs      = [];

    const maxThisTurn = Math.min(car.maxSpeed, prevSpeed + car.accel);
    if (speed > maxThisTurn) {
      speed = maxThisTurn;
      msgs.push('Accel limit: max speed this turn is ' + speed);
    }
    car.speed = Math.max(0, speed);

    const decelAmt = prevSpeed - car.speed;
    if (decelAmt > car.accel) {
      const dc = decelDC(decelAmt - car.accel);
      msgs.push(car.name + ' emergency brake \u2212' + decelAmt + ' (D' + dc + ')');
      applyManeuver(car, dc, msgs);
    }
    msgs.unshift(car.name + ' sets speed to ' + car.speed);

    if (this.activeIdx === 0) {
      // P1 declared — now P2 declares
      this.activeIdx      = 1;
      this.movesRemaining = 0;
    } else {
      // P2 declared — start movement phases
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
        if (!car.isDestroyed() && car.speed > 0 && PHASE_CHART[car.speed][phIdx] > 0) {
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
    this.movesRemaining                  = PHASE_CHART[this.activeCar.speed][this.movePhase - 1];
    this.activeCar.maneuverUsedThisPhase = false;
    this.maneuverMode                    = 'bend';
    return msgs;
  }

  _advanceMover() {
    this.moveOrderPos++;
    if (this.moveOrderPos < this.moveOrder.length) {
      this.activeIdx                       = this.moveOrder[this.moveOrderPos];
      this.movesRemaining                  = PHASE_CHART[this.activeCar.speed][this.movePhase - 1];
      this.activeCar.maneuverUsedThisPhase = false;
      this.maneuverMode                    = 'bend';
      return [];
    } else {
      this.movePhase++;
      return this._startMovePhase();
    }
  }

  // Returns { maneuverDC, newFacing, absDiff } or null if the move is illegal.
  getMoveInfo(col, row) {
    if (this.phase !== PHASE.MOVE || this.movesRemaining <= 0) return null;
    const car = this.activeCar;
    const dc = col - car.x, dr = row - car.y;
    if (Math.abs(dc) > 1 || Math.abs(dr) > 1 || (dc === 0 && dr === 0)) return null;
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;

    const e = this.enemyCar;
    const er = rearSquare(e);
    if ((col === e.x && row === e.y) || (col === er.x && row === er.y)) return null;

    let moveFacing = -1;
    for (let f = 0; f < 8; f++) {
      if (FACING_VEC[f][0] === dc && FACING_VEC[f][1] === dr) { moveFacing = f; break; }
    }
    if (moveFacing === -1) return null;

    // Shortest angular distance from current facing (0, 1, or 2)
    const raw     = (moveFacing - car.facing + 8) % 8;
    const absDiff = Math.min(raw, 8 - raw);
    if (absDiff > 2) return null;  // can't turn > 90° in one step

    // Maneuvers require maneuverUsedThisPhase to be false
    if (absDiff > 0 && car.maneuverUsedThisPhase) return null;

    // New facing: bend changes it; drift keeps it
    const newFacing = (absDiff === 0 || this.maneuverMode === 'drift')
      ? car.facing
      : moveFacing;

    // Rear square after the move must stay on map
    const newRearX = col - FACING_VEC[newFacing][0];
    const newRearY = row - FACING_VEC[newFacing][1];
    if (newRearX < 0 || newRearX >= GRID_COLS || newRearY < 0 || newRearY >= GRID_ROWS) return null;

    // DC by mode and angle
    let maneuverDC = 0;
    if (absDiff === 1) maneuverDC = this.maneuverMode === 'drift' ? 1 : 3;
    else if (absDiff === 2) maneuverDC = this.maneuverMode === 'drift' ? 3 : 6;

    return { maneuverDC, newFacing, absDiff };
  }

  canMoveTo(col, row) { return this.getMoveInfo(col, row) !== null; }

  moveActiveCar(col, row) {
    const info = this.getMoveInfo(col, row);
    const car  = this.activeCar;
    car.x      = col;
    car.y      = row;
    car.facing = info.newFacing;
    this.movesRemaining--;
    const msgs = [];

    if (info.maneuverDC > 0) {
      const label = info.absDiff === 1
        ? (this.maneuverMode === 'drift' ? 'Drift'       : 'Bend 45\xB0')
        : (this.maneuverMode === 'drift' ? 'Steep Drift' : 'Bend 90\xB0');
      car.maneuverUsedThisPhase = true;
      applyManeuver(car, info.maneuverDC, msgs);
      msgs.unshift(car.name + ' \u2192 (' + col + ',' + row + ') Ph' + this.movePhase +
                   ' [' + label + ' D' + info.maneuverDC + '] facing ' + FACING_NAMES[car.facing]);
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

  // ── Special maneuvers ───────────────────────────────────────────

  canBootlegger() {
    const car = this.activeCar;
    return this.phase === PHASE.MOVE &&
           this.movesRemaining > 0 &&
           !car.maneuverUsedThisPhase &&
           car.speed >= 2 && car.speed <= 3;
  }

  doBootlegger() {
    const car  = this.activeCar;
    const msgs = [car.name + ' \u2014 BOOTLEGGER!'];
    car.maneuverUsedThisPhase = true;
    applyManeuver(car, 7, msgs);
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

    const arcCheck = checkFireArc(attacker, target, weapon);
    if (!arcCheck.canFire)              return { hit: false, messages: [arcCheck.reason] };

    const dist    = arcCheck.dist;
    const toHit   = calcToHit(target, dist);
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
    const ctx    = this.ctx;
    const car    = this.gs.activeCar;
    // DC → [fillRGBA, strokeRGBA]
    const colors = {
      0: ['rgba(0,200,255,0.12)',  'rgba(0,200,255,0.38)'],   // straight — faint cyan
      1: ['rgba(0,230,120,0.18)',  'rgba(0,230,120,0.55)'],   // D1 drift  — green
      3: ['rgba(0,140,255,0.18)',  'rgba(0,140,255,0.55)'],   // D3 bend/steep drift — blue
      6: ['rgba(255,140,0,0.18)',  'rgba(255,140,0,0.55)'],   // D6 bend 90° — orange
    };
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const nx = car.x + dc, ny = car.y + dr;
        const info = this.gs.getMoveInfo(nx, ny);
        if (!info) continue;
        const [fill, stroke] = colors[info.maneuverDC] || colors[0];
        ctx.fillStyle   = fill;
        ctx.fillRect(nx*SQ, ny*SQ, SQ, SQ);
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = 1;
        ctx.strokeRect(nx*SQ+0.5, ny*SQ+0.5, SQ-1, SQ-1);
      }
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
      const er = rearSquare(enemy);
      ctx.fillStyle   = 'rgba(255,180,0,0.15)';
      ctx.fillRect(enemy.x*SQ, enemy.y*SQ, SQ, SQ);
      ctx.fillRect(er.x*SQ, er.y*SQ, SQ, SQ);
      ctx.strokeStyle = 'rgba(255,180,0,0.75)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(enemy.x*SQ+1, enemy.y*SQ+1, SQ-2, SQ-2);
      ctx.strokeRect(er.x*SQ+1, er.y*SQ+1, SQ-2, SQ-2);
    }
  }

  _activeOutline() {
    const car  = this.gs.activeCar;
    const rear = rearSquare(car);
    this.ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    this.ctx.lineWidth   = 1.5;
    this.ctx.strokeRect(car.x*SQ+1,  car.y*SQ+1,  SQ-2, SQ-2);
    this.ctx.strokeRect(rear.x*SQ+1, rear.y*SQ+1, SQ-2, SQ-2);
  }

  _cars() {
    for (const car of this.gs.cars) this._drawCar(car);
  }

  _drawCar(car) {
    const ctx  = this.ctx;
    const rear = rearSquare(car);
    const [fdx, fdy] = FACING_VEC[car.facing];

    // Centers of front and rear squares
    const fCx = (car.x  + 0.5) * SQ, fCy = (car.y  + 0.5) * SQ;
    const rCx = (rear.x + 0.5) * SQ, rCy = (rear.y + 0.5) * SQ;
    const midX  = (fCx + rCx) / 2, midY = (fCy + rCy) / 2;
    const dist  = Math.sqrt((fCx - rCx) ** 2 + (fCy - rCy) ** 2);
    const angle = Math.atan2(fdy, fdx);

    // Counter body: extends 0.38 cell past each center point, 0.68 cell wide
    const halfLen = dist / 2 + SQ * 0.38;
    const halfW   = SQ * 0.34;

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

    // Divider between front and rear halves
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
    ctx.font         = 'bold ' + Math.max(7, Math.round(SQ * 0.38)) + 'px monospace';
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
      if (!car.alive || car.driverHits >= 2) { dr.textContent='DEAD';    dr.style.color='#e74c3c'; }
      else if (car.driverHits===1)           { dr.textContent='WOUNDED'; dr.style.color='#f39c12'; }
      else                                   { dr.textContent='OK';      dr.style.color='#2ecc71'; }
    }
    setText('c'+n+'-speed-cur', car.speed);
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
    setText('speed-range-hint', Math.max(0, car.speed - car.accel) + '\u2013' + Math.min(car.maxSpeed, car.speed + car.accel));
    // Move-controls
    if (gs.phase === PHASE.MOVE) {
      const el = document.getElementById('move-phase-info');
      if (el) el.textContent = 'Phase ' + gs.movePhase + ' of 5  \u2014  ' + gs.activeCar.name;
      const used     = gs.activeCar.maneuverUsedThisPhase;
      const bendBtn  = document.getElementById('mode-bend');
      const driftBtn = document.getElementById('mode-drift');
      const bootBtn  = document.getElementById('do-bootlegger');
      if (bendBtn)  { bendBtn.classList.toggle('active', gs.maneuverMode === 'bend');  bendBtn.disabled  = used; }
      if (driftBtn) { driftBtn.classList.toggle('active', gs.maneuverMode === 'drift'); driftBtn.disabled = used; }
      if (bootBtn)  showEl('do-bootlegger', gs.canBootlegger());
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
    setText('speed-select-val', selectedSpeed);
    const car = gs.activeCar;
    const safeMin = Math.max(0, car.speed - car.accel);
    const safeMax = Math.min(car.maxSpeed, car.speed + car.accel);
    setText('speed-range-hint', safeMin + '–' + safeMax);
    const el = document.getElementById('speed-select-val');
    if (el) {
      el.style.color = selectedSpeed < safeMin ? '#e74c3c' : selectedSpeed > safeMax ? '#f39c12' : '';
    }
  }

  // ── Canvas click ────────────────────────────────────────────
  canvas.addEventListener('click', function(e) {
    if (gs.gameOver) return;
    const { col, row } = grid.screenToGrid(e.clientX, e.clientY);

    if (gs.phase === PHASE.MOVE) {
      if (gs.canMoveTo(col, row)) {
        ui.log(gs.moveActiveCar(col, row));
        render();
      }
      return;
    }

    if (gs.phase === PHASE.FIRE) {
      const enemy = gs.enemyCar;
      const er    = rearSquare(enemy);
      const hitEnemy = (col === enemy.x && row === enemy.y) || (col === er.x && row === er.y);
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
    selectedSpeed = Math.max(0, selectedSpeed - 1);
    syncSpeed();
  });
  document.getElementById('speed-up').addEventListener('click', function() {
    const maxThisTurn = Math.min(gs.activeCar.maxSpeed, gs.activeCar.speed + gs.activeCar.accel);
    selectedSpeed = Math.min(maxThisTurn, selectedSpeed + 1);
    syncSpeed();
  });
  document.getElementById('set-speed').addEventListener('click', function() {
    ui.log(gs.setSpeed(selectedSpeed));
    // If still in SPEED phase, P2 is now declaring — reset selector to P2's speed
    if (gs.phase === PHASE.SPEED) {
      selectedSpeed = gs.activeCar.speed;
      syncSpeed();
    }
    render();
  });

  // ── Move controls ───────────────────────────────────────────
  document.getElementById('end-move').addEventListener('click', function() {
    ui.log(gs.endMove());
    render();
  });
  document.getElementById('mode-bend').addEventListener('click', function() {
    gs.maneuverMode = 'bend';
    render();
  });
  document.getElementById('mode-drift').addEventListener('click', function() {
    gs.maneuverMode = 'drift';
    render();
  });
  document.getElementById('do-bootlegger').addEventListener('click', function() {
    ui.log(gs.doBootlegger());
    render();
  });

  // ── Fire / End Turn ─────────────────────────────────────────
  document.getElementById('end-turn').addEventListener('click', doEndFire);

  function doEndFire() {
    const msgs = gs.endFire();
    ui.log(msgs);
    if (gs.phase === PHASE.SPEED) {
      // New turn started — reset speed selector for P1
      selectedSpeed = gs.activeCar.speed;
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
        const nx = car.x + FACING_VEC[car.facing][0];
        const ny = car.y + FACING_VEC[car.facing][1];
        if (gs.canMoveTo(nx, ny)) { ui.log(gs.moveActiveCar(nx, ny)); render(); }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const car = gs.activeCar;
        const savedMode = gs.maneuverMode;
        gs.maneuverMode = e.shiftKey ? 'drift' : 'bend';
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        const turnFacing = (car.facing + dir + 8) % 8;
        const fv = FACING_VEC[turnFacing];
        const nx = car.x + fv[0];
        const ny = car.y + fv[1];
        if (gs.canMoveTo(nx, ny)) { ui.log(gs.moveActiveCar(nx, ny)); render(); }
        else gs.maneuverMode = savedMode;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        ui.log(gs.endMove());
        render();
      }
    }

    if (gs.phase === PHASE.SPEED) {
      if (e.key === '+' || e.key === '=') { selectedSpeed = Math.min(gs.activeCar.maxSpeed, selectedSpeed+1); syncSpeed(); }
      if (e.key === '-')                  { selectedSpeed = Math.max(0, selectedSpeed-1); syncSpeed(); }
      if (e.key === 'Enter') {
        ui.log(gs.setSpeed(selectedSpeed));
        if (gs.phase === PHASE.SPEED) { selectedSpeed = gs.activeCar.speed; syncSpeed(); }
        render();
      }
    }

    if (gs.phase === PHASE.FIRE && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      doEndFire();
    }
  });

  // ── Boot ────────────────────────────────────────────────────
  ui.log('Car Wars v0.3 — phase movement + 1\xD72 footprint');
  ui.log('P1: Killer Kart (red) \u2014 Machine Gun');
  ui.log('P2: Road Warrior (blue) \u2014 Rocket');
  ui.log('Set speed and press GO!');
  render();
})();
