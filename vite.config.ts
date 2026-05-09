import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Resolve model — env var takes precedence over vite.config default
  const ollamaModel = process.env.VITE_OLLAMA_MODEL
    || env.VITE_OLLAMA_MODEL
    || 'gemma4:e2b';

  const ollamaTarget = process.env.OLLAMA_TARGET
    || env.OLLAMA_TARGET
    || 'http://100.x.x.x:11434';

  return {
    plugins: [react()],

    // Expose resolved values as both import.meta.env.VITE_* AND process.env.*
    // so existing code using either pattern works correctly.
    define: {
      'process.env.OLLAMA_HOST':  JSON.stringify('/ollama-api'),
      'process.env.OLLAMA_MODEL': JSON.stringify(ollamaModel),
    },

    server: {
      port: 3000,
      host: true,
      allowedHosts: true,

      // Vite dev server proxy — handles browser requests in dev mode
      // /ollama-api → Tailscale Ollama node (direct, no Nginx hop in dev)
      // /ai-speech  → Wyoming bridge on NAS port 10500
      proxy: {
        '/ollama-api': {
          target: ollamaTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama-api/, ''),
        },
        '/ai-speech': {
          target: 'http://127.0.0.1:10500',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ai-speech/, ''),
        },
      },
    },
  };
});