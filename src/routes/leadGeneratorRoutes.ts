import { Router } from 'express';
import {
  authenticate,
  adminOnly,
  requireLeadGeneratorAccess,
  requireLeadGeneratorBroker,
} from '../middleware/auth';
import {
  searchCarriers,
  getCarrierContact,
  listSaves,
  createSave,
  deleteSave,
  exportCsv,
  adminListAllSaves,
} from '../controllers/leadGeneratorController';

const router = Router();

router.use(authenticate);

// Carrier search — any LG tier (or admin)
router.get('/search', requireLeadGeneratorAccess, searchCarriers);

// Carrier contact (phone/email) for click-to-call — any LG tier (or admin)
router.get('/carrier/:dot/contact', requireLeadGeneratorAccess, getCarrierContact);

// CSV export — broker/admin only
router.get('/export.csv', requireLeadGeneratorBroker, exportCsv);

// Saved leads — any LG tier (or admin); always scoped to the current user
router.get('/saves', requireLeadGeneratorAccess, listSaves);
router.post('/saves', requireLeadGeneratorAccess, createSave);
router.delete('/saves/:id', requireLeadGeneratorAccess, deleteSave);

// Admin-only cross-user view
router.get('/admin/saves', adminOnly, adminListAllSaves);

export default router;
