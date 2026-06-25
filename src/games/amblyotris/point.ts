import type { PointVariant } from '@/engine/dichoptic';

export type Direction = 'vertical' | 'horizontal';

export interface PointInit {
  x: number;
  y: number;
  color?: string;
  direction?: Direction;
  variant?: PointVariant;
}

/** A single grid cell. Ported from the original point.ts. */
export class Point {
  x: number;
  y: number;
  color?: string;
  direction?: Direction;
  variant?: PointVariant;

  constructor(init: PointInit);
  constructor(x: number, y: number);
  constructor(xo: PointInit | number, y?: number) {
    if (typeof xo === 'number') {
      this.x = xo;
      this.y = y as number;
    } else {
      this.x = xo.x;
      this.y = xo.y;
      this.color = xo.color;
      this.direction = xo.direction;
      this.variant = xo.variant;
    }
  }
}

export interface BoardPoint extends Point {
  taken: boolean;
}
