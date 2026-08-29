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
  it('tints the "left" role red and keeps the dp sign positive when red is on the left (cyan on the right)', () => {
    expect(orthopticsEyeRoles('right')).toEqual({ leftIsRed: true, dpSign: 1 });
  });

  it('mirrors both when cyan is on the left (red on the right): "left" role turns cyan, dp sign flips', () => {
    expect(orthopticsEyeRoles('left')).toEqual({ leftIsRed: false, dpSign: -1 });
  });
});
