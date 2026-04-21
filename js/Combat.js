// Combat.js — dice rolling, fire-arc checks, to-hit, damage, criticals

import { FACING_VEC } from './Car.js';

// ─── Dice ─────────────────────────────────────────────────────────────────────

export function rollDice(num, sides) {
  const rolls = [];
  for (let i = 0; i < num; i++) rolls.push(Math.floor(Math.random() * sides) + 1);
  return { total: rolls.reduce((a, b) => a + b, 0), rolls };
}

// ─── Fire arc ─────────────────────────────────────────────────────────────────

/**
 * Check whether attacker's weapon can fire at target.
 * Front arc = within ±45° of facing direction (dot product > cos45 ≈ 0.707).
 * Returns { canFire: bool, dist: number, reason: string }.
 */
export function checkFireArc(attacker, target, weapon) {
  const dx   = target.x - attacker.x;
  const dy   = target.y - attacker.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0) return { canFire: false, reason: 'Same square' };

  const [fdx, fdy] = FACING_VEC[attacker.facing];
  const dot = (dx * fdx + dy * fdy) / dist;   // cosine of angle between shot and facing

  if (dot < 0.707) return { canFire: false, reason: 'Target not in front arc (±45°)' };
  if (dist > weapon.range) return { canFire: false, reason: `Out of range (${dist.toFixed(1)} sq, max ${weapon.range})` };

  return { canFire: true, dist };
}

// ─── To-hit ───────────────────────────────────────────────────────────────────

/**
 * Returns the target number the attacker must meet or beat on 2d6.
 *   Base: 7
 *   +1 per full 4-square range band beyond the first
 *   −1 if target is stationary
 */
export function calcToHit(attacker, target, dist) {
  let toHit = 7;
  const extraBands = Math.max(0, Math.floor((dist - 4) / 4));
  toHit += extraBands;
  if (target.speed === 0) toHit -= 1;
  return Math.max(2, Math.min(12, toHit));
}

// ─── Hit facing ───────────────────────────────────────────────────────────────

/**
 * Determine which armor facing of `target` is struck.
 * `fromX,fromY` = attacker position; `toX,toY` = target position.
 *
 * Works in canvas coordinates (y increases downward).
 * Cross-product sign is therefore flipped vs. standard math:
 *   cross > 0  →  left side of target
 *   cross < 0  →  right side of target
 */
export function getHitFacing(targetFacing, fromX, fromY, toX, toY) {
  // Vector from target toward attacker (i.e. the direction the shot arrived from)
  const dx  = fromX - toX;
  const dy  = fromY - toY;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return 'front';

  const [fdx, fdy] = FACING_VEC[targetFacing];

  // Cosine: positive = shot from front hemisphere, negative = from rear
  const cos   = (dx * fdx + dy * fdy) / mag;
  // Cross product z-component (canvas y-down → left/right flipped)
  const cross = dx * fdy - dy * fdx;

  if (cos  >  0.707) return 'front';
  if (cos  < -0.707) return 'back';
  return cross > 0 ? 'left' : 'right';
}

// ─── Damage & criticals ───────────────────────────────────────────────────────

/**
 * Apply `damage` points to `car`'s `hitFacing` armor.
 * Returns an array of log message strings.
 */
export function applyDamage(car, damage, hitFacing) {
  const msgs = [];

  if (car.breached[hitFacing]) {
    // Side already open — each subsequent hit is a direct critical
    msgs.push(`${car.name}'s ${hitFacing} is already BREACHED — direct critical!`);
    rollCritical(car, msgs);
  } else {
    car.armor[hitFacing] = Math.max(0, car.armor[hitFacing] - damage);
    if (car.armor[hitFacing] === 0) {
      car.breached[hitFacing] = true;
      msgs.push(`${car.name}'s ${hitFacing} armor BREACHED!`);
      rollCritical(car, msgs);
    }
  }

  return msgs;
}

function rollCritical(car, msgs) {
  const roll = Math.floor(Math.random() * 6) + 1;
  msgs.push(`Critical roll: ${roll}`);
  if (roll <= 2) {
    car.hc = Math.max(1, car.hc - 1);
    msgs.push(`Tire hit! ${car.name} HC → ${car.hc}`);
  } else if (roll <= 4) {
    car.maxSpeed = Math.max(1, Math.floor(car.maxSpeed * 0.75));
    if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
    msgs.push(`Engine hit! ${car.name} max speed → ${car.maxSpeed}`);
  } else {
    car.driverHits++;
    if (car.driverHits >= 2) {
      car.alive = false;
      msgs.push(`DRIVER KILLED — ${car.name} is OUT!`);
    } else {
      msgs.push(`Driver wounded! (${car.driverHits}/2 hits)`);
    }
  }
}
