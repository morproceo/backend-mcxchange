import { Router } from 'express';
import {
  uploadDocument,
  getDocument,
  getListingDocuments,
  getTransactionDocuments,
  deleteDocument,
  verifyDocument,
  getPendingDocuments,
  uploadDocumentValidation,
} from '../controllers/documentController';
import { authenticate, adminOnly } from '../middleware/auth';
import validate from '../middleware/validate';
import { uploadSingle } from '../middleware/upload';

const router = Router();

// All document routes require authentication
router.use(authenticate);

// Upload document
router.post('/', uploadSingle, validate(uploadDocumentValidation), uploadDocument);

// Get document
router.get('/:id', getDocument);

// Delete document
router.delete('/:id', deleteDocument);

// Get documents by listing
router.get('/listing/:listingId', getListingDocuments);

// Get documents by transaction
router.get('/transaction/:transactionId', getTransactionDocuments);

// Admin routes
router.get('/admin/pending', adminOnly, getPendingDocuments);
router.put('/:id/verify', adminOnly, verifyDocument);

export default router;
