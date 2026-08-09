import { verifyAccessToken, verifyAnyToken } from '../lib/jwt.js';

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
    } catch (e) {
      // Fallback to legacy verification for tokens issued before unify (7d)
      try {
        payload = await verifyAnyToken(token);
      } catch {
        throw e;
      }
    }

    // jose payload uses sub, legacy uses id
    req.userId = payload.sub || payload.id;
    req.userEmail = payload.email;
    req.tokenPayload = payload;
    if (!req.userId) throw new Error('Invalid token payload');
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

export default auth;
