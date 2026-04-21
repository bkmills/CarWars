// GameState.js — turn/phase management, movement, firing logic

import { Car, CAR_DEFS, FACING_VEC, FACING_NAMES } from './Car.js';
import {
  rollDice,
  checkFireArc,
  calcToHit,
  getHitFacing,
  applyDamage,
} from './Combat.js';

export const PHASE = { SPEED: 'SPEED', MOVE: 'MOVE', FIRE: 'FIRE' };

export const GRID_COLS = 44;
export const GRID_ROWS = 32;

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.cars            = CAR_DEFS.map(def => new Car(def));
    this.activeIdx       = 0;    // 0 or 1
    this.phase           = PHASE.SPEED;
    this.turn            = 1;
    this.movesRemaining  = 0;
    this.gameOver        = false;
    this.winner          = null;
  }

  get activeCar()  { return this.cars[this.activeIdx]; }
  get enemyCar()   { return this.cars[1 - this.activeIdx]; }

  // ─── Speed phase ───────────────────────────────────────────────────────────

  setSpeed(speed) {
    const car = this.activeCar;
    car.speed = Math.max(0, Math.min(car.maxSpeed, speed));

    if (car.speed === 0) {
      // No movement — jump straight to fire
      this.movesRemaining = 0;
      this._enterFirePhase();
      return [`${car.name} is stationary this turn`];
    }

    this.movesRemaining = car.speed;
    this.phase = PHASE.MOVE;
    return [`${car.name} sets speed to ${car.speed}`];
  }

  // ─── Move phase ────────────────────────────────────────────────────────────

  /**
   * Returns true if (col, row) is a legal next step for the active car.
   */
  canMoveTo(col, row) {
    if (this.phase !== PHASE.MOVE || this.movesRemaining <= 0) return false;

    const car = this.activeCar;
    const dc = col - car.x;
    const dr = row - car.y;

    if (Math.abs(dc) > 1 || Math.abs(dr) > 1 || (dc === 0 && dr === 0)) return false;
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;

    // Can't drive onto enemy's square
    const e = this.enemyCar;
    if (col === e.x && row === e.y) return false;

    return true;
  }

  moveActiveCar(col, row) {
    const car = this.activeCar;
    const dc = col - car.x;
    const dr = row - car.y;

    // Derive new facing from movement direction
    for (let f = 0; f < 8; f++) {
      if (FACING_VEC[f][0] === dc && FACING_VEC[f][1] === dr) {
        car.facing = f;
        break;
      }
    }

    car.x = col;
    car.y = row;
    this.movesRemaining--;

    const msgs = [`${car.name} → (${col},${row}) facing ${FACING_NAMES[car.facing]}`];

    if (this.movesRemaining <= 0) {
      msgs.push(...this._enterFirePhase());
    }

    return msgs;
  }

  endMove() {
    return this._enterFirePhase();
  }

  _enterFirePhase() {
    this.phase = PHASE.FIRE;
    this.activeCar.weapons.forEach(w => { w.shotsThisTurn = 0; });
    return [];
  }

  // ─── Fire phase ────────────────────────────────────────────────────────────

  /**
   * Attempt to fire weaponIdx at the enemy car.
   * Returns { hit, messages }.
   */
  fireWeapon(weaponIdx) {
    const attacker = this.activeCar;
    const target   = this.enemyCar;
    const weapon   = attacker.weapons[weaponIdx];

    if (!weapon) return { hit: false, messages: ['No such weapon'] };
    if (weapon.ammo <= 0) return { hit: false, messages: [`${weapon.name} is out of ammo!`] };
    if (weapon.shotsThisTurn >= weapon.rof) return { hit: false, messages: [`${weapon.name} ROF limit reached`] };

    const arcCheck = checkFireArc(attacker, target, weapon);
    if (!arcCheck.canFire) return { hit: false, messages: [arcCheck.reason] };

    const dist    = arcCheck.dist;
    const toHit   = calcToHit(attacker, target, dist);
    const diceRes = rollDice(2, 6);
    const hit     = diceRes.total >= toHit;

    weapon.shotsThisTurn++;
    weapon.ammo--;

    const msgs = [
      `${attacker.name} fires ${weapon.name} at ${target.name}`,
      `Range ${dist.toFixed(1)} sq | Need ${toHit}+ | Roll ${diceRes.rolls.join('+')}=${diceRes.total} → ${hit ? 'HIT!' : 'miss'}`,
    ];

    if (hit) {
      const hitFacing = getHitFacing(target.facing, attacker.x, attacker.y, target.x, target.y);
      const dmgRes    = rollDice(weapon.damageDice, weapon.damageSides);
      msgs.push(`Hits ${target.name}'s ${hitFacing}! Dmg: ${dmgRes.rolls.join('+')}=${dmgRes.total}`);
      msgs.push(...applyDamage(target, dmgRes.total, hitFacing));

      if (target.isDestroyed()) {
        this.gameOver = true;
        this.winner   = attacker;
        msgs.push(`★ ${attacker.name} WINS! ★`);
      }
    }

    return { hit, messages: msgs };
  }

  /** How many shots can still be fired this phase */
  shotsAvailable() {
    const car = this.activeCar;
    return car.weapons.reduce((n, w) => {
      return n + (w.ammo > 0 && w.shotsThisTurn < w.rof ? 1 : 0);
    }, 0);
  }

  // ─── End turn ──────────────────────────────────────────────────────────────

  endTurn() {
    this.activeIdx = 1 - this.activeIdx;
    if (this.activeIdx === 0) this.turn++;
    this.phase = PHASE.SPEED;
    this.movesRemaining = 0;
  }
}
