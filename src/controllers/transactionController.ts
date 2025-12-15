import { Response } from 'express';
import { body } from 'express-validator';
import { transactionService } from '../services/transactionService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { PaymentMethod, TransactionStatus } from '../models';

// Validation rules
export const paymentValidation = [
  body('paymentMethod')
    .isIn(['STRIPE', 'ZELLE', 'WIRE', 'CHECK'])
    .withMessage('Invalid payment method'),
  body('reference').optional().trim(),
];

export const messageValidation = [
  body('content').trim().notEmpty().withMessage('Message content is required'),
];

// Get transaction by ID
export const getTransaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const transaction = await transactionService.getTransactionById(id, req.user.id);

  res.json({
    success: true,
    data: transaction,
  });
});

// Get user's transactions
export const getMyTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const transactions = await transactionService.getUserTransactions(req.user.id, req.user.role);

  res.json({
    success: true,
    data: transactions,
  });
});

// Buyer accepts terms
export const buyerAcceptTerms = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const transaction = await transactionService.buyerAcceptTerms(id, req.user.id);

  res.json({
    success: true,
    data: transaction,
    message: 'Terms accepted',
  });
});

// Seller accepts terms
export const sellerAcceptTerms = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const transaction = await transactionService.sellerAcceptTerms(id, req.user.id);

  res.json({
    success: true,
    data: transaction,
    message: 'Terms accepted',
  });
});

// Pay deposit
export const payDeposit = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { paymentMethod, reference } = req.body;

  const payment = await transactionService.recordDeposit(
    id,
    req.user.id,
    paymentMethod as PaymentMethod,
    reference
  );

  res.json({
    success: true,
    data: payment,
    message: paymentMethod === 'STRIPE'
      ? 'Processing payment...'
      : 'Deposit submitted. Awaiting admin verification.',
  });
});

// Verify deposit (admin)
export const verifyDeposit = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id, paymentId } = req.params;

  await transactionService.verifyDeposit(id, req.user.id, paymentId);

  res.json({
    success: true,
    message: 'Deposit verified',
  });
});

// Buyer approval
export const buyerApprove = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const transaction = await transactionService.buyerApprove(id, req.user.id);

  res.json({
    success: true,
    data: transaction,
    message: 'Buyer approval recorded',
  });
});

// Seller approval
export const sellerApprove = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const transaction = await transactionService.sellerApprove(id, req.user.id);

  res.json({
    success: true,
    data: transaction,
    message: 'Seller approval recorded',
  });
});

// Admin approval
export const adminApprove = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const transaction = await transactionService.adminApprove(id, req.user.id);

  res.json({
    success: true,
    data: transaction,
    message: 'Admin approval recorded. Ready for final payment.',
  });
});

// Pay final amount
export const payFinal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { paymentMethod, reference } = req.body;

  const payment = await transactionService.recordFinalPayment(
    id,
    req.user.id,
    paymentMethod as PaymentMethod,
    reference
  );

  res.json({
    success: true,
    data: payment,
    message: paymentMethod === 'STRIPE'
      ? 'Processing payment...'
      : 'Payment submitted. Awaiting admin verification.',
  });
});

// Verify final payment (admin)
export const verifyFinalPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id, paymentId } = req.params;

  await transactionService.verifyFinalPayment(id, req.user.id, paymentId);

  res.json({
    success: true,
    message: 'Payment verified. Transaction completed.',
  });
});

// Cancel transaction
export const cancelTransaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { reason } = req.body;

  await transactionService.cancelTransaction(id, req.user.id, reason || 'No reason provided');

  res.json({
    success: true,
    message: 'Transaction cancelled',
  });
});

// Open dispute
export const openDispute = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    res.status(400).json({ success: false, error: 'Dispute reason is required' });
    return;
  }

  const transaction = await transactionService.openDispute(id, req.user.id, reason);

  res.json({
    success: true,
    data: transaction,
    message: 'Dispute opened',
  });
});

// Send message
export const sendMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { content } = req.body;

  const message = await transactionService.sendMessage(id, req.user.id, content);

  res.json({
    success: true,
    data: message,
  });
});

// Update status (admin)
export const updateStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { status, notes } = req.body;

  const transaction = await transactionService.updateStatus(
    id,
    req.user.id,
    status as TransactionStatus,
    notes
  );

  res.json({
    success: true,
    data: transaction,
    message: 'Status updated',
  });
});
