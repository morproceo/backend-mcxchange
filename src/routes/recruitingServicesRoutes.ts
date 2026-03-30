import { Router } from 'express';
import * as recruitingServicesController from '../controllers/recruitingServicesController';
import rateLimit from 'express-rate-limit';

const router = Router();

const recruitingFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many recruiting form submissions, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

router.post('/submit', recruitingFormLimiter, recruitingServicesController.submitRecruitingForm);

export default router;
