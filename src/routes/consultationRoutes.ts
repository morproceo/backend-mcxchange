import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth';
import * as consultationController from '../controllers/consultationController';

const router = Router();

// Public routes (no auth required)
router.post('/checkout', consultationController.createCheckoutSession);

// Webhook route (no auth, but verified by Stripe)
router.post('/webhook', consultationController.handleWebhook);

// Admin routes
router.get('/', authenticate, adminOnly, consultationController.getAll);
router.get('/stats', authenticate, adminOnly, consultationController.getStats);
router.get('/:id', authenticate, adminOnly, consultationController.getById);
router.put('/:id/status', authenticate, adminOnly, consultationController.updateStatus);
router.post('/:id/refund', authenticate, adminOnly, consultationController.refund);

export default router;
