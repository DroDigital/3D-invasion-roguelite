import { defineConfig } from 'vite';

// Everything under /assets is served as-is; paths come from assets/manifest.json.
export default defineConfig({
  base: './',
  publicDir: 'assets',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
