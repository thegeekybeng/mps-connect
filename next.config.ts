import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output — copies only required files into .next/standalone
  // This keeps the Docker image lean (no node_modules in final image)
  output: 'standalone',

  // Never expose server env vars to the browser unless explicitly prefixed NEXT_PUBLIC_
  // This is the Next.js equivalent of Vite's import.meta.env guard
  serverExternalPackages: ['pg', 'ioredis', 'jose'],

  experimental: {
    // Causality engine pipeline takes 30-90s on Ollama.
    // Default proxy timeout is too short — extend to 5 minutes.
    proxyTimeout: 300_000,
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
