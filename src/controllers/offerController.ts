import { Response } from 'express';
import { body } from 'express-validator';
import { offerService } from '../services/offerService';
import stripeService from '../services/stripeService';
import { asyncHandler, NotFoundError, ForbiddenError, BadRequestError } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { OfferStatus, Offer, Transaction, Listing, User, TransactionStatus } from '../models';
import { config } from '../config';

// Validation rules
export const createOfferValidation = [
  body('listingId').trim().notEmpty().withMessage('Listing ID is required'),
  body('amount').isNumeric().isFloat({ min: 1 }).withMessage('Amount must be a positive number'),
  body('message').optional().trim(),
];

export const counterOfferValidation = [
  body('counterAmount').isNumeric().isFloat({ min: 1 }).withMessage('Counter amount must be a positive number'),
  body('message').optional().trim(),
];

// Create offer
export const createOffer = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { listingId, amount, message, expiresAt } = req.body;

  const offer = await offerService.createOffer(req.user.id, {
    listingId,
    amount: parseFloat(amount),
    message,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  });

  res.status(201).json({
    success: true,
    data: offer,
    message: 'Offer submitted successfully',
  });
});

// Get offer by ID
export const getOffer = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const offer = await offerService.getOfferById(id, req.user.id);

  res.json({
    success: true,
    data: offer,
  });
});

// Get buyer's offers
export const getBuyerOffers = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const status = req.query.status as OfferStatus | undefined;

  const offers = await offerService.getBuyerOffers(req.user.id, status);

  res.json({
    success: true,
    data: offers,
  });
});

// Get seller's offers
export const getSellerOffers = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const status = req.query.status as OfferStatus | undefined;

  const offers = await offerService.getSellerOffers(req.user.id, status);

  res.json({
    success: true,
    data: offers,
  });
});

// Accept offer
export const acceptOffer = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const result = await offerService.acceptOffer(id, req.user.id);

  res.json({
    success: true,
    data: result,
    message: 'Offer accepted. Transaction created.',
  });
});

// Reject offer
export const rejectOffer = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const offer = await offerService.rejectOffer(id, req.user.id);

  res.json({
    success: true,
    data: offer,
    message: 'Offer rejected',
  });
});

// Counter offer
export const counterOffer = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { counterAmount, message } = req.body;

  const offer = await offerService.counterOffer(id, req.user.id, parseFloat(counterAmount), message);

  res.json({
    success: true,
    data: offer,
    message: 'Counter offer sent',
  });
});

// Accept counter offer (buyer)
export const acceptCounterOffer = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const offer = await offerService.acceptCounterOffer(id, req.user.id);

  res.json({
    success: true,
    data: offer,
    message: 'Counter offer accepted',
  });
});

// Withdraw offer (buyer)
export const withdrawOffer = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const offer = await offerService.withdrawOffer(id, req.user.id);

  res.json({
    success: true,
    data: offer,
    message: 'Offer withdrawn',
  });
});

// Get listing offers (admin)
export const getListingOffers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { listingId } = req.params;

  const offers = await offerService.getListingOffers(listingId);

  res.json({
    success: true,
    data: offers,
  });
});

// Create deposit checkout session (buyer)
export const createDepositCheckout = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  // Get the offer with its transaction
  const offer = await Offer.findByPk(id, {
    include: [
      {
        model: Transaction,
        as: 'transaction',
      },
      {
        model: Listing,
        as: 'listing',
      },
    ],
  });

  if (!offer) {
    throw new NotFoundError('Offer not found');
  }

  // Verify the buyer owns this offer
  if (offer.buyerId !== req.user.id) {
    throw new ForbiddenError('You do not have permission to pay for this offer');
  }

  // Verify offer has been accepted (for Buy Now, admin sets to ACCEPTED and creates transaction)
  if (offer.status !== OfferStatus.ACCEPTED) {
    throw new BadRequestError('Offer must be accepted before paying deposit');
  }

  // Verify transaction exists and is awaiting deposit
  const transaction = offer.transaction;
  if (!transaction) {
    throw new BadRequestError('No transaction found for this offer');
  }

  if (transaction.status !== TransactionStatus.AWAITING_DEPOSIT) {
    throw new BadRequestError('Transaction is not awaiting deposit payment');
  }

  // Get buyer info
  const buyer = await User.findByPk(req.user.id);
  if (!buyer) {
    throw new NotFoundError('Buyer not found');
  }

  // Get or create Stripe customer for the buyer
  let stripeCustomerId = buyer.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripeService.getOrCreateCustomer(
      buyer.id,
      buyer.email,
      buyer.name
    );
    stripeCustomerId = customer.id;
    await buyer.update({ stripeCustomerId });
  }

  // Deposit is $1,000 = 100000 cents
  const depositAmountCents = 100000;

  // Create Stripe checkout session
  const frontendUrl = config.frontendUrl || 'http://localhost:5173';
  const result = await stripeService.createDepositCheckout({
    customerId: stripeCustomerId,
    amount: depositAmountCents,
    buyerId: req.user.id,
    transactionId: transaction.id,
    offerId: offer.id,
    mcNumber: offer.listing?.mcNumber || 'Unknown',
    successUrl: `${frontendUrl}/transaction/${transaction.id}?deposit=success`,
    cancelUrl: `${frontendUrl}/buyer/deposit/${offer.id}?deposit=cancelled`,
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
