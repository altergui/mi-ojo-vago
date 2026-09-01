# UI test infra + GameShell/Hub coverage

**Date:** 2026-09-01
**Branch:** `test-infra-ui-coverage`
**Status:** approved

## Problem

103 Vitest tests cover pure logic (i18n, sync, stores, engine, tetromino,
silhouettes) but no jsdom/RTL is configured and nothing exercises component
render or UI flow. `src/components/GameShell.tsx` and `src/routes/Hub.tsx`
carry several non-obvious behaviors — play/pause button visibility, an
exit-confirmation guard active across five different exit paths, a
hand-rolled browser-history guard for the native back button, and
scroll-position restoration on the hub — that today are only checked by hand
in a browser. Real regressions in exactly these areas shipped and were only
caught by manual testing this week (see `GameShell.tsx` comments: history
`idx` corruption, a cleanup effect undoing a just-confirmed exit, a chained
`history.go()` causing a full page reload instead of an SPA transition).

`puppeteer-core` sits unused in `devDependencies` with no committed script.
CI (`.github/workflows/deploy.yml`, `build-and-test`) runs
`npm run build && npm test` as a required gate before every deploy target.

## Goals

- Add component-level test coverage for the specific GameShell/Hub behaviors
  listed in the Coverage section below.
- Choose and wire test infrastructure that fits what's actually being tested:
  component render/state (fast, in-process) vs. real browser History API
  semantics (jsdom does not reproduce these faithfully for a hash router).
- Keep the existing `npm test` gate fast and unchanged in behavior for the
  103 existing pure-logic tests.
- Make the new suites run headless in CI and gate deploys.

## Non-goals

- No production/UI logic changes beyond what's needed to make something
  testable (e.g. a `data-testid`), and only if actually needed.
- No attempt to make jsdom simulate real navigation — flows that need that
  go to the Puppeteer suite instead.
- No coverage of games' canvas rendering internals — out of scope, GameShell
  is driven here through a hand-built fake `GameController`.

## Infra

### Two test layers, one already-fast gate kept intact

**Component layer — Vitest + jsdom + React Testing Library**, colocated with
source (`GameShell.test.tsx` next to `GameShell.tsx`, matching the existing
`SyncPage.test.ts`-next-to-`SyncPage.tsx` convention). Runs via the existing
`npm test`.

- New root `vitest.config.ts`: `mergeConfig(viteConfig, defineConfig({ test: {...} }))`
  so the `@` alias and `@vitejs/plugin-react` aren't duplicated between Vite
  and Vitest config. `vite.config.ts` itself is untouched.
- Default `test.environment` stays `'node'` — the 103 existing pure-logic
  tests are unaffected. New component test files opt into jsdom individually
  via a `// @vitest-environment jsdom` docblock pragma at the top of the file.
- `test.setupFiles: ['./src/test/setup.ts']`, which does
  `import '@testing-library/jest-dom/vitest'` for `toBeInTheDocument()` etc.
- New devDependencies: `jsdom`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`.

**Browser layer — Puppeteer against a real built app**, in a new top-level
`e2e/` directory (these drive the whole app through a real hash-routed URL,
not one module, so they don't fit the colocated convention). Run via a new
`npm run test:e2e`.

- New root `vitest.e2e.config.ts`: separate Vitest project,
  `test.environment: 'node'` (Puppeteer drives a real browser from Node; no
  jsdom involved), `test.include` pointed at `e2e/**/*.e2e.test.ts`,
  `test.globalSetup: './e2e/global-setup.ts'`.
- `e2e/global-setup.ts` starts `vite preview` against the already-built
  `dist/` on a fixed local port, waits for it to accept connections, and
  exposes the base URL to test files via `process.env.E2E_BASE_URL`; its
  teardown function kills the preview server.
- `puppeteer` (full package, bundled Chromium) replaces the currently-unused
  `puppeteer-core` in devDependencies — this avoids depending on whatever
  browser happens to be preinstalled on the CI runner image.
- `"test:e2e": "vite build && vitest run --config vitest.e2e.config.ts"` —
  the script rebuilds itself so it's self-sufficient standalone (a developer
  running it without having just run `npm run build` still gets a correct
  `dist/`), at the cost of one redundant build in CI (see below).

### package.json scripts

- `"test": "vitest run"` — unchanged in behavior, now resolves against the
  new `vitest.config.ts`.
- `"test:e2e": "vite build && vitest run --config vitest.e2e.config.ts"` —
  new.

### CI (`.github/workflows/deploy.yml`)

New job `e2e-test`, parallel to `build-and-test` (no `needs:`, so it doesn't
wait on it — it does its own `npm ci` + `npm run test:e2e`, which includes
its own build):

```yaml
  e2e-test:
    name: E2E (Puppeteer)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:e2e
```

`npm ci` installs every devDependency for whichever job runs it, so adding
`puppeteer` to `package.json` means its Chromium download would otherwise
fire in *every* job that installs deps — `build-and-test` and every deploy
job included, none of which ever launch a browser. Every `npm ci` step
outside `e2e-test` gets `env: { PUPPETEER_SKIP_DOWNLOAD: 'true' }` (Puppeteer
honors this at install time) so only `e2e-test`'s install actually fetches
Chromium.

Every deploy job's `needs:` gains `e2e-test` alongside the existing
`build-and-test`: `deploy-prod`, `preview-pr`, `deploy-dev`,
`deploy-hosting-stg`, `deploy-hosting-prod`. A red e2e run now blocks every
deploy target exactly like a red `npm test` run does today. Running as its
own job (rather than an extra step inside `build-and-test`) means it
overlaps with the unit-test job on wall-clock time, at the cost of building
the app twice across the two jobs — an accepted tradeoff for the parallel
job structure.

### Documentation

README gets a short "Test" subsection under "Develop" covering both
commands and why they're split (component/jsdom vs. browser/Puppeteer).

## Coverage

| TODO item | What's verified | How | Layer |
|---|---|---|---|
| Play/pause button only while `state.playing` | Button present when `statechange` reports `playing: true`; absent otherwise (paused, starting) | Mount `GameShell` with a hand-built fake `GameController` (a real event emitter, no actual game engine) driving `statechange`; query for the button | jsdom+RTL |
| Exit-confirm gated by `started && !gameOver`, no dupes, across: topbar ✕, identity badge, Game Over modal close | `window.confirm` spy is called exactly once per attempted exit when a run is in progress, and never called on any of these three when the game hasn't started or Game Over is already showing | Fake controller drives `started`/`gameOver` via events; click each affordance inside a `MemoryRouter`; assert on the spy | jsdom+RTL |
| Exit-confirm on `beforeunload` | `beforeunload`'s `preventDefault()` fires when in progress, not otherwise | Dispatch a synthetic `beforeunload` `Event` on `window`, read `event.defaultPrevented` — no real browser dialog needed, this is testing listener wiring, not the browser's own UI | jsdom+RTL |
| Native back-button confirm/cancel, and the history-guard regressions already fixed once by hand: duplicate-entry `idx` corruption, a cleanup effect undoing an already-confirmed exit, a synchronous `history.go()` inside a popstate handler forcing a full reload instead of an SPA transition | A real Chrome, hash-routed session: press back mid-run → native `confirm()` dialog appears (intercepted via `page.on('dialog')`); Cancel leaves the run intact and the guard re-armed (back again → dialog again); Accept exits to the hub without a full reload (a `window.__navMarker` flag set before the press must survive) and without corrupting later navigation; confirming exit via the topbar ✕ and *then* pressing back afterward doesn't re-open or undo that exit | Puppeteer against `vite preview` of the production build | Puppeteer (`e2e/`) |
| Hub remembers scroll position across any return path | Mounting `Hub` with a saved `sessionStorage['hub-scroll-y']` calls `window.scrollTo` with that value; unmounting after `window.scrollY` changed saves the new value back to `sessionStorage` | `window.scrollTo` mocked as a spy; `window.scrollY` set directly to simulate user scroll (sidesteps jsdom's lack of real scroll/layout physics entirely) | jsdom+RTL |

## Test doubles

`GameShell.test.tsx` needs a `GameDefinition`/`GameController` pair (see
`src/games/types.ts`) that is fully hand-built for the test file rather than
using any real game engine: a small object implementing
`events` (a real minimal emitter), `getState`, `getScore`, `getSettings`,
and no-op `input`/`resize`/`pause`/`resume`/`togglePause`/`resetGame`/
`setMuted`/`applySettings`/`destroy`. Tests drive behavior by emitting
`statechange`/`gameover` through it. This keeps the test decoupled from any
real game's canvas/engine code.

## Risks / open questions

- `@testing-library/jest-dom`'s ambient matcher types (`toBeInTheDocument()`
  etc.) need to type-check under this repo's `tsconfig.json`
  (`"types": ["node"]`, no `@types` auto-inclusion beyond that). Importing
  `@testing-library/jest-dom/vitest` from a file inside `src/` (already in
  `tsconfig.json`'s `include`) should pick up its module augmentation
  without touching `types`; verified during implementation via
  `npm run build` (`tsc --noEmit`).
- Puppeteer's bundled Chromium download adds to `npm ci` time. Scoped to the
  `e2e-test` job alone via `PUPPETEER_SKIP_DOWNLOAD=true` on every other
  job's install (see CI section above); acceptable given `e2e-test` runs in
  parallel with `build-and-test` rather than adding to its critical path.
