export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Warm up queue worker singleton
    await import('./lib/queue');
    console.log('[Instrumentation] Next.js queue worker initialized');
  }
}
