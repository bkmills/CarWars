// Grid.js — canvas rendering: grid lines, car counters, move/fire highlights

import { FACING_VEC } from './Car.js';
import { PHASE, GRID_COLS, GRID_ROWS } from './GameState.js';
import { checkFireArc } from './Combat.js';

export const SQ = 20;   // pixels per grid square

export class Grid {
  constructor(canvas, gameState) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.gs     = gameState;

    canvas.width  = GRID_COLS * SQ;
    canvas.height = GRID_ROWS * SQ;
  }

  render() {
    this._drawBackground();
    this._drawGrid();
    this._drawHighlights();
    this._drawCars();
  }

  // ─── Background & grid ─────────────────────────────────────────────────────

  _drawBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _drawGrid() {
    const ctx = this.ctx;

    for (let c = 0; c <= GRID_COLS; c++) {
      const onInch = c % 4 === 0;
      ctx.strokeStyle = onInch ? '#252545' : '#181830';
      ctx.lineWidth   = onInch ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(c * SQ, 0);
      ctx.lineTo(c * SQ, GRID_ROWS * SQ);
      ctx.stroke();
    }

    for (let r = 0; r <= GRID_ROWS; r++) {
      const onInch = r % 4 === 0;
      ctx.strokeStyle = onInch ? '#252545' : '#181830';
      ctx.lineWidth   = onInch ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, r * SQ);
      ctx.lineTo(GRID_COLS * SQ, r * SQ);
      ctx.stroke();
    }
  }

  // ─── Highlights ────────────────────────────────────────────────────────────

  _drawHighlights() {
    const { gs } = this;

    if (gs.phase === PHASE.MOVE && gs.movesRemaining > 0) {
      this._highlightValidMoves();
    }

    if (gs.phase === PHASE.FIRE) {
      this._highlightFireTarget();
    }

    // Always outline active car's square
    this._outlineActiveCar();
  }

  _highlightValidMoves() {
    const ctx = this.ctx;
    const car = this.gs.activeCar;

    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const nx = car.x + dc;
        const ny = car.y + dr;
        if (this.gs.canMoveTo(nx, ny)) {
          ctx.fillStyle = 'rgba(0, 200, 255, 0.18)';
          ctx.fillRect(nx * SQ, ny * SQ, SQ, SQ);
          ctx.strokeStyle = 'rgba(0, 200, 255, 0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(nx * SQ + 0.5, ny * SQ + 0.5, SQ - 1, SQ - 1);
        }
      }
    }
  }

  _highlightFireTarget() {
    const ctx      = this.ctx;
    const attacker = this.gs.activeCar;
    const enemy    = this.gs.enemyCar;

    // Try each weapon, draw appropriate indicator
    let anyCanFire = false;
    for (const w of attacker.weapons) {
      if (w.ammo <= 0 || w.shotsThisTurn >= w.rof) continue;
      const check = checkFireArc(attacker, enemy, w);
      if (check.canFire) {
        anyCanFire = true;
        break;
      }
    }

    // Dashed line attacker → enemy
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = anyCanFire ? 'rgba(255, 180, 0, 0.7)' : 'rgba(180, 40, 40, 0.5)';
    ctx.beginPath();
    ctx.moveTo((attacker.x + 0.5) * SQ, (attacker.y + 0.5) * SQ);
    ctx.lineTo((enemy.x + 0.5) * SQ, (enemy.y + 0.5) * SQ);
    ctx.stroke();
    ctx.restore();

    // Enemy highlight
    if (anyCanFire) {
      ctx.fillStyle = 'rgba(255, 180, 0, 0.18)';
      ctx.fillRect(enemy.x * SQ, enemy.y * SQ, SQ, SQ);
      ctx.strokeStyle = 'rgba(255, 180, 0, 0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(enemy.x * SQ + 1, enemy.y * SQ + 1, SQ - 2, SQ - 2);
    }
  }

  _outlineActiveCar() {
    const ctx = this.ctx;
    const car = this.gs.activeCar;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(car.x * SQ + 1, car.y * SQ + 1, SQ - 2, SQ - 2);
  }

  // ─── Car counters ──────────────────────────────────────────────────────────

  _drawCars() {
    for (const car of this.gs.cars) {
      this._drawCar(car);
    }
  }

  _drawCar(car) {
    const ctx  = this.ctx;
    const px   = car.x * SQ;
    const py   = car.y * SQ;
    const pad  = 3;
    const size = SQ - pad * 2;

    // Body
    ctx.fillStyle = car.isDestroyed() ? '#444' : car.color;
    ctx.fillRect(px + pad, py + pad, size, size);

    // Destroyed X
    if (car.isDestroyed()) {
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + pad, py + pad);
      ctx.lineTo(px + pad + size, py + pad + size);
      ctx.moveTo(px + pad + size, py + pad);
      ctx.lineTo(px + pad, py + pad + size);
      ctx.stroke();
      return;
    }

    // Facing arrow
    const [fdx, fdy]  = FACING_VEC[car.facing];
    const cx          = px + SQ / 2;
    const cy          = py + SQ / 2;
    const arrowLen    = SQ / 2 - 5;
    const tipX        = cx + fdx * arrowLen;
    const tipY        = cy + fdy * arrowLen;
    const angle       = Math.atan2(fdy, fdx);
    const headLen     = 5;

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle   = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 1.5;

    // Shaft
    ctx.beginPath();
    ctx.moveTo(cx - fdx * 3, cy - fdy * 3);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 6), tipY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 6), tipY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    // Car number
    ctx.fillStyle   = 'rgba(0,0,0,0.75)';
    ctx.font        = `bold 8px monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(car.id.toString(), cx, cy);
  }

  // ─── Screen → grid coordinate conversion ──────────────────────────────────

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
