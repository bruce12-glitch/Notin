// WP-AUDIT — unit tests for lib/jwt.js (access token + CSRF primitives)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import {
  createAccessToken,
  verifyAccessToken,
  mintCsrfToken,
  verifyCsrfToken,
  jwtConfig,
} from '../../src/lib/jwt.js';

const user = { id: 'c123abc', email: 'user@example.com', tokenVersion: 2 };

test('access token round-trips and carries sub/type/tv but NO email (WP-AUDIT-L2)', async () => {
  const token = await createAccessToken(user);
  const payload = await verifyAccessToken(token);
  assert.equal(payload.sub, user.id);
  assert.equal(payload.type, 'access');
  assert.equal(payload.tv, 2);
  assert.equal(payload.email, undefined, 'email is PII and must not be embedded in the JWT');
  assert.equal(payload.iss, jwtConfig.issuer);
  assert.equal(payload.aud, jwtConfig.audience);
});

test('access token defaults tokenVersion to 0 when missing', async () => {
  const token = await createAccessToken({ id: 'c9' });
  const payload = await verifyAccessToken(token);
  assert.equal(payload.tv, 0);
});

test('rejects a token signed with the wrong key', async () => {
  const forged = await new SignJWT({ sub: 'c1', type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(jwtConfig.issuer)
    .setAudience(jwtConfig.audience)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode('attacker-controlled-key-material-32chars!!'));
  await assert.rejects(() => verifyAccessToken(forged));
});

test('rejects a token with the wrong type claim', async () => {
  const wrongType = await new SignJWT({ sub: 'c1', type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(jwtConfig.issuer)
    .setAudience(jwtConfig.audience)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(jwtConfig.accessSecret));
  await assert.rejects(() => verifyAccessToken(wrongType), /Invalid token type/);
});

test('rejects a token with the wrong issuer', async () => {
  const wrongIss = await new SignJWT({ sub: 'c1', type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('not-notin')
    .setAudience(jwtConfig.audience)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(jwtConfig.accessSecret));
  await assert.rejects(() => verifyAccessToken(wrongIss));
});

test('CSRF token: mint/verify round-trip', () => {
  const token = mintCsrfToken();
  assert.equal(typeof token, 'string');
  assert.ok(token.includes('.'));
  assert.equal(verifyCsrfToken(token), true);
});

test('CSRF token: tampered value is rejected', () => {
  const token = mintCsrfToken();
  const dot = token.lastIndexOf('.');
  const tamperedSig = token.slice(0, dot + 1) + (token.endsWith('a') ? 'b' : 'a');
  assert.equal(verifyCsrfToken(tamperedSig), false);
  const tamperedRand = 'x' + token.slice(1);
  assert.equal(verifyCsrfToken(tamperedRand), false);
});

test('CSRF token: malformed inputs are rejected, never throw', () => {
  assert.equal(verifyCsrfToken(undefined), false);
  assert.equal(verifyCsrfToken(null), false);
  assert.equal(verifyCsrfToken(''), false);
  assert.equal(verifyCsrfToken('no-dot-here'), false);
  assert.equal(verifyCsrfToken('.'), false);
  assert.equal(verifyCsrfToken(42), false);
});
