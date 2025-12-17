import { Request, Response } from 'express';
import { body } from 'express-validator';
import { authService } from '../services/authService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { UserRole } from '../models';

// Validation rules
export const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('role')
    .isIn(['BUYER', 'SELLER', 'ADMIN'])
    .withMessage('Role must be BUYER, SELLER, or ADMIN'),
  body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Register new user
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, role, phone, companyName } = req.body;

  const result = await authService.register({
    email,
    password,
    name,
    role: role as UserRole,
    phone,
    companyName,
  });

  res.status(201).json({
    success: true,
    data: result,
    message: 'Registration successful',
  });
});

// Login
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = await authService.login({ email, password });

  res.json({
    success: true,
    data: result,
    message: 'Login successful',
  });
});

// Refresh token
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400).json({
      success: false,
      error: 'Refresh token is required',
    });
    return;
  }

  const tokens = await authService.refreshToken(refreshToken);

  res.json({
    success: true,
    data: tokens,
  });
});

// Logout
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// Logout from all devices
export const logoutAll = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  await authService.logoutAll(req.user.id);

  res.json({
    success: true,
    message: 'Logged out from all devices',
  });
});

// Get current user
export const getCurrentUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const user = await authService.getUserById(req.user.id);

  res.json({
    success: true,
    data: user,
  });
});

// Change password
export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({
      success: false,
      error: 'Current password and new password are required',
    });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({
      success: false,
      error: 'New password must be at least 8 characters',
    });
    return;
  }

  await authService.changePassword(req.user.id, currentPassword, newPassword);

  res.json({
    success: true,
    message: 'Password changed successfully',
  });
});

// Request password reset
export const requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      error: 'Email is required',
    });
    return;
  }

  await authService.requestPasswordReset(email);

  res.json({
    success: true,
    message: 'If an account exists with this email, a reset link will be sent',
  });
});
