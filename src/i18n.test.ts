import { describe, expect, it } from 'vitest';
import { langFromSearch } from './i18n';

describe('langFromSearch', () => {
  it('reads lang=es', () => {
    expect(langFromSearch('?lang=es')).toBe('es');
  });

  it('reads lang=en', () => {
    expect(langFromSearch('?lang=en')).toBe('en');
  });

  it('returns null when there is no lang param', () => {
    expect(langFromSearch('')).toBeNull();
    expect(langFromSearch('?foo=bar')).toBeNull();
  });

  it('returns null for an unrecognized value, never a made-up language', () => {
    expect(langFromSearch('?lang=fr')).toBeNull();
  });

  it('reads lang alongside other params, in any position', () => {
    expect(langFromSearch('?foo=bar&lang=en&baz=qux')).toBe('en');
  });
});
