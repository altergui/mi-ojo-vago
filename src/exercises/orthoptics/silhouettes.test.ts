import { describe, expect, it } from 'vitest';
import { SILHOUETTES } from './silhouettes';

/** Every filename stem OrthopticsExercise.tsx's STIMULI/markers can look up by. */
const EXPECTED_NAMES = [
  'cirR', 'cirA', 'face', 'solR', 'solA', 'crossR', 'crossA',
  'houseR', 'houseA', 'carR', 'carA', 'stereoR', 'stereoA',
  'left', 'right',
];

describe('SILHOUETTES', () => {
  it.each(EXPECTED_NAMES)('has an entry for %s', (name) => {
    expect(SILHOUETTES[name]).toBeDefined();
  });

  it('gives every entry a non-empty path and transform, and positive dimensions', () => {
    for (const [name, shape] of Object.entries(SILHOUETTES)) {
      expect(shape.d.length, `${name}.d`).toBeGreaterThan(0);
      expect(shape.transform.length, `${name}.transform`).toBeGreaterThan(0);
      expect(shape.width, `${name}.width`).toBeGreaterThan(0);
      expect(shape.height, `${name}.height`).toBeGreaterThan(0);
    }
  });
});
