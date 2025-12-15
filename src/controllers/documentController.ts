import { Response } from 'express';
import { body } from 'express-validator';
import { documentService } from '../services/documentService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { DocumentType } from '../models';
import { parseIntParam, parseBooleanParam } from '../utils/helpers';

// Validation rules
export const uploadDocumentValidation = [
  body('type')
    .isIn(['INSURANCE', 'UCC_FILING', 'AUTHORITY', 'SAFETY_RECORD', 'BILL_OF_SALE', 'OTHER'])
    .withMessage('Invalid document type'),
  body('listingId').optional().trim(),
  body('transactionId').optional().trim(),
];

// Upload a document
export const uploadDocument = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }

  const { type, listingId, transactionId } = req.body;

  const document = await documentService.uploadDocument(req.user.id, {
    type: type as DocumentType,
    listingId,
    transactionId,
    name: req.file.originalname,
    url: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });

  res.status(201).json({
    success: true,
    data: document,
    message: 'Document uploaded successfully',
  });
});

// Get document by ID
export const getDocument = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  const document = await documentService.getDocumentById(id, req.user.id);

  res.json({
    success: true,
    data: document,
  });
});

// Get listing documents
export const getListingDocuments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { listingId } = req.params;

  const result = await documentService.getListingDocuments(listingId, req.user.id);

  res.json({
    success: true,
    data: result.documents,
    count: result.count,
    restricted: result.restricted,
  });
});

// Get transaction documents
export const getTransactionDocuments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { transactionId } = req.params;

  const documents = await documentService.getTransactionDocuments(transactionId, req.user.id);

  res.json({
    success: true,
    data: documents,
  });
});

// Delete a document
export const deleteDocument = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  await documentService.deleteDocument(id, req.user.id);

  res.json({
    success: true,
    message: 'Document deleted',
  });
});

// Verify document (admin)
export const verifyDocument = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const { verified } = req.body;

  const document = await documentService.verifyDocument(id, req.user.id, verified);

  res.json({
    success: true,
    data: document,
    message: verified ? 'Document verified' : 'Document rejected',
  });
});

// Get pending documents (admin)
export const getPendingDocuments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;

  const result = await documentService.getPendingDocuments(page, limit);

  res.json({
    success: true,
    data: result.documents,
    pagination: result.pagination,
  });
});
