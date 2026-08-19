import bcrypt from 'bcryptjs';
import db from '../config/db.js';
import { createAccessToken, randomToken, hashToken } from '../lib/jwt.js';

function publicUser(u) {
  if (!u) return null;
  const { password, google_sub, googleSub, ...rest } = u;
  // normalize googleSub key
  return { id: u.id, email: u.email, username: u.username || null, googleSub: u.googleSub || u.google_sub || null, createdAt: u.createdAt || u.created_at, updatedAt: u.updatedAt || u.updated_at };
}

export const signup = async (req, res) => {
  const { username, email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  const normEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
    return res.status(400).json({ message: 'Invalid email' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    const existing = await db.user.findUnique({ where: { email: normEmail } });
    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        email: normEmail,
        password: hashed,
        username: username ? String(username).trim() : null,
        googleSub: null,
      },
    });

    const accessToken = await createAccessToken(user, 15);
    // Also issue refresh token for unified session model
    const refreshRaw = randomToken(48);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    // WP-SEC-001 — every signup starts a NEW rotation family
    const familyId = randomToken(24);
    await db.query(
      `INSERT INTO refresh_tokens (hash, user_id, family_id, expires_at, revoked_at, revoke_reason, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [hashToken(refreshRaw), user.id, familyId, expiresAt, null, null, now]
    );

    // Set httpOnly cookie for refresh (same options as auth)
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('notin_refresh', refreshRaw, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 86400000,
    });
    // Also set legacy /auth path for compatibility with auth frontend
    res.cookie('notin_refresh', refreshRaw, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/auth',
      maxAge: 30 * 86400000,
    });

    const pub = publicUser(user);
    res.status(201).json({ user: pub, token: accessToken, accessToken });
  } catch (error) {
    console.error('signup error', error);
    res.status(500).json({ message: 'Something went wrong during signup' });
  }
};

export const signin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  const normEmail = String(email).trim().toLowerCase();

  try {
    const user = await db.user.findUnique({ where: { email: normEmail } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!user.password) {
      return res.status(401).json({ message: 'Invalid credentials — please use Google sign-in for this account' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = await createAccessToken(user, 15);
    const refreshRaw = randomToken(48);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    // WP-SEC-001 — every signin starts a NEW rotation family
    const familyId = randomToken(24);
    await db.query(
      `INSERT INTO refresh_tokens (hash, user_id, family_id, expires_at, revoked_at, revoke_reason, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [hashToken(refreshRaw), user.id, familyId, expiresAt, null, null, now]
    );
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('notin_refresh', refreshRaw, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 86400000,
    });
    res.cookie('notin_refresh', refreshRaw, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/auth',
      maxAge: 30 * 86400000,
    });

    const pub = publicUser(user);
    res.status(200).json({ user: pub, token: accessToken, accessToken });
  } catch (error) {
    console.error('signin error', error);
    res.status(500).json({ message: 'Something went wrong during signin' });
  }
};
