import { Response } from 'express';
import { credentialService } from '../services/credentialService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

export const createCredential = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { transactionId, label, username, password } = req.body;

  if (!transactionId || !label || !password) {
    res.status(400).json({ success: false, error: 'transactionId, label, and password are required' });
    return;
  }

  const credential = await credentialService.createCredential(req.user.id, {
    transactionId,
    label,
    username,
    password,
  });

  res.status(201).json({ success: true, data: credential });
});

export const getTransactionCredentials = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { transactionId } = req.params;
  const credentials = await credentialService.getCredentials(transactionId, req.user.id);

  res.json({ success: true, data: credentials });
});

export const updateCredential = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { label, username, password } = req.body;

  const credential = await credentialService.updateCredential(id, req.user.id, {
    label,
    username,
    password,
  });

  res.json({ success: true, data: credential });
});

export const deleteCredential = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  await credentialService.deleteCredential(id, req.user.id);

  res.json({ success: true, message: 'Credential deleted' });
});

export const releaseCredentials = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { transactionId } = req.params;
  await credentialService.releaseCredentials(transactionId, req.user.id);

  res.json({ success: true, message: 'Credentials released to buyer' });
});

export const revokeCredentialRelease = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { transactionId } = req.params;
  await credentialService.revokeCredentialRelease(transactionId, req.user.id);

  res.json({ success: true, message: 'Credential release revoked' });
});
