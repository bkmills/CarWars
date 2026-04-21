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
    this.weapons  = cfg.weapons.map(w => ({ ...w, shotsThisTurn: 0 }));
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
        damageDice: 1, damageSides: 6, rof: 2, ammo: 20 },
    ],
  },
  {
    id: 2, name: 'Killer Kart', color: '#3498db',
    x: 40, y: 15, facing: 6,  // starts facing W
    maxSpeed: 15, accel: 3, hc: 3,
    armor: { front: 4, back: 3, left: 3, right: 3 },
    weapons: [
      { name: 'Machine Gun', type: 'mg', range: 8,
        damageDice: 1, damageSides: 6, rof: 2, ammo: 20 },
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
    msgs.push(car.name + "'s " + hitFacing + ' is already BREACHED \u2014 direct critical!');
    rollCritical(car, msgs);
  } else {
    car.armor[hitFacing] = Math.max(0, car.armor[hitFacing] - damage);
    if (car.armor[hitFacing] === 0) {
      car.breached[hitFacing] = true;
      msgs.push(car.name + "'s " + hitFacing + ' armor BREACHED!');
      rollCritical(car, msgs);
    }
  }
  return msgs;
}

function rollCritical(car, msgs) {
  const roll = Math.floor(Math.random() * 6) + 1;
  msgs.push('Critical roll: ' + roll);
  if (roll <= 2) {
    car.hc = Math.max(1, car.hc - 1);
    msgs.push('Tire hit! ' + car.name + ' HC \u2192 ' + car.hc);
  } else if (roll <= 4) {
    car.maxSpeed = Math.max(1, Math.floor(car.maxSpeed * 0.75));
    if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
    msgs.push('Engine hit! ' + car.name + ' max speed \u2192 ' + car.maxSpeed);
  } else {
    car.driverHits++;
    if (car.driverHits >= 2) {
      car.alive = false;
      msgs.push('DRIVER KILLED \u2014 ' + car.name + ' is OUT!');
    } else {
      msgs.push('Driver wounded! (' + car.driverHits + '/2 hits)');
    }
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
  }

  get activeCar() { return this.cars[this.activeIdx]; }
  get enemyCar()  { return this.cars[1 - this.activeIdx]; }

  setSpeed(speed) {
    const car       = this.activeCar;
    const prevSpeed = car.speed;
    const msgs      = [];

    // Hard acceleration cap
    const maxThisTurn = Math.min(car.maxSpeed, prevSpeed + car.accel);
    if (speed > maxThisTurn) {
      speed = maxThisTurn;
      msgs.push('Accel limit: max speed this turn is ' + speed);
    }
    car.speed = Math.max(0, speed);

    // Deceleration check
    const decelAmt = prevSpeed - car.speed;
    if (decelAmt > car.accel) {
      const dc = decelDC(decelAmt - car.accel);
      msgs.push(car.name + ' emergency brake −' + decelAmt + ' (D' + dc + ')');
      applyManeuver(car, dc, msgs);
    }

    if (car.speed === 0) {
      this.movesRemaining = 0;
      this._enterFirePhase();
      msgs.unshift(car.name + ' is stationary this turn');
    } else {
      this.movesRemaining = car.speed;
      this.phase = PHASE.MOVE;
      msgs.unshift(car.name + ' sets speed to ' + car.speed);
    }
    return msgs;
  }

  canMoveTo(col, row) {
    if (this.phase !== PHASE.MOVE || this.movesRemaining <= 0) return false;
    const car = this.activeCar;
    const dc = col - car.x, dr = row - car.y;
    if (Math.abs(dc) > 1 || Math.abs(dr) > 1 || (dc === 0 && dr === 0)) return false;
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;
    const e = this.enemyCar;
    if (col === e.x && row === e.y) return false;
    // Movement direction must be within 45° of current facing (no reversals)
    let moveFacing = -1;
    for (let f = 0; f < 8; f++) {
      if (FACING_VEC[f][0] === dc && FACING_VEC[f][1] === dr) { moveFacing = f; break; }
    }
    if (moveFacing === -1) return false;
    const diff = (moveFacing - car.facing + 8) % 8;
    return diff === 0 || diff === 1 || diff === 7;
  }

  moveActiveCar(col, row) {
    const car       = this.activeCar;
    const oldFacing = car.facing;
    const dc = col - car.x, dr = row - car.y;
    for (let f = 0; f < 8; f++) {
      if (FACING_VEC[f][0] === dc && FACING_VEC[f][1] === dr) { car.facing = f; break; }
    }
    car.x = col;
    car.y = row;
    this.movesRemaining--;
    const msgs = [car.name + ' \u2192 (' + col + ',' + row + ') facing ' + FACING_NAMES[car.facing]];

    // 45 degree facing change = D3 bend maneuver
    if (car.facing !== oldFacing) applyManeuver(car, 3, msgs);

    if (this.movesRemaining <= 0 || car.isDestroyed()) this._enterFirePhase();
    return msgs;
  }

  endMove() {
    this._enterFirePhase();
    return [];
  }

  _enterFirePhase() {
    this.phase = PHASE.FIRE;
    this.activeCar.weapons.forEach(w => { w.shotsThisTurn = 0; });
  }

  fireWeapon(idx) {
    const attacker = this.activeCar;
    const target   = this.enemyCar;
    const weapon   = attacker.weapons[idx];

    if (!weapon)            return { hit: false, messages: ['No such weapon'] };
    if (weapon.ammo <= 0)   return { hit: false, messages: [weapon.name + ' is out of ammo!'] };
    if (weapon.shotsThisTurn >= weapon.rof)
                            return { hit: false, messages: [weapon.name + ' ROF limit reached'] };

    const arcCheck = checkFireArc(attacker, target, weapon);
    if (!arcCheck.canFire)  return { hit: false, messages: [arcCheck.reason] };

    const dist    = arcCheck.dist;
    const toHit   = calcToHit(target, dist);
    const diceRes = rollDice(2, 6);
    const hit     = diceRes.total >= toHit;

    weapon.shotsThisTurn++;
    weapon.ammo--;

    const msgs = [
      attacker.name + ' fires ' + weapon.name + ' at ' + target.name,
      'Range ' + dist.toFixed(1) + ' | Need ' + toHit + '+ | Roll ' + diceRes.rolls.join('+') + '=' + diceRes.total + ' \u2192 ' + (hit ? 'HIT!' : 'miss'),
    ];

    if (hit) {
      const hitFacing = getHitFacing(target.facing, attacker.x, attacker.y, target.x, target.y);
      const dmgRes    = rollDice(weapon.damageDice, weapon.damageSides);
      msgs.push('Hits ' + target.name + "'s " + hitFacing + '! Dmg: ' + dmgRes.rolls.join('+') + '=' + dmgRes.total);
      msgs.push(...applyDamage(target, dmgRes.total, hitFacing));
      if (target.isDestroyed()) {
        this.gameOver = true;
        this.winner   = attacker;
        msgs.push('\u2605 ' + attacker.name + ' WINS! \u2605');
      }
    }
    return { hit, messages: msgs };
  }

  endTurn() {
    for (const car of this.cars) {
      car.handlingStatus = Math.min(car.hc, car.handlingStatus + car.hc);
    }
    this.activeIdx = 1 - this.activeIdx;
    if (this.activeIdx === 0) this.turn++;
    this.phase = PHASE.SPEED;
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
    const car = this.gs.activeCar;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const nx = car.x + dc, ny = car.y + dr;
        if (this.gs.canMoveTo(nx, ny)) {
          ctx.fillStyle   = 'rgba(0,200,255,0.18)';
          ctx.fillRect(nx*SQ, ny*SQ, SQ, SQ);
          ctx.strokeStyle = 'rgba(0,200,255,0.5)';
          ctx.lineWidth   = 1;
          ctx.strokeRect(nx*SQ+0.5, ny*SQ+0.5, SQ-1, SQ-1);
        }
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
      ctx.fillStyle   = 'rgba(255,180,0,0.15)';
      ctx.fillRect(enemy.x*SQ, enemy.y*SQ, SQ, SQ);
      ctx.strokeStyle = 'rgba(255,180,0,0.75)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(enemy.x*SQ+1, enemy.y*SQ+1, SQ-2, SQ-2);
    }
  }

  _activeOutline() {
    const car = this.gs.activeCar;
    this.ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    this.ctx.lineWidth   = 1.5;
    this.ctx.strokeRect(car.x*SQ+1, car.y*SQ+1, SQ-2, SQ-2);
  }

  _cars() {
    for (const car of this.gs.cars) this._drawCar(car);
  }

  _drawCar(car) {
    const ctx = this.ctx;
    const px  = car.x * SQ, py = car.y * SQ;
    const pad = 3, size = SQ - pad*2;

    ctx.fillStyle = car.isDestroyed() ? '#444' : car.color;
    ctx.fillRect(px+pad, py+pad, size, size);

    if (car.isDestroyed()) {
      ctx.strokeStyle = '#777'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px+pad, py+pad); ctx.lineTo(px+pad+size, py+pad+size);
      ctx.moveTo(px+pad+size, py+pad); ctx.lineTo(px+pad, py+pad+size);
      ctx.stroke();
      return;
    }

    const [fdx, fdy] = FACING_VEC[car.facing];
    const cx = px + SQ/2, cy = py + SQ/2;
    const len = SQ/2 - 5;
    const tipX = cx + fdx*len, tipY = cy + fdy*len;
    const angle = Math.atan2(fdy, fdx), hl = 5;

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle   = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - fdx*3, cy - fdy*3);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - hl*Math.cos(angle - Math.PI/6), tipY - hl*Math.sin(angle - Math.PI/6));
    ctx.lineTo(tipX - hl*Math.cos(angle + Math.PI/6), tipY - hl*Math.sin(angle + Math.PI/6));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle    = 'rgba(0,0,0,0.7)';
    ctx.font         = 'bold 8px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(car.id, cx, cy);
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
    car.weapons.forEach((w,i) => setText('c'+n+'-w'+i+'-ammo', w.ammo<=0?'EMPTY':w.ammo));
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
    setText('phase-label', gs.phase);
    setText('moves-left',  gs.movesRemaining);
  }

  _controls() {
    const { gs } = this;
    showEl('speed-controls', gs.phase === PHASE.SPEED);
    showEl('move-controls',  gs.phase === PHASE.MOVE);
    showEl('fire-controls',  gs.phase === PHASE.FIRE);
    setText('speed-max-hint', gs.activeCar.maxSpeed);
    const _car = gs.activeCar;
    setText('speed-range-hint', Math.max(0, _car.speed - _car.accel) + '–' + Math.min(_car.maxSpeed, _car.speed + _car.accel));
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
    if (typeof messages === 'string') messages = [messages];
    messages.forEach(m => this.logLines.push(esc(m)));
    this.logLines = this.logLines.slice(-40);
    const el = document.getElementById('action-log');
    if (el) {
      el.innerHTML = this.logLines.map(l => '<div class="log-line">'+l+'</div>').join('');
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
      if (col !== enemy.x || row !== enemy.y) return;
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
    render();
  });

  // ── Move controls ───────────────────────────────────────────
  document.getElementById('end-move').addEventListener('click', function() {
    gs.endMove();
    ui.log(gs.activeCar.name + ' ends movement');
    render();
  });

  // ── Fire / End Turn ─────────────────────────────────────────
  document.getElementById('end-turn').addEventListener('click', doEndTurn);

  function doEndTurn() {
    gs.endTurn();
    selectedSpeed = gs.activeCar.speed;
    syncSpeed();
    ui.log('--- ' + gs.activeCar.name + "'s turn (Turn " + gs.turn + ') ---');
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
      const dirs = {
        ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
        w:[0,-1], s:[0,1], a:[-1,0], d:[1,0],
      };
      const dir = dirs[e.key];
      if (dir) {
        e.preventDefault();
        const car = gs.activeCar;
        const nx = car.x + dir[0], ny = car.y + dir[1];
        if (gs.canMoveTo(nx, ny)) { ui.log(gs.moveActiveCar(nx, ny)); render(); }
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        gs.endMove();
        ui.log(gs.activeCar.name + ' ends movement');
        render();
      }
    }

    if (gs.phase === PHASE.SPEED) {
      if (e.key === '+' || e.key === '=') { selectedSpeed = Math.min(gs.activeCar.maxSpeed, selectedSpeed+1); syncSpeed(); }
      if (e.key === '-')                  { selectedSpeed = Math.max(0, selectedSpeed-1); syncSpeed(); }
      if (e.key === 'Enter')              { ui.log(gs.setSpeed(selectedSpeed)); render(); }
    }

    if (gs.phase === PHASE.FIRE && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      doEndTurn();
    }
  });

  // ── Boot ────────────────────────────────────────────────────
  ui.log('Car Wars v0.1');
  ui.log('P1: Killer Kart (red) \u2014 Machine Gun');
  ui.log('P2: Road Warrior (blue) \u2014 Rocket');
  ui.log('Set speed and press GO!');
  render();
})();
