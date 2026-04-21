// Car.js — Car class, pre-built car definitions, facing constants

export const FACING_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// dx,dy unit vectors for each of the 8 facings (canvas coords: y increases downward)
export const FACING_VEC = [
  [ 0, -1],  // 0: N
  [ 1, -1],  // 1: NE
  [ 1,  0],  // 2: E
  [ 1,  1],  // 3: SE
  [ 0,  1],  // 4: S
  [-1,  1],  // 5: SW
  [-1,  0],  // 6: W
  [-1, -1],  // 7: NW
];

export class Car {
  constructor(cfg) {
    this.id       = cfg.id;
    this.name     = cfg.name;
    this.color    = cfg.color;
    this.x        = cfg.x;       // grid column
    this.y        = cfg.y;       // grid row
    this.facing   = cfg.facing;  // 0-7
    this.maxSpeed = cfg.maxSpeed;
    this.speed    = 0;           // speed set at start of each turn
    this.hc       = cfg.hc;      // Handling Class

    // Armor by facing
    this.armor    = { ...cfg.armor };     // { front, back, left, right }
    this.maxArmor = { ...cfg.armor };
    this.breached = { front: false, back: false, left: false, right: false };

    // Driver
    this.driverHits = 0;   // 2 = dead
    this.alive      = true;

    // Weapons — copies so originals are untouched on reset
    this.weapons = cfg.weapons.map(w => ({ ...w, shotsThisTurn: 0 }));
  }

  isDestroyed() {
    if (!this.alive || this.driverHits >= 2) return true;
    const a = this.armor;
    return a.front <= 0 && a.back <= 0 && a.left <= 0 && a.right <= 0;
  }
}

// ─── Pre-built car definitions ───────────────────────────────────────────────

export const CAR_DEFS = [
  {
    id: 1,
    name: 'Killer Kart',
    color: '#e74c3c',
    x: 4, y: 15,
    facing: 2,        // E — starts facing right
    maxSpeed: 15,
    hc: 3,
    armor: { front: 4, back: 3, left: 3, right: 3 },
    weapons: [
      {
        name: 'Machine Gun',
        type: 'mg',
        range: 8,           // squares (≈2")
        damageDice: 1,
        damageSides: 6,
        rof: 2,             // shots per turn
        ammo: 20,
      },
    ],
  },
  {
    id: 2,
    name: 'Road Warrior',
    color: '#3498db',
    x: 40, y: 15,
    facing: 6,        // W — starts facing left
    maxSpeed: 12,
    hc: 4,
    armor: { front: 5, back: 4, left: 4, right: 3 },
    weapons: [
      {
        name: 'Rocket',
        type: 'rocket',
        range: 24,          // squares (≈6")
        damageDice: 3,
        damageSides: 6,
        rof: 1,
        ammo: 1,
      },
    ],
  },
];
