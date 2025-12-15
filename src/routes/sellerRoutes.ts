import { Router } from 'express';
import {
  getDashboardStats,
  getListings,
  getOffers,
  getEarnings,
  getVerificationStatus,
  getDocuments,
  getAnalytics,
} from '../controllers/sellerController';
import { authenticate, sellerOnly } from '../middleware/auth';

const router = Router();

// All seller routes require authentication and seller role
router.use(authenticate);
router.use(sellerOnly);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Listings
router.get('/listings', getListings);

// Offers
router.get('/offers', getOffers);

// Earnings
router.get('/earnings', getEarnings);

// Verification
router.get('/verification', getVerificationStatus);

// Documents
router.get('/documents', getDocuments);

// Analytics
router.get('/analytics', getAnalytics);

export default router;
