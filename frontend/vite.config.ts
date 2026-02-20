import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    outDir: 'build',
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
});
