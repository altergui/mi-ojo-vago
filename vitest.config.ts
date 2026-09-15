import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Reuses vite.config.ts's plugins/alias/define rather than duplicating them —
// the two configs must never drift on the `@` alias or the JSX transform.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Existing 103 tests are pure logic and stay on the faster default
      // ('node'); component tests opt into jsdom per-file via a
      // `// @vitest-environment jsdom` docblock instead of flipping this
      // globally.
      environment: 'node',
      setupFiles: ['./src/test/setup.ts'],
      // e2e/ has its own config (vitest.e2e.config.ts) and its own runner
      // (`npm run test:e2e`) — excluded here so `npm test` never tries to
      // spin up a browser.
      exclude: [...configDefaults.exclude, 'e2e/**'],
    },
  })
);
