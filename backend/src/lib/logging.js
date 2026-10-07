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

// Log correlation and a bounded error category. Driver errors, stacks, URLs,
// and request data can contain credentials or private notes and never belong here.
const ERROR_TYPES = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'DatabaseError']);
export function logError(req, error, context) {
  const id = isSaneRequestId(req?.id) ? req.id : '-';
  const label = typeof context === 'string' && /^[A-Za-z0-9 _-]{1,80}$/.test(context) ? context : 'request';
  const errorType = ERROR_TYPES.has(error?.name) ? error.name : 'Error';
  console.error('Application error', { requestId: id, context: label, errorType });
}
