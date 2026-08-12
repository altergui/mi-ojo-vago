/**
 * Recolors Orthoptics' pre-tinted stimulus/marker PNGs to match the active
 * color calibration.
 *
 * The source PNGs (ported from FUENTES/orthoptics/img) are solid-color
 * silhouettes: near-uniform maroon (128,0,0) or navy (0,0,128) RGB with a
 * transparent background, where the alpha channel carries the shape
 * (including antialiased edges). Recoloring them means keeping that alpha
 * channel and replacing the RGB uniformly with the calibrated hex color —
 * these two are the only genuinely testable-without-a-browser parts of that;
 * loading/drawing/encoding the image is thin canvas glue below.
 */

/** #rgb / #rrggbb -> [r,g,b], 0-255. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mutates RGBA pixel data in place: keeps each pixel's alpha, replaces its RGB with [r,g,b]. */
export function recolorPixels(data: Uint8ClampedArray, [r, g, b]: [number, number, number]): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

const IMAGE_CACHE = new Map<string, Promise<HTMLImageElement>>();
const TINT_CACHE = new Map<string, string>();

function tintCacheKey(src: string, color: string): string {
  return `${src}|${color}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  let promise = IMAGE_CACHE.get(src);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`tint: failed to load ${src}`));
      img.src = src;
    });
    IMAGE_CACHE.set(src, promise);
  }
  return promise;
}

/** Synchronously returns an already-computed tint, if any — lets callers avoid a stale-image flash. */
export function peekTintedImage(src: string, color: string): string | undefined {
  return TINT_CACHE.get(tintCacheKey(src, color));
}

/** Recolors `src` to `color` (hex), preserving its alpha shape. Cached per (src, color). */
export async function tintImage(src: string, color: string): Promise<string> {
  const key = tintCacheKey(src, color);
  const cached = TINT_CACHE.get(key);
  if (cached) return cached;

  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src; // no canvas support — fall back to the untinted original

  ctx.drawImage(img, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolorPixels(frame.data, hexToRgb(color));
  ctx.putImageData(frame, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  TINT_CACHE.set(key, dataUrl);
  return dataUrl;
}
