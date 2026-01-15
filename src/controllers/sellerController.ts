import { Response } from 'express';
import { sellerService } from '../services/sellerService';
import { stripeService } from '../services/stripeService';
import { asyncHandler, BadRequestError } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { ListingStatus, User } from '../models';
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

// Create listing fee checkout session
export const createListingFeeCheckout = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { mcNumber, successUrl, cancelUrl } = req.body;

  if (!mcNumber) {
    throw new BadRequestError('MC number is required');
  }

  if (!successUrl || !cancelUrl) {
    throw new BadRequestError('Success and cancel URLs are required');
  }

  // Get or create Stripe customer for this user (validates existing ID and recreates if invalid)
  const customer = await stripeService.getOrCreateCustomer(
    req.user.id,
    req.user.email,
    req.user.name || req.user.email,
    req.user.stripeCustomerId || undefined
  );

  // Update user's stripeCustomerId if it changed (new customer created)
  if (customer.id !== req.user.stripeCustomerId) {
    await User.update({ stripeCustomerId: customer.id }, { where: { id: req.user.id } });
  }

  // Create the checkout session for $35 listing fee
  const result = await stripeService.createListingFeeCheckout({
    customerId: customer.id,
    amount: 3500, // $35.00 in cents
    sellerId: req.user.id,
    mcNumber: mcNumber,
    successUrl,
    cancelUrl,
    metadata: {
      userId: req.user.id,
      userEmail: req.user.email,
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

// Get seller's Stripe payment history directly from Stripe
export const getStripePaymentHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  // Get user's Stripe customer ID
  const user = await User.findByPk(req.user.id);

  if (!user || !user.stripeCustomerId) {
    res.json({
      success: true,
      data: {
        charges: [],
        paymentIntents: [],
        checkoutSessions: [],
      },
    });
    return;
  }

  // Get payment history from Stripe
  const history = await stripeService.getCustomerPaymentHistory(user.stripeCustomerId);

  // Helper function to safely convert Unix timestamp to ISO string
  const safeDate = (timestamp: number | null | undefined): string | null => {
    if (!timestamp || timestamp <= 0) return null;
    try {
      return new Date(timestamp * 1000).toISOString();
    } catch {
      return null;
    }
  };

  // Transform the data for frontend consumption - focus on listing fee payments
  const transformedCharges = history.charges
    .filter(charge => charge.status === 'succeeded')
    .map(charge => ({
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
      type: session.metadata?.type || 'unknown', // listing_fee, etc.
      mcNumber: session.metadata?.mcNumber || null,
    }));

  res.json({
    success: true,
    data: {
      charges: transformedCharges,
      checkoutSessions: transformedCheckoutSessions,
      stripeCustomerId: user.stripeCustomerId,
    },
  });
});
