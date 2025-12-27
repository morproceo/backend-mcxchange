import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { UserRole } from '../models';
import * as consultationController from '../controllers/consultationController';

const router = Router();

// Public routes (no auth required)
router.post('/checkout', consultationController.createCheckoutSession);

// Webhook route (no auth, but verified by Stripe)
router.post('/webhook', consultationController.handleWebhook);

// Admin routes
router.get('/', authenticate, requireRole([UserRole.ADMIN]), consultationController.getAll);
router.get('/stats', authenticate, requireRole([UserRole.ADMIN]), consultationController.getStats);
router.get('/:id', authenticate, requireRole([UserRole.ADMIN]), consultationController.getById);
router.put('/:id/status', authenticate, requireRole([UserRole.ADMIN]), consultationController.updateStatus);
router.post('/:id/refund', authenticate, requireRole([UserRole.ADMIN]), consultationController.refund);

export default router;
