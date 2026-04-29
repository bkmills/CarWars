// game.js — Car Wars (single-file, no ES modules required)
// Open index.html directly in any browser — no server needed.

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PHASE = { SPEED: 'SPEED', MOVE: 'MOVE' };

// ── Facing geometry ──────────────────────────────────────────
// car.facing = degrees clockwise from North (0=N, 90=E, 180=S, 270=W)
// car.x, car.y = front-left corner of car body (float grid squares)

function facingToVec(deg) {
  const r = deg * Math.PI / 180;
  return [Math.sin(r), -Math.cos(r)];   // [dx, dy], canvas y-down
}
function rightVec(deg) {
  const r = deg * Math.PI / 180;
  return [Math.cos(r), Math.sin(r)];    // 90° CW from forward
}
function normalizeDeg(d) { return ((d % 360) + 360) % 360; }
function facingLabel(deg) {
  const d = normalizeDeg(Math.round(deg));
  const m = {0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW',360:'N'};
  return m[d] !== undefined ? m[d] : d + '\xb0';
}

// Visual center of car body in grid coords (used for fire arc)
function carCenter(car) {
  const [fdx, fdy] = facingToVec(car.facing);
  const [rx, ry]   = rightVec(car.facing);
  return { x: car.x + rx - 2*fdx, y: car.y + ry - 2*fdy };
}

// 4 OBB corners of the 4×2 car rectangle (front-left origin)
function carCorners(x, y, deg) {
  const [fdx, fdy] = facingToVec(deg);
  const [rx, ry]   = rightVec(deg);
  return [
    [x,            y           ],
    [x+2*rx,       y+2*ry      ],
    [x+2*rx-4*fdx, y+2*ry-4*fdy],
    [x-4*fdx,      y-4*fdy     ],
  ];
}

// SAT overlap test for two cars
function obbOverlap(c1, c2) {
  const p1 = carCorners(c1.x, c1.y, c1.facing);
  const p2 = carCorners(c2.x, c2.y, c2.facing);
  for (const poly of [p1, p2]) {
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i+1) % poly.length];
      const nx = -(by-ay), ny = bx-ax;
      let mn1=Infinity,mx1=-Infinity,mn2=Infinity,mx2=-Infinity;
      for (const [px,py] of p1) { const d=px*nx+py*ny; mn1=Math.min(mn1,d); mx1=Math.max(mx1,d); }
      for (const [px,py] of p2) { const d=px*nx+py*ny; mn2=Math.min(mn2,d); mx2=Math.max(mx2,d); }
      if (mx1 < mn2-1e-6 || mx2 < mn1-1e-6) return false;
    }
  }
  return true;
}

// True if grid point (px,py) lies inside car's OBB
function pointInCar(px, py, car) {
  const [fdx, fdy] = facingToVec(car.facing);
  const [rx, ry]   = rightVec(car.facing);
  const vx = px - car.x, vy = py - car.y;
  const fwd = vx*fdx + vy*fdy;   // along facing axis (negative = behind front-left)
  const rt  = vx*rx  + vy*ry;    // perpendicular axis
  return fwd <= 1e-6 && fwd >= -4-1e-6 && rt >= -1e-6 && rt <= 2+1e-6;
}

// Approximate integer grid squares overlapping the car's OBB
function carSquares(car) {
  const [fdx, fdy] = facingToVec(car.facing);
  const [rx, ry]   = rightVec(car.facing);
  const seen = new Set();
  for (let fi = 0; fi <= 4; fi++) {
    for (let ri = 0; ri <= 2; ri++) {
      seen.add(Math.round(car.x - fi*fdx + ri*rx) + ',' + Math.round(car.y - fi*fdy + ri*ry));
      if (fi < 4) seen.add(Math.round(car.x - (fi+0.5)*fdx + ri*rx) + ',' +
                           Math.round(car.y - (fi+0.5)*fdy + ri*ry));
    }
  }
  return [...seen].map(k => { const p=k.split(','); return {x:+p[0],y:+p[1]}; });
}

// Check car OBB is fully within grid bounds
function inBounds(x, y, deg) {
  for (const [cx, cy] of carCorners(x, y, deg)) {
    if (cx < 0 || cx > GRID_COLS || cy < 0 || cy > GRID_ROWS) return false;
  }
  return true;
}

// ── Movement destination helpers ─────────────────────────────
function bendDC(angleDeg) { return Math.ceil(Math.abs(angleDeg) / 15); }

function destForBend(car, angleDeg) {
  // Move 4 sq forward, then anchor the turning-side rear corner.
  // Right bend → right rear corner stays fixed; left bend → left rear corner stays fixed.
  // After advancing 4 sq the rear corners land on the original front corners.
  const [fdx, fdy] = facingToVec(car.facing);
  const [rx, ry]   = rightVec(car.facing);
  const bf = car.reverse ? -1 : 1;
  const midX = car.x + fdx*4*bf, midY = car.y + fdy*4*bf;
  const turnsRight = (car.reverse ? -angleDeg : angleDeg) > 0;
  const pivX = turnsRight ? car.x + 2*rx : car.x;
  const pivY = turnsRight ? car.y + 2*ry : car.y;
  const relX = midX - pivX, relY = midY - pivY;
  const tr = angleDeg * Math.PI / 180;
  const cs = Math.cos(tr), sn = Math.sin(tr);
  return {
    x: pivX + relX*cs - relY*sn,
    y: pivY + relX*sn + relY*cs,
    facing: normalizeDeg(car.facing + (car.reverse ? -angleDeg : angleDeg)),
  };
}

function destForStraight(car, squares) {
  const [fdx, fdy] = facingToVec(car.facing);
  const bf = car.reverse ? -1 : 1;
  return { x: car.x + fdx*squares*bf, y: car.y + fdy*squares*bf, facing: car.facing };
}

function destForDrift(car, dir) {
  // dir +1=right, -1=left (D1)
  const [fdx, fdy] = facingToVec(car.facing);
  const [rx, ry]   = rightVec(car.facing);
  const bf = car.reverse ? -1 : 1;
  return { x: car.x + fdx*4*bf + rx*dir, y: car.y + fdy*4*bf + ry*dir, facing: car.facing };
}

function destForSteepDrift(car, dir) {
  // dir +1=right, -1=left (D3)
  const [fdx, fdy] = facingToVec(car.facing);
  const [rx, ry]   = rightVec(car.facing);
  const bf = car.reverse ? -1 : 1;
  return { x: car.x + fdx*4*bf + rx*dir*2, y: car.y + fdy*4*bf + ry*dir*2, facing: car.facing };
}

function destForPivot(car, angleDeg) {
  // 5mph pivot: advance 1 sq, then anchor the turning-side rear corner.
  const [fdx, fdy] = facingToVec(car.facing);
  const [rx, ry]   = rightVec(car.facing);
  const bf = car.reverse ? -1 : 1;
  const midX = car.x + fdx*bf;
  const midY = car.y + fdy*bf;
  // Rear corners after 1-sq advance (car still 4 sq long)
  const turnsRight = (car.reverse ? -angleDeg : angleDeg) > 0;
  const rearX = turnsRight ? midX + 2*rx - 4*fdx*bf : midX - 4*fdx*bf;
  const rearY = turnsRight ? midY + 2*ry - 4*fdy*bf : midY - 4*fdy*bf;
  const tr = (car.reverse ? -angleDeg : angleDeg) * Math.PI / 180;
  const cs = Math.cos(tr), sn = Math.sin(tr);
  const relX = midX - rearX, relY = midY - rearY;
  return {
    x: rearX + relX*cs - relY*sn,
    y: rearY + relX*sn + relY*cs,
    facing: normalizeDeg(car.facing + (car.reverse ? -angleDeg : angleDeg)),
  };
}

function destForSwerve(car, driftDir, bendAngle) {
  // driftDir: +1=right, -1=left. bendAngle is already the opposite sign.
  const [rx, ry] = rightVec(car.facing);
  const shifted  = { x: car.x + rx*driftDir, y: car.y + ry*driftDir,
                     facing: car.facing, reverse: car.reverse };
  return destForBend(shifted, bendAngle);
}

function destForBootlegger(car) {
  const [fdx, fdy] = facingToVec(car.facing);
  const [rx, ry]   = rightVec(car.facing);
  return { x: car.x + fdx*4 + rx, y: car.y + fdy*4 + ry, facing: normalizeDeg(car.facing + 180) };
}

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
  /* 16 80mph */ [2,   1,   2,   1,   2  ],
  /* 17 85mph */ [2,   1.5, 2,   1,   2  ],
  /* 18 90mph */ [2,   2,   2,   1,   2  ],
  /* 19 95mph */ [2,   2,   2,   1.5, 2  ] ,
  /* 20 100mph */[2,   2,   2,   2,   2  ],
];

// Controlled skid table — index = skid distance in squares (1=¼", 2=½", 3=¾", 4=1")
const SKID_TABLE = [
  null,
  { label: '\xbc"', sq: 1, dcAdd: 1, fireMod:   -1, decel:  0, tireDmg: 0 },
  { label: '\xbd"', sq: 2, dcAdd: 2, fireMod:   -3, decel:  5, tireDmg: 0 },
  { label: '\xbe"', sq: 3, dcAdd: 3, fireMod:   -6, decel:  5, tireDmg: 1 },
  { label:   '1"', sq: 4, dcAdd: 4, fireMod:  999, decel: 10, tireDmg: 2 },
];

const GRID_COLS = 64;
const GRID_ROWS = 44;
const BASE_SQ   = 20;
let   SQ        = 20;   // pixels per grid square (mutable for zoom)

// ═══════════════════════════════════════════════════════════════
// BUILDER DATA (Compendium pp. 67–72)
// ═══════════════════════════════════════════════════════════════

const BUILDER_DATA = {
  bodies: [
    { name:'Subcompact',    price:300,  weight:1000, maxLoad:2300, spacesIn:7,  spacesExt:0,  armorCost:11, armorWt:5  },
    { name:'Compact',       price:400,  weight:1300, maxLoad:3700, spacesIn:10, spacesExt:0,  armorCost:13, armorWt:6  },
    { name:'Mid-sized',     price:600,  weight:1600, maxLoad:4800, spacesIn:13, spacesExt:0,  armorCost:16, armorWt:8  },
    { name:'Sedan',         price:700,  weight:1700, maxLoad:5100, spacesIn:16, spacesExt:0,  armorCost:18, armorWt:9  },
    { name:'Luxury',        price:800,  weight:1800, maxLoad:5500, spacesIn:19, spacesExt:0,  armorCost:20, armorWt:10 },
    { name:'Station Wagon', price:800,  weight:1800, maxLoad:5500, spacesIn:14, spacesExt:7,  armorCost:20, armorWt:10 },
    { name:'Pickup',        price:900,  weight:2100, maxLoad:6500, spacesIn:13, spacesExt:11, armorCost:22, armorWt:11 },
    { name:'Camper',        price:1400, weight:2300, maxLoad:6500, spacesIn:17, spacesExt:7,  armorCost:30, armorWt:14 },
    { name:'Van',           price:1000, weight:2000, maxLoad:6000, spacesIn:24, spacesExt:6,  armorCost:30, armorWt:14 },
  ],
  // loadMod/priceMod are multipliers applied to body maxLoad/price
  chassis: [
    { name:'Light',       loadMod:-0.10, priceMod:-0.20 },
    { name:'Standard',    loadMod:0,     priceMod:0     },
    { name:'Heavy',       loadMod:+0.10, priceMod:+0.50 },
    { name:'Extra Heavy', loadMod:+0.20, priceMod:+1.00 },
  ],
  // hc columns: [standard, van/heavy-pickup, subcompact]
  suspensions: [
    { name:'Light',    priceMod:0,    hc:[1,0,2] },
    { name:'Improved', priceMod:1.00, hc:[2,1,3] },
    { name:'Heavy',    priceMod:1.50, hc:[3,2,4] },
    { name:'Off-road', priceMod:5.00, hc:[2,1,3] },
  ],
  engines: [
    { name:'Small',      cost:500,   weight:500,  spaces:3, dp:5,  pf:800  },
    { name:'Medium',     cost:1000,  weight:700,  spaces:4, dp:8,  pf:1400 },
    { name:'Large',      cost:2000,  weight:900,  spaces:5, dp:10, pf:2000 },
    { name:'Super',      cost:3000,  weight:1100, spaces:6, dp:12, pf:2600 },
    { name:'Sport',      cost:6000,  weight:1000, spaces:6, dp:12, pf:3000 },
    { name:'Thundercat', cost:12000, weight:2000, spaces:8, dp:15, pf:6700 },
  ],
  tires: [
    { name:'Standard',           cost:50,   weight:30,  dp:4  },
    { name:'Heavy-Duty',         cost:100,  weight:40,  dp:6  },
    { name:'Puncture-Resistant', cost:200,  weight:50,  dp:9  },
    { name:'Solid',              cost:500,  weight:75,  dp:12 },
    { name:'Plasticore',         cost:1000, weight:150, dp:25 },
  ],
  mg: { cost:1000, weight:150, spaces:1, dp:3, ammo:20, ammoWeight:2.5, ammoCost:25 },
  driverWeight: 150,
};

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
    this.armor    = { front:0, back:0, left:0, right:0, top:0, under:0, ...cfg.armor };
    this.maxArmor = { front:0, back:0, left:0, right:0, top:0, under:0, ...cfg.armor };
    this.breached = { front:false, back:false, left:false, right:false, top:false, under:false };
    this.driverHits = 0;
    this.alive    = true;
    this.weapons  = cfg.weapons.map(w => ({
      ...w, shotsThisTurn: 0,
      dp: w.dp || 3, maxDp: w.dp || 3, destroyed: false,
    }));
    this.reverse    = false;
    this.crashPending          = null;  // { type, dir } — skid applied at start of car's next move
    this.spinout               = null;  // { dir, rotDir } — ongoing spinout
    this.controlledSkidPending = null;  // { dir, skidSq, afterSq, decel, tireDmg }
    this.fireModifier  = 0;     // 0=normal, -3=*, -6=**, 999=no aimed fire
    this.maneuverUsedThisPhase = false;
    this.firedThisTurn = false;
    this.driverSkill = cfg.driverSkill || 0;
    this.gunnerSkill = cfg.gunnerSkill || 0;
    this.reflexRoll  = 0;
    this._rollRecovery = false;
    this.immobilized  = false;
    const edp = cfg.engineDp || 6;
    const tdp = cfg.tireDp   || 4;
    const tc  = cfg.tireCount || 4;
    this.tireCount  = tc;
    const tireSlots = {
      frontLeft:  { dp: tdp, maxDp: tdp, destroyed: false },
      frontRight: { dp: tdp, maxDp: tdp, destroyed: false },
      rearLeft:   { dp: tdp, maxDp: tdp, destroyed: false },
      rearRight:  { dp: tdp, maxDp: tdp, destroyed: false },
      ...(tc >= 6 ? {
        rearLeft2:  { dp: tdp, maxDp: tdp, destroyed: false },
        rearRight2: { dp: tdp, maxDp: tdp, destroyed: false },
      } : {}),
    };
    this.components = {
      engine: { dp: edp, maxDp: edp, destroyed: false },
      tires: tireSlots,
    };
  }

  isDestroyed() {
    return !this.alive || this.driverHits >= 2;
  }
}

const CAR_DEFS = [
  {
    id: 1, name: 'Alpha', color: '#e74c3c',
    x: 5, y: 21, facing: 90,
    maxSpeed: 75, accel: 15, hc: 4,
    armor: { front: 5, back: 5, left: 5, right: 5, top: 0, under: 0 },
    weapons: [
      { name: 'Machine Gun', type: 'mg', range: 32,
        damageDice: 1, damageSides: 6, rof: 1, ammo: 20, dp: 3 },
    ],
  },
  {
    id: 2, name: 'Beta', color: '#3498db',
    x: 59, y: 23, facing: 270,
    maxSpeed: 75, accel: 15, hc: 4,
    armor: { front: 5, back: 5, left: 5, right: 5, top: 0, under: 0 },
    weapons: [
      { name: 'Machine Gun', type: 'mg', range: 32,
        damageDice: 1, damageSides: 6, rof: 1, ammo: 20, dp: 3 },
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

// totalDecel in mph; safe decel is 10 mph per rulebook
// Returns { dc, tireDmg } where tireDmg is 0, 2, "d6", or "d6+3"
function decelInfo(totalDecel) {
  if (totalDecel <= 15) return { dc:  1, tireDmg: 0      };
  if (totalDecel <= 20) return { dc:  2, tireDmg: 0      };
  if (totalDecel <= 25) return { dc:  3, tireDmg: 0      };
  if (totalDecel <= 30) return { dc:  5, tireDmg: 0      };
  if (totalDecel <= 35) return { dc:  7, tireDmg: 2      };
  if (totalDecel <= 40) return { dc:  9, tireDmg: 'd6'   };
  return                       { dc: 11, tireDmg: 'd6+3' };
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
    ['rearLeft2',  'RL2 Tire'],
    ['rearRight2', 'RR2 Tire'],
  ].filter(([k]) => car.components.tires[k] !== undefined);
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
  const roll      = rollDice(2, 6).total;
  const skill     = car.driverSkill || 0;
  const total     = Math.max(2, roll + mod - skill);
  const modStr    = mod !== 0 ? (mod > 0 ? '+' : '') + mod : '';
  const skillStr  = skill > 0 ? '-' + skill + '(skill)' : '';
  msgs.push(car.name + ' — Crash Table 1: 2d6=' + roll + modStr + skillStr + '=' + total);

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
    msgs.push('\u25b6 Spinout (***) — 90\xb0 spin + 1"/phase, tires \u2212' + tireRoll + ' DP, decel 20 mph/turn, no aimed fire');
  } else if (total <= 14) {
    // Roll: sideways roll, 1d damage per phase to each side rolled onto. ***
    const rotDir = Math.random() < 0.5 ? 2 : -2;
    car.spinout  = { dir: preFacing, rotDir, rollOrientation: 0 };
    car.fireModifier = 999;
    if (total >= 13) msgs.push('\u25b6 ROLLS OVER — FIRE CHECK: ' + (Math.floor(Math.random() * 6) + 1 >= 4 ? 'BURNING!' : 'no fire'));
    msgs.push('\u25b6 CAR ROLLS (***) — rolling ' + (rotDir < 0 ? 'left' : 'right') + ', 1d dmg/phase, decel 20 mph/turn, no aimed fire');
  } else {
    // Vault: flies through air, lands, then continues as Roll. ***
    const rotDir      = Math.random() < 0.5 ? 2 : -2;
    const vaultDist   = rollDice(1, 6).total;           // 1d6 inches traveled
    const landOri     = (2 * vaultDist) % 4;            // landing orientation
    // 3d damage to vaulting tires
    _applyTireDamage(car, rollDice(3, 6).total, msgs);
    // Move car vaultDist inches in travel direction
    const [vfdx, vfdy] = facingToVec(preFacing);
    car.x = Math.max(0, Math.min(GRID_COLS - 1, car.x + vaultDist * 4 * vfdx));
    car.y = Math.max(0, Math.min(GRID_ROWS - 1, car.y + vaultDist * 4 * vfdy));
    // Collision damage to landing face at initial speed (speed/20 d6, min 1d)
    const collisionDice = Math.max(1, Math.floor(car.speed / 20));
    const landFacing    = getRollFacing(rotDir, landOri);
    msgs.push(...applyDamage(car, rollDice(collisionDice, 6).total, landFacing));
    msgs.push('\u25b6 VAULT (***) — flies ' + vaultDist + '\u201d, ' + collisionDice + 'd collision on ' + landFacing + ', rolling ' + (rotDir < 0 ? 'left' : 'right'));
    // Occupant takes 1 automatic damage (body armor does not protect)
    car.driverHits++;
    if (car.driverHits >= 2) { car.alive = false; msgs.push('DRIVER KILLED — ' + car.name + ' is OUT!'); }
    else msgs.push(car.name + ' — occupant auto-damage (' + car.driverHits + '/2)');
    // Continue rolling from landing orientation
    car.spinout      = { dir: preFacing, rotDir, rollOrientation: landOri };
    car.fireModifier = 999;
  }
}

function getRollFacing(rotDir, orientation) {
  if (orientation === 0) return 'under';
  if (orientation === 2) return 'top';
  return rotDir < 0
    ? (orientation === 1 ? 'left'  : 'right')  // rolling left:  L→T→R→U
    : (orientation === 1 ? 'right' : 'left');   // rolling right: R→T→L→U
}

function checkFireArc(attacker, target, weapon) {
  const ac = carCenter(attacker), tc = carCenter(target);
  const dx = tc.x - ac.x, dy = tc.y - ac.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return { canFire: false, reason: 'Same square' };

  const [fdx, fdy] = facingToVec(attacker.facing);
  const [rx,  ry]  = rightVec(attacker.facing);
  const fwd = dx * fdx + dy * fdy;
  const lat = dx * rx  + dy * ry;

  // Front arc boundary = corner-to-corner diagonals of 4×2 car: fwd > 2×|lat|
  if (fwd <= 2 * Math.abs(lat)) return { canFire: false, reason: 'Target not in front arc' };

  return { canFire: true, dist };
}

function calcToHit(target, dist, fireModifier, gunnerSkill) {
  if (fireModifier >= 999) return 999;
  let toHit = 7;
  if (dist <= 4) {
    toHit -= 4;                          // point blank (≤1"): +4 to roll
  } else {
    toHit += Math.floor(dist / 16);      // long range: +1 per full 4"
  }
  if (target.speed === 0) toHit -= 1;
  if (fireModifier) toHit -= fireModifier;
  toHit -= (gunnerSkill || 0);
  return Math.max(2, Math.min(12, toHit));
}

function getHitFacing(targetFacing, fromX, fromY, toX, toY) {
  const dx  = fromX - toX;
  const dy  = fromY - toY;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return 'front';

  const [fdx, fdy] = facingToVec(targetFacing);
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
  top:   [null,'driver','driver','engine','engine','weapon','weapon'],
  under: [null,'engine','engine','tire-fl','tire-fr','tire-rl','tire-rr'],
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
    car.maxSpeed     = 0;
    car.speed        = 0;
    car.immobilized  = true;
    msgs.push(car.name + ' engine out \u2014 immobilized!');
  } else if (label.endsWith('Tire')) {
    car.hc = Math.max(0, car.hc - 1);
    if (car.handlingStatus > car.hc) car.handlingStatus = car.hc;
    msgs.push(car.name + ' tire blown! HC \u2192 ' + car.hc);
    if (car.hc === 0) {
      car.immobilized = true;
      msgs.push(car.name + ' lost all tires \u2014 immobilized!');
    }
  } else {
    msgs.push(car.name + "'s " + label + ' is out of action!');
  }
}

// ═══════════════════════════════════════════════════════════════
// CAR BUILDER
// ═══════════════════════════════════════════════════════════════

function buildCarConfig(sel, color, carId) {
  const body    = BUILDER_DATA.bodies[sel.bodyIdx];
  const susp    = BUILDER_DATA.suspensions[sel.suspIdx];
  const engine  = BUILDER_DATA.engines[sel.engineIdx];
  const tire    = BUILDER_DATA.tires[sel.tireIdx];
  const mgData  = BUILDER_DATA.mg;

  const isHeavyBody = sel.bodyIdx >= 6;
  const isXHeavy    = sel.chassisIdx === 3;
  const tireCount   = (isHeavyBody && isXHeavy) ? 6 : 4;

  const armorPts = Object.values(sel.armor).reduce((a, b) => a + b, 0);
  const armorWt  = armorPts * body.armorWt;
  const tireWt   = tire.weight * tireCount;
  const mgAmmo   = sel.hasMG ? (sel.mgAmmo !== undefined ? sel.mgAmmo : mgData.ammo) : 0;
  const mgWt     = sel.hasMG ? (mgData.weight + mgAmmo * mgData.ammoWeight) : 0;
  const totalWt  = body.weight + engine.weight + armorWt + tireWt + mgWt + BUILDER_DATA.driverWeight;

  const pf = engine.pf;
  let accel;
  if      (pf < totalWt / 3) accel = 0;
  else if (pf < totalWt / 2) accel = 5;
  else if (pf < totalWt)     accel = 10;
  else                       accel = 15;

  const maxSpeed   = Math.floor(360 * pf / (pf + totalWt) / 2.5) * 2.5;
  const maxReverse = Math.floor(maxSpeed / 5);

  const isSubcompact = sel.bodyIdx === 0;
  const isVanClass   = sel.bodyIdx === 8 || (sel.bodyIdx === 6 && totalWt > 5500);
  const hcCol        = isSubcompact ? 2 : isVanClass ? 1 : 0;
  const hc           = susp.hc[hcCol];

  return {
    id: carId,
    name: sel.name || ('P' + carId + ' Car'),
    color,
    x: carId === 1 ? 5 : 58,
    y: carId === 1 ? 21 : 22,
    facing: carId === 1 ? 90 : 270,
    maxSpeed, accel, maxReverse, hc,
    armor: { ...sel.armor },
    engineDp: engine.dp,
    tireDp:   tire.dp,
    tireCount,
    weapons: sel.hasMG ? [{
      name:'Machine Gun', type:'mg', range:32,
      damageDice:1, damageSides:6, rof:2, ammo:mgAmmo, dp:mgData.dp,
    }] : [],
    driverSkill: sel.driverSkill || 0,
    gunnerSkill: sel.gunnerSkill || 0,
  };
}

const CarBuilder = {
  step:  1,
  p1cfg: null,

  open(step) {
    this.step = step;
    document.getElementById('car-builder').style.display = 'flex';
    document.getElementById('cb-player-label').textContent = 'P' + step;
    const confirmBtn = document.getElementById('cb-confirm');
    confirmBtn.textContent = step === 1 ? 'Confirm P1 \u2192' : 'Start Game \u25ba';
    confirmBtn.className = 'btn-primary' + (step === 2 ? ' p2' : '');

    document.getElementById('cb-name').value = step === 1 ? 'Killer Kart' : 'Deathmobile';
    document.getElementById('cb-driver-skill').value = 0;
    document.getElementById('cb-gunner-skill').value = 0;
    ['cb-body','cb-chassis','cb-susp','cb-engine','cb-tires'].forEach(id => {
      document.getElementById(id).selectedIndex = 0;
    });
    const defaults = { front:4, back:3, left:3, right:3, top:0, under:0 };
    for (const [f, v] of Object.entries(defaults)) {
      const el = document.getElementById('cb-armor-' + f);
      if (el) el.value = v;
    }
    document.getElementById('cb-mg').checked = true;
    this.recalc();
  },

  _getSel() {
    return {
      bodyIdx:    +document.getElementById('cb-body').value,
      chassisIdx: +document.getElementById('cb-chassis').value,
      suspIdx:    +document.getElementById('cb-susp').value,
      engineIdx:  +document.getElementById('cb-engine').value,
      tireIdx:    +document.getElementById('cb-tires').value,
      armor: {
        front: +document.getElementById('cb-armor-front').value || 0,
        back:  +document.getElementById('cb-armor-back').value  || 0,
        left:  +document.getElementById('cb-armor-left').value  || 0,
        right: +document.getElementById('cb-armor-right').value || 0,
        top:   +document.getElementById('cb-armor-top').value   || 0,
        under: +document.getElementById('cb-armor-under').value || 0,
      },
      hasMG:    document.getElementById('cb-mg').checked,
      mgAmmo:   Math.max(0, Math.min(20, +document.getElementById('cb-mg-ammo').value || 0)),
      name:     document.getElementById('cb-name').value.trim(),
      driverSkill: Math.min(9, Math.max(0, +document.getElementById('cb-driver-skill').value || 0)),
      gunnerSkill: Math.min(9, Math.max(0, +document.getElementById('cb-gunner-skill').value || 0)),
    };
  },

  recalc() {
    const sel    = this._getSel();
    const body   = BUILDER_DATA.bodies[sel.bodyIdx];
    const chassis= BUILDER_DATA.chassis[sel.chassisIdx];
    const susp   = BUILDER_DATA.suspensions[sel.suspIdx];
    const engine = BUILDER_DATA.engines[sel.engineIdx];
    const tire   = BUILDER_DATA.tires[sel.tireIdx];
    const mgData = BUILDER_DATA.mg;

    const isHeavyBody = sel.bodyIdx >= 6;
    const isXHeavy    = sel.chassisIdx === 3;
    const tireCount   = (isHeavyBody && isXHeavy) ? 6 : 4;

    const chassisCost= Math.round(body.price * chassis.priceMod);
    const bodyPrice  = body.price + chassisCost;
    const suspPrice  = Math.round(body.price * susp.priceMod);
    const armorPts   = Object.values(sel.armor).reduce((a, b) => a + b, 0);
    const armorCost  = armorPts * body.armorCost;
    const armorWt    = armorPts * body.armorWt;
    const tireCost   = tire.cost * tireCount;
    const tireWt     = tire.weight * tireCount;
    const mgAmmo     = sel.hasMG ? sel.mgAmmo : 0;
    const mgCost     = sel.hasMG ? (mgData.cost + mgAmmo * mgData.ammoCost) : 0;
    const mgWt       = sel.hasMG ? (mgData.weight + mgAmmo * mgData.ammoWeight) : 0;
    const mgSpaces   = sel.hasMG ? mgData.spaces : 0;

    const totalCost  = bodyPrice + suspPrice + engine.cost + tireCost + armorCost + mgCost;
    const totalWt    = body.weight + engine.weight + armorWt + tireWt + mgWt + BUILDER_DATA.driverWeight;
    const totalSp    = engine.spaces + mgSpaces;
    const maxLoad    = Math.round(body.maxLoad * (1 + chassis.loadMod));

    const pf = engine.pf;
    let accel;
    if      (pf < totalWt / 3) accel = 0;
    else if (pf < totalWt / 2) accel = 5;
    else if (pf < totalWt)     accel = 10;
    else                       accel = 15;
    const maxSpeed   = Math.floor(360 * pf / (pf + totalWt) / 2.5) * 2.5;
    const maxReverse = Math.floor(maxSpeed / 5);

    const isSubcompact = sel.bodyIdx === 0;
    const isVanClass   = sel.bodyIdx === 8 || (sel.bodyIdx === 6 && totalWt > 5500);
    const hcCol        = isSubcompact ? 2 : isVanClass ? 1 : 0;
    const hc           = susp.hc[hcCol];

    const chassisExtra = Math.round(body.price * chassis.priceMod);
    setText('cb-body-cost',    '$' + body.price.toLocaleString());
    setText('cb-chassis-cost', chassisExtra === 0 ? '—' : (chassisExtra > 0 ? '+' : '') + '$' + chassisExtra.toLocaleString());
    setText('cb-body-wt',     body.weight.toLocaleString());
    setText('cb-body-sp',     body.spacesIn + (body.spacesExt ? '(+'+body.spacesExt+')' : ''));
    setText('cb-engine-cost', '$' + engine.cost.toLocaleString());
    setText('cb-engine-wt',   engine.weight.toLocaleString());
    setText('cb-engine-sp',   engine.spaces);
    setText('cb-susp-cost',   '$' + suspPrice.toLocaleString());
    setText('cb-susp-wt',     '—');
    setText('cb-susp-sp',     '—');
    setText('cb-tire-cost',   '$' + tireCost.toLocaleString());
    setText('cb-tire-wt',     tireWt.toLocaleString());
    setText('cb-tire-sp',     '—');
    setText('cb-tire-count',  tireCount + ' tires');
    setText('cb-armor-cost',  '$' + armorCost.toLocaleString());
    setText('cb-armor-wt',    armorWt.toLocaleString());
    setText('cb-armor-sp',    '—');
    const ammoEl = document.getElementById('cb-mg-ammo');
    ammoEl.disabled = !sel.hasMG;
    const ammoMax = mgData.ammo;
    if (+ammoEl.value > ammoMax) ammoEl.value = ammoMax;
    if (+ammoEl.value < 0)       ammoEl.value = 0;
    sel.mgAmmo = +ammoEl.value;
    const ammoCost = sel.hasMG ? mgAmmo * mgData.ammoCost : 0;
    const ammoWt   = sel.hasMG ? mgAmmo * mgData.ammoWeight : 0;
    setText('cb-mg-gun-cost',  sel.hasMG ? '$' + mgData.cost.toLocaleString() : '$0');
    setText('cb-mg-gun-wt',    sel.hasMG ? mgData.weight : 0);
    setText('cb-mg-sp',        sel.hasMG ? mgSpaces : '—');
    setText('cb-mg-ammo-cost', sel.hasMG ? '$' + ammoCost.toLocaleString() : '$0');
    setText('cb-mg-ammo-wt',   sel.hasMG ? ammoWt : 0);
    setText('cb-total-cost',  '$' + totalCost.toLocaleString());
    setText('cb-total-wt',    totalWt.toLocaleString() + ' / ' + maxLoad.toLocaleString() + ' lbs');
    setText('cb-total-sp',    totalSp + ' / ' + body.spacesIn);
    setText('cb-accel',    accel === 0 ? 'NONE' : accel + ' mph');
    setText('cb-topspeed', maxSpeed + ' mph');
    setText('cb-hc',       hc);
    setText('cb-maxrev',   maxReverse + ' mph');
    document.getElementById('cb-accel').style.color = accel === 0 ? '#e74c3c' : '#5bc4ef';

    const overload     = totalWt > maxLoad;
    const underpowered = accel === 0;
    const spaceOver    = totalSp > body.spacesIn;
    let warn = '';
    if (overload)     warn += 'OVERWEIGHT: ' + totalWt.toLocaleString() + ' > max ' + maxLoad.toLocaleString() + ' lbs.  ';
    if (underpowered) warn += 'UNDERPOWERED: car cannot move.  ';
    if (spaceOver)    warn += 'OVER SPACE LIMIT: ' + totalSp + ' > ' + body.spacesIn + ' spaces.  ';
    const warnEl = document.getElementById('cb-warning');
    warnEl.textContent   = warn;
    warnEl.style.display = warn ? 'block' : 'none';
    document.getElementById('cb-confirm').disabled = !!(overload || underpowered || spaceOver);
  },

  confirm() {
    const sel   = this._getSel();
    const color = this.step === 1 ? '#e74c3c' : '#3498db';
    const cfg   = buildCarConfig(sel, color, this.step);
    if (this.step === 1) {
      this.p1cfg = cfg;
      this.open(2);
    } else {
      document.getElementById('car-builder').style.display = 'none';
      game.init(this.p1cfg, cfg);
    }
  },
};

// ═══════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════

class GameState {
  constructor(carCfgs) {
    this.cars            = carCfgs.map(def => new Car(def));
    // Reflex rolls — rolled once at start of combat
    this.reflexMsgs = [];
    this.cars.forEach(car => {
      const die   = Math.floor(Math.random() * 6) + 1;
      const total = die + car.driverSkill;
      car.reflexRoll = total;
      const skillStr = car.driverSkill > 0 ? '+' + car.driverSkill + '(skill)' : '';
      let hcBonus = 0;
      if      (total >= 6) hcBonus = 2;
      else if (total >= 5) hcBonus = 1;
      if (hcBonus > 0) {
        car.hc             += hcBonus;
        car.handlingStatus  = Math.min(car.handlingStatus + hcBonus, car.hc);
      }
      const hcStr = hcBonus > 0 ? ' → HC +' + hcBonus + ' (now ' + car.hc + ')' : '';
      this.reflexMsgs.push(car.name + ': Reflex roll 1d6=' + die + skillStr + '=' + total + hcStr);
    });
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
    this.skidDist        = 0;     // controlled skid distance: 0=none, 1=¼", 2=½", 3=¾", 4=1"
    this.bendAngle           = 45;    // current bend angle selection (15/30/45/60/75/90)
    this.phaseFireIdx        = -1;    // -1=inactive, 0=P1 offered, 1=P2 offered
    this.phaseFireKills      = [];    // car indices killed during current phase's fire
    this.phaseFireAliveStart = [];    // alive snapshot at start of phase fire offer
    this._terminalFireOffer = false; // true = finalize goes to endTurnFinal
    this.moveTrail          = [];    // pre-move snapshots for ghost trail visualization
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
    if (car._rollRecovery) {
      car._rollRecovery = false;
      const liveTires = Object.values(car.components.tires).filter(t => !t.destroyed).length;
      msgs.push(car.name + ' stopped rolling right-side up with ' + liveTires + ' tires — may continue!');
    }

    // If car is in a crash spin/roll, speed is auto-locked — no player input
    if (car.spinout) {
      msgs.push(car.name + ' spinning \u2014 speed locked at ' + car.speed + ' mph');
      if (this.activeIdx === 0) {
        this.activeIdx = 1;
      } else {
        msgs.push(...this._enterMovePhase());
      }
      return msgs;
    }
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
    if (decelAmt > 10) {
      const info = decelInfo(decelAmt);
      let brakeMsg = car.name + ' hard brake \u2212' + decelAmt + ' mph (D' + info.dc + ')';
      // Tire damage at 35+ mph decel
      if (info.tireDmg === 'd6+3') {
        const td = rollDice(1, 6).total + 3;
        brakeMsg += ', tires \u2212' + td + ' DP';
        msgs.push(brakeMsg);
        _applyTireDamage(car, td, msgs);
      } else if (info.tireDmg === 'd6') {
        const td = rollDice(1, 6).total;
        brakeMsg += ', tires \u2212' + td + ' DP';
        msgs.push(brakeMsg);
        _applyTireDamage(car, td, msgs);
      } else if (info.tireDmg === 2) {
        brakeMsg += ', tires \u22122 DP';
        msgs.push(brakeMsg);
        _applyTireDamage(car, 2, msgs);
      } else {
        msgs.push(brakeMsg);
      }
      // Control roll at original speed (rules: "at the original speed")
      car.speed = prevMag;
      applyManeuver(car, info.dc, msgs, car.facing);
      car.speed = wantMag;
      this._checkDestroyed(msgs);
    }
    const _delta = Math.abs(car.speed - prevMag);
    const _verb  = car.speed > prevMag ? 'accelerates' : car.speed < prevMag ? 'decelerates' : 'holds speed at';
    const _spd   = (car.reverse ? '−' : '') + car.speed + ' mph' + (car.reverse ? ' (REVERSE)' : '');
    msgs.unshift(car.name + ' ' + _verb + (_delta > 0 ? ' ' + _delta + ' to ' : ' ') + _spd);

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

    if (this.movePhase > 5) {
      this._endTurnFinal();
      return msgs;
    }

    const phIdx = this.movePhase - 1;
    this.moveOrder = [];
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (!car.isDestroyed() && car.speed > 0 && PHASE_CHART[car.speed / 5][phIdx] > 0) {
        this.moveOrder.push(i);
      }
    }

    if (this.moveOrder.length === 0) {
      // No movement this phase — offer fire (player may choose to fire)
      return [...msgs, ...this._enterPhaseFireOffer()];
    }

    msgs.push('\u25b6Turn ' + this.turn + ' \u00b7 Phase ' + this.movePhase);

    // Resolve move order — tie uses reflex roll, coin flip only if equal
    if (this.moveOrder.length === 2 &&
        this.cars[this.moveOrder[0]].speed === this.cars[this.moveOrder[1]].speed) {
      const r0 = this.cars[this.moveOrder[0]].reflexRoll;
      const r1 = this.cars[this.moveOrder[1]].reflexRoll;
      let tieMethod;
      if      (r0 < r1) { this.moveOrder.reverse(); tieMethod = 'reflex'; }
      else if (r0 > r1) {                           tieMethod = 'reflex'; }
      else              { if (Math.random() < 0.5) this.moveOrder.reverse(); tieMethod = 'coin flip'; }
      msgs.push('---Ph' + this.movePhase + ' Speeds equal — ' + tieMethod + ': ' +
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
      // Movement done for this phase — offer fire before advancing
      return this._enterPhaseFireOffer();
    }
  }

  // Returns true if the active car has any valid move this sub-phase.
  hasValidMoves() {
    if (this.phase !== PHASE.MOVE || this.movesRemaining <= 0) return false;
    const car = this.activeCar;
    const sq  = this.halfMovePhase ? 2 : 4;
    const d   = destForStraight(car, sq);
    if (inBounds(d.x, d.y, d.facing) && !obbOverlap({ x:d.x, y:d.y, facing:d.facing }, this.enemyCar)) return true;
    if (this.halfMovePhase || car.maneuverUsedThisPhase) return false;
    const rDC = car.reverse ? 1 : 0;
    for (const angDeg of [15,30,45,60,75,90,-15,-30,-45,-60,-75,-90]) {
      const db = destForBend(car, angDeg);
      if (inBounds(db.x, db.y, db.facing) && !obbOverlap({ x:db.x, y:db.y, facing:db.facing }, this.enemyCar)) return true;
    }
    return false;
  }

  // Execute a maneuver for the active car. type: 'straight'|'bend'|'drift'|'steep'|'bootlegger'
  // param: angle degrees (for 'bend') or ±1 direction (for 'drift'/'steep')
  executeManeuver(type, param) {
    if (this.phase !== PHASE.MOVE || this.movesRemaining <= 0) return [];
    const car       = this.activeCar;
    const wasHalf   = this.halfMovePhase;
    const preFacing = car.facing;
    const rDC = car.reverse ? 1 : 0;
    let dest, dc = 0, label = '';
    const sq = wasHalf ? 2 : 4;

    if (type === 'straight') {
      dest  = destForStraight(car, sq);
      label = wasHalf ? '\xbd" straight' : 'Straight';
    } else if (type === 'bend') {
      if (car.maneuverUsedThisPhase) return [];
      if (wasHalf && car.speed === 5) {
        dest  = destForPivot(car, param);
        dc    = 0;
        label = 'Pivot ' + Math.abs(param) + '\xb0 ' + (param < 0 ? 'L' : 'R');
      } else if (wasHalf) {
        return [];
      } else {
        dest  = destForBend(car, param);
        dc    = bendDC(param) + rDC;
        label = 'Bend ' + Math.abs(param) + '\xb0 ' + (param < 0 ? 'L' : 'R');
      }
    } else if (type === 'drift') {
      if (car.maneuverUsedThisPhase || wasHalf) return [];
      dest  = destForDrift(car, param);
      dc    = 1 + rDC;
      label = 'Drift ' + (param < 0 ? 'L' : 'R');
    } else if (type === 'steep') {
      if (car.maneuverUsedThisPhase || wasHalf) return [];
      dest  = destForSteepDrift(car, param);
      dc    = 3 + rDC;
      label = 'Steep ' + (param < 0 ? 'L' : 'R');
    } else if (type === 'swerve') {
      if (car.maneuverUsedThisPhase || wasHalf) return [];
      // param = bend direction (-1=left, +1=right); drift is opposite
      const driftDir  = -param;
      const bendAngle = param * this.bendAngle;
      dest  = destForSwerve(car, driftDir, bendAngle);
      dc    = bendDC(this.bendAngle) + 1 + rDC;
      label = 'Swerve ' + (param < 0 ? 'L' : 'R') + ' ' + this.bendAngle + '\xb0';
    } else if (type === 'bootlegger') {
      if (!this.canBootlegger()) return [];
      return this.doBootlegger();
    } else {
      return [];
    }
    void rDC;

    if (!inBounds(dest.x, dest.y, dest.facing)) return [];
    if (!car.isDestroyed() && obbOverlap({ x:dest.x, y:dest.y, facing:dest.facing }, this.enemyCar)) return [];

    this.moveTrail.push({ x: car.x, y: car.y, facing: car.facing, carIdx: this.activeIdx, label: label });

    car.x      = dest.x;
    car.y      = dest.y;
    car.facing = dest.facing;
    this.movesRemaining--;

    if (this.halfMovePending && this.movesRemaining === 1) {
      this.halfMovePhase   = true;
      this.halfMovePending = false;
    }

    const msgs = [];
    const skid = this.skidDist > 0 ? SKID_TABLE[this.skidDist] : null;
    const isSkiddable = (type === 'bend' && !wasHalf) || type === 'swerve' ||
                        (type === 'bend' && wasHalf && car.speed === 5);  // pivot counts
    if (skid && isSkiddable) dc += skid.dcAdd;

    if (dc > 0) {
      car.maneuverUsedThisPhase = true;
      applyManeuver(car, dc, msgs, preFacing);
      this._checkDestroyed(msgs);
      msgs.unshift(car.name + ' Ph' + this.movePhase + ' [' + label +
        (skid && isSkiddable ? ' + skid ' + skid.label : '') +
        ' D' + dc + '] facing ' + facingLabel(car.facing));
    } else {
      msgs.push(car.name + ' Ph' + this.movePhase + ' [' + label + '] facing ' + facingLabel(car.facing));
    }

    if (skid && isSkiddable) this.skidDist = 0;  // reset after use

    // Queue controlled skid if declared, control was maintained, and no crash occurred
    if (skid && isSkiddable && !car.crashPending && !car.spinout && !car.isDestroyed()) {
      if (skid.fireMod === 999) car.fireModifier = 999;
      else car.fireModifier = Math.min(car.fireModifier, skid.fireMod);
      car.controlledSkidPending = { dir: preFacing, skidSq: skid.sq, afterSq: 4 - skid.sq,
                                    decel: skid.decel, tireDmg: skid.tireDmg };
      msgs.push('Controlled skid ' + skid.label + ' queued \u2014 executes next move');
    } else if (skid && isSkiddable && (car.crashPending || car.spinout)) {
      msgs.push('Control lost \u2014 controlled skid cancelled, crash table applies');
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

    if (car.controlledSkidPending || car.spinout || car.crashPending) {
      const crashLabel = car.controlledSkidPending ? 'Skd' : car.spinout ? 'Spn' : 'Crs';
      this.moveTrail.push({ x: car.x, y: car.y, facing: car.facing, carIdx: this.activeIdx, label: crashLabel });
    }

    if (car.controlledSkidPending) {
      const { dir, skidSq, afterSq, decel, tireDmg } = car.controlledSkidPending;
      car.controlledSkidPending = null;
      if (decel > 0) {
        car.speed = Math.max(0, car.speed - decel);
        msgs.push(car.name + ' skid decel \u2013' + decel + ' mph \u2192 ' + car.speed + ' mph');
      }
      const [fdx, fdy] = facingToVec(dir);
      const [cfx, cfy] = facingToVec(car.facing);
      const skidLabel  = ['', '\xbc"', '\xbd"', '\xbe"', '1"'][skidSq];
      car.x = Math.max(0, Math.min(GRID_COLS - 1, car.x + skidSq * fdx));
      car.y = Math.max(0, Math.min(GRID_ROWS - 1, car.y + skidSq * fdy));
      msgs.push(car.name + ' controlled skid ' + skidLabel + ' in old direction');
      if (afterSq > 0) {
        const afterLabel = ['', '\xbc"', '\xbd"', '\xbe"', '1"'][afterSq];
        car.x = Math.max(0, Math.min(GRID_COLS - 1, car.x + afterSq * cfx));
        car.y = Math.max(0, Math.min(GRID_ROWS - 1, car.y + afterSq * cfy));
        msgs.push(car.name + ' + ' + afterLabel + ' straight ahead');
      }
      if (tireDmg > 0) {
        _applyTireDamage(car, tireDmg, msgs);
      }
      this.movesRemaining = 0;
      this._checkDestroyed(msgs);
      return msgs;
    }

    if (car.spinout) {
      const { dir, rotDir, rollOrientation } = car.spinout;
      car.facing = normalizeDeg(car.facing + rotDir * 45);
      const [fdx, fdy] = facingToVec(dir);
      car.x = Math.max(0, Math.min(GRID_COLS - 1, car.x + 4 * fdx));
      car.y = Math.max(0, Math.min(GRID_ROWS - 1, car.y + 4 * fdy));
      msgs.push(car.name + ' spinning \u2014 facing now ' + facingLabel(car.facing) +
                ', drifts to (' + car.x.toFixed(1) + ',' + car.y.toFixed(1) + ')');
      // Per-phase roll damage
      if (rollOrientation !== undefined) {
        const newOri = (rollOrientation + 1) % 4;
        car.spinout.rollOrientation = newOri;
        const face = getRollFacing(rotDir, newOri);
        if (face === 'under') {
          const tireHit = rollDice(1, 6).total;
          _applyTireDamage(car, tireHit, msgs);
          msgs.push(car.name + ' rolls onto UNDERSIDE \u2014 tires \u2212' + tireHit + ' DP');
        } else {
          msgs.push(...applyDamage(car, rollDice(1, 6).total, face));
          msgs.push(car.name + ' rolls onto ' + face + ' side');
        }
      }
      this.movesRemaining = 0;
      this._checkDestroyed(msgs);
      return msgs;
    }

    if (car.crashPending) {
      const { type, dir } = car.crashPending;
      car.crashPending = null;
      const [fdx, fdy]  = facingToVec(dir);
      const [cfx, cfy]  = facingToVec(car.facing);
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

  _carCanFire(car) {
    return car.weapons.some(w => !w.destroyed && w.ammo > 0);
  }

  _checkDestroyed(msgs) {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (car.isDestroyed() && !this.gameOver) {
        this.gameOver = true;
        this.winner   = this.cars[1 - i];
        msgs.push('\u2605 ' + this.winner.name + ' WINS!');
        return;
      }
      if (car.immobilized && !this._carCanFire(car) && !this.gameOver) {
        this.gameOver = true;
        this.winner   = this.cars[1 - i];
        msgs.push(car.name + ' is immobilized with no weapons \u2014 out of the fight!');
        msgs.push('\u2605 ' + this.winner.name + ' WINS!');
        return;
      }
    }
  }

  // ── Special maneuvers ───────────────────────────────────────────

  canBootlegger() {
    const car = this.activeCar;
    return this.phase === PHASE.MOVE &&
           this.phaseFireIdx < 0 &&
           this.movesRemaining > 0 &&
           !car.maneuverUsedThisPhase &&
           !this.halfMovePhase &&
           car.speed >= 15 && car.speed <= 25;
  }

  doBootlegger() {
    const car       = this.activeCar;
    const preFacing = car.facing;
    const msgs = [car.name + ' \u2014 BOOTLEGGER!'];
    car.maneuverUsedThisPhase = true;
    const d = destForBootlegger(car);
    car.x = d.x; car.y = d.y;
    applyManeuver(car, 7, msgs, preFacing);
    this._checkDestroyed(msgs);
    if (!car.isDestroyed()) {
      car.facing = d.facing;
      car.speed  = 0;
      msgs.push(car.name + ' reversed \u2192 facing ' + facingLabel(car.facing) + ', speed 0');
    }
    this.movesRemaining = 0;
    msgs.push(...this._advanceMover());
    return msgs;
  }

  // ── Phase fire offer (simultaneous fire within each move phase) ─────

  _canOfferFire(carIdx) {
    const car   = this.cars[carIdx];
    const enemy = this.cars[1 - carIdx];
    return this.phaseFireAliveStart[carIdx] &&
           !car.firedThisTurn &&
           car.fireModifier < 999 &&
           car.weapons.some(w => !w.destroyed && w.ammo > 0 && checkFireArc(car, enemy, w).canFire);
  }

  _enterPhaseFireOffer() {
    this.phaseFireKills      = [];
    this.phaseFireAliveStart = this.cars.map(c => !c.isDestroyed());
    this.phaseFireIdx        = 0;
    return this._advancePhaseFireOffer();
  }

  _advancePhaseFireOffer() {
    while (this.phaseFireIdx <= 1) {
      if (this._canOfferFire(this.phaseFireIdx)) {
        this.activeIdx = this.phaseFireIdx;
        return [];
      }
      this.phaseFireIdx++;
    }
    return this._finalizePhaseFireOffer();
  }

  passPhaseFireOffer() {
    this.phaseFireIdx++;
    return this._advancePhaseFireOffer();
  }

  fireWeaponInPhase(weaponIdx) {
    const attackerIdx = this.phaseFireIdx;
    const targetIdx   = 1 - attackerIdx;
    const attacker    = this.cars[attackerIdx];
    const target      = this.cars[targetIdx];
    const weapon      = attacker.weapons[weaponIdx];

    if (!weapon)          return { hit: false, messages: ['No such weapon'] };
    if (weapon.destroyed) return { hit: false, messages: [weapon.name + ' is destroyed!'] };
    if (weapon.ammo <= 0) return { hit: false, messages: [weapon.name + ' is out of ammo!'] };
    if (attacker.fireModifier >= 999) return { hit: false, messages: ['No aimed fire this turn (***)'] };

    const arcCheck = checkFireArc(attacker, target, weapon);
    if (!arcCheck.canFire) return { hit: false, messages: [arcCheck.reason] };

    const dist    = arcCheck.dist;
    const toHit   = calcToHit(target, dist, attacker.fireModifier, attacker.gunnerSkill);
    const diceRes = rollDice(2, 6);
    const hit     = diceRes.total >= toHit;

    weapon.shotsThisTurn++;
    weapon.ammo--;
    attacker.firedThisTurn = true;

    const msgs = [
      attacker.name + ' fires ' + weapon.name + ' at ' + target.name,
      'Range ' + dist.toFixed(1) + ' | Need ' + toHit + '+ | Roll ' +
        diceRes.rolls.join('+') + '=' + diceRes.total + ' \u2192 ' + (hit ? 'HIT!' : 'miss'),
    ];

    if (hit) {
      const ac = carCenter(attacker), tc = carCenter(target);
      const hitFacing = getHitFacing(target.facing, ac.x, ac.y, tc.x, tc.y);
      const dmgRes    = rollDice(weapon.damageDice, weapon.damageSides);
      msgs.push('Hits ' + target.name + "'s " + hitFacing + '! Dmg: ' +
                dmgRes.rolls.join('+') + '=' + dmgRes.total);
      msgs.push(...applyDamage(target, dmgRes.total, hitFacing));
      if (target.isDestroyed()) {
        this.phaseFireKills.push(targetIdx);
        msgs.push(target.name + ' destroyed! (resolving simultaneously\u2026)');
      }
    }

    this.phaseFireIdx++;
    return { hit, messages: [...msgs, ...this._advancePhaseFireOffer()] };
  }

  _finalizePhaseFireOffer() {
    const msgs = [];
    this.phaseFireIdx = -1;

    const p1Dead = this.phaseFireKills.includes(0);
    const p2Dead = this.phaseFireKills.includes(1);
    if (p1Dead) this.cars[0].alive = false;
    if (p2Dead) this.cars[1].alive = false;

    if (p1Dead && p2Dead) {
      this.gameOver = true;
      this.winner   = null;
      msgs.push('\u2605 DRAW \u2014 Both destroyed! \u2605');
    } else if (p1Dead) {
      this.gameOver = true;
      this.winner   = this.cars[1];
      msgs.push('\u2605 ' + this.winner.name + ' WINS! \u2605');
    } else if (p2Dead) {
      this.gameOver = true;
      this.winner   = this.cars[0];
      msgs.push('\u2605 ' + this.winner.name + ' WINS! \u2605');
    }

    if (!this.gameOver) {
      if (this._terminalFireOffer) {
        this._terminalFireOffer = false;
        this._endTurnFinal();
      } else {
        this.movePhase++;
        if (this.movePhase > 5) {
          this._endTurnFinal();
        } else if (this._noMoreMovement()) {
          const someCanFire = this.cars.some((c, i) =>
            !c.isDestroyed() && !c.firedThisTurn && c.fireModifier < 999 &&
            c.weapons.some(w => !w.destroyed && w.ammo > 0 && checkFireArc(c, this.cars[1 - i], w).canFire)
          );
          if (someCanFire) {
            this._terminalFireOffer = true;
            msgs.push(...this._enterPhaseFireOffer());
          } else {
            this._endTurnFinal();
          }
        } else {
          msgs.push(...this._startMovePhase());
        }
      }
    }
    return msgs;
  }

  _noMoreMovement() {
    for (let ph = this.movePhase; ph <= 5; ph++) {
      for (const car of this.cars) {
        if (!car.isDestroyed() && car.speed > 0 && PHASE_CHART[car.speed / 5][ph - 1] > 0) return false;
      }
    }
    return true;
  }

  _endTurnFinal() {
    for (const car of this.cars) {
      if (car.spinout) {
        car.speed = Math.max(0, car.speed - 20);
        if (car.speed === 0) {
          const { rollOrientation } = car.spinout;
          car.spinout = null;
          if (rollOrientation !== undefined) {
            if (rollOrientation === 0) {
              const liveTires = Object.values(car.components.tires).filter(t => !t.destroyed).length;
              if (liveTires >= 3) { car._rollRecovery = true; }
              else { car.alive = false; }
            } else {
              car.alive = false;
            }
          }
        }
      }
      car.fireModifier   = 0;
      car.firedThisTurn  = false;
      car.handlingStatus = Math.min(car.hc, car.handlingStatus + car.hc);
      car.weapons.forEach(w => { w.shotsThisTurn = 0; });
    }
    this.turn++;
    this.activeIdx      = 0;
    this.phase          = PHASE.SPEED;
    this.movesRemaining = 0;
    this.movePhase      = 0;
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
      for (let r = 0; r <= GRID_ROWS; r++) {
        const r_px   = Math.max(1.2, SQ * 0.055);
        ctx.fillStyle = '#303060';
        ctx.beginPath();
        ctx.arc(c * SQ, r * SQ, r_px, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _highlights() {
    const { gs } = this;
    this._drawMoveTrail();
    if (gs.phase === PHASE.MOVE && gs.movesRemaining > 0 && gs.phaseFireIdx < 0) this._drawGhosts();
    if (gs.phaseFireIdx >= 0) this._fireTarget();
    this._activeOutline();
  }

  // Ghost car preview — draw transparent outlines at reachable destinations
  _drawGhosts() {
    const ctx = this.ctx;
    const gs  = this.gs;
    const car = gs.activeCar;
    const enemy = gs.enemyCar;
    const rDC = car.reverse ? 1 : 0;

    const dcColor = {
      0: 'rgba(0,200,255,',
      1: 'rgba(0,230,120,',
      2: 'rgba(100,230,80,',
      3: 'rgba(0,140,255,',
      4: 'rgba(255,160,0,',
      5: 'rgba(255,100,0,',
      6: 'rgba(255,60,0,',
      7: 'rgba(255,50,200,',
    };

    const tryDest = (dest, dc) => {
      if (!inBounds(dest.x, dest.y, dest.facing)) return;
      if (obbOverlap({ x:dest.x, y:dest.y, facing:dest.facing }, enemy)) return;
      const base = dcColor[dc] || dcColor[0];
      const [fdx2, fdy2] = facingToVec(dest.facing);
      const [rx2, ry2]   = rightVec(dest.facing);
      const cx = (dest.x + rx2 - 2*fdx2) * SQ;
      const cy = (dest.y + ry2 - 2*fdy2) * SQ;
      const angle = (dest.facing - 90) * Math.PI / 180;
      const hl = 2*SQ, hw = SQ;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = base + '0.9)';
      ctx.lineWidth   = Math.max(1, SQ * 0.07);
      ctx.setLineDash([SQ*0.18, SQ*0.12]);
      ctx.strokeRect(-hl, -hw, hl*2, hw*2);
      ctx.globalAlpha = 0.10;
      ctx.fillStyle   = base + '1)';
      ctx.fillRect(-hl, -hw, hl*2, hw*2);
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.fillStyle   = base + '0.8)';
      ctx.font        = 'bold ' + Math.max(7, Math.round(SQ*0.38)) + 'px monospace';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('D' + dc, 0, 0);
      ctx.restore();
    };

    const sq = gs.halfMovePhase ? 2 : 4;
    tryDest(destForStraight(car, sq), 0);
    if (gs.halfMovePhase && car.speed === 5 && !car.maneuverUsedThisPhase) {
      for (const a of [15,30,45,60,75,90]) {
        tryDest(destForPivot(car, -a), 0);
        tryDest(destForPivot(car,  a), 0);
      }
    }
    if (!gs.halfMovePhase && !car.maneuverUsedThisPhase) {
      for (const a of [15,30,45,60,75,90]) {
        tryDest(destForBend(car, -a), bendDC(a) + rDC);
        tryDest(destForBend(car,  a), bendDC(a) + rDC);
      }
      tryDest(destForDrift(car, -1), 1 + rDC);
      tryDest(destForDrift(car,  1), 1 + rDC);
      tryDest(destForSteepDrift(car, -1), 3 + rDC);
      tryDest(destForSteepDrift(car,  1), 3 + rDC);
      for (const a of [15,30,45,60,75,90]) {
        tryDest(destForSwerve(car, +1, -a), bendDC(a) + 1 + rDC);  // Swerve L: bend left, drift right
        tryDest(destForSwerve(car, -1, +a), bendDC(a) + 1 + rDC);  // Swerve R: bend right, drift left
      }
      if (gs.canBootlegger()) tryDest(destForBootlegger(car), 7);
    }
  }

  // Ghost trail — draw transparent outlines at each car's position before its last move
  _drawMoveTrail() {
    const ctx   = this.ctx;
    const gs    = this.gs;
    if (!gs.moveTrail || gs.moveTrail.length === 0) return;

    const hl = 2 * SQ, hw = SQ;

    for (let i = 0; i < gs.moveTrail.length; i++) {
      const t   = gs.moveTrail[i];
      const car = gs.cars[t.carIdx];
      if (!car) continue;

      const [fdx, fdy] = facingToVec(t.facing);
      const [rx,  ry]  = rightVec(t.facing);
      const cx  = (t.x + rx - 2 * fdx) * SQ;
      const cy  = (t.y + ry - 2 * fdy) * SQ;
      const angle = (t.facing - 90) * Math.PI / 180;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // Faint tinted fill
      ctx.globalAlpha = 0.08;
      ctx.fillStyle   = car.color;
      ctx.fillRect(-hl, -hw, hl * 2, hw * 2);

      // Dashed outline — longer dashes than the predictor to visually distinguish
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = car.color;
      ctx.lineWidth   = Math.max(1, SQ * 0.07);
      ctx.setLineDash([SQ * 0.3, SQ * 0.1]);
      ctx.strokeRect(-hl, -hw, hl * 2, hw * 2);

      // Maneuver label
      const lbl = !t.label ? '?' :
        t.label === 'Straight' ? 'S' :
        t.label.charCodeAt(0) === 0xbd ? '\xbdS' :
        t.label.replace(/^Bend (\d+)\xb0 ([LR])/, 'B$1$2')
               .replace(/^Drift ([LR])/, 'D$1')
               .replace(/^Steep ([LR])/, 'St$1')
               .replace(/^Swerve ([LR]).*/, 'Sw$1')
               .replace(/^Pivot \d+\xb0 ([LR])/, 'Pv$1')
               .slice(0, 5);
      ctx.globalAlpha  = 0.75;
      ctx.setLineDash([]);
      ctx.fillStyle    = car.color;
      ctx.font         = 'bold ' + Math.max(7, Math.round(SQ * 0.36)) + 'px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, 0, 0);

      ctx.restore();

      // Line from ghost center to current car center
      const cur   = gs.cars[t.carIdx];
      const [cfdx, cfdy] = facingToVec(cur.facing);
      const [crx,  cry]  = rightVec(cur.facing);
      const curCx = (cur.x + crx - 2 * cfdx) * SQ;
      const curCy = (cur.y + cry - 2 * cfdy) * SQ;

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = car.color;
      ctx.lineWidth   = Math.max(1, SQ * 0.05);
      ctx.setLineDash([SQ * 0.12, SQ * 0.08]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(curCx, curCy);
      ctx.stroke();
      ctx.restore();
    }
  }

  _fireTarget() {
    const ctx   = this.ctx;
    const gs    = this.gs;
    const atk   = gs.cars[gs.phaseFireIdx];
    const enemy = gs.cars[1 - gs.phaseFireIdx];
    let canFire = false;
    for (const w of atk.weapons) {
      if (!w.destroyed && w.ammo > 0 && !atk.firedThisTurn && checkFireArc(atk, enemy, w).canFire) {
        canFire = true; break;
      }
    }

    const ac = carCenter(atk), ec = carCenter(enemy);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = canFire ? 'rgba(255,180,0,0.7)' : 'rgba(180,40,40,0.5)';
    ctx.beginPath();
    ctx.moveTo(ac.x*SQ, ac.y*SQ);
    ctx.lineTo(ec.x*SQ, ec.y*SQ);
    ctx.stroke();
    ctx.restore();

    if (canFire) {
      const [efdx, efdy] = facingToVec(enemy.facing);
      const [erx, ery]   = rightVec(enemy.facing);
      const ecx = (enemy.x - 1.5*efdx + 0.5*erx + 0.5)*SQ;
      const ecy = (enemy.y - 1.5*efdy + 0.5*ery + 0.5)*SQ;
      const angle = (enemy.facing - 90) * Math.PI / 180;
      ctx.save();
      ctx.translate(ecx, ecy);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle   = 'rgba(255,180,0,1)';
      ctx.fillRect(-2*SQ, -SQ, 4*SQ, 2*SQ);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,180,0,0.75)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(-2*SQ, -SQ, 4*SQ, 2*SQ);
      ctx.restore();
    }
  }

  _activeOutline() {
    const car   = this.gs.activeCar;
    const ctx   = this.ctx;
    const [fdx, fdy] = facingToVec(car.facing);
    const [rx, ry]   = rightVec(car.facing);
    const cx  = (car.x + rx - 2*fdx)*SQ;
    const cy  = (car.y + ry - 2*fdy)*SQ;
    const ang = (car.facing - 90) * Math.PI / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(-2*SQ-2, -SQ-2, 4*SQ+4, 2*SQ+4);
    ctx.restore();
  }

  _cars() {
    for (const car of this.gs.cars) this._drawCar(car);
  }

  _drawCar(car) {
    const ctx = this.ctx;
    const [fdx, fdy] = facingToVec(car.facing);
    const [rx, ry]   = rightVec(car.facing);

    const midX  = (car.x + rx - 2*fdx) * SQ;
    const midY  = (car.y + ry - 2*fdy) * SQ;
    const angle = (car.facing - 90) * Math.PI / 180;
    const halfLen = 2 * SQ;
    const halfW   = SQ;

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
    for (const f of ['front','back','left','right','top','under']) {
      const el = document.getElementById('c'+n+'-'+f);
      if (!el) continue;
      const cur = Math.max(0, car.armor[f]);
      const max = car.maxArmor[f];
      el.textContent = cur + '/' + max;
      el.className   = 'armor-val' + (f === 'top' || f === 'under' ? ' small' : '') + (car.breached[f] ? ' breached' : '');
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
    const hcEl = document.getElementById('c'+n+'-hc');
    if (hcEl) {
      hcEl.textContent = car.handlingStatus + '/' + car.hc;
      hcEl.style.color = car.handlingStatus > 0 ? '#2ecc71' : car.handlingStatus === 0 ? '#f39c12' : '#e74c3c';
    }
    // Engine
    const engEl = document.getElementById('c'+n+'-engine-dp');
    if (engEl) {
      const eng = car.components.engine;
      if (eng.destroyed)           { engEl.textContent = 'DEAD';                engEl.style.color = '#e74c3c'; }
      else if (eng.dp < eng.maxDp) { engEl.textContent = eng.dp+'/'+eng.maxDp; engEl.style.color = '#f39c12'; }
      else                         { engEl.textContent = eng.dp+'/'+eng.maxDp; engEl.style.color = '#2ecc71'; }
    }
    // Tires — supports 4 or 6
    const tireKeys = [
      ['fl','frontLeft'],['fr','frontRight'],['rl','rearLeft'],['rr','rearRight'],
      ['rl2','rearLeft2'],['rr2','rearRight2'],
    ];
    for (const [k, prop] of tireKeys) {
      const el = document.getElementById('c'+n+'-tire-'+k);
      if (!el) continue;
      const t = car.components.tires[prop];
      if (!t) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.textContent   = t.dp + '/' + t.maxDp;
      el.style.color   = t.destroyed ? '#e74c3c' : t.dp < t.maxDp ? '#f39c12' : '#2ecc71';
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
    const phaseText = gs.phase === PHASE.SPEED ? 'Set speed'
      : gs.phaseFireIdx >= 0 ? 'FIRE Ph ' + gs.movePhase + '/5'
      : 'MOVE ' + gs.movePhase + '/5';
    setText('phase-label', phaseText);
    setText('moves-left',  gs.movesRemaining);
  }

  _controls() {
    const { gs } = this;
    showEl('speed-controls', gs.phase === PHASE.SPEED);
    showEl('btn-surrender', gs.phase === PHASE.SPEED && gs.activeCar.immobilized && gs.activeCar.weapons.some(w => !w.destroyed && w.ammo > 0));
    showEl('move-controls',  gs.phase === PHASE.MOVE);
    showEl('fire-controls',  false);
    const car = gs.activeCar;
    setText('speed-max-hint',   car.maxSpeed);
    setText('speed-rev-hint',   Math.floor(car.maxSpeed / 5));
    setText('speed-range-hint', _safeRangeStr(car));
    // Move-controls
    if (gs.phase === PHASE.MOVE) {
      const el = document.getElementById('move-phase-info');
      const inFireOffer = gs.phaseFireIdx >= 0;
      if (el) el.textContent = inFireOffer
        ? 'Phase ' + gs.movePhase + ' \u2014 ' + gs.cars[gs.phaseFireIdx].name + ' fire?'
        : 'Phase ' + gs.movePhase + ' of 5  \u2014  ' + gs.activeCar.name;
      const hasMoves = gs.movesRemaining > 0 && !inFireOffer;
      showEl('maneuver-menu', hasMoves);
      if (hasMoves) this._updateManeuverMenu();
      showEl('fire-offer-controls', inFireOffer);
      if (inFireOffer) this._updateFireOfferUI();
      // End Move only when genuinely blocked
      const endMoveBtn = document.getElementById('end-move');
      if (endMoveBtn) {
        const stuck = !inFireOffer && gs.movesRemaining > 0 && !gs.hasValidMoves();
        showEl('end-move', stuck);
        if (stuck) endMoveBtn.textContent = 'Blocked \u2014 Skip Move';
      }
    }
    // Tint primary action buttons to match active player
    const isP2 = gs.activeIdx === 1;
    ['set-speed', 'end-move', 'btn-fire-weapon-0', 'btn-pass-fire'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.toggle('p2', isP2);
    });
  }

  _updateManeuverMenu() {
    const gs  = this.gs;
    const car = gs.activeCar;
    const angle = gs.bendAngle;
    const dc    = bendDC(angle);
    // Update bend stepper labels
    setText('bend-angle-label', angle + '\xb0');
    const isPivot   = gs.halfMovePhase && car.speed === 5;
    const skidEntry = gs.skidDist > 0 ? SKID_TABLE[gs.skidDist] : null;
    const skidAdd   = skidEntry ? skidEntry.dcAdd : 0;
    const baseDC    = car.reverse ? dc + 1 : dc;
    setText('bend-dc-label', isPivot ? 'D0 pivot' :
      skidAdd ? 'D' + (baseDC + skidAdd) + ' (+' + skidAdd + ')' : 'D' + baseDC);
    const sd = gs.skidDist;
    setText('skid-dist-label', sd === 0 ? 'None' : SKID_TABLE[sd].label);
    setText('skid-dc-label',   sd === 0 ? ''     : '+D' + SKID_TABLE[sd].dcAdd);
    // Helper: is a destination reachable?
    function ok(dest) {
      if (!dest) return false;
      const other = gs.cars.find(c => c !== car);
      return inBounds(dest.x, dest.y, dest.facing) && !obbOverlap(
        { x: dest.x, y: dest.y, facing: dest.facing },
        other
      );
    }
    const setBtn = (id, dest) => {
      const b = document.getElementById(id);
      if (b) b.disabled = !ok(dest);
    };
    const mvrAvail  = !car.maneuverUsedThisPhase && !gs.halfMovePhase;
    const pivotAvail = !car.maneuverUsedThisPhase && gs.halfMovePhase && car.speed === 5;
    setBtn('btn-straight', destForStraight(car, gs.halfMovePhase ? 2 : 4));
    setBtn('btn-bend-l',   mvrAvail  ? destForBend(car, -angle)  :
                           pivotAvail ? destForPivot(car, -angle) : null);
    setBtn('btn-bend-r',   mvrAvail  ? destForBend(car,  angle)  :
                           pivotAvail ? destForPivot(car,  angle) : null);
    setBtn('btn-drift-l',  mvrAvail ? destForDrift(car, -1) : null);
    setBtn('btn-drift-r',  mvrAvail ? destForDrift(car,  1) : null);
    setBtn('btn-steep-l',  mvrAvail ? destForSteepDrift(car, -1) : null);
    setBtn('btn-steep-r',  mvrAvail ? destForSteepDrift(car,  1) : null);
    setBtn('btn-swerve-l', mvrAvail ? destForSwerve(car, +1, -angle) : null);
    setBtn('btn-swerve-r', mvrAvail ? destForSwerve(car, -1, +angle) : null);
    const bb = document.getElementById('btn-boot');
    if (bb) bb.disabled = !gs.canBootlegger();
  }

  _updateFireOfferUI() {
    const gs  = this.gs;
    const car = gs.cars[gs.phaseFireIdx];
    const enemy = gs.cars[1 - gs.phaseFireIdx];
    car.weapons.forEach((w, i) => {
      const btn = document.getElementById('btn-fire-weapon-' + i);
      if (!btn) return;
      if (w.destroyed || w.ammo <= 0) {
        btn.disabled = true;
        btn.textContent = w.name + ' (unavailable)';
        return;
      }
      const arcCheck = checkFireArc(car, enemy, w);
      btn.disabled = !arcCheck.canFire;
      btn.title    = arcCheck.canFire ? '' : arcCheck.reason;
      btn.textContent = 'Fire ' + w.name + ' (' + w.ammo + ' ammo)';
    });
  }

  _weaponInfo() {
    if (this.gs.phaseFireIdx < 0) return;
    const gs  = this.gs;
    const car = gs.cars[gs.phaseFireIdx];
    const lines = car.weapons.map(w => {
      return w.name + ': ' + (w.ammo > 0 ? w.ammo + ' ammo' : 'EMPTY');
    });
    setText('weapon-info', lines.join(' | '));
  }

  log(messages, playerIdx) {
    if (!messages || (Array.isArray(messages) && messages.length === 0)) return;
    if (typeof messages === 'string') messages = [messages];
    const pi = playerIdx !== undefined && playerIdx !== null ? playerIdx : this.gs.activeIdx;
    const defaultCls = playerIdx === null ? 'sys' : 'p' + (pi + 1);
    messages.forEach(m => {
      const s   = String(m);
      const hdr = s.startsWith('▶');
      const sys = !hdr && s.startsWith('---');
      const cls = hdr ? 'hdr' : sys ? 'sys' : defaultCls;
      this.logLines.push({ h: esc(hdr ? s.slice(1) : sys ? s.slice(3).trimLeft() : s), c: cls });
    });
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
    if (mg) mg.textContent   = winner ? winner.name + ' WINS!' : 'DRAW \u2014 Both Destroyed!';
  }
}

function setText(id, val) { const e=document.getElementById(id); if(e) e.textContent=val; }
function showEl(id, v)    { const e=document.getElementById(id); if(e) e.style.display=v?'block':'none'; }
function esc(s)           { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ═══════════════════════════════════════════════════════════════
// MAIN — wire everything together
// ═══════════════════════════════════════════════════════════════

const game = (function() {
  const canvas = document.getElementById('game-canvas');
  let gs, grid, ui;
  let selectedSpeed = 0;
  let zoomLevel = 1.0;
  const ZOOM_STEP = 0.25, ZOOM_MIN = 0.5, ZOOM_MAX = 3.0;

  function init(p1cfg, p2cfg) {
    gs   = new GameState([p1cfg, p2cfg]);
    grid = new Grid(canvas, gs);
    ui   = new UI(gs);
    selectedSpeed = 0;
    // Update sidebar panel names to match built cars
    const h1 = document.querySelector('#panel-1 .car-header');
    if (h1) h1.firstChild.textContent = p1cfg.name + ' ';
    const h2 = document.querySelector('#panel-2 .car-header');
    if (h2) h2.firstChild.textContent = p2cfg.name + ' ';
    ui.log('Car Wars \u2014 ' + p1cfg.name + ' (P1) vs ' + p2cfg.name + ' (P2)', null);
    gs.reflexMsgs.forEach(m => ui.log(m, null));
    ui.log('\u25b6Turn 1');
    ui.log('Set speed and press GO!', null);
    render();
  }

  // ── one-time event wiring ───────────────────────────────────

  function setZoom(z) {
    zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    SQ = Math.round(BASE_SQ * zoomLevel);
    grid.resize();
    render();
    document.getElementById('zoom-level').textContent = Math.round(zoomLevel * 100) + '%';
  }

  function render() {
    if (!gs) return;
    grid.render();
    ui.update();
  }

  function syncSpeed() {
    if (!gs) return;
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
    if (!gs || gs.gameOver) return;
    if (gs.phase === PHASE.MOVE && gs.phaseFireIdx < 0) return;  // sidebar buttons handle movement

    if (gs.phaseFireIdx >= 0) {
      const { col, row } = grid.screenToGrid(e.clientX, e.clientY);
      const target = gs.cars[1 - gs.phaseFireIdx];
      if (!pointInCar(col, row, target)) return;
      const attacker = gs.cars[gs.phaseFireIdx];
      let fired = false;
      for (let i = 0; i < attacker.weapons.length; i++) {
        const w = attacker.weapons[i];
        if (!w.destroyed && w.ammo > 0) {
          const snapIdx = gs.phaseFireIdx;
          const res = gs.fireWeaponInPhase(i);
          ui.log(res.messages, snapIdx);
          fired = true;
          break;
        }
      }
      if (!fired) ui.log('No weapons available.');
      afterPhaseFire([]);
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
    const snapIdx = gs.activeIdx;
    ui.log(gs.setSpeed(selectedSpeed), snapIdx);
    advanceSpinoutSpeeds();
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
    const snapIdx = gs.activeIdx;
    ui.log(gs.endMove(), snapIdx);
    render();
  });

  // Skid distance stepper buttons
  document.getElementById('skid-dec').addEventListener('click', function() {
    if (gs.skidDist > 0) { gs.skidDist--; render(); }
  });
  document.getElementById('skid-inc').addEventListener('click', function() {
    if (gs.skidDist < 4) { gs.skidDist++; render(); }
  });

  // Bend angle stepper buttons
  const BEND_ANGLES = [15,30,45,60,75,90];
  document.getElementById('bend-dec').addEventListener('click', function() {
    const idx = BEND_ANGLES.indexOf(gs.bendAngle);
    if (idx > 0) { gs.bendAngle = BEND_ANGLES[idx-1]; render(); }
  });
  document.getElementById('bend-inc').addEventListener('click', function() {
    const idx = BEND_ANGLES.indexOf(gs.bendAngle);
    if (idx < BEND_ANGLES.length-1) { gs.bendAngle = BEND_ANGLES[idx+1]; render(); }
  });

  // Maneuver action buttons
  // snapIdx is evaluated BEFORE executeManeuver (left-to-right arg evaluation),
  // so it captures the acting player even if _advanceMover changes activeIdx.
  function doMove(snapIdx, msgs) {
    if (msgs && msgs.length) {
      ui.log(msgs, snapIdx);
      if (gs.gameOver) ui.showGameOver(gs.winner);
      render();
    }
  }
  document.getElementById('btn-straight').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('straight'));
  });
  document.getElementById('btn-bend-l').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('bend', -gs.bendAngle));
  });
  document.getElementById('btn-bend-r').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('bend', gs.bendAngle));
  });
  document.getElementById('btn-swerve-l').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('swerve', -1));
  });
  document.getElementById('btn-swerve-r').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('swerve', +1));
  });
  document.getElementById('btn-drift-l').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('drift', -1));
  });
  document.getElementById('btn-drift-r').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('drift', 1));
  });
  document.getElementById('btn-steep-l').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('steep', -1));
  });
  document.getElementById('btn-steep-r').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('steep', 1));
  });
  document.getElementById('btn-boot').addEventListener('click', function() {
    if (this.disabled) return;
    doMove(gs.activeIdx, gs.executeManeuver('bootlegger'));
  });

  // ── Fire / End Turn ─────────────────────────────────────────
  function advanceSpinoutSpeeds() {
    while (gs.phase === PHASE.SPEED && gs.activeCar.spinout) {
      const idx = gs.activeIdx;
      const car = gs.activeCar;
      const m   = gs.setSpeed(car.reverse ? -car.speed : car.speed);
      if (m && m.length) ui.log(m, idx);
    }
  }

  function afterPhaseFire(msgs, snapIdx) {
    if (msgs && msgs.length) ui.log(msgs, snapIdx);
    if (gs.phase === PHASE.SPEED) {
      ui.log('\u25b6Turn ' + gs.turn);
      advanceSpinoutSpeeds();
      if (gs.phase === PHASE.SPEED) {
        const c = gs.activeCar;
        selectedSpeed = c.reverse ? -c.speed : c.speed;
        syncSpeed();
      }
    }
    if (gs.gameOver) ui.showGameOver(gs.winner);
    render();
  }

  document.getElementById('btn-fire-weapon-0').addEventListener('click', function() {
    if (gs.phaseFireIdx < 0) return;
    const snapIdx = gs.phaseFireIdx;
    const res = gs.fireWeaponInPhase(0);
    ui.log(res.messages, snapIdx);
    afterPhaseFire([]);
  });

  document.getElementById('btn-pass-fire').addEventListener('click', function() {
    if (gs.phaseFireIdx < 0) return;
    const snapIdx = gs.phaseFireIdx;
    const msgs = gs.passPhaseFireOffer();
    afterPhaseFire(msgs, snapIdx);
  });

  // ── Clear move trail ────────────────────────────────────────
  document.getElementById('clear-trail-btn').addEventListener('click', function() {
    if (gs) { gs.moveTrail = []; render(); }
  });

  // ── Fullscreen ──────────────────────────────────────────────
  document.getElementById('fullscreen-btn').addEventListener('click', function() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(function() {});
    }
  });

  document.getElementById('btn-surrender').addEventListener('click', function() {
    if (!gs || !gs.activeCar.immobilized) return;
    const car    = gs.activeCar;
    const winner = gs.cars[1 - gs.activeIdx];
    gs.gameOver  = true;
    gs.winner    = winner;
    const msgs   = [car.name + ' surrenders!', '★ ' + winner.name + ' WINS!'];
    ui.log(msgs);
    ui.showGameOver(gs.winner);
    render();
  });

  document.getElementById('zoom-in-btn').addEventListener('click', function()  { setZoom(zoomLevel + ZOOM_STEP); });
  document.getElementById('zoom-out-btn').addEventListener('click', function() { setZoom(zoomLevel - ZOOM_STEP); });

  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    setZoom(zoomLevel + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }, { passive: false });

  // ── New game ────────────────────────────────────────────────
  document.getElementById('restart-btn').addEventListener('click', function() {
    CarBuilder.open(1);
  });

  // ── Keyboard shortcuts ───────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (!gs || gs.gameOver) return;

    if (e.key === 'f' || e.key === 'F') {
      document.getElementById('fullscreen-btn').click();
      return;
    }
    if (e.key === 'z' || e.key === 'Z') { setZoom(zoomLevel + ZOOM_STEP); return; }
    if (e.key === 'x' || e.key === 'X') { setZoom(zoomLevel - ZOOM_STEP); return; }

    if (gs.phase === PHASE.MOVE) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        doMove(gs.activeIdx, gs.executeManeuver('straight'));
      } else if (e.key === '[') {
        e.preventDefault();
        const idx = BEND_ANGLES.indexOf(gs.bendAngle);
        if (idx > 0) { gs.bendAngle = BEND_ANGLES[idx-1]; render(); }
      } else if (e.key === ']') {
        e.preventDefault();
        const idx = BEND_ANGLES.indexOf(gs.bendAngle);
        if (idx < BEND_ANGLES.length-1) { gs.bendAngle = BEND_ANGLES[idx+1]; render(); }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) doMove(gs.activeIdx, gs.executeManeuver('drift', -1));
        else            doMove(gs.activeIdx, gs.executeManeuver('bend', -gs.bendAngle));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) doMove(gs.activeIdx, gs.executeManeuver('drift',  1));
        else            doMove(gs.activeIdx, gs.executeManeuver('bend',  gs.bendAngle));
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
        const snapIdx = gs.activeIdx;
        ui.log(gs.setSpeed(selectedSpeed), snapIdx);
        advanceSpinoutSpeeds();
        if (gs.phase === PHASE.SPEED) {
          const c = gs.activeCar;
          selectedSpeed = c.reverse ? -c.speed : c.speed;
          syncSpeed();
        }
        render();
      }
    }

    if (gs.phaseFireIdx >= 0 && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      document.getElementById('btn-pass-fire').click();
    }
  });

  // ── Car builder wiring ──────────────────────────────────────
  document.getElementById('car-builder').addEventListener('change', function() {
    CarBuilder.recalc();
  });
  document.getElementById('car-builder').addEventListener('input', function(e) {
    if (e.target.type === 'number' || e.target.tagName === 'INPUT') CarBuilder.recalc();
  });
  document.getElementById('cb-confirm').addEventListener('click', function() {
    CarBuilder.confirm();
  });

  // ── Boot: open car builder for P1 ──────────────────────────
  CarBuilder.open(1);

  return { init };
})();
