import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth';
import * as facebookController from '../controllers/facebookController';

const router = Router();

// All routes require admin authentication
router.use(authenticate, adminOnly);

// Configuration
router.get('/config', facebookController.getConfig);
router.put('/config', facebookController.updateConfig);
router.post('/test', facebookController.testConnection);

// Sharing
router.post('/share-listing', facebookController.shareListing);

// Listings for sharing
router.get('/listings', facebookController.getListingsForSharing);

export default router;
