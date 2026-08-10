/**
 * Flying Bird — anaglyph hold-to-glide dodger for amblyopia training.
 *
 * Ported from FUENTES/flying bird/js/script.js: the bird moves only
 * vertically (holding ArrowUp/ArrowDown glides up/down at constant speed,
 * releasing stops it — no gravity, unlike classic tap-physics flappy bird),
 * dodging paired pipes that scroll in from the right. Each pipe pair is
 * drawn one bar per eye colour (top = one eye, bottom = the other) so each
 * eye, behind its lens, must track a different obstacle.
 *
 * The original's pixel-space obstacle sizing (canvas width/height in raw
 * px, including a width/height mixup in the bottom-bar height calc) is
 * reproduced here as normalised (0..1) proportions instead, since this
 * engine is resolution-independent by design — the intent (top bar random
 * height, bottom bar fills the remaining gap to the floor) is preserved.
 *
 * The bird itself is drawn as a plain vector circle (neutral grey) rather
 * than porting the original's raster PNG bird-colour picker, which is
 * superseded by this app's shared Settings/Calibration screens.
 *
 * Mouse control (new, not in the original): like BridgeDockGame, a mouse
 * hovering the board directly positions the bird at the cursor's vertical
 * position (no glide physics) rather than requiring arrow-key holds.
 * Restricted to `pointerType === 'mouse'` so it doesn't fight with the
 * touch up/down buttons (TouchControls' 'glider' scheme) on mobile.
 */
import { CanvasLayers } from '@/engine/canvasLayers';
import { defaultDichopticSettings, type DichopticSettings } from '@/engine/dichoptic';
import { Emitter } from '@/engine/emitter';
import { fitBox } from '@/engine/fit';
import { requestAnimFrame } from '@/engine/raf';
import { SoundManager } from '@/engine/sound';
import type { GameState, InputAction, ScoreInfo } from '../types';

export type FlyingBirdEvents = {
  score: ScoreInfo;
  levelup: { level: number };
  gameover: ScoreInfo;
  statechange: GameState;
  settingschange: DichopticSettings;
  ready: void;
};

export interface FlyingBirdOptions {
  board: HTMLElement;
  settings?: Partial<DichopticSettings>;
  soundBasePath?: string;
  enableKeyboard?: boolean;
  pauseOnBlur?: boolean;
}

interface Pipe {
  x: number; // leading (right) edge, normalised
  gapTop: number; // top of the gap (normalised 0..1)
  gapBottom: number;
  scored: boolean;
}

type LayerName = 'back' | 'stack' | 'active' | 'message';

const BIRD_X = 0.25; // fixed horizontal position (world scrolls past it)
const BIRD_R = 0.035;
const GLIDE_SPEED = 0.42; // normalised units / second
const PIPE_W = 0.09;
const PIPE_SPEED = 0.22; // normalised units / second
const SPAWN_EVERY = 1.7; // seconds, ~= original's "every 100 frames" at 20ms/frame
const GAP_MIN = 0.16;
const GAP_MAX = 0.28;
const TOP_MIN = 0.06;
const TOP_MAX = 0.4;
// Touch buttons send discrete repeated taps (~90ms apart) rather than real
// key-up events; treat "no tap for this long" as release.
const TOUCH_RELEASE_MS = 160;

export class FlyingBirdGame {
  readonly events = new Emitter<FlyingBirdEvents>();

  private board: HTMLElement;
  private layers: CanvasLayers<LayerName>;
  private sounds: SoundManager<'background' | 'denied'>;
  private settings: DichopticSettings;
  private aspect = 4 / 3;

  private width = 0;
  private height = 0;

  private birdY = 0.45;
  private keyDir = 0; // -1 up, +1 down, 0 none (keyboard)
  private touchDir = 0;
  private touchReleaseAt = 0;

  private pipes: Pipe[] = [];
  private spawnTimer = 0;
  private elapsed = 0;

  private scorePoints = 0;

  private paused = true;
  private starting = false;
  private canPlay = false;
  private alive = true;
  private lastFrame = 0;
  private startTimers: ReturnType<typeof setTimeout>[] = [];

  private enableKeyboard: boolean;
  private pauseOnBlur: boolean;

  constructor(opts: FlyingBirdOptions) {
    this.board = opts.board;
    this.enableKeyboard = opts.enableKeyboard ?? true;
    this.pauseOnBlur = opts.pauseOnBlur ?? true;
    this.settings = { ...defaultDichopticSettings(), ...opts.settings };

    this.layers = new CanvasLayers<LayerName>(this.board, ['back', 'stack', 'active', 'message']);
    this.layers.canvases.message.style.transition = 'opacity 0.3s ease';
    this.layers.canvases.message.style.opacity = '0';

    this.sounds = new SoundManager(opts.soundBasePath ?? '/assets/flyingbird', {
      background: { file: 'theme.mp3', loop: true },
      denied: { file: 'denied.mp3' },
    });

    this.resetGame();
    this.resize();
    if (this.enableKeyboard) {
      document.addEventListener('keydown', this.onKeyDown);
      document.addEventListener('keyup', this.onKeyUp);
    }
    this.board.addEventListener('pointermove', this.onPointerMove);
    if (this.pauseOnBlur) window.addEventListener('blur', this.onBlur);
    this.lastFrame = performance.now();
    requestAnimFrame(this.loop);
    this.events.emit('ready', undefined);
    this.emitState();
  }

  destroy(): void {
    this.alive = false;
    this.startTimers.forEach(clearTimeout);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.board.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('blur', this.onBlur);
    this.sounds.destroy();
    this.layers.destroy();
    this.events.clear();
  }

  // ---- setup --------------------------------------------------------------

  resetGame = (): void => {
    this.scorePoints = 0;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.birdY = 0.45;
    this.keyDir = 0;
    this.touchDir = 0;
    this.pipes = [];
    this.sounds.stop('background');
    this.refreshScore();
    this.pause();
  };

  // ---- input ----------------------------------------------------------------

  input(action: InputAction): void {
    switch (action) {
      case 'up':
        this.touchDir = -1;
        this.touchReleaseAt = performance.now() + TOUCH_RELEASE_MS;
        break;
      case 'down':
        this.touchDir = 1;
        this.touchReleaseAt = performance.now() + TOUCH_RELEASE_MS;
        break;
      case 'left':
      case 'right':
      case 'rotate':
      case 'drop':
      case 'launch':
        break; // not used by Flying Bird
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowUp') this.keyDir = -1;
    else if (e.code === 'ArrowDown') this.keyDir = 1;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if ((e.code === 'ArrowUp' && this.keyDir < 0) || (e.code === 'ArrowDown' && this.keyDir > 0)) {
      this.keyDir = 0;
    }
  };

  private onBlur = () => {
    if (!this.paused) this.pause();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.canPlay || e.pointerType !== 'mouse') return;
    const rect = this.board.getBoundingClientRect();
    if (rect.height === 0) return;
    const y = (e.clientY - rect.top) / rect.height;
    this.birdY = Math.min(1 - BIRD_R, Math.max(BIRD_R, y));
  };

  private currentDir(): number {
    if (this.keyDir !== 0) return this.keyDir;
    if (this.touchDir !== 0 && performance.now() < this.touchReleaseAt) return this.touchDir;
    if (performance.now() >= this.touchReleaseAt) this.touchDir = 0;
    return 0;
  }

  // ---- loop -----------------------------------------------------------------

  private loop = (now: number): void => {
    if (!this.alive) return;
    requestAnimFrame(this.loop);
    const dt = Math.min(1 / 20, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.canPlay) this.update(dt);
    this.draw();
  };

  private update(dt: number) {
    // Bird glide
    const dir = this.currentDir();
    this.birdY = Math.min(1 - BIRD_R, Math.max(BIRD_R, this.birdY + dir * GLIDE_SPEED * dt));

    // Spawn pipes
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_EVERY;
      const gap = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
      const top = TOP_MIN + Math.random() * (TOP_MAX - TOP_MIN);
      this.pipes.push({ x: 1 + PIPE_W, gapTop: top, gapBottom: Math.min(1, top + gap), scored: false });
    }

    // Move + score + collide
    for (const pipe of this.pipes) {
      pipe.x -= PIPE_SPEED * dt;
      if (!pipe.scored && pipe.x + PIPE_W / 2 < BIRD_X) {
        pipe.scored = true;
      }
      const overlapsX = BIRD_X + BIRD_R > pipe.x - PIPE_W / 2 && BIRD_X - BIRD_R < pipe.x + PIPE_W / 2;
      if (overlapsX) {
        const hitsTop = this.birdY - BIRD_R < pipe.gapTop;
        const hitsBottom = this.birdY + BIRD_R > pipe.gapBottom;
        if (hitsTop || hitsBottom) {
          this.onCrash();
          return;
        }
      }
    }
    this.pipes = this.pipes.filter((p) => p.x + PIPE_W > 0);

    this.elapsed += dt;
    this.scorePoints = Math.floor(this.elapsed * 10);
    this.refreshScore();
  }

  private onCrash() {
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

  private draw() {
    this.drawBack();
    this.drawPipes();
    this.drawActive();
  }

  private drawBack() {
    this.layers.canvases.back.style.background = this.settings.color[0];
  }

  private drawPipes() {
    const ctx = this.layers.ctx.stack;
    this.clear('stack');
    for (const pipe of this.pipes) {
      const x = (pipe.x - PIPE_W / 2) * this.width;
      const w = PIPE_W * this.width;
      // Top bar: one eye's colour
      const topAlpha = this.settings.opacity[1];
      ctx.fillStyle = this.settings.color[1] + topAlpha;
      ctx.fillRect(x, 0, w, pipe.gapTop * this.height);
      // Bottom bar: the other eye's colour
      const botAlpha = this.settings.opacity[2];
      ctx.fillStyle = this.settings.color[2] + botAlpha;
      ctx.fillRect(x, pipe.gapBottom * this.height, w, this.height - pipe.gapBottom * this.height);
    }
  }

  private drawActive() {
    const ctx = this.layers.ctx.active;
    this.clear('active');
    ctx.fillStyle = this.settings.color[3];
    ctx.beginPath();
    ctx.arc(BIRD_X * this.width, this.birdY * this.height, BIRD_R * this.width, 0, Math.PI * 2);
    ctx.fill();
  }

  private setMessage(text: string, font?: string) {
    const ctx = this.layers.ctx.message;
    this.clear('message');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = this.width / 80;
    const f = font ?? `bold ${this.width * 0.1}px Arial`;
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
    const bw = this.board.clientWidth || 400;
    const bh = this.board.clientHeight || 300;
    const { width, height } = fitBox(bw, bh, this.aspect);
    this.width = width;
    this.height = height;
    this.layers.resize(width, height);
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
    this.setMessage('❚❚', `bold ${this.width * 0.08}px Arial`);
    this.emitState();
  };

  resume = (): void => {
    if (!this.paused || this.starting) return;
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

  getScore = (): ScoreInfo => ({ points: this.scorePoints, level: 1 });

  getSettings = (): DichopticSettings => structuredClone(this.settings);

  applySettings = (next: Partial<DichopticSettings>): void => {
    this.settings = { ...this.settings, ...next };
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
