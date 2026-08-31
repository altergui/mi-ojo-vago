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
  it('tints the "left" role red and keeps the dp sign positive when cyan is on the left (red on the right)', () => {
    // The left eye's own lens (cyan) blends into the background — red is
    // the colour that shows up as a dark shape through it, so "left" must
    // be tinted red for the left eye to actually read it.
    expect(orthopticsEyeRoles('left')).toEqual({ leftIsRed: true, dpSign: 1 });
  });

  it('mirrors both when cyan is on the right (red on the left): "left" role turns cyan, dp sign flips', () => {
    expect(orthopticsEyeRoles('right')).toEqual({ leftIsRed: false, dpSign: -1 });
  });
});
