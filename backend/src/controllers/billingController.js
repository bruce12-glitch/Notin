// WP-BILLING-001 — Stripe billing controller (config-gated).
//
// Money surfaces are deliberately boring:
//   • GET  /api/billing          — the caller's plan + effective entitlements
//   • POST /api/billing/checkout — Stripe Checkout session URL (subscription)
//   • POST /api/billing/portal   — Stripe billing-portal session URL
//   • POST /api/billing/webhook  — RAW-body signed Stripe events (mounted in
//     server.js BEFORE express.json so the signature sees the exact bytes).
//
// The webhook is the ONLY code path that mutates plan state. Checkout success
// redirects alone never promote a user — a crafted success_url cannot
// self-upgrade. Every failure here returns a static public message; provider
// details go to logs only, never to clients.

import db from '../config/db.js';
import { logError } from '../lib/logging.js';
import { sendInternalError } from '../lib/apiResponse.js';
import {
  billingConfig,
  isBillingConfigured,
  isWebhookConfigured,
  entitlementsForPlan,
  isPlanActive,
  stripeRequest,
  verifyStripeSignature,
  BillingProviderError,
} from '../lib/billing.js';

const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing']);

function publicOrigin() {
  return String(process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || 'http://localhost:5000').replace(/\/+$/, '');
}

function planPayload(user) {
  const plan = String(user?.plan || 'free').toLowerCase() === 'pro' ? 'pro' : 'free';
  return {
    plan,
    status: user?.planStatus || (isPlanActive(user?.plan, user?.planStatus) ? 'active' : null),
    renewsAt: user?.planRenewsAt || null,
    entitlements: entitlementsForPlan(user?.plan, user?.planStatus),
  };
}

/** GET /api/billing — capability + current plan + effective entitlements. */
export async function getBillingStatus(req, res) {
  try {
    const user = await db.user.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    res.set('Cache-Control', 'no-store');
    return res.json({
      configured: isBillingConfigured(),
      ...planPayload(user),
    });
  } catch (error) {
    return sendInternalError(req, res, error, 'Could not load billing status', 'getBillingStatus');
  }
}

/** POST /api/billing/checkout {plan:'pro'} — starts a Stripe Checkout session. */
export async function createCheckoutSession(req, res) {
  try {
    if (!isBillingConfigured()) {
      return res.status(503).json({ message: 'Billing is not configured on this deployment' });
    }
    const user = await db.user.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (isPlanActive(user.plan, user.planStatus)) {
      return res.status(409).json({ message: 'You are already on the Pro plan' });
    }

    // Reuse the Stripe customer created by a previous (abandoned) checkout.
    let customerId = user.stripeCustomerId || null;
    if (!customerId) {
      const customer = await stripeRequest('/v1/customers', {
        email: user.email,
        'metadata[userId]': user.id,
      });
      customerId = customer.id;
      const now = new Date().toISOString();
      await db.query(
        `UPDATE "User" SET "stripeCustomerId" = $1, "updatedAt" = $2 WHERE id = $3`,
        [customerId, now, user.id],
      );
    }

    const origin = publicOrigin();
    const session = await stripeRequest('/v1/checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': billingConfig.proPriceId,
      'line_items[0][quantity]': 1,
      success_url: `${origin}${billingConfig.successPath}`,
      cancel_url: `${origin}${billingConfig.cancelPath}`,
      client_reference_id: user.id,
      'metadata[userId]': user.id,
      'subscription_data[metadata][userId]': user.id,
      allow_promotion_codes: 'true',
    });
    if (!session?.url) throw new BillingProviderError('Checkout session had no redirect URL', 502);
    return res.json({ url: session.url });
  } catch (error) {
    if (error instanceof BillingProviderError) {
      return sendInternalError(req, res, error, 'Could not start checkout. Try again shortly.', 'createCheckoutSession');
    }
    return sendInternalError(req, res, error, 'Could not start checkout. Try again shortly.', 'createCheckoutSession');
  }
}

/** POST /api/billing/portal — Stripe customer-portal session URL. */
export async function createPortalSession(req, res) {
  try {
    if (!isBillingConfigured()) {
      return res.status(503).json({ message: 'Billing is not configured on this deployment' });
    }
    const user = await db.user.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (!user.stripeCustomerId) {
      return res.status(409).json({ message: 'No billing profile yet — upgrade to Pro first' });
    }
    const session = await stripeRequest('/v1/billing_portal/sessions', {
      customer: user.stripeCustomerId,
      return_url: `${publicOrigin()}/app.html?billing=portal`,
    });
    if (!session?.url) throw new BillingProviderError('Portal session had no redirect URL', 502);
    return res.json({ url: session.url });
  } catch (error) {
    return sendInternalError(req, res, error, 'Could not open the billing portal. Try again shortly.', 'createPortalSession');
  }
}

// ── Webhook apply ────────────────────────────────────────────────────────────
// Resolution order for the affected user: explicit metadata.userId /
// client_reference_id, then subscription id, then Stripe customer id. Events
// for unknown users are acknowledged but ignored (they cannot be applied).

async function resolveUserForEvent(obj) {
  const metaUserId = obj?.metadata?.userId || obj?.client_reference_id || null;
  if (metaUserId) {
    const byId = await db.user.findById(String(metaUserId));
    if (byId) return byId;
  }
  if (obj?.id) {
    const bySub = await db.user.findByStripeSubscriptionId(String(obj.id));
    if (bySub) return bySub;
  }
  if (obj?.customer) {
    const byCustomer = await db.user.findByStripeCustomerId(String(obj.customer));
    if (byCustomer) return byCustomer;
  }
  return null;
}

async function applyCheckoutCompleted(session) {
  const user = await resolveUserForEvent(session);
  if (!user) {
    console.warn('[billing] checkout.session.completed for an unresolvable user — ignored');
    return;
  }
  const customerId = session.customer ? String(session.customer) : null;
  const subscriptionId = session.subscription ? String(session.subscription) : null;
  const status = session.status === 'complete' || !session.status ? 'active' : String(session.status);
  await db.query(
    `UPDATE "User"
     SET plan = 'pro', "planStatus" = $1, "stripeCustomerId" = $2,
         "stripeSubscriptionId" = $3, "planRenewsAt" = NULL, "updatedAt" = $4
     WHERE id = $5`,
    [status, customerId, subscriptionId, new Date().toISOString(), user.id],
  );
}

async function applySubscriptionEvent(subscription) {
  const user = await resolveUserForEvent(subscription);
  if (!user) {
    console.warn('[billing] subscription event for an unresolvable user — ignored');
    return;
  }
  const status = String(subscription.status || 'unknown');
  const now = new Date().toISOString();

  // Terminal failure → back to free. incomplete_expired means the first
  // payment never succeeded; canceled means the sub ended for good.
  if (status === 'canceled' || status === 'incomplete_expired') {
    await db.query(
      `UPDATE "User"
       SET plan = 'free', "planStatus" = 'canceled', "stripeSubscriptionId" = NULL,
           "planRenewsAt" = NULL, "updatedAt" = $1
       WHERE id = $2`,
      [now, user.id],
    );
    return;
  }

  const renewsAt = subscription.current_period_end
    ? new Date(Number(subscription.current_period_end) * 1000).toISOString()
    : null;
  const plan = ACTIVE_SUB_STATUSES.has(status) ? 'pro' : (user.plan === 'pro' ? 'pro' : 'free');
  await db.query(
    `UPDATE "User"
     SET plan = $1, "planStatus" = $2, "stripeCustomerId" = $3,
         "stripeSubscriptionId" = $4, "planRenewsAt" = $5, "updatedAt" = $6
     WHERE id = $7`,
    [plan, status, subscription.customer ? String(subscription.customer) : user.stripeCustomerId,
     String(subscription.id), renewsAt, now, user.id],
  );
}

/**
 * POST /api/billing/webhook — raw-body Stripe events. Mounted with
 * express.raw in server.js. 401-style security: an unverifiable signature is a
 * flat 400 with no detail, and the handler never acts on unknown event types.
 */
export async function handleStripeWebhook(req, res) {
  if (!isWebhookConfigured()) {
    return res.status(503).json({ message: 'Webhook secret is not configured' });
  }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!raw) return res.status(400).json({ message: 'Invalid payload' });

  const verified = verifyStripeSignature({
    payload: raw,
    header: req.headers['stripe-signature'],
    secret: billingConfig.webhookSecret,
  });
  if (!verified) return res.status(400).json({ message: 'Invalid signature' });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const type = typeof event?.type === 'string' ? event.type : '';
  const obj = event?.data?.object && typeof event?.data?.object === 'object' ? event.data.object : {};

  try {
    if (type === 'checkout.session.completed') {
      await applyCheckoutCompleted(obj);
    } else if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      await applySubscriptionEvent(obj);
    }
    // Unknown event types are acknowledged — Stripe retries anything else.
    return res.json({ received: true });
  } catch (error) {
    // 500 makes Stripe retry; the event stays verifiable and idempotent.
    return sendInternalError(req, res, error, 'Webhook handling failed', 'handleStripeWebhook');
  }
}
