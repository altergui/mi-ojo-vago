import { preview, type PreviewServer } from 'vite';

const PORT = 4319;

/**
 * Vitest global setup: runs once, before any e2e test file, in the main
 * process. Uses Vite's programmatic preview() API (in-process) rather than
 * spawning `vite preview` as a child process — a spawned child leaves an
 * orphan behind that this process can't reliably reach to kill (npx/vite's
 * own process nesting), which was hanging the whole e2e run on teardown.
 * `process.env` changes made here are inherited by the worker processes
 * that actually run the test files, which is how E2E_BASE_URL reaches them.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const server: PreviewServer = await preview({
    preview: { port: PORT, strictPort: true },
  });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite preview did not report a URL to serve from');
  process.env.E2E_BASE_URL = url.replace(/\/$/, '');

  return () => server.close();
}
