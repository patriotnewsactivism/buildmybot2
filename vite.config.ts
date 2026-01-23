import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve('./'),
        '@shared': path.resolve('./shared'),
      },
    },
    define: {
      'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(
        env.VITE_OPENAI_API_KEY || env.OPENAI_API_KEY || '',
      ),
      'import.meta.env.VITE_CARTESIA_API_KEY': JSON.stringify(
        env.VITE_CARTESIA_API_KEY || env.CARTESIA_API_KEY || '',
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
      watch: {
        usePolling: true,
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
