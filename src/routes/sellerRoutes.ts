import { Router } from 'express';
import {
  getDashboardStats,
  getListings,
  getOffers,
  getEarnings,
  getVerificationStatus,
  getDocuments,
  getAnalytics,
  createListingFeeCheckout,
  getStripePaymentHistory,
  getConnectStatus,
  createConnectAccount,
  getConnectDashboardLink,
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

// Listing fee payment
router.post('/listing-fee/checkout', createListingFeeCheckout);

// Stripe payment history
router.get('/stripe-history', getStripePaymentHistory);

// Stripe Connect - Payout setup
router.get('/connect/status', getConnectStatus);
router.post('/connect/create', createConnectAccount);
router.get('/connect/dashboard', getConnectDashboardLink);

export default router;
