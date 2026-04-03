import { Router } from 'express';
import {
  createCredential,
  getTransactionCredentials,
  updateCredential,
  deleteCredential,
  releaseCredentials,
  revokeCredentialRelease,
} from '../controllers/credentialController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All credential routes require authentication
router.post('/', authenticate, createCredential);
router.get('/transaction/:transactionId', authenticate, getTransactionCredentials);
router.put('/:id', authenticate, updateCredential);
router.delete('/:id', authenticate, deleteCredential);
router.post('/transaction/:transactionId/release', authenticate, releaseCredentials);
router.post('/transaction/:transactionId/revoke', authenticate, revokeCredentialRelease);

export default router;
