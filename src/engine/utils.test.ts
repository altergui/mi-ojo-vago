import { describe, expect, it } from 'vitest';
import { weightedPick } from './utils';

describe('weightedPick', () => {
  it('always returns the only option when there is a single weight', () => {
    for (let i = 0; i < 20; i++) {
      expect(weightedPick([{ value: 'only', weight: 1 }])).toBe('only');
    }
  });

  it('never picks a zero-weight option', () => {
    for (let i = 0; i < 1000; i++) {
      const result = weightedPick([
        { value: 'never', weight: 0 },
        { value: 'always', weight: 1 },
      ]);
      expect(result).toBe('always');
    }
  });

  it('matches the requested distribution within tolerance over many samples', () => {
    const N = 10000;
    const counts: Record<string, number> = { red: 0, cyan: 0, grey: 0 };
    for (let i = 0; i < N; i++) {
      const pick = weightedPick([
        { value: 'red', weight: 40 },
        { value: 'cyan', weight: 40 },
        { value: 'grey', weight: 20 },
      ]);
      counts[pick]++;
    }
    const tolerance = 0.05; // ±5 percentage points
    expect(counts.red / N).toBeGreaterThan(0.4 - tolerance);
    expect(counts.red / N).toBeLessThan(0.4 + tolerance);
    expect(counts.cyan / N).toBeGreaterThan(0.4 - tolerance);
    expect(counts.cyan / N).toBeLessThan(0.4 + tolerance);
    expect(counts.grey / N).toBeGreaterThan(0.2 - tolerance);
    expect(counts.grey / N).toBeLessThan(0.2 + tolerance);
  });
});
