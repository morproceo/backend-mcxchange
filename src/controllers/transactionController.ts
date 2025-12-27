import { Response } from 'express';
import { body } from 'express-validator';
import { transactionService } from '../services/transactionService';
import stripeService from '../services/stripeService';
import { asyncHandler, NotFoundError, ForbiddenError, BadRequestError } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { PaymentMethod, TransactionStatus, Transaction, Listing, User } from '../models';
import { config } from '../config';

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

// Create deposit checkout session (Stripe) for a transaction
export const createDepositCheckout = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  // Get the transaction with listing
  const transaction = await Transaction.findByPk(id, {
    include: [
      {
        model: Listing,
        as: 'listing',
      },
    ],
  });

  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  // Verify the buyer owns this transaction
  if (transaction.buyerId !== req.user.id) {
    throw new ForbiddenError('You do not have permission to pay for this transaction');
  }

  // Verify transaction is awaiting deposit
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

  // Get MC number from listing
  const mcNumber = transaction.listing?.mcNumber || 'Unknown';

  // Create Stripe checkout session
  const frontendUrl = config.frontendUrl || 'http://localhost:5173';
  const result = await stripeService.createDepositCheckout({
    customerId: stripeCustomerId,
    amount: depositAmountCents,
    buyerId: req.user.id,
    transactionId: transaction.id,
    offerId: transaction.offerId || '',
    mcNumber: mcNumber,
    successUrl: `${frontendUrl}/transaction/${transaction.id}?deposit=success`,
    cancelUrl: `${frontendUrl}/transaction/${transaction.id}?deposit=cancelled`,
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

// Verify deposit payment status - used when returning from Stripe checkout
// This checks Stripe directly and updates the transaction if paid
export const verifyDepositStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  // Get the transaction
  const transaction = await Transaction.findByPk(id, {
    include: [{ model: Listing, as: 'listing' }],
  });

  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  // Verify the buyer owns this transaction
  if (transaction.buyerId !== req.user.id) {
    throw new ForbiddenError('You do not have permission to verify this transaction');
  }

  // If already marked as deposit received, return success
  if (transaction.status !== TransactionStatus.AWAITING_DEPOSIT) {
    res.json({
      success: true,
      data: {
        status: transaction.status,
        depositPaid: true,
        depositPaidAt: transaction.depositPaidAt,
      },
      message: 'Deposit already confirmed',
    });
    return;
  }

  // Check for recent successful checkout sessions for this transaction
  const sessions = await stripeService.listCheckoutSessions(transaction.id);

  if (sessions.success && sessions.sessions && sessions.sessions.length > 0) {
    // Find a completed/paid session for deposit
    const paidSession = sessions.sessions.find(
      (s: any) => s.payment_status === 'paid' && s.metadata?.type === 'deposit'
    );

    if (paidSession) {
      const amountPaid = paidSession.amount_total ? paidSession.amount_total / 100 : 1000;

      // Update transaction status
      await transaction.update({
        status: TransactionStatus.DEPOSIT_RECEIVED,
        depositAmount: amountPaid,
        depositPaidAt: new Date(),
      });

      res.json({
        success: true,
        data: {
          status: TransactionStatus.DEPOSIT_RECEIVED,
          depositPaid: true,
          depositPaidAt: new Date(),
          amount: amountPaid,
        },
        message: 'Deposit verified and confirmed',
      });
      return;
    }
  }

  // No paid session found
  res.json({
    success: true,
    data: {
      status: transaction.status,
      depositPaid: false,
    },
    message: 'Deposit payment not yet confirmed',
  });
});

// ============================================
// Admin Create Transaction
// ============================================

// Validation for admin create transaction
export const adminCreateTransactionValidation = [
  body('listingId').trim().notEmpty().withMessage('Listing ID is required'),
  body('buyerId').trim().notEmpty().withMessage('Buyer ID is required'),
  body('agreedPrice').isNumeric().withMessage('Agreed price must be a number'),
  body('depositAmount').optional().isNumeric().withMessage('Deposit amount must be a number'),
  body('notes').optional().trim(),
];

// Admin creates a transaction manually
export const adminCreateTransaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { listingId, buyerId, agreedPrice, depositAmount, notes } = req.body;

  const transaction = await transactionService.adminCreateTransaction(req.user.id, {
    listingId,
    buyerId,
    agreedPrice: Number(agreedPrice),
    depositAmount: depositAmount ? Number(depositAmount) : undefined,
    notes,
  });

  res.status(201).json({
    success: true,
    data: transaction,
    message: 'Transaction created successfully',
  });
});

// Get available buyers for admin transaction creation
export const getAvailableBuyers = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { search } = req.query;

  const buyers = await transactionService.getAvailableBuyers(search as string);

  res.json({
    success: true,
    data: buyers,
  });
});

// Get available listings for admin transaction creation
export const getAvailableListings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { search } = req.query;

  const listings = await transactionService.getAvailableListings(search as string);

  res.json({
    success: true,
    data: listings,
  });
});
