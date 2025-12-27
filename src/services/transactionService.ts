import { Op } from 'sequelize';
import sequelize from '../config/database';
import {
  Transaction,
  Listing,
  Offer,
  User,
  Document,
  Payment,
  TransactionMessage,
  TransactionTimeline,
  Notification,
  TransactionStatus,
  ListingStatus,
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  UserRole,
  OfferStatus,
} from '../models';
import { NotFoundError, ForbiddenError, BadRequestError } from '../middleware/errorHandler';
import { pricingConfigService } from './pricingConfigService';

class TransactionService {
  // Get transaction by ID
  async getTransactionById(transactionId: string, userId: string) {
    const transaction = await Transaction.findByPk(transactionId, {
      include: [
        {
          model: Listing,
          as: 'listing',
          include: [{ model: Document, as: 'documents' }],
        },
        { model: Offer, as: 'offer' },
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'name', 'email', 'phone', 'verified', 'trustScore', 'companyName', 'companyAddress', 'city', 'state'],
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'phone', 'verified', 'trustScore', 'companyName', 'companyAddress', 'city', 'state'],
        },
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'name', 'email'],
        },
        { model: Document, as: 'documents' },
        {
          model: TransactionMessage,
          as: 'messages',
          order: [['createdAt', 'ASC']],
        },
        {
          model: TransactionTimeline,
          as: 'timeline',
          order: [['createdAt', 'ASC']],
        },
        {
          model: Payment,
          as: 'payments',
          order: [['createdAt', 'DESC']],
        },
      ],
    });

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    // Only buyer, seller, or admin can view transaction
    const user = await User.findByPk(userId);
    if (
      transaction.buyerId !== userId &&
      transaction.sellerId !== userId &&
      user?.role !== 'ADMIN'
    ) {
      throw new ForbiddenError('You do not have access to this transaction');
    }

    // Determine what info to show based on status and role
    const isAdmin = user?.role === 'ADMIN';
    const isBuyer = transaction.buyerId === userId;
    const isSeller = transaction.sellerId === userId;

    // Hide seller info from buyer until final payment
    const showSellerInfo = isAdmin || isSeller ||
      transaction.status === TransactionStatus.COMPLETED ||
      transaction.status === TransactionStatus.PAYMENT_RECEIVED;

    // Hide buyer info from seller until deposit received
    const showBuyerInfo = isAdmin || isBuyer ||
      transaction.status !== TransactionStatus.AWAITING_DEPOSIT;

    const txData = transaction.toJSON();

    return {
      ...txData,
      buyer: showBuyerInfo ? txData.buyer : {
        id: txData.buyer.id,
        name: txData.buyer.name,
        trustScore: txData.buyer.trustScore,
        verified: txData.buyer.verified,
      },
      seller: showSellerInfo ? txData.seller : {
        id: txData.seller.id,
        name: txData.seller.name,
        trustScore: txData.seller.trustScore,
        verified: txData.seller.verified,
      },
      userRole: isAdmin ? 'admin' : isBuyer ? 'buyer' : 'seller',
    };
  }

  // Get user's transactions
  async getUserTransactions(userId: string, role: UserRole) {
    const where: Record<string, unknown> = role === UserRole.BUYER
      ? { buyerId: userId }
      : role === UserRole.SELLER
        ? { sellerId: userId }
        : {}; // Admin sees all

    const transactions = await Transaction.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'mcNumber', 'dotNumber', 'title', 'legalName'],
        },
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'name', 'trustScore'],
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'trustScore'],
        },
      ],
    });

    return transactions;
  }

  // Buyer accepts terms
  async buyerAcceptTerms(transactionId: string, buyerId: string) {
    const transaction = await this.getTransactionForUpdate(transactionId, buyerId, 'BUYER');

    if (transaction.buyerAcceptedTerms) {
      throw new ForbiddenError('Terms already accepted');
    }

    await transaction.update({
      buyerAcceptedTerms: true,
      buyerAcceptedTermsAt: new Date(),
    });

    await this.addTimelineEntry(transactionId, transaction.status, 'Buyer Accepted Terms',
      'Buyer has accepted the transaction terms and conditions', buyerId, 'BUYER');

    return transaction;
  }

  // Seller accepts terms
  async sellerAcceptTerms(transactionId: string, sellerId: string) {
    const transaction = await this.getTransactionForUpdate(transactionId, sellerId, 'SELLER');

    if (transaction.sellerAcceptedTerms) {
      throw new ForbiddenError('Terms already accepted');
    }

    await transaction.update({
      sellerAcceptedTerms: true,
      sellerAcceptedTermsAt: new Date(),
    });

    await this.addTimelineEntry(transactionId, transaction.status, 'Seller Accepted Terms',
      'Seller has accepted the transaction terms and conditions', sellerId, 'SELLER');

    return transaction;
  }

  // Record deposit payment
  async recordDeposit(
    transactionId: string,
    userId: string,
    paymentMethod: PaymentMethod,
    reference?: string
  ) {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    if (transaction.buyerId !== userId) {
      throw new ForbiddenError('Only buyer can pay deposit');
    }

    if (transaction.status !== TransactionStatus.AWAITING_DEPOSIT) {
      throw new ForbiddenError('Deposit already paid or not required');
    }

    // Create payment record
    const payment = await Payment.create({
      transactionId,
      userId,
      type: PaymentType.DEPOSIT,
      amount: transaction.depositAmount,
      method: paymentMethod,
      reference,
      status: paymentMethod === PaymentMethod.STRIPE
        ? PaymentStatus.PROCESSING
        : PaymentStatus.PENDING, // Zelle/Wire needs admin verification
    });

    // If Stripe, status will be updated via webhook
    // If Zelle/Wire, admin needs to verify
    if (paymentMethod !== PaymentMethod.STRIPE) {
      await this.addTimelineEntry(transactionId, transaction.status, 'Deposit Submitted',
        `Buyer submitted ${paymentMethod} payment. Awaiting admin verification.`, userId, 'BUYER');
    }

    return payment;
  }

  // Admin verifies deposit (for Zelle/Wire)
  async verifyDeposit(transactionId: string, adminId: string, paymentId: string) {
    const transaction = await Transaction.findByPk(transactionId, {
      include: [{ model: Payment, as: 'payments' }],
    });

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    const payment = transaction.payments?.find((p: Payment) => p.id === paymentId);
    if (!payment) {
      throw new NotFoundError('Payment');
    }

    const t = await sequelize.transaction();

    try {
      await Payment.update(
        {
          status: PaymentStatus.COMPLETED,
          verifiedBy: adminId,
          verifiedAt: new Date(),
          completedAt: new Date(),
        },
        { where: { id: paymentId }, transaction: t }
      );

      await transaction.update(
        {
          status: TransactionStatus.DEPOSIT_RECEIVED,
          depositPaidAt: new Date(),
          depositPaymentMethod: payment.method,
          depositPaymentRef: payment.reference,
          adminId,
        },
        { transaction: t }
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }

    await this.addTimelineEntry(transactionId, TransactionStatus.DEPOSIT_RECEIVED,
      'Deposit Verified', 'Admin has verified the deposit payment', adminId, 'ADMIN');

    // Notify buyer and seller
    await this.notifyParties(transaction.buyerId, transaction.sellerId,
      'Deposit Confirmed', 'The deposit has been verified. Transaction is now in review.');

    return { success: true };
  }

  // Buyer approval
  async buyerApprove(transactionId: string, buyerId: string) {
    const transaction = await this.getTransactionForUpdate(transactionId, buyerId, 'BUYER');

    // Allow approval when deposit is received, in review, or seller already approved
    if (transaction.status !== TransactionStatus.DEPOSIT_RECEIVED &&
        transaction.status !== TransactionStatus.IN_REVIEW &&
        transaction.status !== TransactionStatus.SELLER_APPROVED) {
      throw new ForbiddenError('Transaction is not ready for buyer approval');
    }

    const newStatus = transaction.sellerApproved
      ? TransactionStatus.BOTH_APPROVED
      : TransactionStatus.BUYER_APPROVED;

    await transaction.update({
      buyerApproved: true,
      buyerApprovedAt: new Date(),
      status: newStatus,
    });

    await this.addTimelineEntry(transactionId, newStatus, 'Buyer Approved',
      'Buyer has approved the transaction', buyerId, 'BUYER');

    return transaction;
  }

  // Seller approval
  async sellerApprove(transactionId: string, sellerId: string) {
    const transaction = await this.getTransactionForUpdate(transactionId, sellerId, 'SELLER');

    // Allow approval when deposit is received, in review, or buyer already approved
    if (transaction.status !== TransactionStatus.DEPOSIT_RECEIVED &&
        transaction.status !== TransactionStatus.IN_REVIEW &&
        transaction.status !== TransactionStatus.BUYER_APPROVED) {
      throw new ForbiddenError('Transaction is not ready for seller approval');
    }

    const newStatus = transaction.buyerApproved
      ? TransactionStatus.BOTH_APPROVED
      : TransactionStatus.SELLER_APPROVED;

    await transaction.update({
      sellerApproved: true,
      sellerApprovedAt: new Date(),
      status: newStatus,
    });

    await this.addTimelineEntry(transactionId, newStatus, 'Seller Approved',
      'Seller has approved the transaction', sellerId, 'SELLER');

    return transaction;
  }

  // Admin approval (after both parties approve)
  async adminApprove(transactionId: string, adminId: string) {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    if (transaction.status !== TransactionStatus.BOTH_APPROVED) {
      throw new ForbiddenError('Both parties must approve before admin review');
    }

    await transaction.update({
      adminApproved: true,
      adminApprovedAt: new Date(),
      adminId,
      status: TransactionStatus.PAYMENT_PENDING,
    });

    await this.addTimelineEntry(transactionId, TransactionStatus.PAYMENT_PENDING,
      'Admin Approved - Payment Pending', 'Admin has approved. Awaiting final payment from buyer.',
      adminId, 'ADMIN');

    await this.notifyParties(transaction.buyerId, transaction.sellerId,
      'Ready for Final Payment', 'Transaction approved. Buyer can now submit final payment.');

    return transaction;
  }

  // Record final payment
  async recordFinalPayment(
    transactionId: string,
    buyerId: string,
    paymentMethod: PaymentMethod,
    reference?: string
  ) {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    if (transaction.buyerId !== buyerId) {
      throw new ForbiddenError('Only buyer can pay');
    }

    if (transaction.status !== TransactionStatus.PAYMENT_PENDING) {
      throw new ForbiddenError('Transaction is not ready for final payment');
    }

    const finalAmount = Number(transaction.agreedPrice) - Number(transaction.depositAmount);

    const payment = await Payment.create({
      transactionId,
      userId: buyerId,
      type: PaymentType.FINAL_PAYMENT,
      amount: finalAmount,
      method: paymentMethod,
      reference,
      status: paymentMethod === PaymentMethod.STRIPE
        ? PaymentStatus.PROCESSING
        : PaymentStatus.PENDING,
    });

    if (paymentMethod !== PaymentMethod.STRIPE) {
      await this.addTimelineEntry(transactionId, transaction.status, 'Final Payment Submitted',
        `Buyer submitted ${paymentMethod} payment. Awaiting admin verification.`, buyerId, 'BUYER');
    }

    return payment;
  }

  // Admin verifies final payment and completes transaction
  async verifyFinalPayment(transactionId: string, adminId: string, paymentId: string) {
    const transaction = await Transaction.findByPk(transactionId, {
      include: [
        { model: Payment, as: 'payments' },
        { model: Listing, as: 'listing' },
      ],
    });

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    const payment = transaction.payments?.find((p: Payment) => p.id === paymentId);
    if (!payment) {
      throw new NotFoundError('Payment');
    }

    const t = await sequelize.transaction();

    try {
      await Payment.update(
        {
          status: PaymentStatus.COMPLETED,
          verifiedBy: adminId,
          verifiedAt: new Date(),
          completedAt: new Date(),
        },
        { where: { id: paymentId }, transaction: t }
      );

      await transaction.update(
        {
          status: TransactionStatus.COMPLETED,
          finalPaidAt: new Date(),
          finalPaymentMethod: payment.method,
          finalPaymentRef: payment.reference,
          completedAt: new Date(),
        },
        { transaction: t }
      );

      await Listing.update(
        {
          status: ListingStatus.SOLD,
          soldAt: new Date(),
        },
        { where: { id: transaction.listingId }, transaction: t }
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }

    await this.addTimelineEntry(transactionId, TransactionStatus.COMPLETED,
      'Transaction Completed', 'All payments verified. Transaction successfully completed.',
      adminId, 'ADMIN');

    await this.notifyParties(transaction.buyerId, transaction.sellerId,
      'Transaction Completed!', 'Congratulations! The MC authority transfer has been completed.');

    return { success: true };
  }

  // Cancel transaction
  async cancelTransaction(transactionId: string, userId: string, reason: string) {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    const user = await User.findByPk(userId);
    const isAdmin = user?.role === 'ADMIN';

    if (!isAdmin && transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new ForbiddenError('You cannot cancel this transaction');
    }

    // Can only cancel before completion
    if (transaction.status === TransactionStatus.COMPLETED || transaction.status === TransactionStatus.CANCELLED) {
      throw new ForbiddenError('This transaction cannot be cancelled');
    }

    const t = await sequelize.transaction();

    try {
      await transaction.update(
        {
          status: TransactionStatus.CANCELLED,
          cancelledAt: new Date(),
          adminNotes: reason,
        },
        { transaction: t }
      );

      await Listing.update(
        { status: ListingStatus.ACTIVE },
        { where: { id: transaction.listingId }, transaction: t }
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }

    const role = isAdmin ? 'ADMIN' : transaction.buyerId === userId ? 'BUYER' : 'SELLER';
    await this.addTimelineEntry(transactionId, TransactionStatus.CANCELLED,
      'Transaction Cancelled', reason, userId, role as UserRole);

    // TODO: Handle refund if deposit was paid

    return { success: true };
  }

  // Open dispute
  async openDispute(transactionId: string, userId: string, reason: string) {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new ForbiddenError('You cannot open a dispute on this transaction');
    }

    await transaction.update({
      status: TransactionStatus.DISPUTED,
      disputeReason: reason,
      disputeOpenedAt: new Date(),
    });

    const role = transaction.buyerId === userId ? 'BUYER' : 'SELLER';
    await this.addTimelineEntry(transactionId, TransactionStatus.DISPUTED,
      'Dispute Opened', reason, userId, role as UserRole);

    return transaction;
  }

  // Send message in transaction
  async sendMessage(transactionId: string, userId: string, content: string) {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    const isParty = transaction.buyerId === userId ||
                    transaction.sellerId === userId ||
                    user.role === 'ADMIN';

    if (!isParty) {
      throw new ForbiddenError('You cannot send messages in this transaction');
    }

    const message = await TransactionMessage.create({
      transactionId,
      senderId: userId,
      senderRole: user.role,
      content,
    });

    return message;
  }

  // Update transaction status (admin)
  async updateStatus(transactionId: string, adminId: string, status: TransactionStatus, notes?: string) {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    await transaction.update({
      status,
      adminNotes: notes,
      adminId,
    });

    await this.addTimelineEntry(transactionId, status, `Status Updated to ${status}`,
      notes || 'Admin updated transaction status', adminId, 'ADMIN');

    return transaction;
  }

  // Admin creates a transaction manually (skipping offer flow)
  async adminCreateTransaction(
    adminId: string,
    params: {
      listingId: string;
      buyerId: string;
      agreedPrice: number;
      depositAmount?: number;
      notes?: string;
    }
  ) {
    const { listingId, buyerId, agreedPrice, depositAmount, notes } = params;

    // Validate listing exists and is available
    const listing = await Listing.findByPk(listingId, {
      include: [{ model: User, as: 'seller' }],
    });

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    if (listing.status === ListingStatus.SOLD) {
      throw new BadRequestError('This listing has already been sold');
    }

    if (listing.status === ListingStatus.RESERVED) {
      throw new BadRequestError('This listing is already reserved in another transaction');
    }

    // Validate buyer exists and is not the seller
    const buyer = await User.findByPk(buyerId);
    if (!buyer) {
      throw new NotFoundError('Buyer');
    }

    if (listing.sellerId === buyerId) {
      throw new BadRequestError('Buyer cannot be the same as seller');
    }

    // Get platform fees to calculate deposit and platform fee
    const platformFees = await pricingConfigService.getPlatformFees();

    // Calculate deposit (use provided or calculate from platform config)
    let calculatedDeposit = depositAmount;
    if (!calculatedDeposit) {
      calculatedDeposit = Math.min(
        Math.max(
          agreedPrice * (platformFees.depositPercentage / 100),
          platformFees.minDeposit
        ),
        platformFees.maxDeposit
      );
    }

    // Calculate platform fee
    const platformFee = agreedPrice * (platformFees.transactionFeePercentage / 100);

    const t = await sequelize.transaction();

    try {
      // Create a placeholder offer to link to the transaction
      const offer = await Offer.create(
        {
          listingId,
          buyerId,
          sellerId: listing.sellerId,
          amount: agreedPrice,
          message: notes || 'Transaction created by admin',
          status: OfferStatus.ACCEPTED, // Mark as accepted since admin is creating directly
        },
        { transaction: t }
      );

      // Create the transaction
      const transaction = await Transaction.create(
        {
          offerId: offer.id,
          listingId,
          buyerId,
          sellerId: listing.sellerId,
          adminId,
          agreedPrice,
          depositAmount: calculatedDeposit,
          platformFee,
          finalPaymentAmount: agreedPrice - calculatedDeposit,
          status: TransactionStatus.AWAITING_DEPOSIT,
          adminNotes: notes,
        },
        { transaction: t }
      );

      // Reserve the listing
      await listing.update(
        { status: ListingStatus.RESERVED },
        { transaction: t }
      );

      await t.commit();

      // Add timeline entry
      await this.addTimelineEntry(
        transaction.id,
        TransactionStatus.AWAITING_DEPOSIT,
        'Transaction Created by Admin',
        notes || 'Admin initiated this transaction. Awaiting deposit from buyer.',
        adminId,
        'ADMIN'
      );

      // Notify both parties
      await this.notifyParties(
        buyerId,
        listing.sellerId,
        'New Transaction Created',
        `Admin has created a transaction for MC-${listing.mcNumber}. Please proceed with the deposit.`
      );

      // Return full transaction with associations
      return Transaction.findByPk(transaction.id, {
        include: [
          { model: Listing, as: 'listing' },
          { model: User, as: 'buyer', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'seller', attributes: ['id', 'name', 'email'] },
        ],
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Get available buyers for admin transaction creation
  async getAvailableBuyers(search?: string) {
    const where: Record<string, unknown> = {
      role: UserRole.BUYER,
    };

    if (search) {
      where[Op.or as unknown as string] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const buyers = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'verified', 'trustScore'],
      limit: 20,
      order: [['name', 'ASC']],
    });

    return buyers;
  }

  // Get available listings for admin transaction creation
  async getAvailableListings(search?: string) {
    const where: Record<string, unknown> = {
      status: {
        [Op.in]: [ListingStatus.ACTIVE, ListingStatus.PENDING_REVIEW],
      },
    };

    if (search) {
      where[Op.or as unknown as string] = [
        { mcNumber: { [Op.like]: `%${search}%` } },
        { legalName: { [Op.like]: `%${search}%` } },
        { title: { [Op.like]: `%${search}%` } },
      ];
    }

    const listings = await Listing.findAll({
      where,
      attributes: ['id', 'mcNumber', 'dotNumber', 'legalName', 'title', 'askingPrice', 'listingPrice', 'sellerId'],
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email'],
        },
      ],
      limit: 20,
      order: [['createdAt', 'DESC']],
    });

    return listings;
  }

  // Helper: Get transaction and verify access
  private async getTransactionForUpdate(
    transactionId: string,
    userId: string,
    expectedRole: 'BUYER' | 'SELLER'
  ) {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    if (expectedRole === 'BUYER' && transaction.buyerId !== userId) {
      throw new ForbiddenError('Not authorized');
    }

    if (expectedRole === 'SELLER' && transaction.sellerId !== userId) {
      throw new ForbiddenError('Not authorized');
    }

    return transaction;
  }

  // Helper: Add timeline entry
  private async addTimelineEntry(
    transactionId: string,
    status: TransactionStatus,
    title: string,
    description: string,
    actorId: string,
    actorRole: UserRole | string
  ) {
    await TransactionTimeline.create({
      transactionId,
      status,
      title,
      description,
      actorId,
      actorRole,
    });
  }

  // Helper: Notify both parties
  private async notifyParties(buyerId: string, sellerId: string, title: string, message: string) {
    await Notification.bulkCreate([
      { userId: buyerId, type: 'TRANSACTION', title, message },
      { userId: sellerId, type: 'TRANSACTION', title, message },
    ]);
  }
}

export const transactionService = new TransactionService();
export default transactionService;
