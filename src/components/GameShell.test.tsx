// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    // Wrapped in act(): these emit synchronously from outside any React
    // event handler, so React won't flush the resulting state update (and
    // GameShell's own effects) before the test's next assertion otherwise.
    setState: (next: Partial<GameState>) => {
      state = { ...state, ...next };
      act(() => events.emit('statechange', state));
    },
    emitGameOver: (s: ScoreInfo) => {
      score = s;
      act(() => events.emit('gameover', s));
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
  vi.restoreAllMocks();
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
