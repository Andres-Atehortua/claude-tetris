'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#eceff1', // 8 - wildcard cell
  '#546e7a' // 9 - power-up cell base
];

const WILDCARD = 8; // wildcard cell left behind by the Dye power-up
const POWERUP_CELL = 9; // marker type for a power-up piece (never stored on board)
const POWERUP_EVERY = 5; // lines needed between power-up spawns
const POWERUPS = ['bomb', 'laser', 'dye', 'gravity', 'freeze'];
const POWERUP_ICONS = { bomb: '\u{1F4A3}', laser: '⚡', dye: '\u{1F3A8}', gravity: '⬇', freeze: '❄' };
const POWERUP_NAMES = { bomb: 'BOMBA', laser: 'RAYO', dye: 'TINTE', gravity: 'GRAVEDAD', freeze: 'CONGELAR' };
const CELL_SCORE = 10; // points per cell destroyed/converted by a power-up
const FREEZE_MS = 5000;
const MAX_WILD_HOLES = 2; // wildcards can only cover up to this many holes per row

const PIECES = [
  null,
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ], // I
  [
    [2, 2],
    [2, 2]
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0]
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0]
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0]
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0]
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0]
  ] // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const powerupEl = document.getElementById('powerup-status');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const showControlsBtn = document.getElementById('show-controls-btn');
const pauseControlsPanel = document.getElementById('pause-controls-panel');
const startLevelSelect = document.getElementById('start-level-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let powerupPending, powerupsSeen, freezeUntil, pauseStart;
let startLevel = Number(localStorage.getItem('tetris-start-level')) || 1; // level applied on the next init()

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map((row) => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerupPiece() {
  const powerup = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  return { type: POWERUP_CELL, powerup, shape: [[POWERUP_CELL]], x: Math.floor(COLS / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length,
    cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  if (current.powerup) return; // a 1x1 power-up cell has nothing to rotate
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    const holes = board[r].filter((v) => v === 0).length;
    const wilds = board[r].filter((v) => v === WILDCARD).length;
    const full = holes === 0 || (holes <= MAX_WILD_HOLES && wilds >= holes);
    if (full) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (Math.floor(lines / POWERUP_EVERY) > powerupsSeen) {
      powerupsSeen = Math.floor(lines / POWERUP_EVERY);
      powerupPending = true;
    }
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.powerup) {
    applyPowerup(current.powerup, current.x, current.y);
  } else {
    merge();
  }
  clearLines();
  spawn();
}

function applyPowerup(kind, x, y) {
  let affected = 0;
  switch (kind) {
    case 'bomb':
      for (let r = y - 1; r <= y + 1; r++) {
        for (let c = x - 1; c <= x + 1; c++) {
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
          if (board[r][c]) affected++;
          board[r][c] = 0;
        }
      }
      break;
    case 'laser':
      for (let c = 0; c < COLS; c++) {
        if (board[y][c]) affected++;
        board[y][c] = 0;
      }
      for (let r = 0; r < ROWS; r++) {
        if (board[r][x]) affected++;
        board[r][x] = 0;
      }
      break;
    case 'dye': {
      const counts = new Array(8).fill(0);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const v = board[r][c];
          if (v >= 1 && v <= 7) counts[v]++;
        }
      let bestColor = 0;
      for (let i = 1; i <= 7; i++) if (counts[i] > counts[bestColor]) bestColor = i;
      if (bestColor) {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === bestColor) {
              board[r][c] = WILDCARD;
              affected++;
            }
      }
      break;
    }
    case 'gravity':
      for (let c = 0; c < COLS; c++) {
        const values = [];
        for (let r = 0; r < ROWS; r++) if (board[r][c]) values.push(board[r][c]);
        const moved = ROWS - values.length;
        for (let r = 0; r < ROWS; r++) {
          const newValue = r < moved ? 0 : values[r - moved];
          if (newValue && board[r][c] !== newValue) affected++;
          board[r][c] = newValue;
        }
      }
      break;
    case 'freeze':
      freezeUntil = performance.now() + FREEZE_MS;
      score += 100 * level;
      updateHUD();
      return;
  }
  score += affected * CELL_SCORE * level;
  updateHUD();
}

function spawn() {
  current = next;
  next = powerupPending ? ((powerupPending = false), randomPowerupPiece()) : randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  const frozen = freezeUntil > performance.now();
  powerupEl.classList.toggle('frozen', frozen);
  if (frozen) {
    const remaining = ((freezeUntil - performance.now()) / 1000).toFixed(1);
    powerupEl.textContent = `${POWERUP_ICONS.freeze} ${remaining}s`;
  } else if (current && current.powerup) {
    powerupEl.textContent = `${POWERUP_ICONS[current.powerup]} ${POWERUP_NAMES[current.powerup]}`;
  } else if (next && next.powerup) {
    powerupEl.textContent = `${POWERUP_ICONS[next.powerup]} ${POWERUP_NAMES[next.powerup]} ▸`;
  } else {
    powerupEl.textContent = '—';
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha, icon) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (icon) {
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(icon, x * size + size / 2, y * size + size / 2 + 1);
  } else if (colorIndex === WILDCARD) {
    context.fillStyle = 'rgba(122, 162, 247, 0.8)';
    context.font = `${Math.floor(size * 0.55)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('✦', x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (gameOver) return;

  // ghost
  const icon = current.powerup ? POWERUP_ICONS[current.powerup] : null;
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2, icon);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK, 1, icon);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const icon = next.powerup ? POWERUP_ICONS[next.powerup] : null;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++) drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB, 1, icon);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    if (freezeUntil > 0) freezeUntil += performance.now() - pauseStart;
    lastTime = performance.now();
    pauseMenu.classList.add('hidden');
    loop(lastTime);
  } else {
    pauseStart = performance.now();
    cancelAnimationFrame(animId);
    pauseMenu.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeUntil > ts) {
    dropAccum = 0;
  } else {
    dropAccum += dt;
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  updateHUD();
  if (gameOver || paused) {
    draw();
    return;
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  powerupPending = false;
  powerupsSeen = 0;
  freezeUntil = 0;
  pauseStart = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    togglePause();
    return;
  }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

resumeBtn.addEventListener('click', () => {
  togglePause();
  resumeBtn.blur(); // avoid a lingering focus so a later Space/Enter doesn't re-trigger this button
});

pauseRestartBtn.addEventListener('click', () => {
  init();
  pauseRestartBtn.blur();
});

showControlsBtn.addEventListener('click', () => {
  pauseControlsPanel.classList.toggle('hidden');
});

startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value) || 1;
  localStorage.setItem('tetris-start-level', String(startLevel));
});

startLevelSelect.value = String(startLevel);

const themeToggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tetris-theme', theme);
  themeToggle.checked = theme === 'light';
  if (current) draw();
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

themeToggle.checked = document.documentElement.getAttribute('data-theme') === 'light';

init();
