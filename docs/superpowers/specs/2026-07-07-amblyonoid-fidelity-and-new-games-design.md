# Amblyonoid fidelity rebuild + Bridge Dock + Flying Bird

Status: approved (design), not yet planned/implemented.

## Context

`FUENTES/` (added since the last build session) contains the real deployed sources
for all 5 original games: `tris` (Amblyotris), `ark` (Amblyonoid), `bridge dock`,
`flying bird`, `orthoptics`. `tris` and `ark` are webpack bundles; the other three
are small hand-written vanilla-JS files.

Amblyotris was already ported from the real MIT TypeScript source (found on GitHub
in the prior session) and verified to match `tris`'s bundled constants
(`DEFAULT_COLOR_ALTERNATIVES` = `#FFFFFF/#00ffff/#ff0000/#969696`, matches exactly).
It is **not** part of this pass.

Amblyonoid was built from scratch last time (no source was available then) and has
real, concrete fidelity gaps now that `ark`'s bundle can be mined. Orthoptics is
structurally a different kind of thing (no score/lives, DOM-positioned vergence
exercise with a diopter readout) and is explicitly **out of scope** — separate
future spec.

This spec covers: (1) an Amblyonoid mechanics rebuild to real parity, (2) Bridge
Dock, (3) Flying Bird — all three on the existing `GameController`/engine
architecture, which is confirmed sound and is not being rewritten.

## Architecture (unchanged)

Each game is a self-contained class implementing `GameController`
(`src/games/types.ts`): owns its `CanvasLayers`, reads/writes `DichopticSettings`
for color, drives its own `requestAnimFrame` loop, and may attach its own DOM
listeners directly (keyboard, pointer) — same pattern `AmblyonoidGame` already uses
for keyboard today. `GameShell`, `TouchControls`, `SettingsPanel`,
`CalibrationPanel`, and the stats system stay generic and untouched.

Two small interface additions:

- `InputAction` gains `'up'` (Flying Bird; `'down'` already exists).
- `ControlScheme` gains:
  - `'pointer'` — Bridge Dock. `TouchControls` renders nothing (or a minimal
    element); input comes from `pointermove`/`touchmove` listeners the game
    attaches to its own `board` element, converted to normalized 0..1 coords.
  - `'glider'` — Flying Bird. `TouchControls` renders up/down hold buttons
    (mirrors the existing `left`/`right` hold-button pattern for `paddle`).
- `'paddle'` scheme is **repurposed**: `TouchControls` drops the ◀/⤒/▶ buttons in
  favor of drag-to-position on the board (matching the real source) plus a small
  launch tap target. Only Amblyonoid uses this scheme, so this is a local change.

No `GameController` interface changes are needed for continuous pointer input —
games read it directly off their own `board` element, same as keyboard.

## 1. Amblyonoid rebuild

Source: `FUENTES/ark/js/index.js` (webpack bundle, classes: `Game`, `Ball`,
`Paddle`, `Brick`, `Pill`, `Utils`, `Physics`, plus a `levels.ts` module).

### Confirmed real constants

- Default palette (`ark`'s saved-settings default): `['#FFFFFF', '#00ffff',
  '#ff0000', '#969696', '#767676']` — 5 entries. The 5th (`#767676`) is **not**
  referenced by any render path found (brick shadow is hardcoded `#666666`,
  cracked-overlay is hardcoded `#00000044`) — it appears to be vestigial in the
  saved-settings shape. Decision: keep the app's shared `DichopticSettings` at 4
  colors; do not plumb an unused 5th color app-wide.
- Coordinate space: normalized to a virtual 1000-wide canvas (`x * clientWidth /
  1000`), `cols = 9`, `brickWidth = 1000/9`, `brickHeight = brickWidth * 0.7`,
  board `height = width * 1.5` (i.e. aspect 2:3 — matches our existing
  `boardAspect: 2/3`, no change needed there).
- Ball: default `r = 20` (2% of width), `speed = 600` (0.6 normalized/sec) —
  close to current `BALL_R = 0.018` / `BASE_BALL_SPEED = 0.62`, worth
  double-checking against `physics.ts` collision code during implementation but
  not a major rewrite.
- Lives = 3 (already correct in current code).
- Paddle position is **driven directly by pointer position**:
  `paddle.moveTo(propX)` where `propX = (pageX - boardOffsetLeft) / boardWidth *
  1000`, on both `mousemove` and `touchmove` over the board. Arrow keys move the
  paddle by a fixed step (`± 20` in the 1000-space) per frame while held. Space
  (or a board click/tap) calls `ball.throw()` to launch any stuck ball.
- Bricks: `hitsNeeded` per cell, decoded from a 2-char level-string code:
  `xx` = -1 (indestructible, drawn with a glow/rounded rect and `#FFFFFF44`
  highlight), `'  '` (two spaces) = 0 (no brick), `aa`=1, `bb`=2, `cc`=3, `dd`=4
  hit points. Bricks render **grey** (`fillStyle = color[3]`, `strokeStyle =
  color[0] + '44'`), with a `#666666` drop-shadow layer and a `#00000044`
  semi-transparent overlay repeated per remaining hit (the "crack" look). This
  is the core fidelity bug in the current build, which colors bricks
  cyan/red by `(row+col) % 2`.
- Ball and paddle carry the actual per-eye color split: ball draws with
  `color[2]`, paddle draws with `color[1]`. Pills draw with `color[2]` (good) /
  `color[1]` (evil) — same mapping as ball/paddle.
- 14 hand-authored levels as ASCII grids (row strings of 2-char codes). Port
  the array verbatim into a new `src/games/amblyonoid/levels.ts`. On
  level-complete, advance to next; if `level > 14`, wrap/reset to level 1 (real
  source falls back to level 1 when `levelData` is undefined).
- Falling pills, spawned from destroyed bricks, labeled A–D, `ethics: 'good' |
  'evil'`, caught by paddle-overlap test, otherwise fall off-screen and vanish:
  - good A: all balls `slowDown()` (`speed *= 0.8`)
  - good B: all balls `grow()`
  - good C: paddle `grow()`
  - good D: split — each current ball spawns 2 new balls with adjusted
    directions (`Math.sign(dirX)`/`Math.sign(dirY)` on one axis each)
  - evil A: all balls `speedUp()` (`speed *= 1.25`)
  - evil B: all balls `shrink()`
  - evil C: paddle `shrink()`
- Explicitly **not** porting: `ArrowUp → winLevel()` — an obvious leftover
  debug/cheat binding in the shipped source, not an intended feature.

### Scope of change

This replaces `AmblyonoidGame.ts`'s brick/ball/paddle/pill logic essentially
wholesale, while keeping the outer `GameController` contract (`ScoreInfo`,
`GameState`, `events`, `input()`, `applySettings()`, etc.) identical so
`GameShell` needs no changes for this game. `getScore().lives` and `.level`
keep working as today (level = current level index, now meaningfully
progressing through the 14 levels instead of "brick wave count").

## 2. Bridge Dock

Source: `FUENTES/bridge dock/js/script.js` (plain JS, ~300 lines, readable).

- Mechanic: a ball (neutral, drawn with `color[3]`-equivalent) follows the
  cursor/touch position; 5 falling rectangles per color drop from the top and
  wrap to a new random position/size when they pass the bottom edge, speeding
  up slightly (`+0.1`, capped at 8) each wrap. Losing = cursor overlaps any
  rectangle's bounding box.
- Faithful detail worth preserving even though it looks like a bug: the source
  allocates 20 `fallingRectangle` instances per color but the game loop only
  ever calls `.create()/.move()/...` on indices `0..4` — i.e. **5 active
  rectangles per color**, not 20. Porting this as-is (5 per color), not
  "fixing" it to use all 20, since that's the actual shipped difficulty.
  Per-color rectangles are independently randomized (not a paired stereo
  shape) — two unrelated obstacle streams, one per eye color.
- Score: elapsed survival time (`score += 0.01` per ~60fps tick ≈ real
  seconds elapsed); we'll drive this off `dt` accumulation instead of a fixed
  tick to stay correct regardless of frame rate.
- Controls: `pointer` scheme — direct drag (mouse move / touch move) over the
  board sets cursor position. **New** (source had none): arrow-key fallback
  that nudges the cursor by a fixed step, for keyboard-only accessibility,
  consistent with how every other game in this app supports keyboard.
- Colors: default palette for this game is navy/maroon (`#000080`/`#800000`),
  matching the source's hardcoded `rgba(0,0,128,…)`/`rgba(128,0,0,…)`, as this
  game's default `color` array — still flows through the same calibratable
  `DichopticSettings`/Settings/Calibration UI as every other game, just a
  different starting point, persisted independently per `loadSettings('bridgedock')`
  the same way every game's settings are already isolated per game id.
- `ScoreInfo.level` fixed at 1 (no real level concept in the source).

## 3. Flying Bird

Source: `FUENTES/flying bird/js/script.js` (plain JS, ~330 lines, readable).

- Mechanic: bird moves vertically; holding ArrowUp sets `speedY = -3`, holding
  ArrowDown sets `speedY = 3`, released → `speedY = 0` (glide, no gravity in
  the original — it's a hold-to-move dodger, not classic flappy-tap-physics).
  Pipes: a top bar (random height 30–200) and a bottom bar (canvas height
  minus a random gap 150–250) spawn together every ~100 frames from the right
  edge and scroll left at constant speed; collision = axis-aligned box overlap
  with the bird.
- Score: frames survived (`myGameArea.frameNo`); we'll express this as
  elapsed-time-based for frame-rate independence, same treatment as Bridge
  Dock.
- Controls: `glider` scheme — up/down hold buttons for touch (source was
  keyboard-only; this is a new touch affordance, not a source deviation in
  mechanic, just filling a gap the original never addressed for mobile).
- Colors: paired pipes, top = one color, bottom = the other — same navy/maroon
  default treatment as Bridge Dock, same rationale (faithful default, still
  calibratable).
- Visual: bird drawn as a simple vector shape (circle) in neutral grey,
  consistent with how the ball/paddle are drawn elsewhere in this app, rather
  than porting the original's raster PNG bird-color-picker (`birdA/B/N/R.png`
  swap) — that sub-feature is superseded by the app's existing
  Settings/Calibration screens.
- `ScoreInfo.level` fixed at 1 (no real level concept in the source).

## 4. Shared plumbing

- `src/games/registry.ts`: add `bridgedock` and `flyingbird` entries
  (`id`, `nameKey`, `descKey`, `screenshot`, `controlScheme`, `hasPreview:
  false`, `boardAspect`, `create()`).
- `src/i18n.tsx`: ES/EN strings for both games' name/description/welcome text.
- `public/assets/bridgedock/`, `public/assets/flyingbird/`: copy `choque.mp3`
  (collision sound, reused by both — same file appears in both FUENTES
  folders) and each game's theme track (`audio1.mp3`, `No Ballads Balla.mp3`).
  Re-encode/rename to match the `SoundManager` key convention used by the
  other two games (`background`/`denied`/`tap`/`success` — Bridge Dock and
  Flying Bird only really have background + collision, so map collision to
  `denied`).
- `NOTICE.md`: attribution entries for Bridge Dock, Flying Bird, and updated
  Amblyonoid notes once its source is confirmed (same portal,
  `dresiribarren.com.ar/mi-ojo-vago/`).

## 5. Verification

Same approach as the original build: `npm run build` for typecheck +
production build, plus a Puppeteer smoke script per game (run from the
scratchpad, not checked into the repo, matching how Amblyotris/Amblyonoid were
verified last time) — confirms the game loads, responds to input, and that
settings/calibration changes persist and redraw correctly.

## Explicitly out of scope

- Orthoptics (separate future spec — different UI paradigm, no score/lives).
- Rebuilding/rewriting Amblyotris (already faithful).
- Any change to `GameShell`, `SettingsPanel`, `CalibrationPanel`, stats system,
  or the Hub layout beyond adding two new registry entries.
