import { Response } from 'express';
import { sellerService } from '../services/sellerService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { ListingStatus } from '../models';
import { parseIntParam } from '../utils/helpers';

// Get seller dashboard stats
export const getDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const stats = await sellerService.getDashboardStats(req.user.id);

  res.json({
    success: true,
    data: stats,
  });
});

// Get seller's listings
export const getListings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const status = req.query.status as ListingStatus | undefined;
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await sellerService.getListings(req.user.id, status, page, limit);

  res.json({
    success: true,
    data: result.listings,
    pagination: result.pagination,
  });
});

// Get seller's offers
export const getOffers = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const status = req.query.status as string | undefined;
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await sellerService.getOffers(req.user.id, status, page, limit);

  res.json({
    success: true,
    data: result.offers,
    pagination: result.pagination,
  });
});

// Get seller's earnings
export const getEarnings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await sellerService.getEarnings(req.user.id, page, limit);

  res.json({
    success: true,
    data: result.transactions,
    totals: result.totals,
    pagination: result.pagination,
  });
});

// Get seller verification status
export const getVerificationStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const status = await sellerService.getVerificationStatus(req.user.id);

  res.json({
    success: true,
    data: status,
  });
});

// Get seller's documents
export const getDocuments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await sellerService.getDocuments(req.user.id, page, limit);

  res.json({
    success: true,
    data: result.documents,
    pagination: result.pagination,
  });
});

// Get seller analytics
export const getAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const days = parseIntParam(req.query.days as string) || 30;

  const analytics = await sellerService.getAnalytics(req.user.id, days);

  res.json({
    success: true,
    data: analytics,
  });
});
