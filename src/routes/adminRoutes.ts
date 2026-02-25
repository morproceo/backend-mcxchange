import { Router } from 'express';
import {
  getDashboardStats,
  getPendingListings,
  approveListing,
  rejectListing,
  getListingById,
  updateListing,
  getUsers,
  getUserDetails,
  blockUser,
  unblockUser,
  verifySeller,
  getPremiumRequests,
  updatePremiumRequest,
  getAllListings,
  getAllTransactions,
  getActionLog,
  getSettings,
  updateSettings,
  getRevenueAnalytics,
  getUserAnalytics,
  getListingAnalytics,
  broadcastMessage,
  rejectListingValidation,
  blockUserValidation,
  getAllOffers,
  adminApproveOffer,
  adminRejectOffer,
  createUser,
  createUserValidation,
  createListing,
  createListingValidation,
  createUserWithListing,
  updateUserRole,
  updateUserRoleValidation,
  getPricingConfig,
  updatePricingConfig,
  getStripeTransactions,
  getStripeBalance,
  getStripeBalanceTransactions,
  adjustUserCredits,
  adjustCreditsValidation,
  blockUserForMismatch,
  blockUserMismatchValidation,
  getAllDisputes,
  resolveDispute,
  rejectDispute,
  processAutoUnblock,
  getNotificationSettings,
  updateNotificationSettings,
  getUserActivityLog,
  getActivityLog,
} from '../controllers/adminController';
import { authenticate, adminOnly } from '../middleware/auth';
import validate from '../middleware/validate';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(adminOnly);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Listings
router.get('/listings', getAllListings);
router.post('/listings', validate(createListingValidation), createListing);
router.get('/listings/pending', getPendingListings);
router.get('/listings/:id', getListingById);
router.put('/listings/:id', updateListing);
router.post('/listings/:id/approve', approveListing);
router.post('/listings/:id/reject', validate(rejectListingValidation), rejectListing);

// Users
router.get('/users', getUsers);
router.post('/users', validate(createUserValidation), createUser);
router.post('/users/with-listing', createUserWithListing);
router.get('/users/:id', getUserDetails);
router.get('/users/:id/activity-log', getUserActivityLog);
router.put('/users/:id/role', validate(updateUserRoleValidation), updateUserRole);
router.post('/users/:id/block', validate(blockUserValidation), blockUser);
router.post('/users/:id/unblock', unblockUser);
router.post('/users/:id/verify-seller', verifySeller);
router.post('/users/:id/credits', validate(adjustCreditsValidation), adjustUserCredits);

// Premium requests
router.get('/premium-requests', getPremiumRequests);
router.put('/premium-requests/:id', updatePremiumRequest);

// Transactions
router.get('/transactions', getAllTransactions);

// Offers
router.get('/offers', getAllOffers);
router.post('/offers/:id/approve', adminApproveOffer);
router.post('/offers/:id/reject', adminRejectOffer);

// Action log
router.get('/action-log', getActionLog);
router.get('/activity-log', getActivityLog);

// Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// Analytics
router.get('/analytics/revenue', getRevenueAnalytics);
router.get('/analytics/users', getUserAnalytics);
router.get('/analytics/listings', getListingAnalytics);

// Broadcast
router.post('/broadcast', broadcastMessage);

// Pricing Configuration
router.get('/pricing', getPricingConfig);
router.put('/pricing', updatePricingConfig);

// Stripe Transactions (payment history from Stripe)
router.get('/stripe/transactions', getStripeTransactions);
router.get('/stripe/balance', getStripeBalance);
router.get('/stripe/balance-transactions', getStripeBalanceTransactions);

// Account Disputes
router.get('/disputes', getAllDisputes);
router.post('/disputes/block-mismatch', validate(blockUserMismatchValidation), blockUserForMismatch);
router.post('/disputes/:id/resolve', resolveDispute);
router.post('/disputes/:id/reject', rejectDispute);
router.post('/disputes/process-auto-unblock', processAutoUnblock);

// Notification Settings
router.get('/settings/notifications', getNotificationSettings);
router.put('/settings/notifications', updateNotificationSettings);

export default router;
