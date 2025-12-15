import { Response } from 'express';
import { body } from 'express-validator';
import { userService } from '../services/userService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { parseIntParam } from '../utils/helpers';

// Validation rules
export const updateProfileValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('phone').optional().trim(),
  body('companyName').optional().trim(),
  body('companyAddress').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim().isLength({ min: 2, max: 2 }).withMessage('State must be 2 characters'),
  body('zipCode').optional().trim(),
  body('ein').optional().trim(),
];

// Get current user profile
export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const profile = await userService.getProfile(req.user.id);

  res.json({
    success: true,
    data: profile,
  });
});

// Update current user profile
export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const updated = await userService.updateProfile(req.user.id, req.body);

  res.json({
    success: true,
    data: updated,
    message: 'Profile updated successfully',
  });
});

// Get public user profile
export const getPublicProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const profile = await userService.getPublicProfile(id);

  res.json({
    success: true,
    data: profile,
  });
});

// Get user's reviews
export const getUserReviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 10;

  const result = await userService.getUserReviews(id, page, limit);

  res.json({
    success: true,
    data: result.reviews,
    pagination: result.pagination,
  });
});

// Get user's public listings
export const getUserListings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 10;

  const result = await userService.getUserListings(id, page, limit);

  res.json({
    success: true,
    data: result.listings,
    pagination: result.pagination,
  });
});

// Upload avatar
export const uploadAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }

  // The file path is set by multer middleware
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  const result = await userService.updateAvatar(req.user.id, avatarUrl);

  res.json({
    success: true,
    data: result,
    message: 'Avatar uploaded successfully',
  });
});

// Deactivate account
export const deactivateAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  await userService.deactivateAccount(req.user.id);

  res.json({
    success: true,
    message: 'Account deactivated',
  });
});

// Get dashboard stats
export const getDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const stats = await userService.getDashboardStats(req.user.id, req.user.role);

  res.json({
    success: true,
    data: stats,
  });
});
