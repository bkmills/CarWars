// main.js — entry point: wires events, drives the turn loop

import { GameState, PHASE } from './GameState.js';
import { Grid } from './Grid.js';
import { UI } from './UI.js';

// ─── Init ─────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas');
const gs     = new GameState();
const grid   = new Grid(canvas, gs);
const ui     = new UI(gs);

// Speed currently shown in the speed-selector (before committing)
let selectedSpeed = 0;

// ─── Render / update ─────────────────────────────────────────────────────────

function render() {
  grid.render();
  ui.update();
}

function syncSpeedDisplay() {
  const el = document.getElementById('speed-select-val');
  if (el) el.textContent = selectedSpeed;
}

// ─── Canvas clicks ────────────────────────────────────────────────────────────

canvas.addEventListener('click', e => {
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

    // Find first weapon that still has shots this turn
    const car = gs.activeCar;
    let fired = false;
    for (let i = 0; i < car.weapons.length; i++) {
      const w = car.weapons[i];
      if (w.ammo > 0 && w.shotsThisTurn < w.rof) {
        const result = gs.fireWeapon(i);
        ui.log(result.messages);
        fired = true;
        break;
      }
    }

    if (!fired) ui.log('No weapons available to fire.');

    if (gs.gameOver) {
      ui.showGameOver(gs.winner);
    }

    render();
  }
});

// ─── Speed controls ───────────────────────────────────────────────────────────

document.getElementById('speed-down')?.addEventListener('click', () => {
  selectedSpeed = Math.max(0, selectedSpeed - 1);
  syncSpeedDisplay();
});

document.getElementById('speed-up')?.addEventListener('click', () => {
  selectedSpeed = Math.min(gs.activeCar.maxSpeed, selectedSpeed + 1);
  syncSpeedDisplay();
});

document.getElementById('set-speed')?.addEventListener('click', () => {
  const msgs = gs.setSpeed(selectedSpeed);
  ui.log(msgs);
  render();
});

// ─── Move controls ────────────────────────────────────────────────────────────

document.getElementById('end-move')?.addEventListener('click', () => {
  gs.endMove();
  ui.log(`${gs.activeCar.name} ends movement`);
  render();
});

// ─── Fire controls ────────────────────────────────────────────────────────────

document.getElementById('end-turn')?.addEventListener('click', () => {
  _doEndTurn();
});

function _doEndTurn() {
  gs.endTurn();
  selectedSpeed = gs.activeCar.speed;   // prefill with last-used speed
  syncSpeedDisplay();
  ui.log(`--- ${gs.activeCar.name}'s turn (Turn ${gs.turn}) ---`);
  render();
}

// ─── Fullscreen ───────────────────────────────────────────────────────────────

document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});

// ─── New game ─────────────────────────────────────────────────────────────────

document.getElementById('restart-btn')?.addEventListener('click', () => {
  location.reload();
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (gs.gameOver) return;

  // F — fullscreen
  if (e.key === 'f' || e.key === 'F') {
    document.getElementById('fullscreen-btn')?.click();
    return;
  }

  // Arrow keys / WASD — one-step movement in MOVE phase
  if (gs.phase === PHASE.MOVE) {
    const dirMap = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    };
    const dir = dirMap[e.key];
    if (dir) {
      e.preventDefault();
      const car = gs.activeCar;
      const nx = car.x + dir[0];
      const ny = car.y + dir[1];
      if (gs.canMoveTo(nx, ny)) {
        ui.log(gs.moveActiveCar(nx, ny));
        render();
      }
    }

    // Enter / Space — end move
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      gs.endMove();
      ui.log(`${gs.activeCar.name} ends movement`);
      render();
    }
  }

  // Speed phase: +/- to adjust speed, Enter to commit
  if (gs.phase === PHASE.SPEED) {
    if (e.key === '+' || e.key === '=') {
      selectedSpeed = Math.min(gs.activeCar.maxSpeed, selectedSpeed + 1);
      syncSpeedDisplay();
    }
    if (e.key === '-') {
      selectedSpeed = Math.max(0, selectedSpeed - 1);
      syncSpeedDisplay();
    }
    if (e.key === 'Enter') {
      const msgs = gs.setSpeed(selectedSpeed);
      ui.log(msgs);
      render();
    }
  }

  // Fire phase: Enter / Space — end turn
  if (gs.phase === PHASE.FIRE) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      _doEndTurn();
    }
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

ui.log('── CAR WARS v0.1 ──');
ui.log('Player 1: Killer Kart  (red)');
ui.log('Player 2: Road Warrior (blue)');
ui.log('Set speed and press GO to start!');
render();
