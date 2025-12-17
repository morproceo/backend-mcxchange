import { Response } from 'express';
import { body } from 'express-validator';
import { adminService } from '../services/adminService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { PremiumRequestStatus } from '../models';
import { parseIntParam, parseBooleanParam } from '../utils/helpers';

// Validation rules
export const rejectListingValidation = [
  body('reason').trim().notEmpty().withMessage('Rejection reason is required'),
];

export const blockUserValidation = [
  body('reason').trim().notEmpty().withMessage('Block reason is required'),
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
  const { notes } = req.body;

  const listing = await adminService.approveListing(id, req.user.id, notes);

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
