import { describe, expect, it } from 'vitest';
import {
  newTetrominoI,
  newTetrominoJ,
  newTetrominoL,
  newTetrominoO,
  newTetrominoS,
  newTetrominoT,
  newTetrominoZ,
} from './tetromino';

/**
 * I, S and Z have 180°-rotational symmetry: rotating them twice must land back
 * on the exact same cells, not a copy shifted by one row/column. Previously
 * each had 4 rotation states where states 0/2 and 1/3 were the same shape
 * translated by one cell, so repeatedly rotating made the piece appear to
 * "walk" instead of toggling between just 2 visual orientations.
 */
describe('Tetromino rotation states', () => {
  it('I has exactly 2 distinct rotation states (horizontal/vertical)', () => {
    expect(newTetrominoI('filled', '#000').rotations.length).toBe(2);
  });

  it('S has exactly 2 distinct rotation states', () => {
    expect(newTetrominoS('filled', '#000').rotations.length).toBe(2);
  });

  it('Z has exactly 2 distinct rotation states', () => {
    expect(newTetrominoZ('filled', '#000').rotations.length).toBe(2);
  });

  it('O has exactly 1 rotation state (never visually rotates)', () => {
    expect(newTetrominoO('filled', '#000').rotations.length).toBe(1);
  });

  it('L, J and T genuinely have 4 distinct rotation states', () => {
    expect(newTetrominoL('filled', '#000').rotations.length).toBe(4);
    expect(newTetrominoJ('filled', '#000').rotations.length).toBe(4);
    expect(newTetrominoT('filled', '#000').rotations.length).toBe(4);
  });

  it('rotating an I piece twice returns to the exact same cells (no drift)', () => {
    const t = newTetrominoI('filled', '#000');
    const toKey = (pts: { x: number; y: number }[]) =>
      pts.map((p) => `${p.x},${p.y}`).sort().join('|');
    const state0 = toKey(t.getNextRotation());
    t.incrementRotationIndex();
    t.incrementRotationIndex();
    const state0Again = toKey(t.getNextRotation());
    expect(state0Again).toBe(state0);
  });
});
