import { Router } from 'express';
import * as safetyServicesController from '../controllers/safetyServicesController';
import rateLimit from 'express-rate-limit';

const router = Router();

const safetyFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many safety services form submissions, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

router.post('/submit', safetyFormLimiter, safetyServicesController.submitSafetyForm);

export default router;
