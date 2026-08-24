/**
 * Renders one of Orthoptics' vector-traced stimulus/marker shapes
 * (silhouettes.ts) as a plain SVG, filled with the given color.
 *
 * Replaces the earlier canvas-based tinting approach: since these are real
 * vector paths (not recolored raster pixels), there's no image to load, no
 * async tint to wait for, and no upper bound on display size.
 */
import type { CSSProperties } from 'react';
import { SILHOUETTES } from './silhouettes';

interface SilhouetteProps {
  name: keyof typeof SILHOUETTES;
  color: string;
  className?: string;
  style?: CSSProperties;
}

export function Silhouette({ name, color, className, style }: SilhouetteProps) {
  const shape = SILHOUETTES[name];
  return (
    <svg
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      width={shape.width}
      height={shape.height}
      className={className}
      style={style}
      aria-hidden="true"
    >
      <g transform={shape.transform} fill={color}>
        <path d={shape.d} />
      </g>
    </svg>
  );
}
