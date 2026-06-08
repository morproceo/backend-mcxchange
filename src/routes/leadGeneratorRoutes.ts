import { Router } from 'express';
import {
  authenticate,
  adminOnly,
  requireLeadGeneratorAccess,
} from '../middleware/auth';
import {
  searchCarriers,
  getCarrierContact,
  listSaves,
  createSave,
  deleteSave,
  exportCsv,
  adminListAllSaves,
  getAccess,
} from '../controllers/leadGeneratorController';

const router = Router();

router.use(authenticate);

// Access check — authenticated, NOT gated by requireLeadGeneratorAccess so it can
// return { hasAccess:false } (200) instead of 403, and never touches the external
// carrier-data provider. The UI uses this to decide whether to show the tool.
router.get('/access', getAccess);

// Carrier search — any LG tier (or admin)
router.get('/search', requireLeadGeneratorAccess, searchCarriers);

// Carrier contact (phone/email) for click-to-call — any LG tier (or admin)
router.get('/carrier/:dot/contact', requireLeadGeneratorAccess, getCarrierContact);

// CSV export — any tier. Buyer gets the current page (25 rows); broker/admin get
// the full result set enriched with phone + email. Tier split is in the controller.
router.get('/export.csv', requireLeadGeneratorAccess, exportCsv);

// Saved leads — any LG tier (or admin); always scoped to the current user
router.get('/saves', requireLeadGeneratorAccess, listSaves);
router.post('/saves', requireLeadGeneratorAccess, createSave);
router.delete('/saves/:id', requireLeadGeneratorAccess, deleteSave);

// Admin-only cross-user view
router.get('/admin/saves', adminOnly, adminListAllSaves);

export default router;
