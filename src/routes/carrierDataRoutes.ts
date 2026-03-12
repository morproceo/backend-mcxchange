import { Router } from 'express';
import { getCarrierReport, refreshCarrierReport } from '../controllers/carrierDataController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public — get carrier report (cached 24hr)
router.get('/report/:dotNumber', getCarrierReport);

// Authenticated — force refresh cache
router.post('/report/:dotNumber/refresh', authenticate, refreshCarrierReport);

export default router;
