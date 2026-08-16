import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output — copies only required files into .next/standalone
  // This keeps the Docker image lean (no node_modules in final image)
  output: 'standalone',

  // Never expose server env vars to the browser unless explicitly prefixed NEXT_PUBLIC_
  // This is the Next.js equivalent of Vite's import.meta.env guard
  serverExternalPackages: ['pg', 'ioredis', 'jose', 'bullmq'],

  experimental: {
    // Causality engine pipeline takes 30-90s on Ollama.
    // Default proxy timeout is too short — extend to 5 minutes.
    proxyTimeout: 300_000,
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' http://localhost:3100 http://localhost:3080;",
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
