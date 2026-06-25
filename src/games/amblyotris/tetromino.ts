import type { PointVariant } from '@/engine/dichoptic';
import { Point } from './point';

/** A rotatable tetromino. Ported verbatim from the original tetromino.ts. */
export class Tetromino {
  rotations: Point[][];
  rotationIndex: number;
  points: Point[];

  constructor(rotations: Point[][]) {
    this.rotations = rotations;
    this.rotationIndex = 0;
    this.points = this.rotations[this.rotationIndex];
    // Sets color and direction for each point if not already set
    this.rotations.forEach((rotation) => {
      rotation.forEach((point, i) => {
        point.color ??= '#000000';
        point.variant ??= 'fullColor';
        if (point.variant === 'veryHighContrast') {
          point.direction ??= i % 2 === 0 ? 'vertical' : 'horizontal';
        }
      });
    });
    this.incrementRotationIndex();
  }

  getPoints(): Point[] {
    return this.points;
  }

  incrementRotationIndex(): void {
    if (this.rotations.length <= 0) {
      this.rotationIndex = 0;
    } else if (this.rotationIndex + 1 >= this.rotations.length) {
      this.rotationIndex = 0;
    } else {
      this.rotationIndex++;
    }
  }

  getNextRotation(): Point[] {
    return this.rotations[this.rotationIndex];
  }
}

const P = (x: number, y: number, variant: PointVariant, color: string, direction?: 'vertical' | 'horizontal') =>
  new Point({ x, y, variant, color, direction });

export function newTetrominoO(variant: PointVariant, color: string): Tetromino {
  return new Tetromino([[P(0, -1, variant, color), P(1, -1, variant, color), P(1, 0, variant, color), P(0, 0, variant, color)]]);
}

export function newTetrominoI(variant: PointVariant, color: string): Tetromino {
  return new Tetromino([
    [P(-1, 0, variant, color), P(0, 0, variant, color), P(1, 0, variant, color), P(2, 0, variant, color)],
    [P(0, -1, variant, color), P(0, 0, variant, color), P(0, 1, variant, color), P(0, 2, variant, color)],
    [P(-1, 1, variant, color), P(0, 1, variant, color), P(1, 1, variant, color), P(2, 1, variant, color)],
    [P(1, -1, variant, color), P(1, 0, variant, color), P(1, 1, variant, color), P(1, 2, variant, color)],
  ]);
}

export function newTetrominoL(variant: PointVariant, color: string): Tetromino {
  return new Tetromino([
    [P(-1, 0, variant, color), P(0, 0, variant, color), P(1, 0, variant, color), P(1, -1, variant, color)],
    [P(0, -1, variant, color), P(0, 0, variant, color), P(0, 1, variant, color), P(1, 1, variant, color)],
    [P(-1, 1, variant, color), P(-1, 0, variant, color), P(0, 0, variant, color), P(1, 0, variant, color)],
    [P(-1, -1, variant, color), P(0, -1, variant, color), P(0, 0, variant, color), P(0, 1, variant, color)],
  ]);
}

export function newTetrominoJ(variant: PointVariant, color: string): Tetromino {
  return new Tetromino([
    [P(-1, -1, variant, color), P(-1, 0, variant, color), P(0, 0, variant, color), P(1, 0, variant, color)],
    [P(0, 1, variant, color), P(0, 0, variant, color), P(0, -1, variant, color), P(1, -1, variant, color)],
    [P(-1, 0, variant, color), P(0, 0, variant, color), P(1, 0, variant, color), P(1, 1, variant, color)],
    [P(-1, 1, variant, color), P(0, 1, variant, color), P(0, 0, variant, color), P(0, -1, variant, color)],
  ]);
}

export function newTetrominoZ(variant: PointVariant, color: string): Tetromino {
  return new Tetromino([
    [P(-1, -1, variant, color), P(0, -1, variant, color), P(0, 0, variant, color), P(1, 0, variant, color)],
    [P(0, 1, variant, color), P(0, 0, variant, color), P(1, 0, variant, color), P(1, -1, variant, color)],
    [P(-1, 0, variant, color), P(0, 0, variant, color), P(0, 1, variant, color), P(1, 1, variant, color)],
    [P(-1, 1, variant, color), P(-1, 0, variant, color), P(0, 0, variant, color), P(0, -1, variant, color)],
  ]);
}

export function newTetrominoS(variant: PointVariant, color: string): Tetromino {
  return new Tetromino([
    [P(-1, 0, variant, color), P(0, 0, variant, color), P(0, -1, variant, color), P(1, -1, variant, color)],
    [P(0, -1, variant, color), P(0, 0, variant, color), P(1, 0, variant, color), P(1, 1, variant, color)],
    [P(-1, 1, variant, color), P(0, 1, variant, color), P(0, 0, variant, color), P(1, 0, variant, color)],
    [P(-1, -1, variant, color), P(-1, 0, variant, color), P(0, 0, variant, color), P(0, 1, variant, color)],
  ]);
}

export function newTetrominoT(variant: PointVariant, color: string): Tetromino {
  return new Tetromino([
    [P(-1, 0, variant, color, 'vertical'), P(0, 0, variant, color, 'horizontal'), P(1, 0, variant, color, 'vertical'), P(0, -1, variant, color, 'vertical')],
    [P(0, -1, variant, color, 'horizontal'), P(0, 0, variant, color, 'vertical'), P(0, 1, variant, color, 'horizontal'), P(1, 0, variant, color, 'horizontal')],
    [P(-1, 0, variant, color, 'vertical'), P(0, 0, variant, color, 'horizontal'), P(1, 0, variant, color, 'vertical'), P(0, 1, variant, color, 'vertical')],
    [P(0, -1, variant, color, 'horizontal'), P(0, 0, variant, color, 'vertical'), P(0, 1, variant, color, 'horizontal'), P(-1, 0, variant, color, 'horizontal')],
  ]);
}
