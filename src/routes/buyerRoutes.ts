import { Router } from 'express';
import {
  getDashboardStats,
  getOffers,
  getPurchases,
  getSavedListings,
  getUnlockedListings,
  getSubscription,
  getTransactions,
  getStripePaymentHistory,
  createSubscriptionCheckout,
  cancelSubscription,
  verifySubscription,
  createPremiumRequest,
  getPremiumRequests,
  getTermsStatus,
  acceptTerms,
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

// Premium requests - require subscription to request premium access
router.post('/premium-requests', requireSubscription, createPremiumRequest);
router.get('/premium-requests', requireSubscription, getPremiumRequests);

// Stripe payment history - no subscription required (to see payment history)
router.get('/stripe-history', getStripePaymentHistory);

// Terms of Service - no subscription required
router.get('/terms-status', getTermsStatus);
router.post('/accept-terms', acceptTerms);

export default router;
