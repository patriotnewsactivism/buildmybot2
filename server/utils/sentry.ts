import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { env } from '../env';

export function initSentry() {
  const dsn = env.VITE_SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN;
  const normalizedDsn = typeof dsn === 'string' ? dsn.trim() : '';
  const isPlaceholder =
    normalizedDsn.includes('your-sentry-dsn') ||
    normalizedDsn.includes('sentry.io/project-id');

  if (!normalizedDsn || isPlaceholder) {
    console.log('Sentry DSN not configured, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn: normalizedDsn,
    integrations: [nodeProfilingIntegration()],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
    environment: env.NODE_ENV || 'development',
  });

  console.log('Sentry initialized');
}

export { Sentry };
