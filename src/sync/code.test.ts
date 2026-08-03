import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalToLinkUrl, canonicalToWords, isValidCanonicalCode, wordsToCanonical } from './code';

// canonicalToLinkUrl reads window.location; stub just enough (no jsdom dependency needed).
beforeAll(() => {
  (globalThis as unknown as { window: { location: { origin: string; pathname: string } } }).window = {
    location: { origin: 'https://mi-ojo-vago.guidev.org', pathname: '/' },
  };
});

describe('wordsToCanonical', () => {
  it('parses a bare canonical code unchanged', () => {
    expect(wordsToCanonical('17-42-742')).toBe('17-42-742');
  });

  it('parses ES words', () => {
    expect(wordsToCanonical(canonicalToWords('17-42-742', 'es'))).toBe('17-42-742');
  });

  it('parses EN words for a code generated/displayed in ES', () => {
    expect(wordsToCanonical(canonicalToWords('17-42-742', 'en'))).toBe('17-42-742');
  });

  it('extracts the code from a pasted sync deep link', () => {
    expect(wordsToCanonical('https://mi-ojo-vago.guidev.org/#/sync/17-42-742')).toBe('17-42-742');
  });

  it('rejects garbage input', () => {
    expect(wordsToCanonical('not a valid code')).toBeNull();
    expect(wordsToCanonical('gato-999-742')).toBeNull(); // "999" isn't a word in either list
  });
});

describe('canonicalToLinkUrl', () => {
  it('builds a deep link that round-trips back through wordsToCanonical', () => {
    const url = canonicalToLinkUrl('17-42-742');
    expect(url).toContain('#/sync/17-42-742');
    expect(wordsToCanonical(url)).toBe('17-42-742');
  });
});

describe('isValidCanonicalCode', () => {
  it('rejects out-of-range indices', () => {
    expect(isValidCanonicalCode('999-0-000')).toBe(false);
  });
});
