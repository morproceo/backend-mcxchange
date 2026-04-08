import { Response } from 'express';
import { sellerService } from '../services/sellerService';
import { stripeService } from '../services/stripeService';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { ListingStatus, User } from '../models';
import { parseIntParam } from '../utils/helpers';
import { config } from '../config';

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

// ============================================
// Stripe Connect - Seller Payout Setup
// ============================================

// Get seller's Connect account status
export const getConnectStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (!user.stripeAccountId) {
    res.json({
      success: true,
      data: {
        hasAccount: false,
        isOnboarded: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      },
    });
    return;
  }

  const account = await stripeService.getConnectedAccount(user.stripeAccountId);

  if (!account) {
    res.json({
      success: true,
      data: {
        hasAccount: true,
        accountId: user.stripeAccountId,
        isOnboarded: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        error: 'Could not retrieve account details',
      },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      hasAccount: true,
      accountId: user.stripeAccountId,
      isOnboarded: account.details_submitted && account.charges_enabled && account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    },
  });
});

// Create a Stripe Connect account for the seller and return onboarding link
export const createConnectAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // If seller already has a Connect account, just return a new onboarding link
  if (user.stripeAccountId) {
    const isOnboarded = await stripeService.isAccountOnboarded(user.stripeAccountId);
    if (isOnboarded) {
      throw new BadRequestError('Your payout account is already set up and active');
    }

    // Account exists but not fully onboarded — generate a new onboarding link
    const frontendUrl = config.frontendUrl || 'http://localhost:5173';
    const linkResult = await stripeService.createAccountLink({
      accountId: user.stripeAccountId,
      refreshUrl: `${frontendUrl}/seller/payout-setup?refresh=true`,
      returnUrl: `${frontendUrl}/seller/payout-setup?onboarding=complete`,
    });

    if (!linkResult.success) {
      throw new BadRequestError(linkResult.error || 'Failed to create onboarding link');
    }

    res.json({
      success: true,
      data: {
        accountId: user.stripeAccountId,
        onboardingUrl: linkResult.url,
      },
      message: 'Continue setting up your payout account',
    });
    return;
  }

  // Create a new Connect account
  const accountResult = await stripeService.createConnectedAccount({
    userId: user.id,
    email: user.email,
    businessName: user.companyName || undefined,
  });

  if (!accountResult.success || !accountResult.accountId) {
    throw new BadRequestError(accountResult.error || 'Failed to create payout account');
  }

  // Save the account ID to the user record
  await user.update({ stripeAccountId: accountResult.accountId });

  // Generate onboarding link
  const frontendUrl = config.frontendUrl || 'http://localhost:5173';
  const linkResult = await stripeService.createAccountLink({
    accountId: accountResult.accountId,
    refreshUrl: `${frontendUrl}/seller/payout-setup?refresh=true`,
    returnUrl: `${frontendUrl}/seller/payout-setup?onboarding=complete`,
  });

  if (!linkResult.success) {
    throw new BadRequestError(linkResult.error || 'Failed to create onboarding link');
  }

  res.json({
    success: true,
    data: {
      accountId: accountResult.accountId,
      onboardingUrl: linkResult.url,
    },
    message: 'Payout account created. Complete the onboarding to start receiving payments.',
  });
});

// Get a Stripe Express dashboard login link for the seller
export const getConnectDashboardLink = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (!user.stripeAccountId) {
    throw new BadRequestError('No payout account found. Please set up your account first.');
  }

  const isOnboarded = await stripeService.isAccountOnboarded(user.stripeAccountId);
  if (!isOnboarded) {
    throw new BadRequestError('Your payout account setup is not complete.');
  }

  const result = await stripeService.createLoginLink(user.stripeAccountId);

  if (!result.success) {
    throw new BadRequestError(result.error || 'Failed to create dashboard link');
  }

  res.json({
    success: true,
    data: {
      url: result.url,
    },
  });
});
