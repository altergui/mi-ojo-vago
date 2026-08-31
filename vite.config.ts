import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };
const sha = execSync('git rev-parse --short HEAD').toString().trim();

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
    __APP_VERSION__: JSON.stringify(`v${pkg.version} (${sha})`),
  },
});
