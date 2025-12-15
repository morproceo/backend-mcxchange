import {
  Document,
  Listing,
  Transaction,
  User,
  UnlockedListing,
  DocumentType,
  DocumentStatus,
} from '../models';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';
import { getPaginationInfo } from '../utils/helpers';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

interface UploadDocumentData {
  listingId?: string;
  transactionId?: string;
  type: DocumentType;
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

class DocumentService {
  // Upload a document
  async uploadDocument(uploaderId: string, data: UploadDocumentData) {
    // Verify ownership if listing or transaction ID provided
    if (data.listingId) {
      const listing = await Listing.findByPk(data.listingId);
      if (!listing) {
        throw new NotFoundError('Listing');
      }
      if (listing.sellerId !== uploaderId) {
        throw new ForbiddenError('You can only upload documents to your own listings');
      }
    }

    if (data.transactionId) {
      const transaction = await Transaction.findByPk(data.transactionId);
      if (!transaction) {
        throw new NotFoundError('Transaction');
      }
      // Both buyer and seller can upload to transaction
      if (transaction.buyerId !== uploaderId && transaction.sellerId !== uploaderId) {
        throw new ForbiddenError('You are not part of this transaction');
      }
    }

    const document = await Document.create({
      uploaderId,
      listingId: data.listingId,
      transactionId: data.transactionId,
      type: data.type,
      name: data.name,
      url: data.url,
      size: data.size,
      mimeType: data.mimeType,
      status: DocumentStatus.PENDING,
    });

    return document;
  }

  // Get document by ID
  async getDocumentById(documentId: string, userId: string) {
    const document = await Document.findByPk(documentId, {
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'sellerId', 'mcNumber', 'title'],
        },
        {
          model: Transaction,
          as: 'transaction',
          attributes: ['id', 'buyerId', 'sellerId'],
        },
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'name'],
        },
      ],
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check access rights
    const user = await User.findByPk(userId);
    const isAdmin = user?.role === 'ADMIN';
    const isUploader = document.uploaderId === userId;
    const isListingOwner = document.listing?.sellerId === userId;
    const isTransactionParty = document.transaction?.buyerId === userId ||
                               document.transaction?.sellerId === userId;

    if (!isAdmin && !isUploader && !isListingOwner && !isTransactionParty) {
      throw new ForbiddenError('You do not have access to this document');
    }

    return document;
  }

  // Get documents for a listing
  async getListingDocuments(listingId: string, userId: string) {
    const listing = await Listing.findByPk(listingId);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    const user = await User.findByPk(userId);
    const isAdmin = user?.role === 'ADMIN';
    const isOwner = listing.sellerId === userId;

    // Check if user has unlocked this listing
    const unlocked = await UnlockedListing.findOne({
      where: { userId, listingId },
    });

    // Only show documents to owner, admin, or users who unlocked the listing
    if (!isAdmin && !isOwner && !unlocked) {
      // Return only document count, not actual documents
      const count = await Document.count({ where: { listingId } });
      return { documents: [], count, restricted: true };
    }

    const documents = await Document.findAll({
      where: { listingId },
      order: [['createdAt', 'DESC']],
    });

    return { documents, count: documents.length, restricted: false };
  }

  // Get documents for a transaction
  async getTransactionDocuments(transactionId: string, userId: string) {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    const user = await User.findByPk(userId);
    const isAdmin = user?.role === 'ADMIN';
    const isParty = transaction.buyerId === userId || transaction.sellerId === userId;

    if (!isAdmin && !isParty) {
      throw new ForbiddenError('You are not part of this transaction');
    }

    const documents = await Document.findAll({
      where: { transactionId },
      order: [['createdAt', 'DESC']],
      include: [{
        model: User,
        as: 'uploader',
        attributes: ['id', 'name'],
      }],
    });

    return documents;
  }

  // Delete a document
  async deleteDocument(documentId: string, userId: string) {
    const document = await Document.findByPk(documentId, {
      include: [{ model: Listing, as: 'listing' }],
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    const user = await User.findByPk(userId);
    const isAdmin = user?.role === 'ADMIN';
    const isUploader = document.uploaderId === userId;
    const isListingOwner = document.listing?.sellerId === userId;

    if (!isAdmin && !isUploader && !isListingOwner) {
      throw new ForbiddenError('You cannot delete this document');
    }

    // Delete the file from disk
    try {
      const filePath = path.join(config.upload.uploadDir, path.basename(document.url));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    await document.destroy();

    return { success: true };
  }

  // Verify a document (admin only)
  async verifyDocument(documentId: string, adminId: string, verified: boolean) {
    const document = await Document.findByPk(documentId);

    if (!document) {
      throw new NotFoundError('Document');
    }

    await document.update({
      status: verified ? DocumentStatus.VERIFIED : DocumentStatus.REJECTED,
      verifiedBy: adminId,
      verifiedAt: new Date(),
    });

    return document;
  }

  // Get all pending documents (admin)
  async getPendingDocuments(page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { rows: documents, count: total } = await Document.findAndCountAll({
      where: { status: DocumentStatus.PENDING },
      order: [['createdAt', 'ASC']],
      offset,
      limit,
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'mcNumber', 'title'],
        },
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    return {
      documents,
      pagination: getPaginationInfo(page, limit, total),
    };
  }
}

export const documentService = new DocumentService();
export default documentService;
