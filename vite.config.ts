import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome105', 'safari13'],
    minify: process.env.TAURI_DEBUG ? false : 'esbuild',
    sourcemap: Boolean(process.env.TAURI_DEBUG),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
