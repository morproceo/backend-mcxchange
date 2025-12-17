import { Router } from 'express';
import {
  getDashboardStats,
  getOffers,
  getPurchases,
  getSavedListings,
  getUnlockedListings,
  getSubscription,
  getTransactions,
  createSubscriptionCheckout,
  cancelSubscription,
  verifySubscription,
} from '../controllers/buyerController';
import { authenticate, buyerOnly, requireSubscription } from '../middleware/auth';

const router = Router();

// All buyer routes require authentication and buyer role
router.use(authenticate);
router.use(buyerOnly);

// Subscription routes - no subscription required (so users can subscribe)
router.get('/subscription', getSubscription);
router.post('/subscription/checkout', createSubscriptionCheckout);
router.post('/subscription/cancel', cancelSubscription);
router.post('/subscription/verify', verifySubscription);

// Dashboard - no subscription required (shows subscription status)
router.get('/dashboard', getDashboardStats);

// Routes that require active subscription
router.get('/offers', requireSubscription, getOffers);
router.get('/purchases', requireSubscription, getPurchases);
router.get('/saved', requireSubscription, getSavedListings);
router.get('/unlocked', requireSubscription, getUnlockedListings);
router.get('/transactions', requireSubscription, getTransactions);

export default router;
