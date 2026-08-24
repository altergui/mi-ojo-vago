import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // Subpath deploys (e.g. the cPanel hosting at /mi-ojo-vago-dev/) set VITE_BASE;
  // Cloudflare and `npm run dev` serve from the root.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
