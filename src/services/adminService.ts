import { Op } from 'sequelize';
import {
  User,
  Listing,
  Transaction,
  PremiumRequest,
  AdminAction,
  Notification,
  PlatformSetting,
  RefreshToken,
  ListingStatus,
  UserStatus,
  PremiumRequestStatus,
  TransactionStatus,
  NotificationType,
  UserRole,
} from '../models';
import { NotFoundError } from '../middleware/errorHandler';
import { getPaginationInfo } from '../utils/helpers';

class AdminService {
  // Get dashboard stats
  async getDashboardStats() {
    const [
      totalUsers,
      totalListings,
      activeListings,
      pendingListings,
      soldListings,
      totalTransactions,
      activeTransactions,
      completedTransactions,
      pendingPremiumRequests,
    ] = await Promise.all([
      User.count(),
      Listing.count(),
      Listing.count({ where: { status: ListingStatus.ACTIVE } }),
      Listing.count({ where: { status: ListingStatus.PENDING_REVIEW } }),
      Listing.count({ where: { status: ListingStatus.SOLD } }),
      Transaction.count(),
      Transaction.count({ where: { status: { [Op.ne]: TransactionStatus.COMPLETED } } }),
      Transaction.count({ where: { status: TransactionStatus.COMPLETED } }),
      PremiumRequest.count({ where: { status: PremiumRequestStatus.PENDING } }),
    ]);

    // Calculate total revenue from completed transactions
    const revenueResult = await Transaction.sum('platformFee', {
      where: { status: TransactionStatus.COMPLETED },
    });

    return {
      users: {
        total: totalUsers,
      },
      listings: {
        total: totalListings,
        active: activeListings,
        pending: pendingListings,
        sold: soldListings,
      },
      transactions: {
        total: totalTransactions,
        active: activeTransactions,
        completed: completedTransactions,
      },
      premiumRequests: pendingPremiumRequests,
      revenue: revenueResult || 0,
    };
  }

  // Get pending listings for review
  async getPendingListings(page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { count: total, rows: listings } = await Listing.findAndCountAll({
      where: { status: ListingStatus.PENDING_REVIEW },
      order: [['createdAt', 'ASC']],
      offset,
      limit,
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'verified', 'trustScore'],
        },
      ],
    });

    return {
      listings,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Approve listing
  async approveListing(listingId: string, adminId: string, notes?: string) {
    const listing = await Listing.findByPk(listingId);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    await listing.update({
      status: ListingStatus.ACTIVE,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      reviewNotes: notes,
      publishedAt: new Date(),
    });

    // Record admin action
    await AdminAction.create({
      adminId,
      action: 'APPROVE_LISTING',
      targetType: 'LISTING',
      targetId: listingId,
      reason: notes,
    });

    // Notify seller
    await Notification.create({
      userId: listing.sellerId,
      type: NotificationType.VERIFICATION,
      title: 'Listing Approved',
      message: `Your listing MC-${listing.mcNumber} has been approved and is now live.`,
      link: `/seller/listings`,
    });

    return listing;
  }

  // Reject listing
  async rejectListing(listingId: string, adminId: string, reason: string) {
    const listing = await Listing.findByPk(listingId);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    await listing.update({
      status: ListingStatus.REJECTED,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      rejectionReason: reason,
    });

    // Record admin action
    await AdminAction.create({
      adminId,
      action: 'REJECT_LISTING',
      targetType: 'LISTING',
      targetId: listingId,
      reason,
    });

    // Notify seller
    await Notification.create({
      userId: listing.sellerId,
      type: NotificationType.VERIFICATION,
      title: 'Listing Rejected',
      message: `Your listing MC-${listing.mcNumber} was not approved. Reason: ${reason}`,
      link: `/seller/listings`,
    });

    return listing;
  }

  // Get all users with filters
  async getUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
  }) {
    const { page = 1, limit = 20, search, role, status } = params;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { companyName: { [Op.like]: `%${search}%` } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    const { count: total, rows: users } = await User.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      attributes: [
        'id',
        'email',
        'name',
        'phone',
        'role',
        'status',
        'verified',
        'trustScore',
        'memberSince',
        'lastLoginAt',
        'companyName',
        'createdAt',
      ],
    });

    // Get counts for each user
    const usersWithCounts = await Promise.all(
      users.map(async (user) => {
        const [listingsCount, sentOffersCount, buyerTransactionsCount, sellerTransactionsCount] =
          await Promise.all([
            Listing.count({ where: { sellerId: user.id } }),
            (await import('../models')).Offer.count({ where: { buyerId: user.id } }),
            Transaction.count({ where: { buyerId: user.id } }),
            Transaction.count({ where: { sellerId: user.id } }),
          ]);

        return {
          ...user.toJSON(),
          _count: {
            listings: listingsCount,
            sentOffers: sentOffersCount,
            buyerTransactions: buyerTransactionsCount,
            sellerTransactions: sellerTransactionsCount,
          },
        };
      })
    );

    return {
      users: usersWithCounts,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get user details
  async getUserDetails(userId: string) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Get related data
    const [listings, sentOffers, receivedOffers, subscription] = await Promise.all([
      Listing.findAll({
        where: { sellerId: userId },
        limit: 10,
        order: [['createdAt', 'DESC']],
      }),
      (await import('../models')).Offer.findAll({
        where: { buyerId: userId },
        limit: 10,
        order: [['createdAt', 'DESC']],
        include: [{ model: Listing, as: 'listing', attributes: ['mcNumber', 'title'] }],
      }),
      (await import('../models')).Offer.findAll({
        where: { sellerId: userId },
        limit: 10,
        order: [['createdAt', 'DESC']],
        include: [{ model: Listing, as: 'listing', attributes: ['mcNumber', 'title'] }],
      }),
      (await import('../models')).Subscription.findOne({ where: { userId } }),
    ]);

    // Get counts
    const [listingsCount, sentOffersCount, receivedOffersCount, buyerTransactionsCount, sellerTransactionsCount] =
      await Promise.all([
        Listing.count({ where: { sellerId: userId } }),
        (await import('../models')).Offer.count({ where: { buyerId: userId } }),
        (await import('../models')).Offer.count({ where: { sellerId: userId } }),
        Transaction.count({ where: { buyerId: userId } }),
        Transaction.count({ where: { sellerId: userId } }),
      ]);

    return {
      ...user.toJSON(),
      listings,
      sentOffers,
      receivedOffers,
      subscription,
      _count: {
        listings: listingsCount,
        sentOffers: sentOffersCount,
        receivedOffers: receivedOffersCount,
        buyerTransactions: buyerTransactionsCount,
        sellerTransactions: sellerTransactionsCount,
      },
    };
  }

  // Block user
  async blockUser(userId: string, adminId: string, reason: string) {
    const user = await User.findByPk(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    await user.update({ status: UserStatus.BLOCKED });

    // Record admin action
    await AdminAction.create({
      adminId,
      action: 'BLOCK_USER',
      targetType: 'USER',
      targetId: userId,
      reason,
    });

    // Invalidate all refresh tokens
    await RefreshToken.destroy({ where: { userId } });

    return user;
  }

  // Unblock user
  async unblockUser(userId: string, adminId: string) {
    const user = await User.findByPk(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    await user.update({ status: UserStatus.ACTIVE });

    // Record admin action
    await AdminAction.create({
      adminId,
      action: 'UNBLOCK_USER',
      targetType: 'USER',
      targetId: userId,
    });

    return user;
  }

  // Get premium requests
  async getPremiumRequests(status?: PremiumRequestStatus, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;
    const where = status ? { status } : {};

    const { count: total, rows: requests } = await PremiumRequest.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'name', 'email', 'phone', 'trustScore'],
        },
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'mcNumber', 'title', 'price'],
          include: [
            {
              model: User,
              as: 'seller',
              attributes: ['id', 'name', 'email'],
            },
          ],
        },
      ],
    });

    return {
      requests,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Update premium request
  async updatePremiumRequest(requestId: string, adminId: string, status: PremiumRequestStatus, notes?: string) {
    const request = await PremiumRequest.findByPk(requestId);

    if (!request) {
      throw new NotFoundError('Premium request');
    }

    await request.update({
      status,
      adminNotes: notes,
      contactedAt: status === PremiumRequestStatus.CONTACTED ? new Date() : undefined,
      contactedBy: status === PremiumRequestStatus.CONTACTED ? adminId : undefined,
    });

    return request;
  }

  // Get all listings (admin view)
  async getAllListings(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    isPremium?: boolean;
  }) {
    const { page = 1, limit = 20, search, status, isPremium } = params;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { mcNumber: { [Op.like]: `%${search}%` } },
        { dotNumber: { [Op.like]: `%${search}%` } },
        { title: { [Op.like]: `%${search}%` } },
        { legalName: { [Op.like]: `%${search}%` } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (isPremium !== undefined) {
      where.isPremium = isPremium;
    }

    const { count: total, rows: listings } = await Listing.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'verified', 'trustScore'],
        },
      ],
    });

    return {
      listings,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get all transactions (admin view)
  async getAllTransactions(params: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const { page = 1, limit = 20, status } = params;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    const { count: total, rows: transactions } = await Transaction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
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
          as: 'buyer',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    return {
      transactions,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get admin action log
  async getAdminActionLog(adminId?: string, page: number = 1, limit: number = 50) {
    const offset = (page - 1) * limit;
    const where = adminId ? { adminId } : {};

    const { count: total, rows: actions } = await AdminAction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    return {
      actions,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Verify seller
  async verifySeller(userId: string, adminId: string) {
    const user = await User.findByPk(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    await user.update({
      sellerVerified: true,
      sellerVerifiedAt: new Date(),
      verified: true,
      verifiedAt: new Date(),
      // Boost trust score for verified sellers
      trustScore: Math.min(100, user.trustScore + 20),
    });

    // Record admin action
    await AdminAction.create({
      adminId,
      action: 'VERIFY_SELLER',
      targetType: 'USER',
      targetId: userId,
    });

    // Notify seller
    await Notification.create({
      userId,
      type: NotificationType.VERIFICATION,
      title: 'Seller Verification Complete',
      message: 'Congratulations! Your seller account has been verified.',
      link: '/seller/dashboard',
    });

    return user;
  }

  // ==================== PLATFORM SETTINGS ====================

  // Get all platform settings
  async getSettings() {
    const settings = await PlatformSetting.findAll();

    // Convert to key-value object
    const result: Record<string, unknown> = {};
    for (const setting of settings) {
      let value: unknown = setting.value;
      if (setting.type === 'number') {
        value = parseFloat(setting.value);
      } else if (setting.type === 'boolean') {
        value = setting.value === 'true';
      } else if (setting.type === 'json') {
        try {
          value = JSON.parse(setting.value);
        } catch {
          value = setting.value;
        }
      }
      result[setting.key] = value;
    }

    return result;
  }

  // Get a single setting
  async getSetting(key: string) {
    const setting = await PlatformSetting.findOne({ where: { key } });

    if (!setting) {
      return null;
    }

    let value: unknown = setting.value;
    if (setting.type === 'number') {
      value = parseFloat(setting.value);
    } else if (setting.type === 'boolean') {
      value = setting.value === 'true';
    } else if (setting.type === 'json') {
      try {
        value = JSON.parse(setting.value);
      } catch {
        value = setting.value;
      }
    }

    return { key: setting.key, value, type: setting.type };
  }

  // Update a setting
  async updateSetting(key: string, value: string, type: string = 'string') {
    const [setting, created] = await PlatformSetting.upsert({
      key,
      value,
      type,
    });
    return setting;
  }

  // Update multiple settings
  async updateSettings(settings: Array<{ key: string; value: string; type?: string }>) {
    const results = await Promise.all(
      settings.map((s) => this.updateSetting(s.key, s.value, s.type || 'string'))
    );
    return results;
  }

  // ==================== ANALYTICS ====================

  // Get revenue analytics
  async getRevenueAnalytics(startDate?: Date, endDate?: Date) {
    const where: any = { status: TransactionStatus.COMPLETED };
    if (startDate || endDate) {
      where.completedAt = {};
      if (startDate) where.completedAt[Op.gte] = startDate;
      if (endDate) where.completedAt[Op.lte] = endDate;
    }

    const transactions = await Transaction.findAll({
      where,
      attributes: ['agreedPrice', 'platformFee', 'completedAt'],
    });

    const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.platformFee || 0), 0);
    const totalVolume = transactions.reduce((sum, t) => sum + Number(t.agreedPrice), 0);

    return {
      totalRevenue,
      totalVolume,
      transactionCount: transactions.length,
      averageTransactionValue: transactions.length > 0 ? totalVolume / transactions.length : 0,
    };
  }

  // Get user analytics
  async getUserAnalytics(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = startDate;
      if (endDate) where.createdAt[Op.lte] = endDate;
    }

    const [totalUsers, buyerCount, sellerCount, adminCount, verifiedCount] = await Promise.all([
      User.count({ where }),
      User.count({ where: { ...where, role: UserRole.BUYER } }),
      User.count({ where: { ...where, role: UserRole.SELLER } }),
      User.count({ where: { ...where, role: UserRole.ADMIN } }),
      User.count({ where: { ...where, verified: true } }),
    ]);

    return {
      totalUsers,
      byRole: {
        buyers: buyerCount,
        sellers: sellerCount,
        admins: adminCount,
      },
      verifiedCount,
      verificationRate: totalUsers > 0 ? ((verifiedCount / totalUsers) * 100).toFixed(2) : 0,
    };
  }

  // Get listing analytics
  async getListingAnalytics(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = startDate;
      if (endDate) where.createdAt[Op.lte] = endDate;
    }

    const [totalListings, activeCount, pendingCount, soldCount, premiumCount, totalViews, totalSaves] =
      await Promise.all([
        Listing.count({ where }),
        Listing.count({ where: { ...where, status: ListingStatus.ACTIVE } }),
        Listing.count({ where: { ...where, status: ListingStatus.PENDING_REVIEW } }),
        Listing.count({ where: { ...where, status: ListingStatus.SOLD } }),
        Listing.count({ where: { ...where, isPremium: true } }),
        Listing.sum('views', { where }),
        Listing.sum('saves', { where }),
      ]);

    // Average price
    const avgPrice = await Listing.findOne({
      where: { ...where, status: ListingStatus.ACTIVE },
      attributes: [[Listing.sequelize!.fn('AVG', Listing.sequelize!.col('price')), 'avgPrice']],
      raw: true,
    });

    return {
      totalListings,
      byStatus: {
        active: activeCount,
        pending: pendingCount,
        sold: soldCount,
      },
      premiumCount,
      premiumRate: totalListings > 0 ? ((premiumCount / totalListings) * 100).toFixed(2) : 0,
      totalViews: totalViews || 0,
      totalSaves: totalSaves || 0,
      averagePrice: (avgPrice as any)?.avgPrice || 0,
      conversionRate: totalListings > 0 ? ((soldCount / totalListings) * 100).toFixed(2) : 0,
    };
  }

  // Send admin message to all users or specific group
  async broadcastMessage(
    adminId: string,
    title: string,
    message: string,
    targetRole?: 'BUYER' | 'SELLER' | 'ALL'
  ) {
    const where = targetRole && targetRole !== 'ALL' ? { role: targetRole } : {};

    const users = await User.findAll({
      where,
      attributes: ['id'],
    });

    const notifications = users.map((u) => ({
      userId: u.id,
      type: NotificationType.SYSTEM,
      title,
      message,
    }));

    await Notification.bulkCreate(notifications);

    // Record admin action
    await AdminAction.create({
      adminId,
      action: 'BROADCAST_MESSAGE',
      targetType: 'NOTIFICATION',
      targetId: 'broadcast',
      metadata: JSON.stringify({ title, targetRole, recipientCount: users.length }),
    });

    return { success: true, recipientCount: users.length };
  }
}

export const adminService = new AdminService();
export default adminService;
