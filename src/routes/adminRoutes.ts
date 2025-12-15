import { Router } from 'express';
import {
  getDashboardStats,
  getPendingListings,
  approveListing,
  rejectListing,
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
router.get('/listings/pending', getPendingListings);
router.post('/listings/:id/approve', approveListing);
router.post('/listings/:id/reject', validate(rejectListingValidation), rejectListing);

// Users
router.get('/users', getUsers);
router.get('/users/:id', getUserDetails);
router.post('/users/:id/block', validate(blockUserValidation), blockUser);
router.post('/users/:id/unblock', unblockUser);
router.post('/users/:id/verify-seller', verifySeller);

// Premium requests
router.get('/premium-requests', getPremiumRequests);
router.put('/premium-requests/:id', updatePremiumRequest);

// Transactions
router.get('/transactions', getAllTransactions);

// Action log
router.get('/action-log', getActionLog);

// Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// Analytics
router.get('/analytics/revenue', getRevenueAnalytics);
router.get('/analytics/users', getUserAnalytics);
router.get('/analytics/listings', getListingAnalytics);

// Broadcast
router.post('/broadcast', broadcastMessage);

export default router;
