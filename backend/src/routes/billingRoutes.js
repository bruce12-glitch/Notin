// WP-BILLING-001 — /api/billing routes.
//
// NOTE: POST /api/billing/webhook is NOT registered here. It needs the RAW
// request body for Stripe signature verification, so it is mounted directly in
// server.js BEFORE the global express.json parser. Everything in this router
// goes through the normal JSON pipeline.
//
// Auth status: status/checkout/portal are Bearer-only (like every other
// user-facing route) — cross-site pages cannot forge the header, so no CSRF
// cookie dance is needed. The webhook is Stripe-only and signature-verified.

import express from 'express';
import rateLimit from 'express-rate-limit';
import auth from '../middleware/auth.js';
import { validateBody, checkoutSchema } from '../lib/validation.js';
import {
  getBillingStatus,
  createCheckoutSession,
  createPortalSession,
} from '../controllers/billingController.js';

const router = express.Router();

// Small budget: status reads are cheap, but checkout/portal create provider
// sessions (and hit Stripe) — 20 per 15 min per user is far above real use.
const billingLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.userId ? `user:${req.userId}` : `ip:${req.socket?.remoteAddress || 'unknown'}`),
});

router.get('/', auth, getBillingStatus);
router.post('/checkout', auth, billingLimit, (req, res, next) => {
  const parsed = validateBody(checkoutSchema, req, res);
  if (!parsed) return;
  req.body = parsed;
  next();
}, createCheckoutSession);
router.post('/portal', auth, billingLimit, createPortalSession);

export default router;
