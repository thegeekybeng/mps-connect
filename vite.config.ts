import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    define: {
      'process.env.OLLAMA_HOST': JSON.stringify('/ollama-api'),
      'process.env.OLLAMA_MODEL': JSON.stringify(process.env.OLLAMA_MODEL || env.OLLAMA_MODEL || 'gemma4:e2b'),
    },
    server: {
      port: 3000,
      host: true,
      allowedHosts: true,
      proxy: {
        '/ollama-api': {
          target: 'http://100.x.x.x:11434',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama-api/, ''),
        },
      },
    },
  };
});