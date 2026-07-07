import type { DichopticSettings } from '@/engine/dichoptic';
import type { Emitter } from '@/engine/emitter';
import type { StringKey } from '@/i18n';

export type InputAction = 'left' | 'right' | 'up' | 'down' | 'rotate' | 'drop' | 'launch';

export interface ScoreInfo {
  points: number;
  level: number;
  rows?: number;
  lives?: number;
}

export interface GameState {
  paused: boolean;
  starting: boolean;
  playing: boolean;
  muted: boolean;
}

/** Events every game controller must be able to emit (superset; some optional). */
export type ControllerEvents = {
  score: ScoreInfo;
  levelup: { level: number };
  gameover: ScoreInfo;
  statechange: GameState;
  settingschange: DichopticSettings;
  ready: void;
};

/** The surface GameShell drives, regardless of which game is mounted. */
export interface GameController {
  readonly events: Emitter<ControllerEvents>;
  input(action: InputAction): void;
  resize(height?: number): void;
  togglePause(): void;
  pause(): void;
  resume(): void;
  resetGame(): void;
  setMuted(muted: boolean): void;
  getSettings(): DichopticSettings;
  applySettings(settings: Partial<DichopticSettings>): void;
  getScore(): ScoreInfo;
  getState(): GameState;
  destroy(): void;
}

export interface CreateGameOptions {
  board: HTMLElement;
  nextCanvas?: HTMLCanvasElement | null;
  subNextCanvas?: HTMLCanvasElement | null;
  settings?: Partial<DichopticSettings>;
}

/**
 * 'paddle'/'pointer' games drive movement by reading pointer/touch position
 * directly off their own board element (see GameController implementations);
 * TouchControls renders no directional buttons for them.
 */
export type ControlScheme = 'tetris' | 'paddle' | 'pointer' | 'glider';

export interface GameDefinition {
  id: string;
  nameKey: StringKey;
  descKey: StringKey;
  screenshot: string;
  controlScheme: ControlScheme;
  /** Whether the HUD shows next-piece previews. */
  hasPreview: boolean;
  /** Board aspect ratio as width / height (e.g. 0.5 for a 1:2 well). */
  boardAspect: number;
  create(opts: CreateGameOptions): GameController;
}
