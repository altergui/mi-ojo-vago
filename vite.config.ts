import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

// Go pseudo-version style (vX.Y.Z-0.yyyymmddhhmmss-abcdefabcdef): package.json
// isn't bumped per-commit, so an untagged HEAD is unordered and undated on its
// own. Stamping the commit's own timestamp (not build time) keeps the string
// reproducible for a given HEAD, on PRs (built from the pull_request merge
// commit) as much as on main. But — also as in Go — a HEAD that *is* tagged
// with the exact release skips the pseudo-version and shows the plain tag:
// nothing tags releases here yet, so this is dormant until something does.
const sha = execSync('git rev-parse HEAD').toString().trim().slice(0, 12);
const commitEpoch = Number(execSync('git log -1 --format=%ct').toString().trim());
const commitTimestamp = new Date(commitEpoch * 1000).toISOString().replace(/\D/g, '').slice(0, 14);
const tagsAtHead = execSync('git tag --points-at HEAD').toString().trim().split('\n').filter(Boolean);
const isReleaseTagged = tagsAtHead.includes(`v${pkg.version}`);

export default defineConfig({
  // Subpath deploys (e.g. the cPanel hosting at /mi-ojo-vago_stg/) set VITE_BASE;
  // Cloudflare and `npm run dev` serve from the root.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    // Shown in the footer across every deploy target (Cloudflare prod/dev,
    // cPanel prod/stg) — the same one build-time value everywhere, so no
    // per-workflow wiring and no version-bump discipline needed to make it
    // useful: it always names the exact commit that's live.
    __APP_VERSION__: JSON.stringify(
      isReleaseTagged ? `v${pkg.version}` : `v${pkg.version}-0.${commitTimestamp}-${sha}`,
    ),
  },
});
