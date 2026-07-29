/**
 * Bridge Dock — anaglyph dodge game for amblyopia training.
 *
 * Ported from FUENTES/bridge dock/js/script.js. A neutral ball follows the
 * cursor/touch position; 5 falling rectangles per eye-color (the source
 * allocates 20 per color but its game loop only ever iterates indices 0..4 —
 * ported faithfully as 5 active per color) drop from the top at independent
 * random x positions/widths and wrap to a new random spot once they scroll
 * past the board. Losing = the cursor overlaps any rectangle.
 *
 * Two faithfulness notes vs. a literal read of the source:
 * - The source writes `this.speed` in `touchEdge()` but `move()` always
 *   reads the *global* `xspeed` (only changed by a difficulty dropdown, not
 *   automatically) — so despite appearances, obstacles do NOT actually speed
 *   up over time in the shipped game. Ported as a constant fall speed.
 * - `update()`'s `if (mouseY < pheight/2+20) { mouseX = this.xPosition; ... }`
 *   branch references `this.xPosition` outside of any `fallingRectangle`
 *   instance (dead/broken code, `this` isn't bound there) — not ported.
 *
 * Geometry is normalised (0..1), matching the rest of this app's engine, so
 * the wrap-past-bottom check uses the board's actual bottom edge rather than
 * the source's hardcoded `yPosition > 600` pixel threshold.
 */
import { CanvasLayers } from '@/engine/canvasLayers';
import { defaultDichopticSettings, type DichopticSettings } from '@/engine/dichoptic';
import { Emitter } from '@/engine/emitter';
import { fitBox } from '@/engine/fit';
import { requestAnimFrame } from '@/engine/raf';
import { SoundManager } from '@/engine/sound';
import type { GameState, InputAction, ScoreInfo } from '../types';

export type BridgeDockEvents = {
  score: ScoreInfo;
  levelup: { level: number };
  gameover: ScoreInfo;
  statechange: GameState;
  settingschange: DichopticSettings;
  ready: void;
};

export interface BridgeDockOptions {
  board: HTMLElement;
  settings?: Partial<DichopticSettings>;
  soundBasePath?: string;
  enableKeyboard?: boolean;
  pauseOnBlur?: boolean;
}

interface Obstacle {
  x: number; // normalised left edge
  y: number; // normalised top edge
  w: number;
}

type LayerName = 'back' | 'obstacles' | 'active' | 'message';

const ACTIVE_PER_COLOR = 5; // source allocates 20/color but only ever animates the first 5
const RECT_W_MIN = 0.09;
const RECT_W_MAX = 0.2;
const RECT_H = 0.035;
const FALL_SPEED = 0.15; // normalised units/sec (constant — see file header)
const BALL_R = 0.028;
const KEYBOARD_STEP = 0.04; // new: source had no keyboard support at all

export class BridgeDockGame {
  readonly events = new Emitter<BridgeDockEvents>();

  private board: HTMLElement;
  private layers: CanvasLayers<LayerName>;
  private sounds: SoundManager<'background' | 'denied'>;
  private settings: DichopticSettings;
  private aspect = 0.75;

  private width = 0;
  private height = 0;

  private cyanObstacles: Obstacle[] = [];
  private redObstacles: Obstacle[] = [];
  private cursorX = 0.5;
  private cursorY = 0.5;

  private elapsedSec = 0;
  private hit = false;

  private paused = true;
  private starting = false;
  private canPlay = false;
  private alive = true;
  private lastFrame = 0;
  private startTimers: ReturnType<typeof setTimeout>[] = [];

  private enableKeyboard: boolean;
  private pauseOnBlur: boolean;

  constructor(opts: BridgeDockOptions) {
    this.board = opts.board;
    this.enableKeyboard = opts.enableKeyboard ?? true;
    this.pauseOnBlur = opts.pauseOnBlur ?? true;
    this.settings = { ...defaultDichopticSettings(), ...opts.settings };

    this.layers = new CanvasLayers<LayerName>(this.board, ['back', 'obstacles', 'active', 'message']);
    this.layers.canvases.message.style.transition = 'opacity 0.3s ease';
    this.layers.canvases.message.style.opacity = '0';
    this.board.style.touchAction = 'none';

    this.sounds = new SoundManager(opts.soundBasePath ?? '/assets/bridgedock', {
      background: { file: 'theme.mp3', loop: true },
      denied: { file: 'denied.mp3' },
    });

    this.resetGame();
    this.resize();
    this.board.addEventListener('pointerdown', this.onPointerDown);
    this.board.addEventListener('pointermove', this.onPointerMove);
    if (this.enableKeyboard) document.addEventListener('keydown', this.onKeyDown);
    if (this.pauseOnBlur) window.addEventListener('blur', this.onBlur);
    this.lastFrame = performance.now();
    requestAnimFrame(this.loop);
    this.events.emit('ready', undefined);
    this.emitState();
  }

  destroy(): void {
    this.alive = false;
    this.startTimers.forEach(clearTimeout);
    this.board.removeEventListener('pointerdown', this.onPointerDown);
    this.board.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('blur', this.onBlur);
    this.sounds.destroy();
    this.layers.destroy();
    this.events.clear();
  }

  // ---- setup --------------------------------------------------------------

  resetGame = (): void => {
    this.elapsedSec = 0;
    this.hit = false;
    this.cursorX = 0.5;
    this.cursorY = 0.5;
    this.sounds.stop('background');
    this.cyanObstacles = this.makeObstacles();
    this.redObstacles = this.makeObstacles();
    this.refreshScore();
    this.pause();
    this.drawBack();
  };

  private makeObstacles(): Obstacle[] {
    return Array.from({ length: ACTIVE_PER_COLOR }, () => this.spawnObstacle());
  }

  private spawnObstacle(): Obstacle {
    return {
      x: Math.random() * (1 - RECT_W_MAX),
      y: -Math.random() * 0.8 - 0.05,
      w: RECT_W_MIN + Math.random() * (RECT_W_MAX - RECT_W_MIN),
    };
  }

  // ---- input ----------------------------------------------------------------

  input(_action: InputAction): void {
    // Position is driven by pointer drag / keyboard nudging (below); no discrete actions used.
    void _action;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.board.setPointerCapture(e.pointerId);
    this.movePointerTo(e);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.buttons === 0 && e.pointerType === 'mouse') {
      // Mice: track hover too (matches source's plain mousemove listener).
      this.movePointerTo(e);
      return;
    }
    this.movePointerTo(e);
  };

  private movePointerTo(e: PointerEvent): void {
    if (!this.canPlay) return;
    const rect = this.board.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.cursorX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    this.cursorY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.canPlay) return;
    switch (e.code) {
      case 'ArrowLeft':
        this.cursorX = Math.max(0, this.cursorX - KEYBOARD_STEP);
        break;
      case 'ArrowRight':
        this.cursorX = Math.min(1, this.cursorX + KEYBOARD_STEP);
        break;
      case 'ArrowUp':
        this.cursorY = Math.max(0, this.cursorY - KEYBOARD_STEP);
        break;
      case 'ArrowDown':
        this.cursorY = Math.min(1, this.cursorY + KEYBOARD_STEP);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  private onBlur = () => {
    if (!this.paused) this.pause();
  };

  // ---- loop -----------------------------------------------------------------

  private loop = (now: number): void => {
    if (!this.alive) return;
    requestAnimFrame(this.loop);
    const dt = Math.min(1 / 20, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.canPlay) this.update(dt);
    this.draw();
  };

  private update(dt: number): void {
    this.elapsedSec += dt;
    this.refreshScore();

    for (const o of this.cyanObstacles) this.advance(o, dt);
    for (const o of this.redObstacles) this.advance(o, dt);

    if (this.checkHit(this.cyanObstacles) || this.checkHit(this.redObstacles)) {
      this.gameOver();
    }
  }

  private advance(o: Obstacle, dt: number): void {
    o.y += FALL_SPEED * dt;
    if (o.y > 1 + RECT_H) {
      const fresh = this.spawnObstacle();
      o.x = fresh.x;
      o.y = fresh.y;
      o.w = fresh.w;
    }
  }

  private checkHit(obstacles: Obstacle[]): boolean {
    const r = BALL_R;
    return obstacles.some((o) => this.cursorX + r > o.x && this.cursorX - r < o.x + o.w && this.cursorY + r > o.y && this.cursorY - r < o.y + RECT_H);
  }

  private gameOver(): void {
    this.hit = true;
    this.canPlay = false;
    this.paused = true;
    this.sounds.stop('background');
    this.sounds.play('denied');
    this.events.emit('gameover', this.getScore());
    this.emitState();
  }

  // ---- rendering --------------------------------------------------------

  private clear(name: LayerName) {
    this.layers.ctx[name].clearRect(0, 0, this.width, this.height);
  }

  private draw(): void {
    this.drawObstacles();
    this.drawActive();
  }

  private drawBack(): void {
    this.layers.canvases.back.style.background = this.settings.color[0];
  }

  private drawObstacles(): void {
    const ctx = this.layers.ctx.obstacles;
    this.clear('obstacles');
    const cyanColor = this.settings.color[1] + this.settings.opacity[1];
    const redColor = this.settings.color[2] + this.settings.opacity[2];
    ctx.fillStyle = cyanColor;
    for (const o of this.cyanObstacles) ctx.fillRect(o.x * this.width, o.y * this.height, o.w * this.width, RECT_H * this.height);
    ctx.fillStyle = redColor;
    for (const o of this.redObstacles) ctx.fillRect(o.x * this.width, o.y * this.height, o.w * this.width, RECT_H * this.height);
  }

  private drawActive(): void {
    if (this.hit) return;
    const ctx = this.layers.ctx.active;
    this.clear('active');
    ctx.fillStyle = this.settings.color[3];
    ctx.beginPath();
    ctx.arc(this.cursorX * this.width, this.cursorY * this.height, BALL_R * this.width, 0, Math.PI * 2);
    ctx.fill();
  }

  private setMessage(text: string, font?: string) {
    const ctx = this.layers.ctx.message;
    this.clear('message');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = this.width / 40;
    const f = font ?? `bold ${this.width * 0.16}px Arial`;
    ctx.font = f;
    const offsetY = Number(f.match(/\d+/)?.[0] ?? 0) / 2 - 6;
    ctx.strokeText(text, this.width / 2, this.height / 2 + offsetY);
    ctx.fillText(text, this.width / 2, this.height / 2 + offsetY);
    this.layers.canvases.message.style.opacity = '1';
  }

  private hideMessage() {
    this.layers.canvases.message.style.opacity = '0';
    setTimeout(() => this.clear('message'), 300);
  }

  // ---- state / controls -------------------------------------------------

  resize = (): void => {
    const bw = this.board.clientWidth || 300;
    const bh = this.board.clientHeight || 400;
    const { width, height } = fitBox(bw, bh, this.aspect);
    this.width = width;
    this.height = height;
    this.layers.resize(width, height);
    this.drawBack();
    this.draw();
  };

  togglePause = (): void => {
    if (this.paused) this.resume();
    else this.pause();
  };

  pause = (): void => {
    this.paused = true;
    this.starting = false;
    this.canPlay = false;
    this.sounds.stop('background');
    this.startTimers.forEach(clearTimeout);
    this.startTimers = [];
    this.setMessage('❚❚', `bold ${this.width * 0.12}px Arial`);
    this.emitState();
  };

  resume = (): void => {
    if (!this.paused || this.starting) return;
    if (this.hit) this.resetGame();
    this.paused = false;
    this.starting = true;
    this.emitState();
    const step = (label: string, after: () => void) => {
      this.setMessage(label);
      this.startTimers.push(
        setTimeout(() => {
          if (!this.starting || !this.alive) return;
          after();
        }, 350)
      );
    };
    step('3', () =>
      step('2', () =>
        step('1', () => {
          this.starting = false;
          this.hideMessage();
          this.sounds.loop('background');
          this.canPlay = true;
          this.lastFrame = performance.now();
          this.emitState();
        })
      )
    );
  };

  setMuted = (muted: boolean): void => {
    this.sounds.setMuted(muted);
    if (!muted && this.canPlay) this.sounds.loop('background');
    this.emitState();
  };

  getState = (): GameState => ({
    paused: this.paused,
    starting: this.starting,
    playing: this.canPlay && !this.paused,
    muted: this.sounds.muted,
  });

  getScore = (): ScoreInfo => ({ points: Math.round(this.elapsedSec * 100), level: 1 });

  getSettings = (): DichopticSettings => structuredClone(this.settings);

  applySettings = (next: Partial<DichopticSettings>): void => {
    this.settings = { ...this.settings, ...next };
    this.drawBack();
    this.draw();
    this.events.emit('settingschange', this.getSettings());
  };

  private refreshScore() {
    this.events.emit('score', this.getScore());
  }

  private emitState() {
    this.events.emit('statechange', this.getState());
  }
}
