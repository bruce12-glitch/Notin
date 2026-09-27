import { verifyAccessToken } from '../lib/jwt.js';
import db from '../config/db.js';
import { logError } from '../lib/logging.js';

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    let payload;
    try {
      payload = await verifyAccessToken(token);
    } catch {
      // Bad signature / expired / wrong type — an auth failure, never infra.
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.userId = payload.sub;
    req.tokenPayload = payload;
    if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });
    // Access JWTs are stateless, so confirm the account still exists. This
    // makes a deleted account's remaining short-lived token fail immediately.
    // WP-AUDIT-M4 — a database failure here is NOT an auth failure: answering
    // 401 would send clients into a refresh loop during an outage. Infra
    // errors get 503; only genuine credential problems get 401.
    let user;
    try {
      user = await db.user.findById(req.userId);
    } catch (dbError) {
      logError(req, dbError, 'auth user lookup failed');
      return res.status(503).json({ message: 'Service temporarily unavailable' });
    }
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    req.userEmail = user.email;
    // WP-SEC-004 — token versioning: password reset increments tokenVersion,
    // invalidating all previously issued access tokens even if they are still
    // within their 15m window. Refresh tokens are already revoked at reset time.
    const payloadTv = Number.isFinite(Number(payload.tv)) ? Number(payload.tv) : 0;
    const userTv = Number.isFinite(Number(user.tokenVersion)) ? Number(user.tokenVersion) : 0;
    if (payloadTv !== userTv) return res.status(401).json({ message: 'Unauthorized' });
    next();
  } catch (error) {
    logError(req, error, 'auth middleware unexpected error');
    return res.status(503).json({ message: 'Service temporarily unavailable' });
  }
};

export default auth;
