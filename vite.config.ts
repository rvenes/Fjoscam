import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rendererContentSecurityPolicy } from './src/shared/contentSecurityPolicy';

export default defineConfig(({ command }) => ({
  plugins: [react(), {
    name: 'fjoscam-renderer-csp',
    transformIndexHtml: () => [{
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: rendererContentSecurityPolicy(command === 'serve') },
      injectTo: 'head-prepend',
    }],
  }],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', 'out/**', 'dist/**', 'dist-renderer/**', 'dist-electron/**'],
  },
}));
