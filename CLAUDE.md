# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris implemented in vanilla JavaScript with HTML5 Canvas and CSS. No dependencies, no build step, no package manager — just three files.

## Running

No install/build required.

```bash
open index.html            # macOS, opens directly in browser
python3 -m http.server 8000  # or serve locally, then visit http://localhost:8000
```

There is no test suite, linter, or build tooling in this repo. Verify changes by opening `index.html` in a browser and playing.

## Architecture

Three files, each with a single responsibility:

- `index.html` — DOM structure: `#board` canvas (300×600, the play field) and `#next-canvas` (120×120, next-piece preview), plus score/lines/level panel and the pause/game-over overlay.
- `style.css` — dark/retro arcade visual theme.
- `game.js` — all game logic (~300 lines), organized around these pieces:
  - **Board model**: `ROWS × COLS` matrix, each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
  - **Pieces**: `PIECES` array of square matrices (one per tetromino type). Rotation is done via transpose + row-reverse (`rotateCW`), not precomputed rotation states.
  - **Collision** (`collide`): checks a shape at a given offset against board bounds and already-locked cells.
  - **Wall kicks** (`tryRotate`): on a colliding rotation, retries at horizontal offsets (±1, ±2 columns) before giving up.
  - **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates elapsed time and drops the piece one row once `dropInterval` is exceeded.
  - **Line clearing** (`clearLines`): scans bottom-up, removes full rows, unshifts empty rows at the top.
  - **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` × current level; hard drop adds 2 pts/cell, soft drop adds 1 pt/row.
  - **Leveling/speed**: level increases every 10 lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
  - **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row, drawn at `globalAlpha = 0.2`.

Flow: `init()` builds the board, seeds `next` via `randomPiece()`, calls `spawn()` (promotes `next` to `current`, generates a new `next`), then starts the `loop`. If a freshly spawned piece immediately collides, `endGame()` fires and the Game Over overlay shows.

## Tuning constants (in `game.js`)

`COLS`, `ROWS`, `BLOCK` (cell size px), `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, also update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).
