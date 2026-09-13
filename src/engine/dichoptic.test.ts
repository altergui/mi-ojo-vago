import { describe, expect, it } from 'vitest';
import { orthopticsEyeRoles, redEye } from './dichoptic';

describe('redEye', () => {
  it('is right when cyan is on the left', () => {
    expect(redEye({ cyanEye: 'left' })).toBe('right');
  });

  it('is left when cyan is on the right', () => {
    expect(redEye({ cyanEye: 'right' })).toBe('left');
  });
});

describe('orthopticsEyeRoles', () => {
  it('tints the "left" role red when cyan is on the left (red on the right)', () => {
    // The left eye's own lens (cyan) blends into the background — red is
    // the colour that shows up as a dark shape through it, so "left" must
    // be tinted red for the left eye to actually read it.
    expect(orthopticsEyeRoles('left')).toEqual({ leftIsRed: true, dpSign: 1 });
  });

  it('mirrors the color when cyan is on the right (red on the left), but keeps the dp sign unchanged', () => {
    // "left"/"right" roles never move on screen — only their color does —
    // so the disparity a physical eye actually sees never changes with
    // cyanEye, and the dp sign must not flip either.
    expect(orthopticsEyeRoles('right')).toEqual({ leftIsRed: false, dpSign: 1 });
  });
});
