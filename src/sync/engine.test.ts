import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

/**
 * engine.ts is a module-level singleton (in-memory snapshot + localStorage),
 * so each test needs a fresh localStorage stub *and* a fresh module graph
 * (vi.resetModules + dynamic import) to isolate from other tests — same
 * pattern as settings/store.test.ts and calibration/store.test.ts.
 */
function stubLocalStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
  return data;
}

// Hoisted mock of the network boundary — no real fetch calls in these tests.
vi.mock('./client', () => ({
  pullBlob: vi.fn(),
  pushBlob: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks(); // resetModules doesn't clear the hoisted './client' mock's call history
  vi.stubGlobal('navigator', { userAgent: 'test-agent' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const IDENTITY = { name: 'Juan Perez', dob: '2000-01-01' };

describe('registerSync (new identity)', () => {
  it('zeroes local stats and gameplay settings synchronously, before anything is pushed', async () => {
    stubLocalStorage();
    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue(null); // identity doesn't exist yet
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');
    statsStore.addTraining('amblyotris', 5000, defaultDichopticSettings());
    expect(statsStore.get().totalMs).toBe(5000); // seeded

    const { saveGameplaySettings } = await import('@/settings/store');
    saveGameplaySettings({ opacity: ['33', '33', 'FF', 'FF'], variantAlternatives: ['filled', 'hollow', 'hollowLine'], variant: 'hollow', cyanEye: 'right', redEyeConfigured: true });

    const { registerSync } = await import('./engine');
    const result = await registerSync(IDENTITY);

    expect(result.ok).toBe(true);
    expect(statsStore.get().totalMs).toBe(0);
    const { loadGameplaySettings } = await import('@/settings/store');
    const { defaultGameplaySettings } = await import('@/engine/dichoptic');
    expect(loadGameplaySettings()).toEqual(defaultGameplaySettings());
  });

  it('leaves calibration untouched', async () => {
    stubLocalStorage();
    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue(null);
    (client.pushBlob as Mock).mockResolvedValue(true);

    const customCalibration = { colorAlternatives: [['#111111', '#222222', '#333333', '#444444']], color: ['#111111', '#222222', '#333333', '#444444'] };
    const { saveCalibration, loadCalibration } = await import('@/calibration/store');
    saveCalibration(customCalibration);

    const { registerSync } = await import('./engine');
    await registerSync(IDENTITY);

    expect(loadCalibration()).toEqual(customCalibration);
  });

  it('eventually pushes a blob with zeroed stats for this device', async () => {
    stubLocalStorage();
    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue(null);
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');
    statsStore.addTraining('amblyotris', 5000, defaultDichopticSettings());

    const { registerSync } = await import('./engine');
    await registerSync(IDENTITY);

    const { getDeviceId } = await import('./deviceId');
    const deviceId = getDeviceId();

    await vi.waitFor(() => expect(client.pushBlob).toHaveBeenCalled());
    const lastCall = (client.pushBlob as Mock).mock.calls.at(-1) as [string, { stats: { devices: Record<string, { stats: { totalMs: number } }> } }];
    expect(lastCall[1].stats.devices[deviceId].stats.totalMs).toBe(0);
  });
});

describe('connectSync (login to an existing identity)', () => {
  it('does not clear local stats or gameplay settings', async () => {
    stubLocalStorage();
    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue(null); // "does it exist" check inside connectSync itself
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');
    statsStore.addTraining('amblyotris', 7000, defaultDichopticSettings());

    const { connectSync } = await import('./engine');
    await connectSync(IDENTITY);

    expect(statsStore.get().totalMs).toBe(7000);
  });

  it('reconciles (max-merges) against the remote copy of this device rather than resetting', async () => {
    stubLocalStorage();
    const { getDeviceId } = await import('./deviceId');
    const deviceId = getDeviceId();

    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue({
      schemaVersion: 3,
      config: { settings: {}, updatedAt: 0 },
      stats: {
        devices: {
          [deviceId]: {
            label: 'other-session',
            lastActiveAt: Date.now(),
            stats: { version: 1, totalMs: 20000, byDay: {}, byGame: {}, contrast: [], sessions: [], bestScore: {} },
          },
        },
      },
    });
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');
    statsStore.addTraining('amblyotris', 1000, defaultDichopticSettings()); // less than the remote's 20000

    const { connectSync } = await import('./engine');
    await connectSync(IDENTITY);

    await vi.waitFor(() => expect(statsStore.get().totalMs).toBe(20000)); // reconciled up, not reset to 0
  });
});

describe('syncNow({ reconcileOwn: false }) — clearing stats while logged in', () => {
  it('does not let a stale remote copy resurrect a local clear', async () => {
    stubLocalStorage();
    const { getDeviceId } = await import('./deviceId');
    const deviceId = getDeviceId();

    const client = await import('./client');
    // The remote still has the pre-clear numbers — this device hasn't pushed
    // the zeroed state yet.
    (client.pullBlob as Mock).mockResolvedValue({
      schemaVersion: 3,
      config: { settings: {}, updatedAt: 0 },
      stats: {
        devices: {
          [deviceId]: {
            label: 'this-device',
            lastActiveAt: Date.now(),
            stats: { version: 1, totalMs: 20000, byDay: {}, byGame: {}, contrast: [], sessions: [], bestScore: {} },
          },
        },
      },
    });
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');
    statsStore.addTraining('amblyotris', 20000, defaultDichopticSettings());

    const { connectSync, syncNow } = await import('./engine');
    await connectSync(IDENTITY);
    await vi.waitFor(() => expect(statsStore.get().totalMs).toBe(20000));

    statsStore.clear();
    expect(statsStore.get().totalMs).toBe(0); // seeded

    // connectSync's own fire-and-forget syncNow() may still be mid-flight (past
    // the reconcile above but not yet through its push), which would make our
    // call below a same-sync-in-progress no-op — retry until a push actually
    // lands, rather than asserting on a specific await.
    await vi.waitFor(async () => {
      const before = (client.pushBlob as Mock).mock.calls.length;
      await syncNow({ reconcileOwn: false });
      expect((client.pushBlob as Mock).mock.calls.length).toBeGreaterThan(before);
    });

    expect(statsStore.get().totalMs).toBe(0); // stays cleared, not resurrected from the stale remote max
    const pushedBlob = (client.pushBlob as Mock).mock.calls.at(-1)?.[1] as { stats: { devices: Record<string, { stats: { totalMs: number } }> } };
    expect(pushedBlob.stats.devices[deviceId].stats.totalMs).toBe(0); // and the clear reaches the server too
  });
});

describe('disconnectSync (logout)', () => {
  it('clears local stats without pushing anything', async () => {
    stubLocalStorage();
    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue(null);
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');
    statsStore.addTraining('amblyotris', 3000, defaultDichopticSettings());

    const { connectSync, disconnectSync } = await import('./engine');
    await connectSync(IDENTITY);
    (client.pushBlob as Mock).mockClear();

    disconnectSync();

    expect(statsStore.get().totalMs).toBe(0);
    expect(client.pushBlob).not.toHaveBeenCalled();
  });

  it('disables sync meta but leaves deviceId untouched', async () => {
    stubLocalStorage();
    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue(null);
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { getDeviceId } = await import('./deviceId');
    const deviceIdBefore = getDeviceId();

    const { connectSync, disconnectSync } = await import('./engine');
    await connectSync(IDENTITY);
    disconnectSync();

    const { loadSyncMeta } = await import('./schema');
    expect(loadSyncMeta().enabled).toBe(false);
    expect(getDeviceId()).toBe(deviceIdBefore);
  });

  it('leaves calibration and gameplay settings untouched', async () => {
    stubLocalStorage();
    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue(null);
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { saveCalibration, loadCalibration } = await import('@/calibration/store');
    const calibration = { colorAlternatives: [['#123456', '#234567', '#345678', '#456789']], color: ['#123456', '#234567', '#345678', '#456789'] };
    saveCalibration(calibration);

    const { saveGameplaySettings, loadGameplaySettings } = await import('@/settings/store');
    const gameplay = {
      opacity: ['66', '66', 'FF', 'FF'],
      variantAlternatives: ['filled', 'hollow', 'hollowLine'] as ('filled' | 'hollow' | 'hollowLine')[],
      variant: 'hollow' as const,
      cyanEye: 'right' as const,
      redEyeConfigured: true,
    };
    saveGameplaySettings(gameplay);

    const { connectSync, disconnectSync } = await import('./engine');
    await connectSync(IDENTITY);
    disconnectSync();

    expect(loadCalibration()).toEqual(calibration);
    expect(loadGameplaySettings()).toEqual(gameplay);
  });
});

describe('clearAccountStats (account-wide "Clear data")', () => {
  it('clears local stats immediately with no network calls when sync is disabled', async () => {
    stubLocalStorage();
    const client = await import('./client');

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');
    statsStore.addTraining('amblyotris', 5000, defaultDichopticSettings());

    const { clearAccountStats } = await import('./engine');
    await clearAccountStats();

    expect(statsStore.get().totalMs).toBe(0);
    expect(client.pullBlob).not.toHaveBeenCalled();
    expect(client.pushBlob).not.toHaveBeenCalled();
  });

  it('zeroes every device (including a cached other device) and pushes a fresh resetAt when sync is enabled', async () => {
    stubLocalStorage();
    const { getDeviceId } = await import('./deviceId');
    const deviceId = getDeviceId();

    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue({
      schemaVersion: 4,
      config: { settings: {}, updatedAt: 0 },
      stats: {
        devices: {
          [deviceId]: { label: 'this-device', lastActiveAt: Date.now(), stats: { version: 1, totalMs: 5000, byDay: {}, byGame: {}, contrast: [], sessions: [], bestScore: {} } },
          'other-device': { label: 'other-device', lastActiveAt: Date.now(), stats: { version: 1, totalMs: 99000, byDay: {}, byGame: {}, contrast: [], sessions: [], bestScore: {} } },
        },
        resetAt: 0,
      },
    });
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');
    statsStore.addTraining('amblyotris', 5000, defaultDichopticSettings());

    const { connectSync, clearAccountStats } = await import('./engine');
    await connectSync(IDENTITY);
    await vi.waitFor(() => expect(client.pushBlob).toHaveBeenCalled());
    (client.pushBlob as Mock).mockClear();

    const before = Date.now();
    // connectSync's own fire-and-forget syncNow() may still be mid-flight
    // (holding the module's `syncing` guard) even after its push landed —
    // retry until our call actually gets through, same pattern as the
    // "does not let a stale remote copy resurrect a local clear" test above.
    await vi.waitFor(async () => {
      await clearAccountStats();
      expect(client.pushBlob).toHaveBeenCalledTimes(1);
    });

    expect(statsStore.get().totalMs).toBe(0);
    const pushedBlob = (client.pushBlob as Mock).mock.calls.at(-1)?.[1] as {
      stats: { devices: Record<string, { stats: { totalMs: number } }>; resetAt: number };
    };
    expect(pushedBlob.stats.devices[deviceId].stats.totalMs).toBe(0);
    expect(pushedBlob.stats.devices['other-device'].stats.totalMs).toBe(0);
    expect(pushedBlob.stats.resetAt).toBeGreaterThanOrEqual(before);
  });
});

describe('syncOnce self-clearing on a newer remote resetAt', () => {
  it('clears local stats before reconciling when the remote resetAt is newer than lastAppliedResetAt', async () => {
    stubLocalStorage();
    const { getDeviceId } = await import('./deviceId');
    const deviceId = getDeviceId();

    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue({
      schemaVersion: 4,
      config: { settings: {}, updatedAt: 0 },
      stats: {
        devices: {
          [deviceId]: { label: 'this-device', lastActiveAt: Date.now(), stats: { version: 1, totalMs: 0, byDay: {}, byGame: {}, contrast: [], sessions: [], bestScore: {} } },
        },
        resetAt: Date.now(),
      },
    });
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');
    statsStore.addTraining('amblyotris', 42000, defaultDichopticSettings());

    const { connectSync } = await import('./engine');
    await connectSync(IDENTITY);

    await vi.waitFor(() => expect(statsStore.get().totalMs).toBe(0)); // self-cleared, not reconciled up
  });

  it('does not re-clear (or lose freshly-accrued time) on a second sync with the same resetAt', async () => {
    stubLocalStorage();
    const { getDeviceId } = await import('./deviceId');
    const deviceId = getDeviceId();
    const resetAt = Date.now();

    const client = await import('./client');
    (client.pullBlob as Mock).mockResolvedValue({
      schemaVersion: 4,
      config: { settings: {}, updatedAt: 0 },
      stats: {
        devices: {
          [deviceId]: { label: 'this-device', lastActiveAt: Date.now(), stats: { version: 1, totalMs: 0, byDay: {}, byGame: {}, contrast: [], sessions: [], bestScore: {} } },
        },
        resetAt,
      },
    });
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { statsStore } = await import('@/stats/store');
    const { defaultDichopticSettings } = await import('@/engine/dichoptic');

    const { connectSync, syncNow } = await import('./engine');
    await connectSync(IDENTITY);
    await vi.waitFor(() => expect(statsStore.get().totalMs).toBe(0));

    // Freshly-accrued time after the reset was already applied once.
    statsStore.addTraining('amblyotris', 3000, defaultDichopticSettings());
    await syncNow();

    expect(statsStore.get().totalMs).toBe(3000); // not wiped again by the same resetAt
  });
});

describe('calibration never syncs', () => {
  it('a full sync cycle never reads or writes the calibration store, even as remote gameplay settings win LWW', async () => {
    stubLocalStorage();
    const { saveCalibration, loadCalibration } = await import('@/calibration/store');
    const localCalibration = { colorAlternatives: [['#000000', '#000000', '#000000', '#000000']], color: ['#000000', '#000000', '#000000', '#000000'] };
    saveCalibration(localCalibration);

    const { defaultGameplaySettings } = await import('@/engine/dichoptic');
    const { saveGameplaySettings } = await import('@/settings/store');
    saveGameplaySettings(defaultGameplaySettings());

    const client = await import('./client');
    const remoteGameplay = { opacity: ['33', '33', '33', '33'], variantAlternatives: ['filled', 'hollow', 'hollowLine'], variant: 'hollowLine', cyanEye: 'right' };
    (client.pullBlob as Mock).mockResolvedValue({
      schemaVersion: 3,
      config: { settings: remoteGameplay, updatedAt: Date.now() + 1_000_000 }, // far in the future: always wins LWW
      stats: { devices: {} },
    });
    (client.pushBlob as Mock).mockResolvedValue(true);

    const { connectSync } = await import('./engine');
    await connectSync(IDENTITY);

    const { loadGameplaySettings } = await import('@/settings/store');
    await vi.waitFor(() => expect(loadGameplaySettings().variant).toBe('hollowLine')); // remote gameplay settings did win

    expect(loadCalibration()).toEqual(localCalibration); // calibration is completely unaffected
  });
});
