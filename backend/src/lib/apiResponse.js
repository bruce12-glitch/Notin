// WP-HARDEN-001 — shared, safe API error helpers.
//
// Every helper here is deliberately small and returns the `res` object so
// controllers can `return sendX(res, ...)`. Only public, static strings reach
// the client: never stack traces, SQL errors, provider errors, token values,
// or database URLs. Operational logging goes through lib/logging.js (logError)
// — never console.log — so request correlation stays intact.
//
// The global Express error handler in src/server.js remains the single
// catch-all for unhandled errors; these helpers are for handled failures.

import { logError } from './logging.js';

/**
 * Standard validation-failure envelope (WP-HARDEN-001):
 *   { message: 'Validation failed', code: 'VALIDATION_ERROR', details: [{ field, message }] }
 */
export function sendValidationError(res, details) {
  return res.status(400).json({
    message: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: Array.isArray(details) ? details : [],
  });
}

/** 404 with a static message. */
export function sendNotFound(res, message = 'Not found') {
  return res.status(404).json({ message });
}

/** 409 (duplicate / conflict) with a static message. */
export function sendConflict(res, message = 'Conflict') {
  return res.status(409).json({ message });
}

/**
 * 500 with a static public message. The error is logged through the shared
 * logging mechanism with an optional short static context label (never user
 * content). `requestId` is additive — the global error handler already
 * includes it, so including it here keeps handled 500s consistent.
 */
export function sendInternalError(req, res, error, publicMessage = 'Internal Server Error', context) {
  logError(req, error, context);
  const body = { message: publicMessage };
  if (req && req.id) body.requestId = req.id;
  return res.status(500).json(body);
}
