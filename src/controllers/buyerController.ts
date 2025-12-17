import { Response } from 'express';
import { buyerService } from '../services/buyerService';
import { stripeService } from '../services/stripeService';
import { asyncHandler, BadRequestError } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { parseIntParam } from '../utils/helpers';
import { config } from '../config';

// Get buyer dashboard stats
export const getDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const stats = await buyerService.getDashboardStats(req.user.id);

  res.json({
    success: true,
    data: stats,
  });
});

// Get buyer's offers
export const getOffers = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const status = req.query.status as string | undefined;
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await buyerService.getOffers(req.user.id, status, page, limit);

  res.json({
    success: true,
    data: result.offers,
    pagination: result.pagination,
  });
});

// Get buyer's purchases
export const getPurchases = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await buyerService.getPurchases(req.user.id, page, limit);

  res.json({
    success: true,
    data: result.purchases,
    pagination: result.pagination,
  });
});

// Get saved listings
export const getSavedListings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await buyerService.getSavedListings(req.user.id, page, limit);

  res.json({
    success: true,
    data: result.listings,
    pagination: result.pagination,
  });
});

// Get unlocked listings
export const getUnlockedListings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await buyerService.getUnlockedListings(req.user.id, page, limit);

  res.json({
    success: true,
    data: result.listings,
    pagination: result.pagination,
  });
});

// Get subscription details
export const getSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const result = await buyerService.getSubscription(req.user.id);

  res.json({
    success: true,
    data: result,
  });
});

// Create subscription checkout session
export const createSubscriptionCheckout = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { plan, isYearly } = req.body;

  // Validate plan
  const validPlans = ['starter', 'professional', 'enterprise'];
  if (!plan || !validPlans.includes(plan)) {
    throw new BadRequestError('Invalid subscription plan');
  }

  // Get or create Stripe customer
  const customer = await stripeService.getOrCreateCustomer(
    req.user.id,
    req.user.email,
    req.user.name || req.user.email
  );

  // Get the price ID for the selected plan
  const priceId = stripeService.getPriceId(
    plan as 'starter' | 'professional' | 'enterprise',
    isYearly ? 'yearly' : 'monthly'
  );

  // Create checkout session
  const frontendUrl = config.frontendUrl || 'http://localhost:5173';
  const result = await stripeService.createCheckoutSession({
    customerId: customer.id,
    priceId,
    successUrl: `${frontendUrl}/buyer/subscription?success=true`,
    cancelUrl: `${frontendUrl}/buyer/subscription?canceled=true`,
    metadata: {
      userId: req.user.id,
      plan,
      isYearly: isYearly ? 'true' : 'false',
    },
  });

  if (!result.success) {
    throw new BadRequestError(result.error || 'Failed to create checkout session');
  }

  res.json({
    success: true,
    data: {
      sessionId: result.sessionId,
      url: result.url,
    },
  });
});

// Cancel subscription
export const cancelSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const result = await buyerService.cancelSubscription(req.user.id);

  res.json({
    success: true,
    data: result,
  });
});

// Verify and fulfill subscription after Stripe checkout success
// This is called by frontend when redirected back from Stripe with success=true
export const verifySubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const result = await buyerService.verifyAndFulfillSubscription(req.user.id);

  res.json({
    success: true,
    data: result,
  });
});

// Get buyer's transactions
export const getTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await buyerService.getTransactions(req.user.id, page, limit);

  res.json({
    success: true,
    data: result.transactions,
    pagination: result.pagination,
  });
});
