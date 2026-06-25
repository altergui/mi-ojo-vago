/**
 * Amblyonoid — anaglyph Breakout/Arkanoid for amblyopia training.
 *
 * Built fresh on the shared dichoptic engine (the original repo is no longer
 * public). It reuses the same colour/contrast/variant model as Amblyotris:
 * bricks are drawn alternating cyan/red so each eye, behind its lens, sees a
 * different set; the contrast (opacity) of each colour is the training control.
 * Paddle and ball are neutral grey so both eyes can track play.
 *
 * Geometry is normalised (0..1) so it is resolution-independent on resize.
 */
import { CanvasLayers } from '@/engine/canvasLayers';
import { defaultDichopticSettings, type DichopticSettings, type PointVariant } from '@/engine/dichoptic';
import { Emitter } from '@/engine/emitter';
import { fitBox } from '@/engine/fit';
import { requestAnimFrame } from '@/engine/raf';
import { SoundManager } from '@/engine/sound';
import type { GameState, InputAction, ScoreInfo } from '../types';

export type AmblyonoidEvents = {
  score: ScoreInfo;
  levelup: { level: number };
  gameover: ScoreInfo;
  statechange: GameState;
  settingschange: DichopticSettings;
  ready: void;
};

export interface AmblyonoidOptions {
  board: HTMLElement;
  settings?: Partial<DichopticSettings>;
  soundBasePath?: string;
  enableKeyboard?: boolean;
  pauseOnBlur?: boolean;
}

interface Brick {
  cx: number; // center x (normalised)
  cy: number;
  w: number;
  h: number;
  color: string; // hex w/o alpha
  colorIndex: 1 | 2; // cyan | red
  variant: PointVariant;
  alive: boolean;
}

type LayerName = 'back' | 'stack' | 'active' | 'front' | 'message';

const BRICK_COLS = 7;
const BRICK_ROWS = 5;
const PADDLE_W = 0.2;
const PADDLE_H = 0.025;
const PADDLE_Y = 0.94;
const BALL_R = 0.018;
const PADDLE_SPEED = 1.3; // per second (keyboard hold)
const PADDLE_STEP = 0.06; // per discrete input (touch)
const BASE_BALL_SPEED = 0.62; // per second

export class AmblyonoidGame {
  readonly events = new Emitter<AmblyonoidEvents>();

  private board: HTMLElement;
  private layers: CanvasLayers<LayerName>;
  private sounds: SoundManager<'background' | 'success' | 'denied' | 'tap'>;
  private settings: DichopticSettings;
  private aspect = 2 / 3;

  private width = 0;
  private height = 0;

  private bricks: Brick[] = [];
  private paddleX = 0.5;
  private moveDir = 0; // -1 left, +1 right (keyboard)
  private ballX = 0.5;
  private ballY = PADDLE_Y - PADDLE_H / 2 - BALL_R;
  private ballVX = 0;
  private ballVY = 0;
  private stuck = true; // ball resting on paddle, awaiting launch

  private scorePoints = 0;
  private level = 1;
  private lives = 3;

  private paused = true;
  private starting = false;
  private canPlay = false;
  private alive = true;
  private lastFrame = 0;
  private startTimers: ReturnType<typeof setTimeout>[] = [];

  private enableKeyboard: boolean;
  private pauseOnBlur: boolean;

  constructor(opts: AmblyonoidOptions) {
    this.board = opts.board;
    this.enableKeyboard = opts.enableKeyboard ?? true;
    this.pauseOnBlur = opts.pauseOnBlur ?? true;
    this.settings = { ...defaultDichopticSettings(), ...opts.settings };

    this.layers = new CanvasLayers<LayerName>(this.board, ['back', 'stack', 'active', 'front', 'message']);
    this.layers.canvases.message.style.transition = 'opacity 0.3s ease';
    this.layers.canvases.message.style.opacity = '0';

    this.sounds = new SoundManager(opts.soundBasePath ?? '/assets/amblyotris', {
      background: { file: 'theme.mp3', loop: true },
      success: { file: 'success.wav' },
      denied: { file: 'denied.wav' },
      tap: { file: 'tap.wav' },
    });

    this.resetGame();
    this.resize();
    if (this.enableKeyboard) {
      document.addEventListener('keydown', this.onKeyDown);
      document.addEventListener('keyup', this.onKeyUp);
    }
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
    window.removeEventListener('blur', this.onBlur);
    this.sounds.destroy();
    this.layers.destroy();
    this.events.clear();
  }

  // ---- setup ------------------------------------------------------------

  resetGame = (): void => {
    this.scorePoints = 0;
    this.level = 1;
    this.lives = 3;
    this.sounds.stop('background');
    this.buildBricks();
    this.resetBall();
    this.refreshScore();
    this.pause();
  };

  private buildBricks() {
    this.bricks = [];
    const top = 0.1;
    const areaH = 0.4;
    const marginX = 0.04;
    const gap = 0.012;
    const cellW = (1 - marginX * 2) / BRICK_COLS;
    const cellH = areaH / BRICK_ROWS;
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const colorIndex: 1 | 2 = (r + c) % 2 === 0 ? 1 : 2;
        this.bricks.push({
          cx: marginX + cellW * (c + 0.5),
          cy: top + cellH * (r + 0.5),
          w: cellW - gap,
          h: cellH - gap,
          color: this.settings.color[colorIndex],
          colorIndex,
          variant: this.settings.variant,
          alive: true,
        });
      }
    }
  }

  private resetBall() {
    this.stuck = true;
    this.paddleX = 0.5;
    this.ballX = 0.5;
    this.ballY = PADDLE_Y - PADDLE_H / 2 - BALL_R;
    this.ballVX = 0;
    this.ballVY = 0;
  }

  private launch() {
    if (!this.stuck || !this.canPlay) return;
    this.stuck = false;
    const speed = this.ballSpeed();
    this.ballVX = speed * 0.35 * (Math.random() < 0.5 ? -1 : 1);
    this.ballVY = -Math.sqrt(Math.max(0, speed * speed - this.ballVX * this.ballVX));
  }

  private ballSpeed(): number {
    return BASE_BALL_SPEED + (this.level - 1) * 0.08;
  }

  // ---- input ------------------------------------------------------------

  input(action: InputAction): void {
    switch (action) {
      case 'left':
        this.paddleX = Math.max(PADDLE_W / 2, this.paddleX - PADDLE_STEP);
        break;
      case 'right':
        this.paddleX = Math.min(1 - PADDLE_W / 2, this.paddleX + PADDLE_STEP);
        break;
      case 'launch':
      case 'drop':
        this.launch();
        break;
      case 'rotate':
      case 'down':
        break;
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft') this.moveDir = -1;
    else if (e.code === 'ArrowRight') this.moveDir = 1;
    else if (e.code === 'Space') {
      e.preventDefault();
      this.launch();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if ((e.code === 'ArrowLeft' && this.moveDir < 0) || (e.code === 'ArrowRight' && this.moveDir > 0)) {
      this.moveDir = 0;
    }
  };

  private onBlur = () => {
    if (!this.paused) this.pause();
  };

  // ---- loop -------------------------------------------------------------

  private loop = (now: number): void => {
    if (!this.alive) return;
    requestAnimFrame(this.loop);
    const dt = Math.min(1 / 30, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.canPlay) this.update(dt);
    this.draw();
  };

  private update(dt: number) {
    // Paddle (keyboard hold)
    if (this.moveDir !== 0) {
      this.paddleX = Math.min(1 - PADDLE_W / 2, Math.max(PADDLE_W / 2, this.paddleX + this.moveDir * PADDLE_SPEED * dt));
    }
    if (this.stuck) {
      this.ballX = this.paddleX;
      return;
    }

    this.ballX += this.ballVX * dt;
    this.ballY += this.ballVY * dt;

    // Walls
    if (this.ballX - BALL_R < 0) {
      this.ballX = BALL_R;
      this.ballVX = Math.abs(this.ballVX);
    } else if (this.ballX + BALL_R > 1) {
      this.ballX = 1 - BALL_R;
      this.ballVX = -Math.abs(this.ballVX);
    }
    if (this.ballY - BALL_R < 0) {
      this.ballY = BALL_R;
      this.ballVY = Math.abs(this.ballVY);
    }

    // Paddle collision
    const paddleTop = PADDLE_Y - PADDLE_H / 2;
    if (
      this.ballVY > 0 &&
      this.ballY + BALL_R >= paddleTop &&
      this.ballY < PADDLE_Y + PADDLE_H &&
      this.ballX >= this.paddleX - PADDLE_W / 2 &&
      this.ballX <= this.paddleX + PADDLE_W / 2
    ) {
      const speed = this.ballSpeed();
      const rel = (this.ballX - this.paddleX) / (PADDLE_W / 2); // -1..1
      const angle = rel * 1.0; // up to ~57°
      this.ballVX = speed * Math.sin(angle);
      this.ballVY = -Math.abs(speed * Math.cos(angle));
      this.ballY = paddleTop - BALL_R;
      this.sounds.play('tap');
    }

    // Brick collisions (first hit per frame)
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const left = brick.cx - brick.w / 2;
      const right = brick.cx + brick.w / 2;
      const topB = brick.cy - brick.h / 2;
      const bottomB = brick.cy + brick.h / 2;
      if (this.ballX + BALL_R < left || this.ballX - BALL_R > right || this.ballY + BALL_R < topB || this.ballY - BALL_R > bottomB) {
        continue;
      }
      brick.alive = false;
      this.scorePoints += 10;
      this.refreshScore();
      this.sounds.play('success');
      // Decide bounce axis by smallest overlap
      const overlapX = Math.min(right - (this.ballX - BALL_R), this.ballX + BALL_R - left);
      const overlapY = Math.min(bottomB - (this.ballY - BALL_R), this.ballY + BALL_R - topB);
      if (overlapX < overlapY) this.ballVX = -this.ballVX;
      else this.ballVY = -this.ballVY;
      break;
    }

    // Level complete
    if (this.bricks.every((b) => !b.alive)) {
      this.level++;
      this.events.emit('levelup', { level: this.level });
      this.buildBricks();
      this.resetBall();
      this.refreshScore();
      return;
    }

    // Ball lost
    if (this.ballY - BALL_R > 1) {
      this.lives--;
      this.refreshScore();
      this.sounds.play('denied');
      if (this.lives <= 0) {
        this.canPlay = false;
        this.paused = true;
        this.sounds.stop('background');
        this.events.emit('gameover', this.getScore());
        this.emitState();
        return;
      }
      this.resetBall();
    }
  }

  // ---- rendering --------------------------------------------------------

  private clear(name: LayerName) {
    this.layers.ctx[name].clearRect(0, 0, this.width, this.height);
  }

  private draw() {
    this.drawBack();
    this.drawBricks();
    this.drawActive();
  }

  private drawBack() {
    this.layers.canvases.back.style.background = this.settings.color[0];
  }

  private drawBricks() {
    const ctx = this.layers.ctx.stack;
    this.clear('stack');
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const alpha = this.settings.opacity[brick.colorIndex];
      this.drawCell(ctx, brick.cx, brick.cy, brick.w, brick.h, brick.color + alpha, brick.variant);
    }
  }

  private drawActive() {
    const ctx = this.layers.ctx.active;
    this.clear('active');
    // Paddle (neutral grey, full contrast)
    this.drawCell(ctx, this.paddleX, PADDLE_Y, PADDLE_W, PADDLE_H, this.settings.color[3], 'fullColor');
    // Ball
    ctx.fillStyle = this.settings.color[3];
    ctx.beginPath();
    ctx.arc(this.ballX * this.width, this.ballY * this.height, BALL_R * this.width, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Draws a rectangle in normalised coords, honouring the dichoptic variant. */
  private drawCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, color: string, variant: PointVariant) {
    const x = (cx - w / 2) * this.width;
    const y = (cy - h / 2) * this.height;
    const pw = w * this.width;
    const ph = h * this.height;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, pw, ph);
    const bw = Math.min(pw, ph) / 5;
    if (variant !== 'fullColor') {
      ctx.clearRect(x + bw, y + bw, pw - bw * 2, ph - bw * 2);
    }
    if (variant === 'veryHighContrast') {
      ctx.fillRect(x + pw / 2 - bw / 2, y + bw, bw, ph - bw * 2);
    }
  }

  private setMessage(text: string, font?: string) {
    const ctx = this.layers.ctx.message;
    this.clear('message');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = this.width / 40;
    const f = font ?? `bold ${this.width * 0.22}px Arial`;
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
    const bh = this.board.clientHeight || 450;
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
    this.setMessage('❚❚', `bold ${this.width * 0.12}px Arial`);
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

  getScore = (): ScoreInfo => ({ points: this.scorePoints, level: this.level, lives: this.lives });

  getSettings = (): DichopticSettings => structuredClone(this.settings);

  applySettings = (next: Partial<DichopticSettings>): void => {
    this.settings = { ...this.settings, ...next };
    // Recolour existing bricks
    for (const brick of this.bricks) {
      brick.color = this.settings.color[brick.colorIndex];
      brick.variant = this.settings.variant;
    }
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
