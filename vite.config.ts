import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve('./'),
      '@shared': path.resolve('./shared'),
    },
  },
  define: {
    'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(
      process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
    ),
    'import.meta.env.VITE_CARTESIA_API_KEY': JSON.stringify(
      process.env.CARTESIA_API_KEY || '',
    ),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
