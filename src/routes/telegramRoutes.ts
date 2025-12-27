import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth';
import * as telegramController from '../controllers/telegramController';

const router = Router();

// All routes require admin authentication
router.use(authenticate, adminOnly);

// Configuration
router.get('/config', telegramController.getConfig);
router.put('/config', telegramController.updateConfig);
router.post('/test', telegramController.testConnection);

// Messaging
router.post('/send', telegramController.sendMessage);
router.post('/share-listing', telegramController.shareListing);

// Listings for sharing
router.get('/listings', telegramController.getListingsForSharing);

export default router;
