/**
 * Amblyonoid — anaglyph Breakout/Arkanoid for amblyopia training.
 *
 * Rebuilt to match the real deployed source (FUENTES/ark, a webpack bundle of
 * Game/Ball/Paddle/Brick/Pill/Physics/levels classes), not just the shared
 * dichoptic model. All game-space math uses the original's virtual 1000
 * (wide) x 1500 (tall) coordinate space — matches this game's 2:3 board
 * aspect exactly — and is scaled to pixels only at draw time
 * (`px = virtual * this.width / 1000`), same as the source's `* clientWidth /
 * 1000` pattern.
 *
 * Bricks render neutral grey (settings.color[3]); the dichoptic split lives
 * on paddle (color[1]) vs ball (color[2]) instead — this is the core fidelity
 * fix over the previous from-scratch build, which colored bricks cyan/red.
 */
import { CanvasLayers } from '@/engine/canvasLayers';
import { defaultDichopticSettings, type DichopticSettings } from '@/engine/dichoptic';
import { Emitter } from '@/engine/emitter';
import { fitBox } from '@/engine/fit';
import { requestAnimFrame } from '@/engine/raf';
import { SoundManager } from '@/engine/sound';
import { randomInRange } from '@/engine/utils';
import type { GameState, InputAction, ScoreInfo } from '../types';
import { CODE_HITS, LEVELS } from './levels';

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

type LayerName = 'back' | 'stack' | 'active' | 'front' | 'message';

// ---- virtual-space geometry (ported constants from the real source) ------
const VW = 1000;
const VH = 1500;
const COLS = 9;
const CELL_W = VW / COLS;
const CELL_H = CELL_W * 0.7;
const MAX_BALL_SPEED = 2000;
const PADDLE_KEY_SPEED = 20 * 60; // source moved paddle 20/frame; scaled to units/sec for dt-independence

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

type Side = 'left' | 'right' | 'top' | 'bottom';
interface InterceptPoint {
  x: number;
  y: number;
  side: Side;
}

// ---- tiny physics helpers (ported from physics.ts) ------------------------

function magnitude(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Normalizes (x,y) to a unit vector (direction only; speed is tracked separately on Ball). */
function normalizeDir(x: number, y: number): { x: number; y: number } {
  const m = magnitude(x, y);
  if (m === 0) return { x: 0, y: 0 };
  return { x: x / m, y: y / m };
}

function physMove(x: number, y: number, velX: number, velY: number, dt: number) {
  const distX = velX * dt;
  const distY = velY * dt;
  return { x: x + distX, y: y + distY, velX, velY, distX, distY };
}

function segIntercept(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, side: Side): InterceptPoint | null {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  if (ua < 0 || ua > 1) return null;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  if (ub < 0 || ub > 1) return null;
  return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1), side };
}

function ballIntercept(ball: Ball, rect: Rect, distX: number, distY: number): InterceptPoint | null {
  let pt: InterceptPoint | null = null;
  if (distX < 0) {
    pt = segIntercept(ball.x, ball.y, ball.x + distX, ball.y + distY, rect.right + ball.r, rect.top - ball.r, rect.right + ball.r, rect.bottom + ball.r, 'right');
  } else if (distX > 0) {
    pt = segIntercept(ball.x, ball.y, ball.x + distX, ball.y + distY, rect.left - ball.r, rect.top - ball.r, rect.left - ball.r, rect.bottom + ball.r, 'left');
  }
  if (!pt) {
    if (distY < 0) {
      pt = segIntercept(ball.x, ball.y, ball.x + distX, ball.y + distY, rect.left - ball.r, rect.bottom + ball.r, rect.right + ball.r, rect.bottom + ball.r, 'bottom');
    } else if (distY > 0) {
      pt = segIntercept(ball.x, ball.y, ball.x + distX, ball.y + distY, rect.left - ball.r, rect.top - ball.r, rect.right + ball.r, rect.top - ball.r, 'top');
    }
  }
  return pt;
}

function pillIntercept(pill: Pill, rect: Rect, distY: number): InterceptPoint | null {
  if (distY < 0) {
    return segIntercept(pill.x, pill.y, pill.x, pill.y + distY, rect.left - pill.w / 2, rect.bottom + pill.h / 2, rect.right + pill.w / 2, rect.bottom + pill.h / 2, 'bottom');
  } else if (distY > 0) {
    return segIntercept(pill.x, pill.y, pill.x, pill.y + distY, rect.left - pill.w / 2, rect.top - pill.h / 2, rect.right + pill.w / 2, rect.top - pill.h / 2, 'top');
  }
  return null;
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ---- entities (ported from ball.ts / paddle.ts / brick.ts / pill.ts) ------

class Ball implements Rect {
  x: number;
  y: number;
  r: number;
  dirX: number;
  dirY: number;
  speed: number;
  still: boolean;
  inMovement = false;
  growShrinkSize: number;
  left = 0;
  right = 0;
  top = 0;
  bottom = 0;

  constructor(x = 500, y = 1205, r = 20, dirX = 1, dirY = -1.5, speed = 600, still = true) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed = speed;
    this.still = still;
    this.growShrinkSize = r / 4; // matches Paddle's w/4 growth convention
    this.updateBox();
  }

  updateBox() {
    this.left = this.x - this.r;
    this.right = this.x + this.r;
    this.top = this.y - this.r;
    this.bottom = this.y + this.r;
  }

  moveTo(x: number, y?: number) {
    this.x = x;
    if (y !== undefined) this.y = y;
    this.updateBox();
  }

  setDir(velX: number, velY: number) {
    const dir = normalizeDir(velX, velY);
    this.dirX = dir.x;
    this.dirY = dir.y;
    this.inMovement = dir.x !== 0 || dir.y !== 0;
  }

  launch() {
    this.inMovement = true;
    this.still = false;
  }

  grow() {
    this.r += this.growShrinkSize;
    this.updateBox();
  }

  shrink() {
    this.r = Math.max(4, this.r - this.growShrinkSize);
    this.updateBox();
  }

  slowDown() {
    this.speed *= 0.8;
  }

  speedUp() {
    this.speed *= 1.25;
  }

  draw(ctx: CanvasRenderingContext2D, scale: number, color: string) {
    ctx.beginPath();
    ctx.arc(this.x * scale, this.y * scale, this.r * scale, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

class Paddle implements Rect {
  x: number;
  y: number;
  w: number;
  h = 40;
  growShrinkSize: number;
  left = 0;
  right = 0;
  top = 0;
  bottom = 0;

  constructor(x = 500, y = 1245, w = 200) {
    this.w = w;
    this.growShrinkSize = w / 4;
    this.x = Math.min(Math.max(x, w / 2), VW - w / 2);
    this.y = y;
    this.updateBox();
  }

  updateBox() {
    this.left = this.x - this.w / 2;
    this.right = this.x + this.w / 2;
    this.top = this.y - this.h / 2;
    this.bottom = this.y + this.h / 2;
  }

  moveTo(x: number) {
    this.x = Math.min(Math.max(x, this.w / 2), VW - this.w / 2);
    this.updateBox();
  }

  grow() {
    this.w += this.growShrinkSize;
    this.updateBox();
  }

  shrink() {
    this.w = Math.max(40, this.w - this.growShrinkSize);
    this.updateBox();
  }

  draw(ctx: CanvasRenderingContext2D, scale: number, color: string) {
    const x = this.left * scale;
    const y = this.top * scale;
    const w = this.w * scale;
    const h = this.h * scale;
    ctx.fillStyle = color;
    drawRoundRect(ctx, x, y, w, h, h / 2, true, false);
  }
}

class Brick implements Rect {
  x: number; // column index
  y: number; // row index
  hitsNeeded: number; // -1 = indestructible
  hitsLeft: number;
  left = 0;
  right = 0;
  top = 0;
  bottom = 0;

  constructor(hitsNeeded: number, x: number, y: number) {
    this.hitsNeeded = hitsNeeded;
    this.hitsLeft = hitsNeeded;
    this.x = x;
    this.y = y;
    this.updateBox();
  }

  updateBox() {
    this.left = this.x * CELL_W;
    this.right = this.left + CELL_W;
    this.top = this.y * CELL_H;
    this.bottom = this.top + CELL_H;
  }

  drawShadow(ctx: CanvasRenderingContext2D, scale: number) {
    const w = CELL_W * scale;
    const h = CELL_H * scale;
    const x = this.left * scale + w / 7;
    const y = this.top * scale + w / 7;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#666666';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = h / 4;
    drawRoundRect(ctx, x, y, w, h, h / 25, true, false);
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, scale: number, fillStyle: string, strokeStyle: string) {
    const w = CELL_W * scale;
    const h = CELL_H * scale;
    const x = this.left * scale;
    const y = this.top * scale;
    ctx.save();
    ctx.lineWidth = w / 30;
    ctx.strokeStyle = strokeStyle;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = 'transparent';
    if (this.hitsNeeded === -1) {
      const glow = w / 7;
      ctx.fillStyle = fillStyle;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#FFFFFF44';
      ctx.fillRect(x, y, w, h);
      ctx.fillRect(x, y, w, glow);
      ctx.fillRect(x, y + glow, glow, h - glow);
      ctx.strokeRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    } else {
      ctx.fillStyle = fillStyle;
      drawRoundRect(ctx, x, y, w, h, h / 8, true, false);
      ctx.fillStyle = '#00000044';
      for (let i = 1; i < this.hitsNeeded; i++) {
        drawRoundRect(ctx, x, y, w, h, h / 8, true, false);
      }
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = w / 5;
      ctx.shadowColor = 'black';
      ctx.globalCompositeOperation = 'source-atop';
      drawRoundRect(ctx, x, y, w, h, h / 8, false, true);
      drawRoundRect(ctx, x, y, w, h, h / 8, false, true);
    }
    ctx.restore();
  }
}

class Pill implements Rect {
  x: number;
  y: number;
  w = 70;
  h = 40;
  label: string;
  ethics: 'good' | 'evil';
  left = 0;
  right = 0;
  top = 0;
  bottom = 0;

  constructor(origin: Rect, ethics: 'good' | 'evil', label: string) {
    this.x = origin.left + (origin.right - origin.left) / 2;
    this.y = origin.bottom;
    this.label = label;
    this.ethics = ethics;
    this.updateBox();
  }

  updateBox() {
    this.left = this.x - this.w / 2;
    this.right = this.x + this.w / 2;
    this.top = this.y - this.h / 2;
    this.bottom = this.y + this.h / 2;
  }

  moveTo(y: number) {
    this.y = y;
    this.updateBox();
  }

  draw(ctx: CanvasRenderingContext2D, scale: number, colorGood: string, colorEvil: string) {
    const x = this.x * scale;
    const y = this.y * scale;
    const w = this.w * scale;
    const h = this.h * scale;
    ctx.fillStyle = this.ethics === 'good' ? colorGood : colorEvil;
    drawRoundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2, true, false);
    ctx.font = `bold ${h * 1.2}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'white';
    ctx.fillText(this.label, x, y + h / 2.8);
  }
}

const WALLS: Rect[] = [
  { left: 0, right: 0, top: 0, bottom: VH }, // left
  { left: VW, right: VW, top: 0, bottom: VH }, // right
  { left: 0, right: VW, top: 0, bottom: 0 }, // top (no bottom wall — falling past it loses the ball)
];

export class AmblyonoidGame {
  readonly events = new Emitter<AmblyonoidEvents>();

  private board: HTMLElement;
  private layers: CanvasLayers<LayerName>;
  private sounds: SoundManager<'background' | 'success' | 'denied' | 'tap'>;
  private settings: DichopticSettings;
  private aspect = 2 / 3;

  private width = 0;
  private height = 0;

  private paddle = new Paddle();
  private balls: Ball[] = [];
  private bricks: Brick[] = [];
  private pills: Pill[] = [];
  private bricksLeft = 0;

  private scorePoints = 0;
  private level = 1;
  private lives = 3;

  private paused = true;
  private starting = false;
  private canPlay = false;
  private alive = true;
  private lastFrame = 0;
  private startTimers: ReturnType<typeof setTimeout>[] = [];

  private keyLeft = false;
  private keyRight = false;

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
    this.board.style.touchAction = 'none';

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
    this.board.addEventListener('pointermove', this.onPointerMove);
    this.board.addEventListener('pointerdown', this.onPointerDown);
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
    this.board.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('blur', this.onBlur);
    this.sounds.destroy();
    this.layers.destroy();
    this.events.clear();
  }

  // ---- setup --------------------------------------------------------------

  resetGame = (): void => {
    this.paddle = new Paddle();
    this.balls = [new Ball()];
    this.pills = [];
    this.keyLeft = false;
    this.keyRight = false;
    this.scorePoints = 0;
    this.level = 1;
    this.lives = 3;
    this.sounds.stop('success');
    this.sounds.stop('background');
    this.loadLevelBricks();
    this.refreshScore();
    this.pause();
    this.drawBack();
    this.drawBricks();
    this.drawActive();
  };

  private loadLevelBricks() {
    this.bricks = [];
    this.bricksLeft = 0;
    let levelData = LEVELS[this.level - 1];
    if (!levelData) {
      this.level = 1;
      levelData = LEVELS[this.level - 1];
    }
    levelData.forEach((row, y) => {
      const cells = row.toLowerCase().match(/(..?)/g) ?? [];
      cells.forEach((code, x) => {
        const hits = CODE_HITS[code] ?? 0;
        if (hits !== 0) {
          this.bricks.push(new Brick(hits, x, y));
          if (hits > 0) this.bricksLeft++;
        }
      });
    });
  }

  // ---- input ----------------------------------------------------------------

  /** Generic input dispatch used by GameShell (touch controls, remote input). */
  input(action: InputAction): void {
    switch (action) {
      case 'left':
        this.keyLeft = true;
        this.keyRight = false;
        break;
      case 'right':
        this.keyRight = true;
        this.keyLeft = false;
        break;
      case 'launch':
      case 'drop':
        this.launchBalls();
        break;
      case 'up':
      case 'down':
      case 'rotate':
        break;
    }
  }

  private launchBalls() {
    if (!this.canPlay) return;
    this.balls.forEach((b) => b.launch());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft') this.keyLeft = true;
    else if (e.code === 'ArrowRight') this.keyRight = true;
    else if (e.code === 'Space') {
      e.preventDefault();
      this.launchBalls();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft') this.keyLeft = false;
    else if (e.code === 'ArrowRight') this.keyRight = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.canPlay) return;
    const rect = this.board.getBoundingClientRect();
    if (rect.width === 0) return;
    const fraction = (e.clientX - rect.left) / rect.width;
    this.paddle.moveTo(fraction * VW);
  };

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.onPointerMove(e);
    this.launchBalls();
  };

  private onBlur = () => {
    if (!this.paused) this.pause();
  };

  // ---- loop -----------------------------------------------------------------

  private loop = (now: number): void => {
    if (!this.alive) return;
    requestAnimFrame(this.loop);
    const dt = Math.min(1 / 30, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.canPlay) this.update(dt);
    this.drawActive();
  };

  private update(dt: number) {
    if (this.keyLeft) this.paddle.moveTo(this.paddle.x - PADDLE_KEY_SPEED * dt);
    else if (this.keyRight) this.paddle.moveTo(this.paddle.x + PADDLE_KEY_SPEED * dt);

    for (const ball of this.balls) {
      if (ball.still) ball.moveTo(this.paddle.x);
    }

    this.processBallsMoves(dt);
    this.processPillsMoves(dt);
  }

  private processBallsMoves(time: number) {
    for (const ball of [...this.balls]) {
      if (ball.still || !ball.inMovement) continue;
      this.stepBall(ball, time);
    }
  }

  private stepBall(ball: Ball, time: number) {
    if (time <= 0 || !this.balls.includes(ball)) return;
    const newPoint = physMove(ball.x, ball.y, ball.dirX * ball.speed, ball.dirY * ball.speed, time);
    let mClosest = Infinity;
    let closest: { item: Rect | Brick; point: InterceptPoint } | undefined;
    const candidates: (Rect | Brick)[] = [this.paddle, ...WALLS, ...this.bricks];
    for (const item of candidates) {
      const pt = ballIntercept(ball, item, newPoint.distX, newPoint.distY);
      if (pt) {
        const m = magnitude(pt.x - ball.x, pt.y - ball.y);
        if (m < mClosest) {
          mClosest = m;
          closest = { item, point: pt };
        }
      }
    }
    if (closest) {
      let velX = newPoint.velX;
      const velY = newPoint.velY;
      if (closest.item === this.paddle && closest.point.side === 'top') {
        const hitPoint = closest.point.x - this.paddle.x;
        const hitPointAngle = (hitPoint / this.paddle.w / 2) * 4;
        velX = ball.speed * hitPointAngle;
        this.sounds.play('tap');
      } else if (closest.item instanceof Brick) {
        this.hitBrick(closest.item, ball);
        if (!this.canPlay) return;
      }
      ball.moveTo(closest.point.x, closest.point.y);
      if (closest.point.side === 'left' || closest.point.side === 'right') ball.setDir(-velX, velY);
      else ball.setDir(velX, -velY);
      const totalDist = magnitude(newPoint.distX, newPoint.distY);
      if (totalDist > 0) {
        const timeElapsedUntilHit = time * (mClosest / totalDist);
        this.stepBall(ball, time - timeElapsedUntilHit);
      }
      return;
    }
    if (newPoint.x < 0 || newPoint.y < 0 || newPoint.x > VW || newPoint.y > VH) {
      this.loseBall(ball);
    } else {
      ball.moveTo(newPoint.x, newPoint.y);
      ball.setDir(newPoint.velX, newPoint.velY);
    }
  }

  private hitBrick(brick: Brick, ball: Ball) {
    this.sounds.play('tap');
    brick.hitsLeft--;
    if (brick.hitsLeft === 0) {
      this.bricks = this.bricks.filter((b) => b !== brick);
      this.bricksLeft--;
      this.scorePoints += brick.hitsNeeded;
      this.refreshScore();
      this.drawBricks();
      const hasPill = randomInRange(0, 2) === 0;
      const isEvil = randomInRange(0, 2) === 0;
      const canHaveThree = this.balls.length === 1 && !this.pills.some((p) => p.label === 'D');
      const labelId = isEvil ? randomInRange(0, 2) : randomInRange(0, canHaveThree ? 3 : 2);
      const labels = ['A', 'B', 'C', 'D'];
      if (hasPill) this.pills.push(new Pill(brick, isEvil ? 'evil' : 'good', labels[labelId]));
    }
    ball.speed += 50 * (1 - ball.speed / MAX_BALL_SPEED);
    if (this.bricksLeft === 0) this.winLevel();
  }

  private winLevel() {
    this.pause();
    this.balls = [new Ball()];
    this.pills = [];
    this.paddle = new Paddle();
    this.level++;
    this.refreshScore();
    this.loadLevelBricks();
    this.drawBricks();
    this.events.emit('levelup', { level: this.level });
  }

  private loseBall(ball: Ball) {
    this.balls = this.balls.filter((b) => b !== ball);
    if (this.balls.length === 0) {
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
      this.balls = [new Ball()];
      this.paddle.moveTo(500);
      this.pills = [];
    }
  }

  private pillEffects(pill: Pill) {
    if (pill.ethics === 'good') {
      switch (pill.label) {
        case 'A':
          this.balls.forEach((b) => b.slowDown());
          break;
        case 'B':
          this.balls.forEach((b) => b.grow());
          break;
        case 'C':
          this.paddle.grow();
          break;
        case 'D': {
          const newBalls: Ball[] = [];
          for (const ball of this.balls) {
            const b1 = new Ball(ball.x, ball.y, ball.r, ball.dirX, ball.dirY, ball.speed, ball.still);
            const b2 = new Ball(ball.x, ball.y, ball.r, ball.dirX, ball.dirY, ball.speed, ball.still);
            b1.setDir(Math.sign(ball.dirX) || 1, ball.dirY);
            b2.setDir(ball.dirX, Math.sign(ball.dirY) || -1);
            newBalls.push(b1, b2);
          }
          this.balls = [...this.balls, ...newBalls];
          break;
        }
      }
    } else {
      switch (pill.label) {
        case 'A':
          this.balls.forEach((b) => b.speedUp());
          break;
        case 'B':
          this.balls.forEach((b) => b.shrink());
          break;
        case 'C':
          this.paddle.shrink();
          break;
      }
    }
  }

  private processPillsMoves(dt: number) {
    for (const pill of [...this.pills]) {
      const newPoint = physMove(pill.x, pill.y, 0, 500, dt);
      const pt = pillIntercept(pill, this.paddle, newPoint.distY);
      if (pt) {
        this.pills = this.pills.filter((p) => p !== pill);
        this.pillEffects(pill);
      } else if (newPoint.y > VH + 100) {
        // Fallen well past the board — drop it (source lets these run forever off-screen).
        this.pills = this.pills.filter((p) => p !== pill);
      } else {
        pill.moveTo(newPoint.y);
      }
    }
  }

  // ---- rendering --------------------------------------------------------

  private clear(name: LayerName) {
    this.layers.clear(name, this.width, this.height);
  }

  private drawBack = (): void => {
    this.layers.canvases.back.style.background = this.settings.color[0];
  };

  private drawBricks = (): void => {
    this.clear('stack');
    this.clear('back');
    const scale = this.width / VW;
    const ctxBack = this.layers.ctx.back;
    const ctxStack = this.layers.ctx.stack;
    for (const brick of this.bricks) brick.drawShadow(ctxBack, scale);
    for (const brick of this.bricks) brick.draw(ctxStack, scale, this.settings.color[3], this.settings.color[0] + '44');
  };

  private drawActive = (): void => {
    this.clear('active');
    const ctx = this.layers.ctx.active;
    const scale = this.width / VW;
    for (const ball of this.balls) ball.draw(ctx, scale, this.settings.color[2]);
    for (const pill of this.pills) pill.draw(ctx, scale, this.settings.color[2], this.settings.color[1]);
    this.paddle.draw(ctx, scale, this.settings.color[1]);
  };

  private setMessage(text: string, options?: { font?: string }) {
    const ctx = this.layers.ctx.message;
    this.clear('message');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = this.width / 60;
    const font = options?.font ?? `bold ${this.width * 0.16}px Arial`;
    ctx.font = font;
    const offsetY = Number(font.match(/\d+/)?.[0] ?? 0) / 2 - 6;
    ctx.strokeText(text, this.width / 2, this.height / 2 + offsetY);
    ctx.fillText(text, this.width / 2, this.height / 2 + offsetY);
    this.layers.canvases.message.style.opacity = '1';
  }

  private hideMessage() {
    this.layers.canvases.message.style.opacity = '0';
    setTimeout(() => this.clear('message'), 300);
  }

  // ---- sizing -------------------------------------------------------------

  resize = (): void => {
    const bw = this.board.clientWidth || 300;
    const bh = this.board.clientHeight || 450;
    const { width, height } = fitBox(bw, bh, this.aspect);
    this.width = width;
    this.height = height;
    this.layers.resize(width, height);
    this.drawBack();
    this.drawBricks();
    this.drawActive();
  };

  // ---- state / controls -------------------------------------------------

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
    this.setMessage('❚❚', { font: `bold ${this.width * 0.12}px Arial` });
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
    this.drawBack();
    this.drawBricks();
    this.events.emit('settingschange', this.getSettings());
  };

  private emitState() {
    this.events.emit('statechange', this.getState());
  }

  private refreshScore() {
    this.events.emit('score', this.getScore());
  }
}
