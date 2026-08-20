import crypto from 'node:crypto';

// WP-OPS-001 — request correlation. Inbound ids are echoed only when they are
// short and charset-safe so a client cannot smuggle header/log injection.
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isSaneRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_RE.test(value);
}

export function resolveRequestId(headerValue) {
  if (isSaneRequestId(headerValue)) return headerValue;
  return crypto.randomUUID();
}

// Shared error logger. Logs the request id + an optional context label + the
// Error object. Never pass tokens, passwords, emails, or note content as
// `context` — keep it a short static string.
export function logError(req, error, context) {
  const id = req && req.id ? req.id : '-';
  if (context) {
    console.error(`[${id}] ${context}`, error);
  } else {
    console.error(`[${id}]`, error);
  }
}
