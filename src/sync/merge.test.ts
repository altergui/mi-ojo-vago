import { describe, expect, it } from 'vitest';
import { capSessionsForPush, mergeConfig, mergeForDisplay, reconcileOwnStats, zeroStats, SESSIONS_PUSH_CAP } from './merge';
import type { StatsData, SessionRecord } from '@/stats/store';
import type { DichopticSettings } from '@/engine/dichoptic';

function stats(overrides: Partial<StatsData> = {}): StatsData {
  return { ...zeroStats(1), ...overrides };
}

function session(id: string, startedAt: string, durationMs = 60_000, deviceId = 'device-a'): SessionRecord {
  return {
    id,
    game: 'amblyotris',
    startedAt,
    durationMs,
    deviceId,
    settings: { cyanEye: 'left', cyanPercent: 100, redPercent: 60, variant: 'filled' },
  };
}

const dummySettings = {} as DichopticSettings;

describe('reconcileOwnStats', () => {
  it('returns local unchanged when there is no remote entry yet', () => {
    const local = stats({ totalMs: 1000 });
    expect(reconcileOwnStats(local, undefined)).toBe(local);
  });

  it('takes the max per counter, never regressing local data', () => {
    const local = stats({
      totalMs: 1000,
      byDay: { '2026-08-01': 500, '2026-08-02': 500 },
      byGame: { amblyotris: 1000 },
      bestScore: { amblyotris: 40 },
    });
    const remote = stats({
      totalMs: 2000, // ahead of local (e.g. local storage was partially lost)
      byDay: { '2026-08-01': 300, '2026-08-02': 900 }, // mixed: one behind, one ahead
      byGame: { amblyotris: 700 }, // behind local
      bestScore: { amblyotris: 55 }, // ahead of local
    });

    const merged = reconcileOwnStats(local, remote);

    expect(merged.totalMs).toBe(2000);
    expect(merged.byDay).toEqual({ '2026-08-01': 500, '2026-08-02': 900 });
    expect(merged.byGame).toEqual({ amblyotris: 1000 });
    expect(merged.bestScore).toEqual({ amblyotris: 55 });
  });

  it('takes the max ms per contrast bucket, matched by signature', () => {
    const bucket = { cyanPercent: 100, redPercent: 60, variant: 'filled', cyanEye: 'left' as const };
    const local = stats({ contrast: [{ ...bucket, ms: 5000 }] });
    const remote = stats({ contrast: [{ ...bucket, ms: 9000 }] });

    const merged = reconcileOwnStats(local, remote);

    expect(merged.contrast).toEqual([{ ...bucket, ms: 9000 }]);
  });

  it('unions sessions by id, deduping, sorted newest-first', () => {
    const local = stats({ sessions: [session('a', '2026-08-02T10:00:00Z'), session('b', '2026-08-01T10:00:00Z')] });
    const remote = stats({ sessions: [session('b', '2026-08-01T10:00:00Z'), session('c', '2026-08-03T10:00:00Z')] });

    const merged = reconcileOwnStats(local, remote);

    expect(merged.sessions.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('mergeForDisplay', () => {
  it('sums additive counters across own + remote devices', () => {
    const own = stats({ totalMs: 1000, byDay: { '2026-08-01': 1000 }, byGame: { amblyotris: 1000 } });
    const remoteDevices = {
      deviceB: stats({ totalMs: 2000, byDay: { '2026-08-01': 500, '2026-08-02': 1500 }, byGame: { amblyonoid: 2000 } }),
    };

    const merged = mergeForDisplay(own, remoteDevices);

    expect(merged.totalMs).toBe(3000);
    expect(merged.byDay).toEqual({ '2026-08-01': 1500, '2026-08-02': 1500 });
    expect(merged.byGame).toEqual({ amblyotris: 1000, amblyonoid: 2000 });
  });

  it('sums contrast bucket ms across devices, matched by signature', () => {
    const bucket = { cyanPercent: 100, redPercent: 60, variant: 'filled', cyanEye: 'left' as const };
    const own = stats({ contrast: [{ ...bucket, ms: 1000 }] });
    const remoteDevices = { deviceB: stats({ contrast: [{ ...bucket, ms: 500 }] }) };

    const merged = mergeForDisplay(own, remoteDevices);

    expect(merged.contrast).toEqual([{ ...bucket, ms: 1500 }]);
  });

  it('takes the max bestScore across devices, not a sum', () => {
    const own = stats({ bestScore: { amblyotris: 40 } });
    const remoteDevices = { deviceB: stats({ bestScore: { amblyotris: 90 } }) };

    expect(mergeForDisplay(own, remoteDevices).bestScore).toEqual({ amblyotris: 90 });
  });

  it('unions sessions across devices, dedupes by id, caps at 200', () => {
    // 250 own (August) sessions alone exceed the 200 cap, so every kept session
    // should be an own one — none of the 50 older (July) remote sessions fit.
    const timeAt = (day: string, i: number) => `${day}T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`;
    const many = Array.from({ length: 250 }, (_, i) => session(`own-${i}`, timeAt('2026-08-01', i), 60_000, 'device-a'));
    const moreMany = Array.from({ length: 50 }, (_, i) => session(`remote-${i}`, timeAt('2026-07-01', i), 60_000, 'device-b'));
    const own = stats({ sessions: many });
    const remoteDevices = { deviceB: stats({ sessions: moreMany }) };

    const merged = mergeForDisplay(own, remoteDevices);

    expect(merged.sessions.length).toBe(200);
    expect(merged.sessions.every((s) => s.id.startsWith('own-') && s.deviceId === 'device-a')).toBe(true);
  });

  it('with no remote devices, is equivalent to own stats', () => {
    const own = stats({ totalMs: 500, bestScore: { amblyotris: 10 } });
    expect(mergeForDisplay(own, {})).toEqual(own);
  });
});

describe('capSessionsForPush', () => {
  it('trims sessions to the push budget without touching other fields', () => {
    const many = Array.from({ length: 100 }, (_, i) => session(`s${i}`, `2026-08-01T00:00:${String(i).padStart(2, '0')}Z`));
    const data = stats({ totalMs: 999, sessions: many });

    const capped = capSessionsForPush(data);

    expect(capped.sessions.length).toBe(SESSIONS_PUSH_CAP);
    expect(capped.totalMs).toBe(999);
  });
});

describe('mergeConfig', () => {
  it('keeps local when there is no remote config yet', () => {
    const local = { settings: dummySettings, updatedAt: 100 };
    expect(mergeConfig(local, undefined)).toBe(local);
  });

  it('picks whichever side has the newer updatedAt, wholesale', () => {
    const local = { settings: { variant: 'filled' } as DichopticSettings, updatedAt: 100 };
    const remote = { settings: { variant: 'hollow' } as DichopticSettings, updatedAt: 200 };

    expect(mergeConfig(local, remote)).toBe(remote);
    expect(mergeConfig(remote, local)).toBe(remote);
  });
});
