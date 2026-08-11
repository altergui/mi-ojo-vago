import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Same isolation pattern as settings/store.test.ts: a module-level singleton reads localStorage at import time. */
function stubLocalStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
  return data;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a fresh install (nothing stored anywhere)', () => {
  it('falls back to the default calibration', async () => {
    stubLocalStorage();
    const { loadCalibration } = await import('./store');
    const { DEFAULT_COLOR_ALTERNATIVES } = await import('@/engine/dichoptic');
    expect(loadCalibration().colorAlternatives).toEqual(DEFAULT_COLOR_ALTERNATIVES);
  });
});

describe('migration from the legacy combined settings key', () => {
  const legacyColorAlternatives = [
    ['#000000', '#111111', '#222222', '#333333'],
    ['#444444', '#555555', '#666666', '#777777'],
  ];
  const legacyColor = ['#000000', '#111111', '#222222', '#333333'];

  it('extracts colorAlternatives/color out of a bare (pre-envelope) legacy blob', async () => {
    stubLocalStorage({
      'miojovago.settings.global': JSON.stringify({
        colorAlternatives: legacyColorAlternatives,
        color: legacyColor,
        opacity: ['FF', 'FF', 'FF', 'FF'],
        variantAlternatives: ['filled', 'hollow', 'hollowLine'],
        variant: 'filled',
        cyanEye: 'left',
      }),
    });
    const { loadCalibration } = await import('./store');
    expect(loadCalibration()).toEqual({ colorAlternatives: legacyColorAlternatives, color: legacyColor });
  });

  it('extracts from the envelope-wrapped legacy shape too', async () => {
    stubLocalStorage({
      'miojovago.settings.global': JSON.stringify({
        schemaVersion: 1,
        updatedAt: 999,
        settings: {
          colorAlternatives: legacyColorAlternatives,
          color: legacyColor,
          opacity: ['FF', 'FF', 'FF', 'FF'],
          variantAlternatives: ['filled', 'hollow', 'hollowLine'],
          variant: 'filled',
          cyanEye: 'left',
        },
      }),
    });
    const { loadCalibration } = await import('./store');
    expect(loadCalibration()).toEqual({ colorAlternatives: legacyColorAlternatives, color: legacyColor });
  });

  it('write-throughs the migrated value, so a later load never needs to touch the legacy key again', async () => {
    const data = stubLocalStorage({
      'miojovago.settings.global': JSON.stringify({ colorAlternatives: legacyColorAlternatives, color: legacyColor }),
    });
    const { loadCalibration } = await import('./store');
    loadCalibration();
    expect(data.has('miojovago.calibration.v1')).toBe(true);

    // Remove the legacy key entirely and reload the module: the new key alone must be enough.
    data.delete('miojovago.settings.global');
    vi.resetModules();
    const { loadCalibration: loadAgain } = await import('./store');
    expect(loadAgain()).toEqual({ colorAlternatives: legacyColorAlternatives, color: legacyColor });
  });
});

describe('saveCalibration / calibrationStore', () => {
  it('persists and is read back verbatim, independent of the legacy key', async () => {
    stubLocalStorage();
    const { loadCalibration, saveCalibration } = await import('./store');
    const next = { colorAlternatives: [['#AAAAAA', '#BBBBBB', '#CCCCCC', '#DDDDDD']], color: ['#AAAAAA', '#BBBBBB', '#CCCCCC', '#DDDDDD'] };
    saveCalibration(next);
    expect(loadCalibration()).toEqual(next);
  });

  it('notifies subscribers on save', async () => {
    stubLocalStorage();
    const { calibrationStore, saveCalibration } = await import('./store');
    const listener = vi.fn();
    calibrationStore.subscribe(listener);
    saveCalibration({ colorAlternatives: [['#000000', '#000000', '#000000', '#000000']], color: ['#000000', '#000000', '#000000', '#000000'] });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
