import 'dotenv/config';

let Sentry = null;
let enabled = false;
const dsn = String(process.env.SENTRY_DSN || '').trim();

function isValidDsn(value) {
  try {
    const parsed = new URL(value);
    const projectId = parsed.pathname.split('/').filter(Boolean).at(-1);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      && Boolean(parsed.username)
      && Boolean(parsed.hostname)
      && Boolean(projectId);
  } catch {
    return false;
  }
}

if (dsn) {
  if (!isValidDsn(dsn)) {
    console.warn('⚠️  SENTRY_DSN is invalid; error monitoring is disabled');
  } else {
    try {
      // Keep the SDK entirely out of the runtime path when monitoring is unset.
      Sentry = await import('@sentry/node');
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
        sendDefaultPii: false,
        // Keep error reports deliberately sparse: no request headers/body, user,
        // breadcrumbs, or arbitrary extras that could contain auth/OTP data.
        beforeSend(event) {
          delete event.request;
          delete event.user;
          delete event.extra;
          delete event.breadcrumbs;
          return event;
        },
      });
      enabled = true;
      console.log('✓ Sentry error monitoring enabled');
    } catch {
      console.warn('⚠️  Sentry initialization failed; error monitoring is disabled');
    }
  }
}

export function captureExpressError(error) {
  if (!enabled || !error) return;
  try {
    Sentry.captureException(error);
  } catch {
    // Monitoring must never make an application error path fail again.
  }
}

export function isSentryEnabled() {
  return enabled;
}
