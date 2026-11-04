import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), {
    // GitHub Pages needs a 404.html copy for deep links; Cloudflare Pages serves index.html
    // for unknown paths by itself, but only when there is no 404.html.
    name: 'spa-404',
    closeBundle() { if (!process.env.CF_PAGES) copyFileSync('dist/index.html', 'dist/404.html'); },
  }],
});
