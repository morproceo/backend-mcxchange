import { Router } from 'express';
import * as fuelProgramController from '../controllers/fuelProgramController';
import rateLimit from 'express-rate-limit';

const router = Router();

const fuelFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many fuel program form submissions, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

router.post('/submit', fuelFormLimiter, fuelProgramController.submitFuelProgramForm);

export default router;
