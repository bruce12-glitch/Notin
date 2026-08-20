import { resolveRequestId } from '../lib/logging.js';

// WP-OPS-001 — honour a sane inbound X-Request-Id, otherwise mint a UUID.
// Mount early (after trust proxy, before routers) so every response — including
// health, static, and the final error handler — carries the same id.
export default function requestId(req, res, next) {
  const inbound = req.headers['x-request-id'];
  const raw = Array.isArray(inbound) ? inbound[0] : inbound;
  const id = resolveRequestId(raw);
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
