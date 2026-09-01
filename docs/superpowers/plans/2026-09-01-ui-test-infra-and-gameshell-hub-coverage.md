# UI Test Infra + GameShell/Hub Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire jsdom+React Testing Library (component behavior) and Puppeteer (real-browser History API behavior) into this repo's test setup, then add regression coverage for `GameShell.tsx`'s play/pause button, exit-confirmation guard, and native-back-button history guard, plus `Hub.tsx`'s scroll restoration — all currently unverified except by hand.

**Architecture:** Two independent test layers sharing one `package.json`. Layer 1 (`npm test`, unchanged command) gains jsdom-environment component tests via a per-file `// @vitest-environment jsdom` pragma, colocated with source. Layer 2 (`npm run test:e2e`, new) drives a real headless Chrome via Puppeteer against a `vite preview` of the production build, living under a new top-level `e2e/` directory. CI runs them as two parallel jobs, both required before any deploy.

**Tech Stack:** Vitest (existing), jsdom, @testing-library/react + jest-dom + user-event, Puppeteer (full package, replacing the unused `puppeteer-core`), react-router-dom's `createMemoryRouter` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-09-01-ui-test-infra-and-gameshell-hub-coverage-design.md`

## Global Constraints

- `npm test` must stay fast and behaviorally unchanged for the 103 existing pure-logic tests — default Vitest `test.environment` stays `'node'`; new component test files opt into jsdom individually via a `// @vitest-environment jsdom` docblock, never a global environment flip.
- No production/UI logic changes beyond what's strictly needed to make something testable — turned out to need none: every element under test already has a stable, i18n-driven `aria-label` or visible text.
- Every deploy job in `.github/workflows/deploy.yml` (`deploy-prod`, `preview-pr`, `deploy-dev`, `deploy-hosting-stg`, `deploy-hosting-prod`) must depend on **both** `build-and-test` and the new `e2e-test` job.
- Every `npm ci` step outside the new `e2e-test` job gets `env: { PUPPETEER_SKIP_DOWNLOAD: 'true' }` so only that one job's install fetches Chromium.
- Flows that need real browser History API semantics (native back button, popstate ordering, actual `history.go()` reload behavior) go in the Puppeteer layer — jsdom does not reproduce these faithfully for a hash router. Everything else stays in the jsdom+RTL layer.

---

## File structure

**Create:**
- `vitest.config.ts` — component/unit test config (jsdom-capable, default `npm test`)
- `vitest.e2e.config.ts` — Puppeteer test config (separate `npm run test:e2e`)
- `src/test/setup.ts` — jest-dom matcher registration
- `src/components/GameShell.test.tsx` — play/pause visibility, exit-confirmation, beforeunload
- `src/routes/Hub.test.tsx` — scroll save/restore
- `e2e/global-setup.ts` — builds nothing itself; starts/stops `vite preview` for the e2e run
- `e2e/gameShell-history.e2e.test.ts` — native back-button + history-guard regression suite

**Modify:**
- `package.json` — new devDependencies, new `test:e2e` script
- `.github/workflows/deploy.yml` — new `e2e-test` job, `PUPPETEER_SKIP_DOWNLOAD` on other installs, `needs:` updated on every deploy job
- `README.md` — new "Test" subsection

---

### Task 1: Component test infra (jsdom + RTL) wired to `npm test`

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json` (devDependencies only — via `npm install`, no hand-editing)

**Interfaces:**
- Produces: `vitest.config.ts` as the config Vitest picks up for `vitest run` (invoked by the existing `npm test` script, unchanged). Component test files trigger jsdom via a `// @vitest-environment jsdom` docblock as their first line.

- [ ] **Step 1: Install the new devDependencies**

```bash
npm install -D jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Create the jest-dom setup file**

`src/test/setup.ts`:
```ts
// Registers jest-dom's matchers (toBeInTheDocument, etc.) for every test file
// in this project — see vitest.config.ts's test.setupFiles.
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Add `vitest.config.ts` to tsconfig's `include`**

`tsconfig.json`'s `"include"` is currently `["src", "vite.config.ts"]` — without this, `tsc --noEmit` (run by `npm run build`) never type-checks the new root config file. Change:
```json
  "include": ["src", "vite.config.ts"]
```
to:
```json
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Reuses vite.config.ts's plugins/alias/define rather than duplicating them —
// the two configs must never drift on the `@` alias or the JSX transform.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Existing 103 tests are pure logic and stay on the faster default
      // ('node'); component tests opt into jsdom per-file via a
      // `// @vitest-environment jsdom` docblock instead of flipping this
      // globally.
      environment: 'node',
      setupFiles: ['./src/test/setup.ts'],
      // e2e/ has its own config (vitest.e2e.config.ts) and its own runner
      // (`npm run test:e2e`) — excluded here so `npm test` never tries to
      // spin up a browser.
      exclude: [...configDefaults.exclude, 'e2e/**'],
    },
  })
);
```

- [ ] **Step 5: Verify the existing suite is unaffected**

Run: `npm test`
Expected: all 103 existing tests still pass, same as before this task.

- [ ] **Step 6: Verify a throwaway jsdom component test actually works end to end**

Create a temporary file `src/test/smoke.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('jsdom + RTL smoke test', () => {
  it('renders into a real DOM and jest-dom matchers work', () => {
    render(<button aria-label="ping">ping</button>);
    expect(screen.getByRole('button', { name: 'ping' })).toBeInTheDocument();
  });
});
```

Run: `npm test -- src/test/smoke.test.tsx`
Expected: PASS. This confirms jsdom, RTL, and the jest-dom matcher types/runtime are all wired correctly before building real coverage on top.

- [ ] **Step 7: Delete the smoke test and commit the infra**

```bash
rm src/test/smoke.test.tsx
npm run build   # tsc --noEmit && vite build — confirms jest-dom's matcher
                 # ambient types type-check under this repo's tsconfig.json
git add vitest.config.ts tsconfig.json src/test/setup.ts package.json package-lock.json
git commit -m "test: wire jsdom + React Testing Library into npm test"
```

---

### Task 2: GameShell test double + play/pause button visibility

**Files:**
- Create: `src/components/GameShell.test.tsx`

**Interfaces:**
- Consumes: `GameShell` (`src/components/GameShell.tsx`, default export is named `GameShell`, prop `{ def: GameDefinition }`); `GameController`, `GameDefinition`, `ControllerEvents`, `GameState`, `ScoreInfo` (`src/games/types.ts`); `Emitter` (`src/engine/emitter.ts`); `defaultDichopticSettings` (`src/engine/dichoptic.ts`); `I18nProvider` (`src/i18n.tsx`).
- Produces (for Task 3, which appends to this same file): `createFakeController()` returning `{ controller: GameController, setState(next: Partial<GameState>): void, emitGameOver(s: ScoreInfo): void }`; `createFakeDef(controller: GameController): GameDefinition`; `renderShell(def: GameDefinition)` returning the RTL `render()` result, with the router topology `'/'` (hub stub) → `'/play/fake-game'` (GameShell, initial entry) → `'/sync'` (stub).

- [ ] **Step 1: Write the test file with the shared fixtures and the play/pause describe block**

`src/components/GameShell.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { defaultDichopticSettings } from '@/engine/dichoptic';
import { Emitter } from '@/engine/emitter';
import { I18nProvider } from '@/i18n';
import type { ControllerEvents, GameController, GameDefinition, GameState, ScoreInfo } from '@/games/types';
import { GameShell } from './GameShell';

const EMPTY_STATE: GameState = { paused: true, starting: false, playing: false, muted: false };
const EMPTY_SCORE: ScoreInfo = { points: 0, level: 1 };

/**
 * A GameController test double with no real game engine behind it — tests
 * drive GameShell's reactive UI purely by emitting events through it, the
 * same way a real engine (see src/games/types.ts) would.
 */
function createFakeController() {
  const events = new Emitter<ControllerEvents>();
  let state = EMPTY_STATE;
  let score = EMPTY_SCORE;
  const controller: GameController = {
    events,
    input: () => {},
    resize: () => {},
    togglePause: () => {},
    pause: () => {},
    resume: () => {},
    resetGame: () => {},
    setMuted: () => {},
    getSettings: () => defaultDichopticSettings(),
    applySettings: () => {},
    getScore: () => score,
    getState: () => state,
    destroy: () => {},
  };
  return {
    controller,
    setState: (next: Partial<GameState>) => {
      state = { ...state, ...next };
      events.emit('statechange', state);
    },
    emitGameOver: (s: ScoreInfo) => {
      score = s;
      events.emit('gameover', s);
    },
  };
}

function createFakeDef(controller: GameController): GameDefinition {
  return {
    id: 'fake-game',
    nameKey: 'game.amblyotris.name',
    descKey: 'game.amblyotris.desc',
    screenshot: '',
    controlScheme: 'tetris',
    hasPreview: false,
    boardAspect: 1,
    create: () => controller,
  };
}

/**
 * Mirrors the real app's route topology (Hub at '/', a game shell under
 * '/play/:id', identity badge linking to '/sync') rather than mounting
 * GameShell at '/' directly — several of these tests exercise navigation
 * *away* from GameShell, which only means something distinct from "already
 * here" if the routes actually differ.
 */
function renderShell(def: GameDefinition) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>hub stub</div> },
      { path: '/play/:gameId', element: <GameShell def={def} /> },
      { path: '/sync', element: <div>sync stub</div> },
    ],
    { initialEntries: ['/play/fake-game'] }
  );
  return render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('play/pause topbar button', () => {
  it('is hidden while paused', () => {
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    expect(screen.queryByRole('button', { name: 'Pausa' })).not.toBeInTheDocument();
  });

  it('appears once the game starts playing', () => {
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    fake.setState({ playing: true, paused: false });
    expect(screen.getByRole('button', { name: 'Pausa' })).toBeInTheDocument();
  });

  it('disappears again when paused mid-run', () => {
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    fake.setState({ playing: true, paused: false });
    expect(screen.getByRole('button', { name: 'Pausa' })).toBeInTheDocument();
    fake.setState({ playing: false, paused: true });
    expect(screen.queryByRole('button', { name: 'Pausa' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and verify it fails for the right reason first, if at all**

Run: `npm test -- src/components/GameShell.test.tsx`
Expected: PASS. (This is coverage for existing, already-correct behavior — a red result here means either the fixture is wrong or the button's actual behavior regressed; check `state.playing &&` in `src/components/GameShell.tsx`'s topbar render before assuming the test is wrong.)

- [ ] **Step 3: Commit**

```bash
git add src/components/GameShell.test.tsx
git commit -m "test: cover GameShell's play/pause button visibility"
```

---

### Task 3: GameShell exit-confirmation + beforeunload coverage

**Files:**
- Modify: `src/components/GameShell.test.tsx` (append to the file from Task 2)

**Interfaces:**
- Consumes (from Task 2, same file): `createFakeController()`, `createFakeDef(controller)`, `renderShell(def)`, `EMPTY_STATE`/`EMPTY_SCORE` shapes as defined above. Needs two more imports added to the top of the file: `vi, waitFor` from `'vitest'`/`'@testing-library/react'`, and `userEvent` (default export) from `'@testing-library/user-event'`.

- [ ] **Step 1: Add the new imports to the top of `src/components/GameShell.test.tsx`**

Change:
```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
```
to:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 2: Append the exit-confirmation and beforeunload describe blocks**

Add at the end of the file:
```tsx
describe('exit confirmation', () => {
  it('confirms before leaving via the topbar ✕ once a run is in progress', async () => {
    const user = userEvent.setup();
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    fake.setState({ playing: true, paused: false });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
  });

  it('does not confirm via the topbar ✕ before the game has started', async () => {
    const user = userEvent.setup();
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    const confirmSpy = vi.spyOn(window, 'confirm');
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('confirms before leaving via the identity badge once a run is in progress', async () => {
    const user = userEvent.setup();
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    fake.setState({ playing: true, paused: false });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('link', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
  });

  it('does not confirm closing the Game Over modal, even though a run had started', async () => {
    const user = userEvent.setup();
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    fake.setState({ playing: true, paused: false });
    fake.emitGameOver({ points: 42, level: 3 });
    const confirmSpy = vi.spyOn(window, 'confirm');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('re-arms after a cancelled exit — the next attempt can still confirm', async () => {
    const user = userEvent.setup();
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    fake.setState({ playing: true, paused: false });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(2));
  });
});

describe('beforeunload guard', () => {
  function dispatchBeforeUnload(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('prevents the default beforeunload once a run is in progress', () => {
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    fake.setState({ playing: true, paused: false });
    expect(dispatchBeforeUnload()).toBe(true);
  });

  it('does not prevent beforeunload before the game has started', () => {
    const fake = createFakeController();
    renderShell(createFakeDef(fake.controller));
    expect(dispatchBeforeUnload()).toBe(false);
  });
});
```

- [ ] **Step 3: Run the full file**

Run: `npm test -- src/components/GameShell.test.tsx`
Expected: all cases PASS, including the ones from Task 2.

- [ ] **Step 4: Run the whole suite to confirm nothing else broke**

Run: `npm test`
Expected: all tests pass (103 pre-existing + this file's new cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/GameShell.test.tsx
git commit -m "test: cover GameShell exit-confirmation and beforeunload guard"
```

---

### Task 4: Hub scroll restoration coverage

**Files:**
- Create: `src/routes/Hub.test.tsx`

**Interfaces:**
- Consumes: `Hub` (`src/routes/Hub.tsx`, named export `Hub`, no props); `I18nProvider` (`src/i18n.tsx`); `MemoryRouter` (`react-router-dom`). Reads/writes the same `sessionStorage` key the component uses: `'hub-scroll-y'`.

- [ ] **Step 1: Write the test file**

`src/routes/Hub.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { Hub } from './Hub';

const SCROLL_KEY = 'hub-scroll-y';

function renderHub() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <Hub />
      </MemoryRouter>
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('hub scroll restoration', () => {
  it('restores a saved scroll position on mount', () => {
    sessionStorage.setItem(SCROLL_KEY, '480');
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderHub();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 480);
  });

  it('does not call scrollTo when nothing was saved', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderHub();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('saves the current scroll position when leaving, regardless of how', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { unmount } = renderHub();
    // Simulate the user having scrolled: set the property directly (jsdom
    // doesn't do real layout/scroll physics) and fire the same 'scroll'
    // event the browser would, since Hub tracks position via that listener
    // rather than reading window.scrollY at unmount time.
    Object.defineProperty(window, 'scrollY', { value: 733, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    unmount();
    expect(sessionStorage.getItem(SCROLL_KEY)).toBe('733');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- src/routes/Hub.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Hub.test.tsx
git commit -m "test: cover Hub scroll restoration"
```

---

### Task 5: Puppeteer e2e infra (`npm run test:e2e`)

**Files:**
- Create: `vitest.e2e.config.ts`
- Create: `e2e/global-setup.ts`
- Modify: `package.json` (new `test:e2e` script; `puppeteer` dependency added, `puppeteer-core` removed)

**Interfaces:**
- Produces: `npm run test:e2e` — builds the app, starts `vite preview` on a fixed port, runs every `e2e/**/*.e2e.test.ts` file against it, tears the server down. Test files read the server's URL from `process.env.E2E_BASE_URL`.

- [ ] **Step 1: Swap the Puppeteer dependency**

```bash
npm uninstall puppeteer-core
npm install -D puppeteer
```

- [ ] **Step 2: Create the global setup**

`e2e/global-setup.ts`:
```ts
import { spawn, type ChildProcess } from 'node:child_process';

const PORT = 4319;
const BASE_URL = `http://localhost:${PORT}`;

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`vite preview did not respond at ${url} within ${timeoutMs}ms`);
}

/**
 * Vitest global setup: runs once, before any e2e test file, in the main
 * process. `process.env` changes made here are inherited by the worker
 * processes that actually run the test files, which is how E2E_BASE_URL
 * reaches them.
 */
export default async function setup(): Promise<() => void> {
  process.env.E2E_BASE_URL = BASE_URL;
  const server: ChildProcess = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'inherit',
  });
  await waitForServer(BASE_URL);

  return () => {
    server.kill();
  };
}
```

- [ ] **Step 3: Add `e2e` and `vitest.e2e.config.ts` to tsconfig's `include`**

Change (as left by Task 1):
```json
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
```
to:
```json
  "include": ["src", "vite.config.ts", "vitest.config.ts", "vitest.e2e.config.ts", "e2e"]
```

- [ ] **Step 4: Create `vitest.e2e.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.test.ts'],
    globalSetup: ['./e2e/global-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

- [ ] **Step 5: Add the `test:e2e` script to `package.json`**

In the `"scripts"` block, next to `"test": "vitest run"`, add:
```json
    "test:e2e": "vite build && vitest run --config vitest.e2e.config.ts",
```

- [ ] **Step 6: Verify the plumbing with a throwaway e2e test**

Create a temporary file `e2e/smoke.e2e.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

describe('e2e global setup smoke test', () => {
  it('starts vite preview and exposes its URL', async () => {
    const baseURL = process.env.E2E_BASE_URL;
    expect(baseURL).toMatch(/^http:\/\/localhost:\d+$/);
    const res = await fetch(baseURL!);
    expect(res.ok).toBe(true);
  });
});
```

Run: `npm run test:e2e`
Expected: PASS, and the process exits cleanly (confirms the global-setup teardown actually kills the `vite preview` child instead of leaving it running / hanging the test run).

- [ ] **Step 7: Delete the smoke test and commit**

```bash
rm e2e/smoke.e2e.test.ts
git add vitest.e2e.config.ts tsconfig.json e2e/global-setup.ts package.json package-lock.json
git commit -m "test: wire Puppeteer e2e infra (npm run test:e2e)"
```

---

### Task 6: Native back-button + history-guard regression suite

**Files:**
- Create: `e2e/gameShell-history.e2e.test.ts`

**Interfaces:**
- Consumes: `process.env.E2E_BASE_URL` (set by `e2e/global-setup.ts` from Task 5); the real running app, navigated to via the Hub's game card link (`a[href*="/play/amblyotris"]`), the shell's start overlay (`.shell__overlay--btn`), the topbar pause icon (`button[aria-label="Pausa"]`) and exit button (`button[aria-label="Volver"]`), and the hub's hero section (`.hub__hero`) as the "landed back on the hub" marker.

- [ ] **Step 1: Write the test file**

`e2e/gameShell-history.e2e.test.ts`:
```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error('E2E_BASE_URL not set — did e2e/global-setup.ts run?');

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await puppeteer.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
});

afterEach(async () => {
  await page.close();
});

/** Hub -> click into amblyotris -> press start, mirroring real usage (and, unlike
 * navigating straight to the game URL, giving the router a tagged history
 * entry to fall back to — the exact shape of the original idx-corruption bug). */
async function startGame(): Promise<void> {
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('a[href*="/play/amblyotris"]');
  await page.click('a[href*="/play/amblyotris"]');
  await page.waitForSelector('.shell__overlay--btn');
  await page.click('.shell__overlay--btn');
  await page.waitForSelector('button[aria-label="Pausa"]');
}

/** Arranges to accept or dismiss the next native confirm() dialog, resolving with its message. */
function autoRespondToNextDialog(accept: boolean): Promise<string> {
  return new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      const message = dialog.message();
      if (accept) await dialog.accept();
      else await dialog.dismiss();
      resolve(message);
    });
  });
}

describe('native back-button history guard', () => {
  it('does not guard the back button before the game has started', async () => {
    await page.goto(`${baseURL}/`, { waitUntil: 'networkidle0' });
    await page.click('a[href*="/play/amblyotris"]');
    await page.waitForSelector('.shell__overlay--btn');
    let dialogFired = false;
    page.once('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });
    await page.goBack();
    await page.waitForSelector('.hub__hero');
    expect(dialogFired).toBe(false);
  });

  it('shows a confirm dialog on back press mid-run, and cancel leaves the run intact', async () => {
    await startGame();
    const dialogPromise = autoRespondToNextDialog(false);
    await page.goBack();
    await expect(dialogPromise).resolves.toMatch(/salir y perder el progreso/i);
    await page.waitForSelector('button[aria-label="Pausa"]');
  });

  it('re-arms the guard after cancel — a second back press dialogs again', async () => {
    await startGame();
    await autoRespondToNextDialog(false);
    await page.goBack();
    await page.waitForSelector('button[aria-label="Pausa"]');
    const dialogPromise = autoRespondToNextDialog(false);
    await page.goBack();
    await expect(dialogPromise).resolves.toMatch(/salir y perder el progreso/i);
  });

  it('accepting exits to the hub via an SPA transition, not a full reload', async () => {
    await startGame();
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__navMarker = true;
    });
    const dialogPromise = autoRespondToNextDialog(true);
    await page.goBack();
    await dialogPromise;
    await page.waitForSelector('.hub__hero');
    const markerSurvived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__navMarker === true
    );
    expect(markerSurvived).toBe(true);
  });

  it('does not corrupt later navigation after an accepted back-button exit', async () => {
    await startGame();
    await autoRespondToNextDialog(true);
    await page.goBack();
    await page.waitForSelector('.hub__hero');
    // A fresh run should be startable and back-guardable again — proof the
    // router's history index wasn't corrupted by the guard's duplicate entry.
    await page.click('a[href*="/play/amblyotris"]');
    await page.waitForSelector('.shell__overlay--btn');
    await page.click('.shell__overlay--btn');
    await page.waitForSelector('button[aria-label="Pausa"]');
    const dialogPromise = autoRespondToNextDialog(true);
    await page.goBack();
    await expect(dialogPromise).resolves.toMatch(/salir y perder el progreso/i);
    await page.waitForSelector('.hub__hero');
  });

  it('a confirmed exit via the topbar ✕ is not undone by a later back press', async () => {
    await startGame();
    const dialogPromise = autoRespondToNextDialog(true);
    await page.click('button[aria-label="Volver"]');
    await dialogPromise;
    await page.waitForSelector('.hub__hero');
    await page.goBack();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const onHub = await page.evaluate(() => document.querySelector('.hub__hero') !== null);
    expect(onHub).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e`
Expected: all cases PASS. If any fails, this is exercising real Chrome/router behavior with no fake underneath it — read the failure message and `page.evaluate(() => location.href)` / dialog messages before changing anything in `GameShell.tsx`; these tests encode already-fixed bugs, so a failure here most likely means a fixture issue (a selector, a timing wait) rather than a real regression, but confirm by reading `src/components/GameShell.tsx`'s history-guard `useEffect` (~line 139) before concluding either way.

- [ ] **Step 3: Commit**

```bash
git add e2e/gameShell-history.e2e.test.ts
git commit -m "test: e2e coverage for the native back-button history guard"
```

---

### Task 7: CI wiring

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm run test:e2e` (Task 5), `npm test` (unchanged).

- [ ] **Step 1: Add `PUPPETEER_SKIP_DOWNLOAD` to every existing `npm ci` step**

In `.github/workflows/deploy.yml`, every job's `- run: npm ci` step (in `build-and-test`, `deploy-prod`, `preview-pr`, `deploy-dev`, `deploy-hosting-stg`, `deploy-hosting-prod`) becomes:
```yaml
      - run: npm ci
        env:
          PUPPETEER_SKIP_DOWNLOAD: 'true'
```
(Six occurrences — one per job. The new `e2e-test` job added in the next step does **not** get this env var.)

- [ ] **Step 2: Add the new `e2e-test` job**

Add this job to `.github/workflows/deploy.yml`, alongside `build-and-test` (same top-level `jobs:` indentation):
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

- [ ] **Step 3: Gate every deploy job on both jobs**

Change `needs: build-and-test` to `needs: [build-and-test, e2e-test]` in every job that currently has it: `deploy-prod`, `preview-pr`, `deploy-dev`, `deploy-hosting-stg`, `deploy-hosting-prod`.

- [ ] **Step 4: Validate the YAML**

Run: `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo OK`
Expected: `OK` (catches indentation/syntax errors before pushing — this repo has no local GitHub Actions runner to test the workflow itself).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add e2e-test job, gate all deploys on it"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Test" subsection under "Develop"**

In `README.md`, right after the existing `## Develop` code block (`npm install` / `npm run dev` / ... / `npm run typecheck`) and before the `Copy .env.example...` paragraph, insert:

```markdown
### Test

```bash
npm test          # Vitest: pure logic + jsdom/React Testing Library component tests
npm run test:e2e  # Puppeteer against a real build — native browser History API behavior
```

Split by what each layer can actually verify: `npm test` covers pure logic and
component render/state (fast, in-process, no browser); `npm run test:e2e`
covers behavior that depends on the real browser History API — native
back/forward, `popstate` ordering — which jsdom does not reproduce faithfully
for a hash router. New component tests opt into a DOM via a
`// @vitest-environment jsdom` docblock at the top of the file rather than
flipping the whole suite to jsdom.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document npm test vs npm run test:e2e"
```
