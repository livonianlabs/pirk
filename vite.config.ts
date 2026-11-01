import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), { name: 'spa-404', closeBundle() { copyFileSync('dist/index.html', 'dist/404.html'); } }],
});
