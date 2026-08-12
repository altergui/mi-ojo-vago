import { describe, expect, it } from 'vitest';
import { hexToRgb, recolorPixels } from './tint';

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
    expect(hexToRgb('#00ffff')).toEqual([0, 255, 255]);
    expect(hexToRgb('#800000')).toEqual([128, 0, 0]);
  });

  it('parses 3-digit shorthand hex', () => {
    expect(hexToRgb('#0f0')).toEqual([0, 255, 0]);
  });

  it('accepts hex without a leading #', () => {
    expect(hexToRgb('ff0000')).toEqual([255, 0, 0]);
  });
});

describe('recolorPixels', () => {
  it('replaces RGB but preserves each pixel alpha exactly', () => {
    // Two pixels: opaque maroon, half-transparent maroon (antialiased edge).
    const data = new Uint8ClampedArray([128, 0, 0, 255, 128, 0, 0, 128]);
    recolorPixels(data, [0, 255, 255]);
    expect(Array.from(data)).toEqual([0, 255, 255, 255, 0, 255, 255, 128]);
  });

  it('makes fully transparent pixels stay transparent regardless of new RGB', () => {
    const data = new Uint8ClampedArray([128, 0, 0, 0]);
    recolorPixels(data, [255, 255, 255]);
    expect(data[3]).toBe(0);
  });

  it('recolors every pixel in a multi-pixel buffer', () => {
    const data = new Uint8ClampedArray([
      128, 0, 0, 255,
      0, 0, 128, 200,
      255, 255, 255, 0,
    ]);
    recolorPixels(data, [10, 20, 30]);
    expect(Array.from(data)).toEqual([
      10, 20, 30, 255,
      10, 20, 30, 200,
      10, 20, 30, 0,
    ]);
  });
});
