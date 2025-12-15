import { Response } from 'express';
import { body } from 'express-validator';
import { offerService } from '../services/offerService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { OfferStatus } from '../models';

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
