import { afterEach, describe, expect, it, vi } from 'vitest';
import { asset } from './assets';

// import.meta.env.BASE_URL is what Vite substitutes for the deploy's `base`.
function withBase(base: string, run: () => void) {
  vi.stubEnv('BASE_URL', base);
  try {
    run();
  } finally {
    vi.unstubAllEnvs();
  }
}

afterEach(() => vi.unstubAllEnvs());

describe('asset', () => {
  it('serves from the root when the app is deployed at the root', () => {
    withBase('/', () => {
      expect(asset('/brand/logo.png')).toBe('/assets/brand/logo.png');
    });
  });

  it('prefixes the subdirectory when deployed under one', () => {
    withBase('/mi-ojo-vago_stg/', () => {
      expect(asset('/brand/logo.png')).toBe('/mi-ojo-vago_stg/assets/brand/logo.png');
    });
  });

  it('never doubles the slash between base and assets', () => {
    withBase('/mi-ojo-vago/', () => {
      expect(asset('/amblyotris')).not.toContain('//');
    });
  });

  it('builds directory paths usable as a soundBasePath prefix', () => {
    withBase('/mi-ojo-vago/', () => {
      expect(`${asset('/amblyotris')}/theme.mp3`).toBe('/mi-ojo-vago/assets/amblyotris/theme.mp3');
    });
  });
});
