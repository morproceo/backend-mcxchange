import { Router } from 'express';
import {
  getDashboardStats,
  getOffers,
  getPurchases,
  getSavedListings,
  getUnlockedListings,
  getSubscription,
  getTransactions,
} from '../controllers/buyerController';
import { authenticate, buyerOnly } from '../middleware/auth';

const router = Router();

// All buyer routes require authentication and buyer role
router.use(authenticate);
router.use(buyerOnly);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Offers
router.get('/offers', getOffers);

// Purchases
router.get('/purchases', getPurchases);

// Saved listings
router.get('/saved', getSavedListings);

// Unlocked listings
router.get('/unlocked', getUnlockedListings);

// Subscription
router.get('/subscription', getSubscription);

// Transactions
router.get('/transactions', getTransactions);

export default router;
