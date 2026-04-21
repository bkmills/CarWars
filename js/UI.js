// UI.js — sidebar stat panels, action log, phase controls

import { PHASE } from './GameState.js';

const MAX_LOG = 10;

export class UI {
  constructor(gameState) {
    this.gs      = gameState;
    this.logLines = [];
  }

  // ─── Full refresh (call after every state change) ─────────────────────────

  update() {
    const { gs } = this;
    this._updateCarPanel(gs.cars[0]);
    this._updateCarPanel(gs.cars[1]);
    this._updateTurnInfo();
    this._updatePhaseControls();
    this._updateWeaponInfo();
  }

  // ─── Car panels ───────────────────────────────────────────────────────────

  _updateCarPanel(car) {
    const n = car.id;   // 1 or 2

    // Armor facings
    for (const f of ['front', 'back', 'left', 'right']) {
      const el = document.getElementById(`c${n}-${f}`);
      if (!el) continue;
      const val = Math.max(0, car.armor[f]);
      el.textContent = val;
      el.className   = 'armor-val' + (car.breached[f] ? ' breached' : '');
    }

    // Driver status
    const driverEl = document.getElementById(`c${n}-driver`);
    if (driverEl) {
      if (!car.alive || car.driverHits >= 2) {
        driverEl.textContent = 'DEAD';
        driverEl.style.color = '#e74c3c';
      } else if (car.driverHits === 1) {
        driverEl.textContent = 'WOUNDED';
        driverEl.style.color = '#f39c12';
      } else {
        driverEl.textContent = 'OK';
        driverEl.style.color = '#2ecc71';
      }
    }

    // Speed
    set(`c${n}-speed-cur`, car.speed);
    set(`c${n}-speed-max`, car.maxSpeed);

    // HC
    set(`c${n}-hc`, car.hc);

    // Weapons
    car.weapons.forEach((w, i) => {
      const ammoEl = document.getElementById(`c${n}-w${i}-ammo`);
      if (ammoEl) ammoEl.textContent = w.ammo <= 0 ? 'EMPTY' : w.ammo;
    });

    // Dim panel if destroyed
    const panel = document.getElementById(`panel-${n}`);
    if (panel) panel.classList.toggle('destroyed', car.isDestroyed());
  }

  // ─── Turn / phase header ──────────────────────────────────────────────────

  _updateTurnInfo() {
    const { gs } = this;
    set('turn-num',      gs.turn);
    set('active-name',   gs.activeCar.name);
    set('phase-label',   gs.phase);
    set('moves-left',    gs.movesRemaining);
  }

  // ─── Show/hide phase control blocks ───────────────────────────────────────

  _updatePhaseControls() {
    const { gs } = this;
    show('speed-controls', gs.phase === PHASE.SPEED);
    show('move-controls',  gs.phase === PHASE.MOVE);
    show('fire-controls',  gs.phase === PHASE.FIRE);
    // Keep the max-speed hint in sync with the active car
    set('speed-max-hint', gs.activeCar.maxSpeed);
  }

  // ─── Weapon info during fire phase ───────────────────────────────────────

  _updateWeaponInfo() {
    const { gs } = this;
    if (gs.phase !== PHASE.FIRE) return;

    const car  = gs.activeCar;
    const lines = car.weapons.map((w, i) => {
      const shots = w.rof - w.shotsThisTurn;
      const avail = w.ammo > 0 && shots > 0;
      return `${w.name}: ${avail ? shots + ' shot(s) left' : 'no shots'}`;
    });

    set('weapon-info', lines.join(' | '));
  }

  // ─── Action log ───────────────────────────────────────────────────────────

  log(messages) {
    if (typeof messages === 'string') messages = [messages];
    for (const msg of messages) {
      this.logLines.unshift(escHtml(msg));
    }
    this.logLines = this.logLines.slice(0, MAX_LOG);

    const el = document.getElementById('action-log');
    if (el) {
      el.innerHTML = this.logLines
        .map(l => `<div class="log-line">${l}</div>`)
        .join('');
    }
  }

  // ─── Game-over overlay ────────────────────────────────────────────────────

  showGameOver(winner) {
    const overlay = document.getElementById('game-over');
    const msg     = document.getElementById('game-over-msg');
    if (overlay) overlay.style.display = 'flex';
    if (msg)     msg.textContent = `${winner.name} WINS!`;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function set(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function show(id, visible) {
  const el = document.getElementById(id);
  if (el) el.style.display = visible ? 'block' : 'none';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
