import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Use '.' instead of process.cwd() for better Docker compatibility
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    define: {
      // Priority: Docker Env Var (process.env) -> .env file (env)
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY || env.API_KEY),
    },
    server: {
      port: 3000,
      host: true, // Expose to network
      allowedHosts: ['mps-connect.thegeekybeng.com'], // CRITICAL: Allows access via Cloudflare tunnel domain
    },
  };
});