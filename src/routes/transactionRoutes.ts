import { Router } from 'express';
import {
  getTransaction,
  getMyTransactions,
  buyerAcceptTerms,
  sellerAcceptTerms,
  payDeposit,
  verifyDeposit,
  buyerApprove,
  sellerApprove,
  adminApprove,
  payFinal,
  verifyFinalPayment,
  cancelTransaction,
  openDispute,
  sendMessage,
  updateStatus,
  paymentValidation,
  messageValidation,
  createDepositCheckout,
  verifyDepositStatus,
  adminCreateTransaction,
  adminCreateTransactionValidation,
  getAvailableBuyers,
  getAvailableListings,
  adminDeleteTransaction,
} from '../controllers/transactionController';
import { authenticate, adminOnly } from '../middleware/auth';
import validate from '../middleware/validate';

const router = Router();

// All transaction routes require authentication
router.use(authenticate);

// Admin create transaction routes (must be before /:id routes to avoid conflict)
router.get('/admin/available-buyers', adminOnly, getAvailableBuyers);
router.get('/admin/available-listings', adminOnly, getAvailableListings);
router.post('/admin/create', adminOnly, validate(adminCreateTransactionValidation), adminCreateTransaction);

// Get transactions
router.get('/', getMyTransactions);
router.get('/:id', getTransaction);

// Buyer actions
router.post('/:id/buyer/accept-terms', buyerAcceptTerms);
router.post('/:id/buyer/approve', buyerApprove);
router.post('/:id/deposit', validate(paymentValidation), payDeposit);
router.post('/:id/deposit-checkout', createDepositCheckout);
router.post('/:id/verify-deposit-status', verifyDepositStatus);
router.post('/:id/final-payment', validate(paymentValidation), payFinal);

// Seller actions
router.post('/:id/seller/accept-terms', sellerAcceptTerms);
router.post('/:id/seller/approve', sellerApprove);

// Both parties
router.post('/:id/cancel', cancelTransaction);
router.post('/:id/dispute', openDispute);
router.post('/:id/messages', validate(messageValidation), sendMessage);

// Admin actions on existing transactions
router.post('/:id/admin/approve', adminOnly, adminApprove);
router.post('/:id/admin/verify-deposit/:paymentId', adminOnly, verifyDeposit);
router.post('/:id/admin/verify-payment/:paymentId', adminOnly, verifyFinalPayment);
router.put('/:id/admin/status', adminOnly, updateStatus);
router.delete('/:id/admin', adminOnly, adminDeleteTransaction);

export default router;
