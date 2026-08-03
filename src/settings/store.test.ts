import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * settingsStore is a module-level singleton that reads localStorage at import
 * time, so each test needs a fresh localStorage stub *and* a fresh module
 * instance (vi.resetModules + dynamic import) to isolate from other tests.
 */
function stubLocalStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a fresh install (no prior settings at all)', () => {
  it('gets updatedAt: 0, so it always loses an LWW merge against any real remote data', async () => {
    stubLocalStorage();
    const { loadSettingsEnvelope } = await import('./store');
    expect(loadSettingsEnvelope().updatedAt).toBe(0);
  });
});

describe('legacy pre-sync data (a bare DichopticSettings blob, no envelope)', () => {
  it('gets updatedAt: now, protecting real configuration from being clobbered by stale remote data', async () => {
    stubLocalStorage({ 'miojovago.settings.global': JSON.stringify({ variant: 'hollow' }) });
    const before = Date.now();
    const { loadSettingsEnvelope } = await import('./store');
    expect(loadSettingsEnvelope().updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('saveSettings', () => {
  it('bumps updatedAt to now on an explicit edit', async () => {
    stubLocalStorage();
    const { loadSettingsEnvelope, saveSettings } = await import('./store');
    const before = Date.now();
    saveSettings(loadSettingsEnvelope().settings);
    expect(loadSettingsEnvelope().updatedAt).toBeGreaterThanOrEqual(before);
  });
});
