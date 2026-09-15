/**
 * Amblyotris — anaglyph Tetris for amblyopia training.
 *
 * Faithful port of the original MIT game.ts (© 2022 Guilad Gonen), refactored to
 * be DOM-decoupled: it owns only its canvas layers + game loop and communicates
 * with the UI through a typed method API and an event emitter. All menus,
 * settings, calibration, HUD and overlays are owned by React.
 */
import { asset } from '@/assets';
import { CanvasLayers } from '@/engine/canvasLayers';
import {
  COLOR_INDEX,
  defaultDichopticSettings,
  type DichopticSettings,
} from '@/engine/dichoptic';
import { Emitter } from '@/engine/emitter';
import { fitBox } from '@/engine/fit';
import { requestAnimFrame } from '@/engine/raf';
import { SoundManager } from '@/engine/sound';
import { randomInRange, weightedPick } from '@/engine/utils';
import { BoardPoint, Point } from './point';
import {
  newTetrominoI,
  newTetrominoJ,
  newTetrominoL,
  newTetrominoO,
  newTetrominoS,
  newTetrominoT,
  newTetrominoZ,
  Tetromino,
} from './tetromino';

export interface GameState {
  paused: boolean;
  starting: boolean;
  playing: boolean; // actively dropping pieces (for stats time accrual)
  muted: boolean;
}

export interface ScorePayload {
  points: number;
  rows: number;
  level: number;
}

export type AmblyotrisEvents = {
  score: ScorePayload;
  levelup: { level: number };
  rowscleared: { count: number; level: number };
  gameover: ScorePayload;
  statechange: GameState;
  settingschange: DichopticSettings;
  ready: void;
};

export interface AmblyotrisOptions {
  board: HTMLElement;
  nextCanvas?: HTMLCanvasElement | null;
  subNextCanvas?: HTMLCanvasElement | null;
  settings?: Partial<DichopticSettings>;
  soundBasePath?: string;
  enableKeyboard?: boolean;
  pauseOnBlur?: boolean;
  cols?: number;
  rows?: number;
  pieceSpeed?: number;
  /** Test-variant knob: keep a piece's red/cyan/grey color once it locks onto
   * the stack, instead of flattening it to the neutral "settled" grey. Off
   * (faithful to the original game) unless a deploy build opts in. */
  keepLockColor?: boolean;
}

type LayerName = 'back' | 'stack' | 'active' | 'front' | 'message';

/** Falling-piece color mix: 40% red, 40% cyan, 20% grey. */
const FIGURE_COLOR_WEIGHTS = [
  { value: COLOR_INDEX.red, weight: 40 },
  { value: COLOR_INDEX.cyan, weight: 40 },
  { value: COLOR_INDEX.grey, weight: 20 },
];

export class AmblyotrisGame {
  readonly events = new Emitter<AmblyotrisEvents>();

  private settings: DichopticSettings;
  private cols: number;
  private rows: number;
  private pieceSpeed: number;
  private squareSize = 0;
  private width = 0;
  private height = 0;

  private layers: CanvasLayers<LayerName>;
  private board: HTMLElement;
  private nextCanvas: HTMLCanvasElement | null;
  private subNextCanvas: HTMLCanvasElement | null;
  private ctxNext: CanvasRenderingContext2D | null = null;
  private ctxSubNext: CanvasRenderingContext2D | null = null;

  private sounds: SoundManager<'background' | 'success' | 'denied' | 'tap'>;

  private existingPieces: BoardPoint[][] = [];
  private currentFigure!: Tetromino;
  private nextFigure!: Tetromino;
  private subNextFigure!: Tetromino;
  private globalX = 0;
  private globalY = 0;

  private scorePoints = 0;
  private scoreRows = 0;
  private scoreLevel = 1;
  private scoreRowsInLevel = 0;

  private paused = true;
  private starting = false;
  private canPlay = false;
  private flagTimeout = false;
  private alive = true;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTimers: ReturnType<typeof setTimeout>[] = [];

  private enableKeyboard: boolean;
  private pauseOnBlur: boolean;
  private keepLockColor: boolean;

  constructor(opts: AmblyotrisOptions) {
    this.board = opts.board;
    this.nextCanvas = opts.nextCanvas ?? null;
    this.subNextCanvas = opts.subNextCanvas ?? null;
    this.cols = opts.cols ?? 10;
    this.rows = opts.rows ?? 20;
    this.pieceSpeed = opts.pieceSpeed ?? 950;
    this.enableKeyboard = opts.enableKeyboard ?? true;
    this.pauseOnBlur = opts.pauseOnBlur ?? true;
    this.keepLockColor = opts.keepLockColor ?? false;
    this.settings = { ...defaultDichopticSettings(), ...opts.settings };

    this.layers = new CanvasLayers<LayerName>(this.board, ['back', 'stack', 'active', 'front', 'message']);
    this.layers.canvases.message.style.transition = 'opacity 0.3s ease';
    this.layers.canvases.message.style.opacity = '0';

    if (this.nextCanvas) this.ctxNext = this.nextCanvas.getContext('2d');
    if (this.subNextCanvas) this.ctxSubNext = this.subNextCanvas.getContext('2d');

    this.sounds = new SoundManager(opts.soundBasePath ?? asset('/amblyotris'), {
      background: { file: 'theme.mp3', loop: true },
      success: { file: 'success.wav' },
      denied: { file: 'denied.wav' },
      tap: { file: 'tap.wav' },
    });

    this.init();
  }

  // ---- lifecycle --------------------------------------------------------

  private init = () => {
    this.resetGame();
    this.resize();
    if (this.enableKeyboard) document.addEventListener('keydown', this.onKeyDown);
    if (this.pauseOnBlur) window.addEventListener('blur', this.onBlur);
    this.drawActive(); // starts the rAF render loop
    this.events.emit('ready', undefined);
    this.emitState();
  };

  destroy(): void {
    this.alive = false;
    if (this.intervalId) clearInterval(this.intervalId);
    this.startTimers.forEach(clearTimeout);
    document.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('blur', this.onBlur);
    this.sounds.destroy();
    this.layers.destroy();
    this.events.clear();
  }

  private onBlur = () => {
    if (!this.paused) this.pause();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowRight':
        this.moveRight();
        break;
      case 'ArrowLeft':
        this.moveLeft();
        break;
      case 'ArrowDown':
        this.moveDown();
        break;
      case 'ArrowUp':
        this.rotate();
        break;
      case 'Space':
        e.preventDefault();
        this.hardDrop();
        break;
    }
  };

  resetGame = (): void => {
    this.scorePoints = 0;
    this.scoreRows = 0;
    this.scoreRowsInLevel = 0;
    this.scoreLevel = 1;
    this.pieceSpeed = 950;
    this.sounds.stop('success');
    this.sounds.stop('background');
    this.initExistingPieces();
    this.currentFigure = undefined as unknown as Tetromino;
    this.nextFigure = undefined as unknown as Tetromino;
    this.subNextFigure = undefined as unknown as Tetromino;
    this.chooseRandomFigure();
    this.restartGlobalXAndY();
    this.refreshScore();
    this.pause();
    this.drawBack();
    this.drawStack();
  };

  // ---- sizing -----------------------------------------------------------

  resize = (height?: number): void => {
    // Fit the 1:2 board inside the container without distortion.
    const bw = this.board.clientWidth || 300;
    const bh = height ?? (this.board.clientHeight || 600);
    const { width: w, height: h } = fitBox(bw, bh, this.cols / this.rows);
    this.height = h;
    this.width = w;
    this.squareSize = h / this.rows;
    this.layers.resize(this.width, this.height);
    if (this.nextCanvas) {
      this.nextCanvas.width = this.squareSize * 5;
      this.nextCanvas.height = this.squareSize * 3;
    }
    if (this.subNextCanvas) {
      this.subNextCanvas.width = this.squareSize * 5;
      this.subNextCanvas.height = this.squareSize * 3;
    }
    this.drawBack();
    this.drawStack();
    this.drawNext();
  };

  // ---- public controls --------------------------------------------------

  /** Generic input dispatch used by the shared GameShell. */
  input(action: 'left' | 'right' | 'down' | 'rotate' | 'drop' | 'launch'): void {
    switch (action) {
      case 'left':
        this.moveLeft();
        break;
      case 'right':
        this.moveRight();
        break;
      case 'down':
        this.moveDown();
        break;
      case 'rotate':
        this.rotate();
        break;
      case 'drop':
        this.hardDrop();
        break;
      case 'launch':
        break; // not used by Tetris
    }
  }

  moveRight = (): void => {
    if (this.canPlay && this.figureCanMoveRight()) this.globalX++;
  };
  moveLeft = (): void => {
    if (this.canPlay && this.figureCanMoveLeft()) this.globalX--;
  };
  moveDown = (): void => {
    if (this.canPlay && this.figureCanMoveDown()) this.globalY++;
  };
  rotate = (): void => {
    if (this.canPlay) this.rotateFigure();
  };
  hardDrop = (): void => {
    if (!this.canPlay) return;
    while (this.figureCanMoveDown()) {
      this.globalY++;
      this.scorePoints++;
      this.refreshScore();
    }
    this.endFallingProcess();
  };

  togglePause = (): void => {
    if (this.paused) this.resume();
    else this.pause();
  };

  pause = (): void => {
    this.paused = true;
    this.starting = false;
    this.sounds.stop('background');
    this.canPlay = false;
    if (this.intervalId) clearInterval(this.intervalId);
    this.startTimers.forEach(clearTimeout);
    this.startTimers = [];
    this.setMessage('▐ ▌', { font: `bold ${this.squareSize * 1.5}px Arial` });
    this.emitState();
  };

  resume = (): void => {
    if (!this.paused || this.starting) return;
    this.paused = false;
    this.starting = true;
    this.emitState();
    // 3-2-1 countdown drawn on the message layer
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
          this.intervalId = setInterval(() => this.mainLoop(), this.pieceSpeed);
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

  getScore = (): ScorePayload => ({ points: this.scorePoints, rows: this.scoreRows, level: this.scoreLevel });

  getSettings = (): DichopticSettings => structuredClone(this.settings);

  /** Applies new dichoptic settings (ported from showSettings confirm block). */
  applySettings = (next: Partial<DichopticSettings>): void => {
    this.settings = { ...this.settings, ...next };
    this.drawBack();
    if (this.nextCanvas) this.nextCanvas.style.background = this.settings.color[0];
    if (this.subNextCanvas) this.subNextCanvas.style.background = this.settings.color[0];
    // Re-roll the queue so colours/variants take effect immediately
    this.chooseRandomFigure();
    this.chooseRandomFigure();
    this.chooseRandomFigure();
    this.restartGlobalXAndY();
    this.events.emit('settingschange', this.getSettings());
  };

  private emitState() {
    this.events.emit('statechange', this.getState());
  }

  // ---- scoring ----------------------------------------------------------

  private addScore(rows: number[]) {
    const score = [0, 40, 100, 300, 1200];
    this.scorePoints += score[rows.length];
    this.scoreRows += rows.length;
    this.scoreRowsInLevel += rows.length;
    const prevLevel = this.scoreLevel;
    if (this.scoreLevel <= 10) {
      if (this.scoreRowsInLevel >= this.scoreLevel * 10) {
        this.scoreLevel++;
        this.scoreRowsInLevel -= this.scoreLevel * 10;
      }
    } else if (this.scoreLevel <= 15) {
      if (this.scoreRowsInLevel >= 100) {
        this.scoreLevel++;
        this.scoreRowsInLevel -= 100;
      }
    } else if (this.scoreRowsInLevel >= 150) {
      this.scoreLevel++;
      this.scoreRowsInLevel -= 150;
    }
    this.pieceSpeed = 1000 - this.scoreLevel * 50;
    if (this.scoreLevel !== prevLevel) {
      // Apply new speed to the running loop
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.mainLoop(), this.pieceSpeed);
      }
      this.events.emit('levelup', { level: this.scoreLevel });
    }
    this.refreshScore();
  }

  private refreshScore() {
    this.events.emit('score', this.getScore());
  }

  // ---- main loop & falling ---------------------------------------------

  private mainLoop() {
    if (!this.canPlay) return;
    if (this.figureCanMoveDown()) {
      this.globalY++;
    } else {
      if (this.flagTimeout) return;
      this.flagTimeout = true;
      setTimeout(() => {
        this.flagTimeout = false;
        if (this.figureCanMoveDown()) return;
        this.endFallingProcess();
      }, this.pieceSpeed / 3);
    }
  }

  private endFallingProcess() {
    this.sounds.play('tap');
    this.moveFigurePointsToExistingPieces();
    if (this.playerLoses()) {
      this.canPlay = false;
      this.paused = true;
      if (this.intervalId) clearInterval(this.intervalId);
      this.sounds.stop('background');
      this.events.emit('gameover', this.getScore());
      this.emitState();
      return;
    }
    this.verifyAndDeleteFullRows();
    this.chooseRandomFigure();
  }

  private moveFigurePointsToExistingPieces() {
    this.canPlay = false;
    for (const point of this.currentFigure.getPoints()) {
      point.x += this.globalX;
      point.y += this.globalY;
      if (!this.keepLockColor) point.color = this.settings.color[3];
      this.existingPieces[point.y][point.x] = { taken: true, ...point } as BoardPoint;
    }
    this.restartGlobalXAndY();
    this.canPlay = true;
    this.drawStack();
  }

  private playerLoses(): boolean {
    return this.existingPieces[1].some((point) => point.taken);
  }

  private verifyAndDeleteFullRows() {
    const deletableRows: number[] = [];
    this.existingPieces.forEach((row, y) => {
      if (row.every((point) => point.taken)) deletableRows.push(y);
    });
    if (!deletableRows.length) return;
    this.addScore(deletableRows);
    this.events.emit('rowscleared', { count: deletableRows.length, level: this.scoreLevel });
    this.sounds.play('success');
    this.canPlay = false;
    this.changeDeletedRowColor(deletableRows);
    setTimeout(() => {
      this.removeRowsFromExistingPieces(deletableRows);
      this.drawStack();
      this.canPlay = true;
    }, 500);
  }

  private removeRowsFromExistingPieces(deletableRows: number[]) {
    const emptyRow = (y: number): BoardPoint[] => {
      const row: BoardPoint[] = [];
      for (let x = 0; x < this.cols; x++) row.push({ taken: false, x, y } as BoardPoint);
      return row;
    };
    for (const yCoordinate of deletableRows) {
      for (let y = yCoordinate; y >= 0; y--) {
        if (y > 0) {
          this.existingPieces[y] = [...this.existingPieces[y - 1]];
          this.existingPieces[y].forEach((_, x) => (this.existingPieces[y][x].y = y));
        } else {
          this.existingPieces[y] = emptyRow(y);
        }
      }
    }
  }

  private changeDeletedRowColor(deletableRows: number[]) {
    const colors = ['#FF00FF', '#888888', '#FF00FF', '#888888', '#FF00FF', '#888888', '#FF00FF', '#888888'];
    const ctx = this.layers.ctx.front;
    const draw = () => {
      this.clearCanvas('front');
      for (const lineY of deletableRows) {
        const y = lineY * this.squareSize;
        const barLength = this.squareSize / colors.length;
        colors.forEach((color, i) => {
          ctx.fillStyle = color;
          ctx.fillRect(0, y + barLength * i, this.squareSize * this.cols, this.squareSize / colors.length);
        });
      }
    };
    draw();
    setTimeout(() => this.clearCanvas('front'), 100);
    setTimeout(draw, 200);
    setTimeout(() => this.clearCanvas('front'), 300);
    setTimeout(draw, 400);
    setTimeout(() => this.clearCanvas('front'), 500);
  }

  // ---- rendering --------------------------------------------------------

  private clearCanvas(name: LayerName) {
    this.layers.ctx[name].clearRect(0, 0, this.width, this.height);
  }

  private drawBack = (): void => {
    const ctx = this.layers.ctx.back;
    this.layers.canvases.back.style.background = this.settings.color[0];
    this.clearCanvas('back');
    ctx.beginPath();
    ctx.lineWidth = this.squareSize / 30;
    for (let y = 0; y < this.rows; y++) {
      ctx.moveTo(0, y * this.squareSize);
      ctx.lineTo(this.width, y * this.squareSize);
    }
    for (let x = 0; x < this.cols; x++) {
      ctx.moveTo(x * this.squareSize, 0);
      ctx.lineTo(x * this.squareSize, this.height);
    }
    ctx.strokeStyle = '#CCCCCC33';
    ctx.stroke();
  };

  private drawActive = (): void => {
    if (!this.alive) return;
    requestAnimFrame(this.drawActive);
    if (!this.currentFigure) return;
    this.clearCanvas('active');
    for (const point of this.currentFigure.getPoints()) {
      const drawingPoint = new Point({ ...point });
      drawingPoint.x += this.globalX;
      drawingPoint.y += this.globalY;
      this.drawPoint(this.layers.ctx.active, drawingPoint);
    }
  };

  private drawStack = (): void => {
    this.clearCanvas('stack');
    for (const row of this.existingPieces) {
      for (const point of row) {
        if (point.taken) this.drawPoint(this.layers.ctx.stack, point);
      }
    }
  };

  private drawNext = (): void => {
    const draw = (figure: Tetromino | undefined, ctx: CanvasRenderingContext2D | null) => {
      if (!figure || !ctx) return;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const points = figure.getPoints();
      let offsetX = 0.5;
      let offsetY = 0.5;
      if (points.find((p) => p.x === 2)) {
        offsetY += -0.5;
      } else if (points.find((p) => p.x === -1)) {
        offsetX += 0.5;
      }
      for (const point of points) {
        const drawingPoint = new Point({ ...point });
        drawingPoint.x += offsetX + 1;
        drawingPoint.y += offsetY + 1;
        this.drawPoint(ctx, drawingPoint);
      }
    };
    draw(this.nextFigure, this.ctxNext);
    draw(this.subNextFigure, this.ctxSubNext);
  };

  private drawPoint(ctx: CanvasRenderingContext2D, point: Point | BoardPoint) {
    const gap = this.squareSize / 30;
    const s = this.squareSize - gap * 2;
    const x = point.x * this.squareSize + gap;
    const y = point.y * this.squareSize + gap;
    ctx.fillStyle = point.color ?? '#000000';
    ctx.fillRect(x, y, s, s);
    const borderWidth = s / 5;
    if (point.variant !== 'filled') {
      ctx.clearRect(x + borderWidth, y + borderWidth, s - borderWidth * 2, s - borderWidth * 2);
    }
    if (point.variant === 'hollowLine') {
      if (point.direction === 'vertical') {
        ctx.fillRect(x + borderWidth * 2, y + borderWidth, borderWidth, s - borderWidth * 2);
      } else {
        ctx.fillRect(x + borderWidth, y + borderWidth * 2, s - borderWidth * 2, borderWidth);
      }
    }
  }

  private setMessage(text: string, options?: { font?: string; fillStyle?: string }) {
    const ctx = this.layers.ctx.message;
    this.clearCanvas('message');
    ctx.textAlign = 'center';
    ctx.fillStyle = options?.fillStyle ?? '#000000';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = this.squareSize / 8;
    const font = options?.font ?? `bold ${this.squareSize * 3}px Arial`;
    ctx.font = font;
    const offsetY = Number(font.match(/\d+/)?.[0] ?? 0) / 2 - 10;
    ctx.strokeText(text, this.width / 2, this.height / 2 + offsetY);
    ctx.fillText(text, this.width / 2, this.height / 2 + offsetY);
    this.layers.canvases.message.style.opacity = '1';
  }

  private hideMessage() {
    this.layers.canvases.message.style.opacity = '0';
    setTimeout(() => this.clearCanvas('message'), 300);
  }

  // ---- figures & collisions --------------------------------------------

  private restartGlobalXAndY() {
    this.globalX = Math.floor(this.cols / 2) - 1;
    this.globalY = -1;
  }

  private chooseRandomFigure = (): void => {
    let randomFigure: Tetromino;
    const randomOption = randomInRange(1, 7);
    const randomColor = weightedPick(FIGURE_COLOR_WEIGHTS);
    const color = this.settings.color[randomColor] + this.settings.opacity[randomColor];
    const variant = this.settings.variant;
    switch (randomOption) {
      case 1:
        randomFigure = newTetrominoO(variant, color);
        break;
      case 2:
        randomFigure = newTetrominoI(variant, color);
        break;
      case 3:
        randomFigure = newTetrominoL(variant, color);
        break;
      case 4:
        randomFigure = newTetrominoJ(variant, color);
        break;
      case 5:
        randomFigure = newTetrominoZ(variant, color);
        break;
      case 6:
        randomFigure = newTetrominoS(variant, color);
        break;
      case 7:
      default:
        randomFigure = newTetrominoT(variant, color);
        break;
    }
    this.currentFigure = this.nextFigure;
    this.nextFigure = this.subNextFigure;
    this.subNextFigure = randomFigure;
    if (!this.currentFigure) this.chooseRandomFigure();
    this.drawNext();
  };

  private initExistingPieces() {
    this.existingPieces = [];
    for (let y = 0; y < this.rows; y++) {
      this.existingPieces.push([]);
      for (let x = 0; x < this.cols; x++) {
        this.existingPieces[y].push({ taken: false, x, y } as BoardPoint);
      }
    }
  }

  private relativePointOutOfLimits(relativeX: number, relativeY: number): boolean {
    return this.absolutePointOutOfLimits(relativeX + this.globalX, relativeY + this.globalY);
  }

  private absolutePointOutOfLimits(absoluteX: number, absoluteY: number): boolean {
    return absoluteX < 0 || absoluteX > this.cols - 1 || absoluteY < -2 || absoluteY > this.rows - 1;
  }

  private isEmptyPoint(x: number, y: number): boolean {
    if (!this.existingPieces[y]) return true;
    if (!this.existingPieces[y][x]) return true;
    return !this.existingPieces[y][x].taken;
  }

  private isValidPoint(point: Point, points: Point[]): boolean {
    const emptyPoint = this.isEmptyPoint(this.globalX + point.x, this.globalY + point.y);
    const hasSameCoordinateOfFigurePoint = points.findIndex((p) => p.x === point.x && p.y === point.y) !== -1;
    const outOfLimits = this.relativePointOutOfLimits(point.x, point.y);
    return Boolean(emptyPoint || hasSameCoordinateOfFigurePoint) && !outOfLimits;
  }

  private figureCanMoveRight(): boolean {
    if (!this.currentFigure) return false;
    return this.currentFigure.getPoints().every((point) => this.isValidPoint(new Point(point.x + 1, point.y), this.currentFigure.getPoints()));
  }
  private figureCanMoveLeft(): boolean {
    if (!this.currentFigure) return false;
    return this.currentFigure.getPoints().every((point) => this.isValidPoint(new Point(point.x - 1, point.y), this.currentFigure.getPoints()));
  }
  private figureCanMoveDown(): boolean {
    if (!this.currentFigure) return false;
    return this.currentFigure.getPoints().every((point) => this.isValidPoint(new Point(point.x, point.y + 1), this.currentFigure.getPoints()));
  }

  private figureCanRotate(offsetX = 0): boolean {
    let newPoints = [...this.currentFigure.getNextRotation()];
    if (offsetX !== 0) {
      newPoints = newPoints.map((point) => {
        const np = new Point({ ...point });
        np.x += offsetX;
        return np;
      });
    }
    return newPoints.every((rotatedPoint) => this.isValidPoint(rotatedPoint, this.currentFigure.getPoints()));
  }

  private rotateFigure() {
    for (let offset = 0; offset <= 4; offset++) {
      if (this.figureCanRotate(offset)) {
        this.currentFigure.points = this.currentFigure.getNextRotation();
        this.currentFigure.incrementRotationIndex();
        this.globalX += offset;
        return;
      }
      if (this.figureCanRotate(offset * -1)) {
        this.currentFigure.points = this.currentFigure.getNextRotation();
        this.currentFigure.incrementRotationIndex();
        this.globalX -= offset;
        return;
      }
    }
    this.sounds.play('denied');
  }
}
