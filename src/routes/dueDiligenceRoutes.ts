import { Router } from 'express';
import { dueDiligenceController } from '../controllers/dueDiligenceController';
import { authenticate, adminOnly } from '../middleware/auth';

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(adminOnly);

// Health check
router.get('/health', dueDiligenceController.healthCheck);

// Analyze MC number
router.get('/analyze/:mcNumber', dueDiligenceController.analyze);

export default router;
