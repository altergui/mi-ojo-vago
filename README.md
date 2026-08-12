# Mi Ojo Vago — modern rebuild

A modern (React + Vite + TypeScript) rebuild of the **Mi Ojo Vago** anaglyph
(red/cyan) games used as adjunct training for **amblyopia** ("lazy eye").

Each game renders pieces in red and cyan; through red/cyan glasses each eye sees a
different set, and the **contrast (opacity) of one colour can be reduced** to make
the weaker eye work — the core dichoptic therapy mechanic. This rebuild keeps that
mechanic, makes everything **responsive + touch-friendly**, and adds **long-term
training statistics** in `localStorage`.

## Games

- **Amblyotris** — anaglyph Tetris. Faithful port of the original MIT TypeScript
  source (© Guilad Gonen), decoupled from the DOM.
- **Amblyonoid** — anaglyph Breakout/Arkanoid, built fresh on the shared engine
  (the original repo is no longer public).

## Features

- Red/cyan dichoptic rendering with selectable **palette**, per-eye **contrast**
  (100/80/60/40/20%), **difficulty variants** (full / hollow / hollow+bar), and a
  **colour calibration** screen.
- Responsive canvas (fits any viewport via `ResizeObserver`), on-screen **touch
  controls**, keyboard controls, fullscreen.
- **Stats** (`localStorage`): total / per-day / per-game training time, time per
  contrast-and-eye combination, recent sessions, best scores; with JSON export.
  Time only accrues while actively playing and the tab is visible.
- Spanish (default) / English UI.

## Architecture

```
src/
  engine/        framework-agnostic core: dichoptic model, canvas layers,
                 sound, rAF, fit, typed event emitter
  games/
    amblyotris/  ported Tetris (game + tetromino + point)
    amblyonoid/  Breakout on the shared engine
    types.ts     GameController contract + GameDefinition registry
  components/    GameShell, Settings/Calibration panels, TouchControls,
                 StatsDashboard, Modal
  stats/         localStorage store + hooks + formatting
  settings/      per-game persisted settings/calibration
  routes/        Hub, GamePage, StatsPage
  i18n.tsx       es/en strings
```

Each game implements a small `GameController` interface (input/resize/pause/…
plus a typed event emitter). The engine owns canvas rendering and the game loop;
**React owns all UI** (menus, HUD, settings, calibration, stats).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run preview    # serve the build
npm run typecheck
```

Copy `.env.example` to `.env.local` and set `VITE_DONATION_EMAIL` /
`VITE_DONATION_PHONE` to show the donations line in the footer (both optional).

## Deploys

Two Cloudflare Workers (static-assets mode) deploy automatically via GitHub
Actions (`.github/workflows/deploy.yml`):

- **Production** — `mi-ojo-vago.guidev.org`, on every push to `main`.
- **Dev preview** — `mi-ojo-vago-dev.guidev.org`, on every push to an open
  pull request targeting `main`. It's a single shared slot, so it always
  reflects whichever PR branch was pushed most recently — not per-PR.

Both paths run `npm run build && npm test` as a gate first. To deploy either
target by hand: `npm run build && npx wrangler deploy --config wrangler.jsonc`
(prod) or `--config wrangler.dev.jsonc` (dev). Production can also be
re-triggered manually from the Actions tab (`workflow_dispatch`).

`worker/` (`mi-ojo-vago-sync`) is a separate Cloudflare Worker, deployed
manually — not part of this CI.

## Attribution & disclaimer

See [`NOTICE.md`](./NOTICE.md). Original games © 2022 Guilad Gonen (MIT).
These games are a training aid, **not** a medical device; amblyopia treatment
should be supervised by an ophthalmologist or orthoptist.
