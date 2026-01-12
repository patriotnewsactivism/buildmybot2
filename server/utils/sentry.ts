import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { env } from '../env';

export function initSentry() {
  const dsn = env.VITE_SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN;
  
  if (!dsn) {
    console.log('Sentry DSN not found, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn,
    integrations: [
      nodeProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
    environment: env.NODE_ENV || 'development',
  });
  
  console.log('Sentry initialized');
}

export { Sentry };
