import { beforeAll, describe, expect, it } from 'vitest';
import { buildJoinLink, computeSecretHash, normalizeDob, normalizeName, parseJoinLinkParams } from './identity';

// buildJoinLink reads window.location; stub just enough (no jsdom dependency needed).
beforeAll(() => {
  (globalThis as unknown as { window: { location: { origin: string; pathname: string } } }).window = {
    location: { origin: 'https://mi-ojo-vago.guidev.org', pathname: '/' },
  };
});

describe('normalizeName', () => {
  it('lowercases', () => {
    expect(normalizeName('JUAN PEREZ')).toBe('juan perez');
  });

  it('strips diacritics', () => {
    expect(normalizeName('Juan Pérez')).toBe('juan perez');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeName('Juan   Pérez')).toBe('juan perez');
  });

  it('trims leading whitespace', () => {
    expect(normalizeName('  Juan Perez')).toBe('juan perez');
  });

  it('trims trailing whitespace', () => {
    expect(normalizeName('Juan Perez ')).toBe('juan perez');
  });

  it('trims leading and trailing whitespace together', () => {
    expect(normalizeName('  Juan Perez  ')).toBe('juan perez');
  });

  it('folds ñ to n, as documented (ASCII-fold, not a preserved special case)', () => {
    expect(normalizeName('Muñoz')).toBe('munoz');
  });

  it('all of the above combined give the same result', () => {
    const variants = ['Juan Pérez', 'JUAN PEREZ', 'juan   pérez', '  Juan Perez ', 'juan perez'];
    const normalized = variants.map(normalizeName);
    expect(new Set(normalized).size).toBe(1);
  });
});

describe('normalizeDob', () => {
  it('passes an ISO date through unchanged', () => {
    expect(normalizeDob('1990-05-12')).toBe('1990-05-12');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeDob(' 1990-05-12 ')).toBe('1990-05-12');
  });
});

describe('computeSecretHash', () => {
  it('is deterministic across repeated calls', async () => {
    const a = await computeSecretHash('Juan Pérez', '1990-05-12');
    const b = await computeSecretHash('Juan Pérez', '1990-05-12');
    expect(a).toBe(b);
  });

  it('gives the same hash for inputs that normalize the same way', async () => {
    const a = await computeSecretHash('Juan Pérez', '1990-05-12');
    const b = await computeSecretHash('  juan   perez  ', ' 1990-05-12 ');
    expect(a).toBe(b);
  });

  it('gives a different hash for a different name', async () => {
    const a = await computeSecretHash('Juan Pérez', '1990-05-12');
    const b = await computeSecretHash('Juana Pérez', '1990-05-12');
    expect(a).not.toBe(b);
  });

  it('gives a different hash for a different dob', async () => {
    const a = await computeSecretHash('Juan Pérez', '1990-05-12');
    const b = await computeSecretHash('Juan Pérez', '1990-05-13');
    expect(a).not.toBe(b);
  });

  it('is a 64-char lowercase hex digest', async () => {
    const hash = await computeSecretHash('Juan Pérez', '1990-05-12');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildJoinLink / parseJoinLinkParams', () => {
  it('round-trips a name with spaces and accents', () => {
    const url = buildJoinLink({ name: 'Juan Pérez', dob: '1990-05-12' });
    const search = new URLSearchParams(url.split('?')[1]);
    expect(parseJoinLinkParams(search)).toEqual({ name: 'Juan Pérez', dob: '1990-05-12' });
  });

  it('returns null when name is missing', () => {
    const search = new URLSearchParams({ dob: '1990-05-12' });
    expect(parseJoinLinkParams(search)).toBeNull();
  });

  it('returns null when dob is missing', () => {
    const search = new URLSearchParams({ name: 'Juan Pérez' });
    expect(parseJoinLinkParams(search)).toBeNull();
  });
});
