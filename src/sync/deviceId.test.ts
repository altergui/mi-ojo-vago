import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceLabel, shortDeviceId } from './deviceId';

describe('shortDeviceId', () => {
  it('trims a full UUID down to a glanceable prefix', () => {
    expect(shortDeviceId('a3f9c1e2-1234-5678-9abc-def012345678')).toBe('a3f9c1e2');
  });
});

function setUserAgent(ua: string): void {
  vi.stubGlobal('navigator', { userAgent: ua });
}

describe('getDeviceLabel', () => {
  beforeEach(() => setUserAgent(''));

  it('returns the raw user agent when short enough', () => {
    setUserAgent('Mozilla/5.0 (short)');
    expect(getDeviceLabel()).toBe('Mozilla/5.0 (short)');
  });

  it('truncates very long user agent strings with an ellipsis', () => {
    setUserAgent('x'.repeat(200));
    const label = getDeviceLabel();
    expect(label.length).toBe(71); // 70 chars + ellipsis
    expect(label.endsWith('…')).toBe(true);
  });
});
