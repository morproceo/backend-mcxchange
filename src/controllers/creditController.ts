import { Response } from 'express';
import { body } from 'express-validator';
import { creditService } from '../services/creditService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { SubscriptionPlan } from '../models';
import { parseIntParam } from '../utils/helpers';

// Validation rules
export const subscribeValidation = [
  body('plan')
    .isIn(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
    .withMessage('Invalid subscription plan'),
  body('isYearly').isBoolean().withMessage('isYearly must be a boolean'),
];

export const addBonusCreditsValidation = [
  body('userId').trim().notEmpty().withMessage('User ID is required'),
  body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer'),
  body('reason').trim().notEmpty().withMessage('Reason is required'),
];

// Get credit balance
export const getBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const balance = await creditService.getCreditBalance(req.user.id);

  res.json({
    success: true,
    data: balance,
  });
});

// Get credit history
export const getHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await creditService.getCreditHistory(req.user.id, page, limit);

  res.json({
    success: true,
    data: result.transactions,
    pagination: result.pagination,
  });
});

// Get subscription plans
export const getPlans = asyncHandler(async (req: AuthRequest, res: Response) => {
  const plans = creditService.getSubscriptionPlans();

  res.json({
    success: true,
    data: plans,
  });
});

// Get current subscription
export const getCurrentSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const subscription = await creditService.getCurrentSubscription(req.user.id);

  res.json({
    success: true,
    data: subscription,
  });
});

// Subscribe to a plan
export const subscribe = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { plan, isYearly, stripePaymentId } = req.body;

  const subscription = await creditService.subscribe(
    req.user.id,
    plan as SubscriptionPlan,
    isYearly,
    stripePaymentId
  );

  res.status(201).json({
    success: true,
    data: subscription,
    message: 'Subscription activated successfully',
  });
});

// Cancel subscription
export const cancelSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const subscription = await creditService.cancelSubscription(req.user.id);

  res.json({
    success: true,
    data: subscription,
    message: 'Subscription cancelled. You can still use remaining credits until the end of the billing period.',
  });
});

// Add bonus credits (admin)
export const addBonusCredits = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { userId, amount, reason } = req.body;

  const result = await creditService.addBonusCredits(userId, amount, reason, req.user.id);

  res.json({
    success: true,
    data: result,
    message: `${amount} bonus credits added`,
  });
});

// Refund credits (admin)
export const refundCredits = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId, amount, reason } = req.body;

  if (!userId || !amount || !reason) {
    res.status(400).json({
      success: false,
      error: 'userId, amount, and reason are required',
    });
    return;
  }

  const result = await creditService.refundCredits(userId, amount, reason);

  res.json({
    success: true,
    data: result,
    message: `${amount} credits refunded`,
  });
});

// Check if user has credits
export const checkCredits = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const required = parseIntParam(req.query.required as string) || 1;

  const hasCredits = await creditService.hasCredits(req.user.id, required);

  res.json({
    success: true,
    data: { hasCredits, required },
  });
});
