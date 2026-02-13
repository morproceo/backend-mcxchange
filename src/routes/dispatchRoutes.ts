import { Router } from 'express';
import * as dispatchController from '../controllers/dispatchController';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter for dispatch form submissions — 5 per hour per IP
const dispatchFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many dispatch form submissions, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

// Public route — no auth required
router.post('/submit', dispatchFormLimiter, dispatchController.submitDispatchForm);

export default router;
