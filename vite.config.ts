import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // The actual Ollama server — used by the Vite proxy (server-side, never seen by browser)
  const ollamaTarget = process.env.OLLAMA_TARGET || env.OLLAMA_TARGET || 'http://100.x.x.x:11434';

  return {
    plugins: [react()],
    define: {
      // Browser always calls /ollama-api/ (same-origin) — nginx or Vite proxy handles it
      'process.env.OLLAMA_HOST': JSON.stringify('/ollama-api'),
      'process.env.OLLAMA_MODEL': JSON.stringify(process.env.OLLAMA_MODEL || env.OLLAMA_MODEL || 'gemma4:e2b'),
    },
    server: {
      port: 3000,
      host: true,
      allowedHosts: true,
      proxy: {
        '/ollama-api': {
          target: ollamaTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama-api/, ''),
        },
      },
    },
  };
});