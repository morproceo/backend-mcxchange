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

// Get buyer's Stripe payment history directly from Stripe
export const getStripePaymentHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('[getStripePaymentHistory] Starting...');
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  console.log('[getStripePaymentHistory] User:', req.user.id);

  // Get user's Stripe customer ID
  const { User } = await import('../models');
  const user = await User.findByPk(req.user.id);

  console.log('[getStripePaymentHistory] User from DB:', user?.id, 'stripeCustomerId:', user?.stripeCustomerId);

  if (!user || !user.stripeCustomerId) {
    console.log('[getStripePaymentHistory] No stripeCustomerId found, returning empty');
    res.json({
      success: true,
      data: {
        charges: [],
        paymentIntents: [],
        checkoutSessions: [],
        subscriptions: [],
      },
    });
    return;
  }

  console.log('[getStripePaymentHistory] Fetching from Stripe for customer:', user.stripeCustomerId);
  // Get payment history from Stripe
  const history = await stripeService.getCustomerPaymentHistory(user.stripeCustomerId);
  console.log('[getStripePaymentHistory] Got history:', {
    charges: history.charges.length,
    paymentIntents: history.paymentIntents.length,
    checkoutSessions: history.checkoutSessions.length,
    subscriptions: history.subscriptions.length,
  });

  // Helper function to safely convert Unix timestamp to ISO string
  const safeDate = (timestamp: number | null | undefined): string | null => {
    if (!timestamp || timestamp <= 0) return null;
    try {
      return new Date(timestamp * 1000).toISOString();
    } catch {
      return null;
    }
  };

  // Transform the data for frontend consumption
  const transformedCharges = history.charges.map(charge => ({
    id: charge.id,
    amount: charge.amount / 100, // Convert cents to dollars
    currency: charge.currency,
    status: charge.status,
    description: charge.description,
    receiptUrl: charge.receipt_url,
    created: safeDate(charge.created),
    paymentMethod: charge.payment_method_details?.card ? {
      brand: charge.payment_method_details.card.brand,
      last4: charge.payment_method_details.card.last4,
    } : null,
    metadata: charge.metadata,
  }));

  const transformedPaymentIntents = history.paymentIntents.map(pi => ({
    id: pi.id,
    amount: pi.amount / 100,
    currency: pi.currency,
    status: pi.status,
    description: pi.description,
    created: safeDate(pi.created),
    metadata: pi.metadata,
  }));

  const transformedCheckoutSessions = history.checkoutSessions
    .filter(session => session.payment_status === 'paid')
    .map(session => ({
      id: session.id,
      amountTotal: session.amount_total ? session.amount_total / 100 : 0,
      currency: session.currency,
      status: session.status,
      paymentStatus: session.payment_status,
      mode: session.mode,
      created: safeDate(session.created),
      metadata: session.metadata,
    }));

  const transformedSubscriptions = history.subscriptions.map(sub => ({
    id: sub.id,
    status: sub.status,
    plan: sub.metadata?.plan || 'unknown',
    currentPeriodStart: safeDate(sub.current_period_start),
    currentPeriodEnd: safeDate(sub.current_period_end),
    created: safeDate(sub.created),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  }));

  res.json({
    success: true,
    data: {
      charges: transformedCharges,
      paymentIntents: transformedPaymentIntents,
      checkoutSessions: transformedCheckoutSessions,
      subscriptions: transformedSubscriptions,
      stripeCustomerId: user.stripeCustomerId,
    },
  });
});
