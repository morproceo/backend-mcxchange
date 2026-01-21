import { Response } from 'express';
import { body } from 'express-validator';
import { adminService } from '../services/adminService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { PremiumRequestStatus } from '../models';
import { parseIntParam, parseBooleanParam } from '../utils/helpers';
import { stripeService } from '../services/stripeService';
import { pricingConfigService } from '../services/pricingConfigService';

// Validation rules
export const rejectListingValidation = [
  body('reason').trim().notEmpty().withMessage('Rejection reason is required'),
];

export const blockUserValidation = [
  body('reason').trim().notEmpty().withMessage('Block reason is required'),
];

export const createUserValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(['BUYER', 'SELLER', 'ADMIN']).withMessage('Valid role is required'),
];

export const createListingValidation = [
  body('mcNumber').trim().notEmpty().withMessage('MC Number is required'),
  body('sellerId').trim().notEmpty().withMessage('Seller ID is required'),
];

// Get dashboard stats
export const getDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const stats = await adminService.getDashboardStats();

  res.json({
    success: true,
    data: stats,
  });
});

// Get pending listings
export const getPendingListings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await adminService.getPendingListings(page, limit);

  res.json({
    success: true,
    data: result.listings,
    pagination: result.pagination,
  });
});

// Approve listing
export const approveListing = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { notes, listingPrice } = req.body;

  const listing = await adminService.approveListing(id, req.user.id, notes, listingPrice);

  res.json({
    success: true,
    data: listing,
    message: 'Listing approved',
  });
});

// Reject listing
export const rejectListing = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { reason } = req.body;

  const listing = await adminService.rejectListing(id, req.user.id, reason);

  res.json({
    success: true,
    data: listing,
    message: 'Listing rejected',
  });
});

// Get all users
export const getUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await adminService.getUsers({
    page: parseIntParam(req.query.page as string),
    limit: parseIntParam(req.query.limit as string),
    search: req.query.search as string,
    role: req.query.role as string,
    status: req.query.status as string,
  });

  res.json({
    success: true,
    data: result.users,
    pagination: result.pagination,
  });
});

// Get user details
export const getUserDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const user = await adminService.getUserDetails(id);

  res.json({
    success: true,
    data: user,
  });
});

// Block user
export const blockUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { reason } = req.body;

  const user = await adminService.blockUser(id, req.user.id, reason);

  res.json({
    success: true,
    data: user,
    message: 'User blocked',
  });
});

// Unblock user
export const unblockUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const user = await adminService.unblockUser(id, req.user.id);

  res.json({
    success: true,
    data: user,
    message: 'User unblocked',
  });
});

// Verify seller
export const verifySeller = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const user = await adminService.verifySeller(id, req.user.id);

  res.json({
    success: true,
    data: user,
    message: 'Seller verified',
  });
});

// Get premium requests
export const getPremiumRequests = asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = req.query.status as PremiumRequestStatus | undefined;
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await adminService.getPremiumRequests(status, page, limit);

  res.json({
    success: true,
    data: result.requests,
    pagination: result.pagination,
  });
});

// Update premium request
export const updatePremiumRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { status, notes } = req.body;

  const request = await adminService.updatePremiumRequest(
    id,
    req.user.id,
    status as PremiumRequestStatus,
    notes
  );

  res.json({
    success: true,
    data: request,
    message: 'Premium request updated',
  });
});

// Get all listings
export const getAllListings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await adminService.getAllListings({
    page: parseIntParam(req.query.page as string),
    limit: parseIntParam(req.query.limit as string),
    search: req.query.search as string,
    status: req.query.status as string,
    isPremium: parseBooleanParam(req.query.isPremium as string),
  });

  res.json({
    success: true,
    data: result.listings,
    pagination: result.pagination,
  });
});

// Get all transactions
export const getAllTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await adminService.getAllTransactions({
    page: parseIntParam(req.query.page as string),
    limit: parseIntParam(req.query.limit as string),
    status: req.query.status as string,
  });

  res.json({
    success: true,
    data: result.transactions,
    pagination: result.pagination,
  });
});

// Get admin action log
export const getActionLog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const adminId = req.query.adminId as string | undefined;
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 50;

  const result = await adminService.getAdminActionLog(adminId, page, limit);

  res.json({
    success: true,
    data: result.actions,
    pagination: result.pagination,
  });
});

// Get platform settings
export const getSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const settings = await adminService.getSettings();

  res.json({
    success: true,
    data: settings,
  });
});

// Update platform settings
export const updateSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { settings } = req.body;

  if (!settings || !Array.isArray(settings)) {
    res.status(400).json({ success: false, error: 'Settings array is required' });
    return;
  }

  await adminService.updateSettings(settings);

  res.json({
    success: true,
    message: 'Settings updated',
  });
});

// Get revenue analytics
export const getRevenueAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

  const analytics = await adminService.getRevenueAnalytics(startDate, endDate);

  res.json({
    success: true,
    data: analytics,
  });
});

// Get user analytics
export const getUserAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

  const analytics = await adminService.getUserAnalytics(startDate, endDate);

  res.json({
    success: true,
    data: analytics,
  });
});

// Get listing analytics
export const getListingAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

  const analytics = await adminService.getListingAnalytics(startDate, endDate);

  res.json({
    success: true,
    data: analytics,
  });
});

// Broadcast message to users
export const broadcastMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { title, message, targetRole } = req.body;

  if (!title || !message) {
    res.status(400).json({ success: false, error: 'Title and message are required' });
    return;
  }

  const result = await adminService.broadcastMessage(req.user.id, title, message, targetRole);

  res.json({
    success: true,
    data: result,
    message: `Message sent to ${result.recipientCount} users`,
  });
});

// Get single listing by ID (admin - returns any status)
export const getListingById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const listing = await adminService.getListingById(id);

  res.json({
    success: true,
    data: listing,
  });
});

// Update listing (admin - can update any field)
export const updateListing = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const data = req.body;

  const listing = await adminService.updateListing(id, req.user.id, data);

  res.json({
    success: true,
    data: listing,
    message: 'Listing updated',
  });
});

// Get all offers (admin)
export const getAllOffers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await adminService.getAllOffers({
    page: parseIntParam(req.query.page as string),
    limit: parseIntParam(req.query.limit as string),
    status: req.query.status as string,
  });

  res.json({
    success: true,
    data: result.offers,
    pagination: result.pagination,
  });
});

// Approve offer (admin)
export const adminApproveOffer = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { notes } = req.body;

  const offer = await adminService.approveOffer(id, req.user.id, notes);

  res.json({
    success: true,
    data: offer,
    message: 'Offer approved. Buyer will be notified to pay deposit.',
  });
});

// Reject offer (admin)
export const adminRejectOffer = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { reason } = req.body;

  const offer = await adminService.rejectOffer(id, req.user.id, reason);

  res.json({
    success: true,
    data: offer,
    message: 'Offer rejected. Buyer will be notified.',
  });
});

// ============================================
// Admin User & Listing Creation
// ============================================

// Create user (admin) - with optional Stripe account for sellers
export const createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { email, name, password, role, phone, companyName, createStripeAccount } = req.body;

  // Create the user
  const user = await adminService.createUser({
    email,
    name,
    password,
    role,
    phone,
    companyName,
    createdByAdminId: req.user.id,
  });

  let stripeAccountId: string | undefined;
  let stripeOnboardingUrl: string | undefined;

  // If seller and createStripeAccount is true, create Stripe connected account
  if (role === 'SELLER' && createStripeAccount && stripeService.isEnabled()) {
    const stripeResult = await stripeService.createConnectedAccount({
      userId: user.id,
      email: user.email,
      businessName: companyName || name,
    });

    if (stripeResult.success && stripeResult.accountId) {
      stripeAccountId = stripeResult.accountId;

      // Update user with Stripe account ID
      await adminService.updateUserStripeAccount(user.id, stripeAccountId);

      // Create onboarding link
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const linkResult = await stripeService.createAccountLink({
        accountId: stripeAccountId,
        refreshUrl: `${frontendUrl}/seller/stripe-refresh`,
        returnUrl: `${frontendUrl}/seller/stripe-complete`,
      });

      if (linkResult.success) {
        stripeOnboardingUrl = linkResult.url;
      }
    }
  }

  res.status(201).json({
    success: true,
    data: {
      user,
      stripeAccountId,
      stripeOnboardingUrl,
    },
    message: `User created successfully${stripeAccountId ? ' with Stripe account' : ''}`,
  });
});

// Create listing (admin) - can assign to any seller
export const createListing = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const {
    sellerId,
    mcNumber,
    dotNumber,
    legalName,
    dbaName,
    title,
    description,
    askingPrice,
    city,
    state,
    yearsActive,
    fleetSize,
    totalDrivers,
    safetyRating,
    insuranceOnFile,
    bipdCoverage,
    cargoCoverage,
    amazonStatus,
    amazonRelayScore,
    highwaySetup,
    sellingWithEmail,
    sellingWithPhone,
    cargoTypes,
    isPremium,
    status,
    adminNotes,
  } = req.body;

  const listing = await adminService.createListing({
    sellerId,
    mcNumber,
    dotNumber,
    legalName,
    dbaName,
    title: title || `MC Authority #${mcNumber}`,
    description,
    askingPrice: askingPrice || 0,
    city,
    state,
    yearsActive,
    fleetSize,
    totalDrivers,
    safetyRating,
    insuranceOnFile,
    bipdCoverage,
    cargoCoverage,
    amazonStatus,
    amazonRelayScore,
    highwaySetup,
    sellingWithEmail,
    sellingWithPhone,
    cargoTypes,
    isPremium,
    status: status || 'ACTIVE', // Admin can create active listings directly
    createdByAdminId: req.user.id,
    adminNotes,
  });

  res.status(201).json({
    success: true,
    data: listing,
    message: 'Listing created successfully',
  });
});

// Create user with listing (admin) - combined operation
export const createUserWithListing = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { user: userData, listing: listingData, createStripeAccount } = req.body;

  if (!userData || !userData.email || !userData.name || !userData.password) {
    res.status(400).json({ success: false, error: 'User data is required (email, name, password)' });
    return;
  }

  // 1. Create the user (always as SELLER for this combined operation)
  const user = await adminService.createUser({
    email: userData.email,
    name: userData.name,
    password: userData.password,
    role: 'SELLER',
    phone: userData.phone,
    companyName: userData.companyName,
    createdByAdminId: req.user.id,
  });

  let stripeAccountId: string | undefined;
  let stripeOnboardingUrl: string | undefined;

  // 2. Create Stripe connected account if requested
  if (createStripeAccount && stripeService.isEnabled()) {
    const stripeResult = await stripeService.createConnectedAccount({
      userId: user.id,
      email: user.email,
      businessName: userData.companyName || userData.name,
    });

    if (stripeResult.success && stripeResult.accountId) {
      stripeAccountId = stripeResult.accountId;
      await adminService.updateUserStripeAccount(user.id, stripeAccountId);

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const linkResult = await stripeService.createAccountLink({
        accountId: stripeAccountId,
        refreshUrl: `${frontendUrl}/seller/stripe-refresh`,
        returnUrl: `${frontendUrl}/seller/stripe-complete`,
      });

      if (linkResult.success) {
        stripeOnboardingUrl = linkResult.url;
      }
    }
  }

  // 3. Create the listing if provided
  let listing = null;
  if (listingData && listingData.mcNumber) {
    listing = await adminService.createListing({
      sellerId: user.id,
      mcNumber: listingData.mcNumber,
      dotNumber: listingData.dotNumber,
      legalName: listingData.legalName || userData.companyName || userData.name,
      dbaName: listingData.dbaName,
      title: listingData.title || `MC Authority #${listingData.mcNumber}`,
      description: listingData.description,
      askingPrice: listingData.askingPrice || 0,
      city: listingData.city,
      state: listingData.state,
      yearsActive: listingData.yearsActive,
      fleetSize: listingData.fleetSize,
      totalDrivers: listingData.totalDrivers,
      safetyRating: listingData.safetyRating,
      insuranceOnFile: listingData.insuranceOnFile,
      bipdCoverage: listingData.bipdCoverage,
      cargoCoverage: listingData.cargoCoverage,
      amazonStatus: listingData.amazonStatus,
      amazonRelayScore: listingData.amazonRelayScore,
      highwaySetup: listingData.highwaySetup,
      sellingWithEmail: listingData.sellingWithEmail,
      sellingWithPhone: listingData.sellingWithPhone,
      cargoTypes: listingData.cargoTypes,
      isPremium: listingData.isPremium,
      status: listingData.status || 'ACTIVE',
      createdByAdminId: req.user.id,
      adminNotes: listingData.adminNotes,
    });
  }

  res.status(201).json({
    success: true,
    data: {
      user,
      listing,
      stripeAccountId,
      stripeOnboardingUrl,
    },
    message: `Seller created${listing ? ' with listing' : ''}${stripeAccountId ? ' and Stripe account' : ''}`,
  });
});

// ============================================
// Pricing Configuration
// ============================================

// Get pricing configuration
export const getPricingConfig = asyncHandler(async (req: AuthRequest, res: Response) => {
  const config = await pricingConfigService.getPricingConfig();

  res.json({
    success: true,
    data: config,
  });
});

// Update pricing configuration
export const updatePricingConfig = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const updates = req.body;

  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ success: false, error: 'Invalid pricing configuration' });
    return;
  }

  const config = await pricingConfigService.updatePricingConfig(updates);

  res.json({
    success: true,
    data: config,
    message: 'Pricing configuration updated',
  });
});

// ============================================
// Stripe Transactions
// ============================================

// Get all Stripe transactions with full customer details
export const getStripeTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = parseIntParam(req.query.limit as string) || 50;
  const status = req.query.status as 'succeeded' | 'pending' | 'failed' | undefined;
  const type = req.query.type as 'all' | 'payment_intent' | 'checkout_session' | 'charge' | undefined;
  const startingAfter = req.query.startingAfter as string | undefined;

  const result = await stripeService.getAllTransactions({
    limit,
    status,
    type,
    startingAfter,
  });

  if (!result.success) {
    res.status(500).json({
      success: false,
      error: result.error || 'Failed to fetch Stripe transactions',
    });
    return;
  }

  res.json({
    success: true,
    data: result.transactions,
    hasMore: result.hasMore,
  });
});

// Get Stripe account balance
export const getStripeBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await stripeService.getAccountBalance();

  if (!result.success) {
    res.status(500).json({
      success: false,
      error: result.error || 'Failed to fetch Stripe balance',
    });
    return;
  }

  res.json({
    success: true,
    data: result.balance,
  });
});

// Get Stripe balance transactions (money movement history)
export const getStripeBalanceTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = parseIntParam(req.query.limit as string) || 50;
  const startingAfter = req.query.startingAfter as string | undefined;

  const result = await stripeService.getBalanceTransactions({
    limit,
    startingAfter,
  });

  if (!result.success) {
    res.status(500).json({
      success: false,
      error: result.error || 'Failed to fetch balance transactions',
    });
    return;
  }

  res.json({
    success: true,
    data: result.data,
    hasMore: result.hasMore,
  });
});

// ============================================
// User Credits Management
// ============================================

// Validation for credits adjustment
export const adjustCreditsValidation = [
  body('amount').isInt().withMessage('Amount must be an integer'),
  body('reason').trim().notEmpty().withMessage('Reason is required'),
];

// Adjust user credits (add or remove)
export const adjustUserCredits = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id: userId } = req.params;
  const { amount, reason } = req.body;

  const result = await adminService.adjustUserCredits(userId, amount, reason, req.user.id);

  res.json({
    success: true,
    data: result,
    message: `Credits ${amount >= 0 ? 'added' : 'removed'} successfully`,
  });
});

// ============================================
// Account Dispute Management
// ============================================

// Block user for cardholder mismatch
export const blockUserMismatchValidation = [
  body('userId').isUUID().withMessage('User ID must be a valid UUID'),
  body('stripeTransactionId').notEmpty().withMessage('Stripe transaction ID is required'),
  body('cardholderName').notEmpty().withMessage('Cardholder name is required'),
  body('userName').notEmpty().withMessage('User name is required'),
];

export const blockUserForMismatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { userId, stripeTransactionId, cardholderName, userName } = req.body;

  const result = await adminService.blockUserForMismatch({
    userId,
    stripeTransactionId,
    cardholderName,
    userName,
    adminId: req.user.id,
  });

  res.json({
    success: true,
    data: result,
    message: result.alreadyExists
      ? 'User already has a pending dispute'
      : 'User blocked for cardholder name mismatch. Dispute created.',
  });
});

// Get all disputes (admin)
export const getAllDisputes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;
  const status = req.query.status as string | undefined;

  const result = await adminService.getAllDisputes({ page, limit, status });

  res.json({
    success: true,
    data: result.disputes,
    pagination: result.pagination,
  });
});

// Resolve dispute (admin)
export const resolveDispute = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { notes } = req.body;

  const result = await adminService.resolveDispute(id, req.user.id, notes);

  res.json({
    success: true,
    data: result,
    message: 'Dispute resolved. User has been unblocked.',
  });
});

// Reject dispute (admin)
export const rejectDispute = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { reason } = req.body;

  const result = await adminService.rejectDispute(id, req.user.id, reason);

  res.json({
    success: true,
    data: result,
    message: 'Dispute rejected. User remains blocked.',
  });
});

// Process auto-unblock (can be called by cron or manually)
export const processAutoUnblock = asyncHandler(async (req: AuthRequest, res: Response) => {
  const results = await adminService.processAutoUnblock();

  res.json({
    success: true,
    data: results,
    message: `Processed ${results.length} disputes for auto-unblock`,
  });
});

// ============================================
// Notification Settings
// ============================================

const NOTIFICATION_SETTING_KEYS = [
  'admin_notification_emails',
  'notify_new_users',
  'notify_new_inquiries',
  'notify_new_transactions',
  'notify_disputes',
  'notify_consultations',
];

// Get notification settings
export const getNotificationSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const allSettings = await adminService.getSettings();

  // Extract only notification-related settings
  const notificationSettings: Record<string, string> = {};
  for (const key of NOTIFICATION_SETTING_KEYS) {
    notificationSettings[key] = allSettings[key]?.toString() || (key === 'admin_notification_emails' ? '' : 'true');
  }

  res.json({
    success: true,
    data: notificationSettings,
  });
});

// Update notification settings
export const updateNotificationSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const updates = req.body;

  // Validate and filter only notification-related settings
  const settingsToUpdate: Array<{ key: string; value: string; type: string }> = [];

  for (const key of NOTIFICATION_SETTING_KEYS) {
    if (updates[key] !== undefined) {
      settingsToUpdate.push({
        key,
        value: updates[key].toString(),
        type: key === 'admin_notification_emails' ? 'string' : 'string', // Store as strings
      });
    }
  }

  if (settingsToUpdate.length === 0) {
    res.status(400).json({ success: false, error: 'No valid notification settings provided' });
    return;
  }

  await adminService.updateSettings(settingsToUpdate);

  res.json({
    success: true,
    message: 'Notification settings updated successfully',
  });
});

// ============================================
// User Activity Log
// ============================================

// Get user activity log (unlocked MCs with view counts and credit transactions)
export const getUserActivityLog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const activityLog = await adminService.getUserActivityLog(id);

  res.json({
    success: true,
    data: activityLog,
  });
});

// Get comprehensive activity log with filters
export const getActivityLog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    type,
    userId,
    mcNumber,
    actionType,
    dateFrom,
    dateTo,
    page,
    limit,
  } = req.query;

  const activityLog = await adminService.getActivityLog({
    type: type as string,
    userId: userId as string,
    mcNumber: mcNumber as string,
    actionType: actionType as string,
    dateFrom: dateFrom as string,
    dateTo: dateTo as string,
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
  });

  res.json({
    success: true,
    data: activityLog,
  });
});
