import { verifyAccessToken } from '../lib/jwt.js';
import db from '../config/db.js';

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const payload = await verifyAccessToken(token);

    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.tokenPayload = payload;
    if (!req.userId) throw new Error('Invalid token payload');
    // Access JWTs are stateless, so confirm the account still exists. This
    // makes a deleted account's remaining short-lived token fail immediately.
    const user = await db.user.findById(req.userId);
    if (!user) throw new Error('Account no longer exists');
    // WP-SEC-004 — token versioning: password reset increments tokenVersion,
    // invalidating all previously issued access tokens even if they are still
    // within their 15m window. Refresh tokens are already revoked at reset time.
    const payloadTv = Number.isFinite(Number(payload.tv)) ? Number(payload.tv) : 0;
    const userTv = Number.isFinite(Number(user.tokenVersion)) ? Number(user.tokenVersion) : 0;
    if (payloadTv !== userTv) throw new Error('Stale token version');
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

export default auth;
