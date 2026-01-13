import { Router } from 'express';
import {
  lookupByDOT,
  lookupByMC,
  getCarrierSnapshot,
  getAuthorityHistory,
  getInsuranceHistory,
  verifyMC,
  getSMSData,
} from '../controllers/fmcsaController';

const router = Router();

// All FMCSA routes are public (for carrier search on services page)
router.get('/dot/:dotNumber', lookupByDOT);
router.get('/mc/:mcNumber', lookupByMC);
router.get('/snapshot/:identifier', getCarrierSnapshot);
router.get('/authority/:dotNumber', getAuthorityHistory);
router.get('/insurance/:dotNumber', getInsuranceHistory);
router.get('/verify/:mcNumber', verifyMC);
router.get('/sms/:dotNumber', getSMSData);

export default router;
