import { Router } from 'express';
import * as adminServicesController from '../controllers/adminServicesController';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter for admin services form submissions — 5 per hour per IP
const adminServicesFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many admin services form submissions, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

// Public route — no auth required
router.post('/submit', adminServicesFormLimiter, adminServicesController.submitAdminServicesForm);

export default router;
