import { Router } from 'express';
import { handleStripeWebhook } from '../controllers/webhookController';
import { webhookLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * Stripe Webhook Endpoint
 *
 * IMPORTANT: This route must NOT use JSON body parser middleware.
 * Stripe webhook verification requires the raw request body.
 * The raw body should be set up in the main app before JSON parsing.
 *
 * POST /api/webhooks/stripe
 */
router.post(
  '/stripe',
  webhookLimiter,
  handleStripeWebhook
);

export default router;
