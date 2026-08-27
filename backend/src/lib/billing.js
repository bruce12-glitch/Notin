// WP-BILLING-001 — config-gated Stripe billing support.
//
// Design rules (mirroring the Google OAuth 503 pattern):
//   • Billing is OPTIONAL. With no STRIPE_SECRET_KEY / STRIPE_PRICE_PRO_MONTHLY
//     the whole product works exactly as before; checkout/portal return 503 and
//     the UI renders an honest "not set up" state.
//   • Zero new npm dependencies. Stripe's REST API is plain HTTPS with
//     form-encoded bodies and Bearer auth — a small fetch client (Node 22
//     global fetch) covers the three calls we need (customers, checkout
//     sessions, billing portal sessions). Webhook signatures are HMAC-SHA256
//     over `<timestamp>.<payload>` verified with timingSafeEqual, the same
//     scheme the official SDK implements.
//   • The webhook — not the redirect — is the single source of truth for plan
//     changes. A successful checkout that never fires the webhook never grants
//     Pro, so a crafted success_url cannot self-upgrade.
//
// Env:
//   STRIPE_SECRET_KEY          sk_live_…/sk_test_… (empty → billing disabled)
//   STRIPE_PRICE_PRO_MONTHLY   price_… for the Pro subscription
//   STRIPE_WEBHOOK_SECRET      whsec_… for /api/billing/webhook signatures
//   STRIPE_API_BASE            override for tests (default https://api.stripe.com)
//   BILLING_SUCCESS_PATH / BILLING_CANCEL_PATH  post-checkout redirects (app paths)
// Entitlements env (server defaults shown):
//   MAX_NOTES_PER_USER=5000            MAX_NOTES_PER_USER_PRO=50000
//   MAX_ATTACHMENT_STORAGE_BYTES=262144000   MAX_ATTACHMENT_STORAGE_BYTES_PRO=10737418240
//   AI_CHAT_LIMIT_FREE=5               AI_CHAT_LIMIT_PRO=60
//   AI_ASSIST_LIMIT_FREE=5             AI_ASSIST_LIMIT_PRO=60

import crypto from 'node:crypto';
import { MAX_ATTACHMENT_STORAGE_BYTES } from './storage.js';

function positiveInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function trimEnv(name) {
  return String(process.env[name] || '').trim();
}

export const billingConfig = {
  secretKey: trimEnv('STRIPE_SECRET_KEY'),
  proPriceId: trimEnv('STRIPE_PRICE_PRO_MONTHLY'),
  webhookSecret: trimEnv('STRIPE_WEBHOOK_SECRET'),
  apiBase: trimEnv('STRIPE_API_BASE') || 'https://api.stripe.com',
  successPath: trimEnv('BILLING_SUCCESS_PATH') || '/app.html?billing=success',
  cancelPath: trimEnv('BILLING_CANCEL_PATH') || '/app.html?billing=canceled',
};

export function isBillingConfigured() {
  return Boolean(billingConfig.secretKey && billingConfig.proPriceId);
}

export function isWebhookConfigured() {
  return Boolean(billingConfig.webhookSecret);
}

export const PRO_PLAN_STATUSES = new Set(['active', 'trialing']);

/** A user only gets Pro entitlements while Stripe reports the sub healthy. */
export function isPlanActive(plan, planStatus) {
  if (String(plan || 'free').toLowerCase() !== 'pro') return false;
  const status = planStatus == null ? 'active' : String(planStatus).toLowerCase();
  return PRO_PLAN_STATUSES.has(status);
}

export const FREE_ENTITLEMENTS = {
  maxNotes: positiveInt('MAX_NOTES_PER_USER', 5000),
  storageQuota: MAX_ATTACHMENT_STORAGE_BYTES,
  aiChatPer15Min: positiveInt('AI_CHAT_LIMIT_FREE', 5),
  aiAssistPer15Min: positiveInt('AI_ASSIST_LIMIT_FREE', 5),
};

const PRO_ENTITLEMENTS = {
  maxNotes: positiveInt('MAX_NOTES_PER_USER_PRO', 50000),
  storageQuota: positiveInt('MAX_ATTACHMENT_STORAGE_BYTES_PRO', 10 * 1024 * 1024 * 1024),
  aiChatPer15Min: positiveInt('AI_CHAT_LIMIT_PRO', 60),
  aiAssistPer15Min: positiveInt('AI_ASSIST_LIMIT_PRO', 60),
};

/**
 * Effective limits for a user row. Past_due/unpaid Pro keeps the Pro LABEL but
 * falls back to free quotas until Stripe reports the subscription healthy —
 * honest state, no free ride, no surprise lockouts.
 */
export function entitlementsForPlan(plan, planStatus) {
  return isPlanActive(plan, planStatus)
    ? { ...PRO_ENTITLEMENTS }
    : { ...FREE_ENTITLEMENTS };
}

export class BillingProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'BillingProviderError';
    this.status = status;
  }
}

/**
 * POST a form-encoded payload to the Stripe REST API. Returns the parsed JSON
 * body. Network/abort failures map to 503; auth failures map to 503 (a
 * misconfigured key is an operator problem, not a user problem); other API
 * errors surface as 502 with the provider's public message.
 */
export async function stripeRequest(pathname, params = {}) {
  const { secretKey, apiBase } = billingConfig;
  if (!secretKey) throw new BillingProviderError('Billing provider is not configured', 503);

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.append(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetch(`${apiBase}${pathname}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });
  } catch {
    throw new BillingProviderError('Billing provider is unreachable', 503);
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const publicMessage = typeof data?.error?.message === 'string' ? data.error.message : 'Billing provider rejected the request';
    const status = response.status === 401 || response.status === 403 ? 503 : 502;
    throw new BillingProviderError(publicMessage, status);
  }
  return data;
}

/**
 * Verify a Stripe webhook `Stripe-Signature` header against the raw body.
 * Header format: `t=<unix-seconds>,v1=<hex hmac of "<t>.<payload>">` (v1 may
 * repeat). Constant-time comparison; ±5 min replay tolerance by default
 * (Stripe's own default). Returns true only on a verified, fresh signature.
 */
export function verifyStripeSignature({ payload, header, secret, toleranceSeconds = 300 }) {
  if (!header || !secret || !payload) return false;
  let timestamp = null;
  const signatures = [];
  for (const part of String(header).split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && !timestamp) timestamp = value;
    else if (key === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(String(sig), 'hex');
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

/** Sign a payload exactly like Stripe would — used by the E2E suite only. */
export function signStripePayload(payload, secret, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestampSeconds}.${payload}`, 'utf8').digest('hex');
  return `t=${timestampSeconds},v1=${sig}`;
}
