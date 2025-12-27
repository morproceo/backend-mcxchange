import { Op } from 'sequelize';
import sequelize from '../config/database';
import {
  User,
  Listing,
  Transaction,
  TransactionTimeline,
  PremiumRequest,
  AdminAction,
  Notification,
  PlatformSetting,
  RefreshToken,
  Offer,
  ListingStatus,
  UserStatus,
  PremiumRequestStatus,
  TransactionStatus,
  NotificationType,
  UserRole,
  OfferStatus,
} from '../models';
import { NotFoundError } from '../middleware/errorHandler';
import { getPaginationInfo, calculateDeposit, calculatePlatformFee } from '../utils/helpers';

class AdminService {
  // Get dashboard stats
  async getDashboardStats() {
    const [
      totalUsers,
      totalSellers,
      totalBuyers,
      activeUsers,
      totalListings,
      activeListings,
      pendingListings,
      soldListings,
      totalTransactions,
      activeTransactions,
      completedTransactions,
      pendingPremiumRequests,
      totalOffers,
      pendingOffers,
    ] = await Promise.all([
      User.count(),
      User.count({ where: { role: 'SELLER' } }),
      User.count({ where: { role: 'BUYER' } }),
      User.count({ where: { status: 'ACTIVE' } }),
      Listing.count(),
      Listing.count({ where: { status: ListingStatus.ACTIVE } }),
      Listing.count({ where: { status: ListingStatus.PENDING_REVIEW } }),
      Listing.count({ where: { status: ListingStatus.SOLD } }),
      Transaction.count(),
      Transaction.count({ where: { status: { [Op.ne]: TransactionStatus.COMPLETED } } }),
      Transaction.count({ where: { status: TransactionStatus.COMPLETED } }),
      PremiumRequest.count({ where: { status: PremiumRequestStatus.PENDING } }),
      Offer.count(),
      Offer.count({ where: { status: 'PENDING' } }),
    ]);

    // Calculate total revenue from completed transactions
    const revenueResult = await Transaction.sum('platformFee', {
      where: { status: TransactionStatus.COMPLETED },
    });

    // Return flat structure for frontend
    return {
      // Users
      totalUsers,
      totalSellers,
      totalBuyers,
      activeUsers,
      // Listings
      totalListings,
      activeListings,
      pendingListings,
      soldListings,
      // Transactions
      totalTransactions,
      activeTransactions,
      completedTransactions,
      // Offers
      totalOffers,
      pendingOffers,
      // Premium
      premiumRequests: pendingPremiumRequests,
      // Revenue
      totalRevenue: revenueResult || 0,
      monthlyRevenue: 0, // Would need date filtering for this
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
  async approveListing(listingId: string, adminId: string, notes?: string, listingPrice?: number) {
    const listing = await Listing.findByPk(listingId);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    // If no listingPrice provided, default to askingPrice
    const finalListingPrice = listingPrice !== undefined ? listingPrice : listing.askingPrice;

    await listing.update({
      status: ListingStatus.ACTIVE,
      listingPrice: finalListingPrice,
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

  // Get single listing by ID (admin view - returns any status)
  async getListingById(listingId: string) {
    const listing = await Listing.findByPk(listingId, {
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'verified', 'trustScore', 'createdAt', 'phone', 'companyName'],
        },
      ],
    });

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    return listing;
  }

  // Admin update listing (can update any field including status)
  async updateListing(listingId: string, adminId: string, data: {
    mcNumber?: string;
    dotNumber?: string;
    legalName?: string;
    dbaName?: string;
    title?: string;
    description?: string;
    askingPrice?: number;
    listingPrice?: number | null;
    city?: string;
    state?: string;
    address?: string;
    yearsActive?: number;
    fleetSize?: number;
    totalDrivers?: number;
    safetyRating?: string;
    saferScore?: string;
    insuranceOnFile?: boolean;
    bipdCoverage?: number;
    cargoCoverage?: number;
    bondAmount?: number;
    amazonStatus?: string;
    amazonRelayScore?: string;
    highwaySetup?: boolean;
    sellingWithEmail?: boolean;
    sellingWithPhone?: boolean;
    contactEmail?: string;
    contactPhone?: string;
    cargoTypes?: string[];
    reviewNotes?: string;
    status?: string;
    visibility?: string;
    isPremium?: boolean;
  }) {
    const listing = await Listing.findByPk(listingId);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    // Build update object
    const updateData: any = {};

    if (data.mcNumber !== undefined) updateData.mcNumber = data.mcNumber;
    if (data.dotNumber !== undefined) updateData.dotNumber = data.dotNumber;
    if (data.legalName !== undefined) updateData.legalName = data.legalName;
    if (data.dbaName !== undefined) updateData.dbaName = data.dbaName;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.askingPrice !== undefined) updateData.askingPrice = data.askingPrice;
    if (data.listingPrice !== undefined) updateData.listingPrice = data.listingPrice;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.state !== undefined) updateData.state = data.state.toUpperCase();
    if (data.address !== undefined) updateData.address = data.address;
    if (data.yearsActive !== undefined) updateData.yearsActive = data.yearsActive;
    if (data.fleetSize !== undefined) updateData.fleetSize = data.fleetSize;
    if (data.totalDrivers !== undefined) updateData.totalDrivers = data.totalDrivers;
    if (data.safetyRating !== undefined) updateData.safetyRating = data.safetyRating.toUpperCase();
    if (data.saferScore !== undefined) updateData.saferScore = data.saferScore;
    if (data.insuranceOnFile !== undefined) updateData.insuranceOnFile = data.insuranceOnFile;
    if (data.bipdCoverage !== undefined) updateData.bipdCoverage = data.bipdCoverage;
    if (data.cargoCoverage !== undefined) updateData.cargoCoverage = data.cargoCoverage;
    if (data.bondAmount !== undefined) updateData.bondAmount = data.bondAmount;
    if (data.amazonStatus !== undefined) updateData.amazonStatus = data.amazonStatus.toUpperCase();
    if (data.amazonRelayScore !== undefined) updateData.amazonRelayScore = data.amazonRelayScore;
    if (data.highwaySetup !== undefined) updateData.highwaySetup = data.highwaySetup;
    if (data.sellingWithEmail !== undefined) updateData.sellingWithEmail = data.sellingWithEmail;
    if (data.sellingWithPhone !== undefined) updateData.sellingWithPhone = data.sellingWithPhone;
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;
    if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone;
    if (data.cargoTypes !== undefined) updateData.cargoTypes = JSON.stringify(data.cargoTypes);
    if (data.reviewNotes !== undefined) updateData.reviewNotes = data.reviewNotes;
    if (data.status !== undefined) updateData.status = data.status.toUpperCase();
    if (data.visibility !== undefined) updateData.visibility = data.visibility.toUpperCase();
    if (data.isPremium !== undefined) updateData.isPremium = data.isPremium;

    await listing.update(updateData);

    // Record admin action
    await AdminAction.create({
      adminId,
      action: 'UPDATE_LISTING',
      targetType: 'LISTING',
      targetId: listingId,
      metadata: JSON.stringify(data),
    });

    // Get updated listing with seller info
    const updatedListing = await Listing.findByPk(listingId, {
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'verified', 'trustScore', 'createdAt', 'phone', 'companyName'],
        },
      ],
    });

    return updatedListing;
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

  // ==================== OFFER MANAGEMENT ====================

  // Get all offers (admin view)
  async getAllOffers(params: {
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

    const { count: total, rows: offers } = await Offer.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'mcNumber', 'title', 'price', 'status'],
        },
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'name', 'email', 'phone', 'verified', 'trustScore'],
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'phone', 'verified'],
        },
      ],
    });

    return {
      offers,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Approve offer (admin) - Creates transaction for Buy Now offers
  async approveOffer(offerId: string, adminId: string, notes?: string) {
    const offer = await Offer.findByPk(offerId, {
      include: [
        {
          model: Listing,
          as: 'listing',
        },
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    if (!offer) {
      throw new NotFoundError('Offer');
    }

    const listing = (offer as any).listing;

    // For Buy Now offers, create a transaction (the "round table" begins!)
    if (offer.isBuyNow) {
      // Calculate amounts - use listing price for Buy Now
      const agreedPrice = Number(offer.amount);
      const depositAmount = calculateDeposit(agreedPrice);
      const platformFee = calculatePlatformFee(agreedPrice);

      const t = await sequelize.transaction();

      try {
        // Update offer status to ACCEPTED (same as seller accepting)
        await offer.update(
          {
            status: OfferStatus.ACCEPTED,
            adminReviewedBy: adminId,
            adminReviewedAt: new Date(),
            adminNotes: notes,
            respondedAt: new Date(),
          },
          { transaction: t }
        );

        // Create the transaction - this starts the round table!
        const transaction = await Transaction.create(
          {
            offerId,
            listingId: offer.listingId,
            buyerId: offer.buyerId,
            sellerId: offer.sellerId,
            agreedPrice,
            depositAmount,
            platformFee,
            status: TransactionStatus.AWAITING_DEPOSIT,
          },
          { transaction: t }
        );

        // Update listing status to RESERVED
        await Listing.update(
          { status: ListingStatus.RESERVED },
          { where: { id: offer.listingId }, transaction: t }
        );

        // Reject other pending offers on this listing
        await Offer.update(
          { status: OfferStatus.REJECTED, respondedAt: new Date() },
          {
            where: {
              listingId: offer.listingId,
              id: { [Op.ne]: offerId },
              status: { [Op.in]: [OfferStatus.PENDING, OfferStatus.COUNTERED] },
            },
            transaction: t,
          }
        );

        await t.commit();

        // Record admin action
        await AdminAction.create({
          adminId,
          action: 'APPROVE_BUY_NOW',
          targetType: 'OFFER',
          targetId: offerId,
          reason: notes,
          metadata: JSON.stringify({ transactionId: transaction.id }),
        });

        // Create timeline entry
        await TransactionTimeline.create({
          transactionId: transaction.id,
          status: TransactionStatus.AWAITING_DEPOSIT,
          title: 'Buy Now Approved',
          description: 'Admin approved the Buy Now request. Awaiting deposit from buyer.',
          actorId: adminId,
          actorRole: 'ADMIN',
        });

        // Notify buyer - transaction created, go to round table
        await Notification.create({
          userId: offer.buyerId,
          type: NotificationType.OFFER,
          title: 'Buy Now Approved!',
          message: `Your Buy Now request for MC-${listing?.mcNumber || 'N/A'} has been approved. Go to the Round Table to proceed with the transaction.`,
          link: `/transaction/${transaction.id}`,
          metadata: JSON.stringify({ transactionId: transaction.id }),
        });

        // Notify seller - their listing has a buyer
        if (listing?.sellerId) {
          await Notification.create({
            userId: listing.sellerId,
            type: NotificationType.OFFER,
            title: 'Buy Now Approved - Transaction Started',
            message: `A Buy Now request for your listing MC-${listing?.mcNumber || 'N/A'} has been approved. The buyer will pay the deposit soon.`,
            link: `/seller/transactions`,
          });
        }

        return { offer, transaction };
      } catch (error) {
        await t.rollback();
        throw error;
      }
    } else {
      // Regular offer approval (not Buy Now) - also create transaction
      // Calculate amounts - use counter amount if exists, otherwise offer amount
      const agreedPrice = Number(offer.counterAmount || offer.amount);
      const depositAmount = calculateDeposit(agreedPrice);
      const platformFee = calculatePlatformFee(agreedPrice);

      const t = await sequelize.transaction();

      try {
        // Update offer status to ACCEPTED
        await offer.update(
          {
            status: OfferStatus.ACCEPTED,
            adminReviewedBy: adminId,
            adminReviewedAt: new Date(),
            adminNotes: notes,
            respondedAt: new Date(),
          },
          { transaction: t }
        );

        // Create the transaction
        const transaction = await Transaction.create(
          {
            offerId,
            listingId: offer.listingId,
            buyerId: offer.buyerId,
            sellerId: offer.sellerId,
            agreedPrice,
            depositAmount,
            platformFee,
            status: TransactionStatus.AWAITING_DEPOSIT,
          },
          { transaction: t }
        );

        // Update listing status to RESERVED
        await Listing.update(
          { status: ListingStatus.RESERVED },
          { where: { id: offer.listingId }, transaction: t }
        );

        // Reject other pending offers on this listing
        await Offer.update(
          { status: OfferStatus.REJECTED, respondedAt: new Date() },
          {
            where: {
              listingId: offer.listingId,
              id: { [Op.ne]: offerId },
              status: { [Op.in]: [OfferStatus.PENDING, OfferStatus.COUNTERED] },
            },
            transaction: t,
          }
        );

        await t.commit();

        // Record admin action
        await AdminAction.create({
          adminId,
          action: 'APPROVE_OFFER',
          targetType: 'OFFER',
          targetId: offerId,
          reason: notes,
          metadata: JSON.stringify({ transactionId: transaction.id }),
        });

        // Create timeline entry
        await TransactionTimeline.create({
          transactionId: transaction.id,
          status: TransactionStatus.AWAITING_DEPOSIT,
          title: 'Offer Approved',
          description: 'Admin approved the offer. Awaiting deposit from buyer.',
          actorId: adminId,
          actorRole: 'ADMIN',
        });

        // Notify buyer that their offer was approved
        await Notification.create({
          userId: offer.buyerId,
          type: NotificationType.OFFER,
          title: 'Offer Approved!',
          message: `Your offer for MC-${listing?.mcNumber || 'N/A'} has been approved. Go to the Round Table to proceed with the transaction.`,
          link: `/transaction/${transaction.id}`,
          metadata: JSON.stringify({ transactionId: transaction.id }),
        });

        // Also notify the seller
        if (listing?.sellerId) {
          await Notification.create({
            userId: listing.sellerId,
            type: NotificationType.OFFER,
            title: 'Offer Approved by Admin',
            message: `An offer for your listing MC-${listing?.mcNumber || 'N/A'} has been approved. The buyer will pay the deposit soon.`,
            link: `/seller/transactions`,
          });
        }

        return { offer, transaction };
      } catch (error) {
        await t.rollback();
        throw error;
      }
    }
  }

  // Reject offer (admin)
  async rejectOffer(offerId: string, adminId: string, reason?: string) {
    const offer = await Offer.findByPk(offerId, {
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'mcNumber', 'title'],
        },
      ],
    });

    if (!offer) {
      throw new NotFoundError('Offer');
    }

    // Update offer status to rejected
    await offer.update({
      status: OfferStatus.REJECTED,
      adminReviewedBy: adminId,
      adminReviewedAt: new Date(),
      adminNotes: reason,
    });

    // Record admin action
    await AdminAction.create({
      adminId,
      action: 'REJECT_OFFER',
      targetType: 'OFFER',
      targetId: offerId,
      reason,
    });

    // Notify buyer that their offer was rejected
    await Notification.create({
      userId: offer.buyerId,
      type: NotificationType.OFFER,
      title: 'Offer Rejected',
      message: `Your ${offer.isBuyNow ? 'buy now request' : 'offer'} for MC-${(offer as any).listing?.mcNumber || 'N/A'} was not approved.${reason ? ` Reason: ${reason}` : ''}`,
      link: `/buyer/offers`,
    });

    return offer;
  }

  // ============================================
  // Admin User & Listing Creation
  // ============================================

  // Create a new user (admin)
  async createUser(data: {
    email: string;
    name: string;
    password: string;
    role: string;
    phone?: string;
    companyName?: string;
    createdByAdminId: string;
  }) {
    const bcrypt = require('bcryptjs');

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: data.email } });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 12);

    // Create user
    const user = await User.create({
      email: data.email,
      name: data.name,
      password: hashedPassword,
      role: data.role as UserRole,
      phone: data.phone,
      companyName: data.companyName,
      status: UserStatus.ACTIVE,
      emailVerified: true, // Admin-created users are pre-verified
      verified: data.role === 'SELLER', // Auto-verify sellers created by admin
    });

    // Record admin action
    await AdminAction.create({
      adminId: data.createdByAdminId,
      action: 'CREATE_USER',
      targetType: 'USER',
      targetId: user.id,
      details: {
        email: data.email,
        role: data.role,
      },
    });

    return user;
  }

  // Update user's Stripe account ID (stored in metadata for now)
  async updateUserStripeAccount(userId: string, stripeAccountId: string) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Store stripe account ID on user
    await user.update({ stripeAccountId });
    return user;
  }

  // Create a listing (admin)
  async createListing(data: {
    sellerId: string;
    mcNumber: string;
    dotNumber?: string;
    legalName?: string;
    dbaName?: string;
    title: string;
    description?: string;
    askingPrice: number;
    city?: string;
    state?: string;
    yearsActive?: number;
    fleetSize?: number;
    totalDrivers?: number;
    safetyRating?: string;
    insuranceOnFile?: boolean;
    bipdCoverage?: number;
    cargoCoverage?: number;
    amazonStatus?: string;
    amazonRelayScore?: string;
    highwaySetup?: boolean;
    sellingWithEmail?: boolean;
    sellingWithPhone?: boolean;
    cargoTypes?: string[];
    isPremium?: boolean;
    status?: string;
    createdByAdminId: string;
    adminNotes?: string;
  }) {
    // Verify seller exists
    const seller = await User.findByPk(data.sellerId);
    if (!seller) {
      throw new NotFoundError('Seller');
    }

    // Check if MC number already exists
    const existingListing = await Listing.findOne({
      where: { mcNumber: data.mcNumber },
    });
    if (existingListing) {
      throw new Error('A listing with this MC number already exists');
    }

    // Create listing
    const listing = await Listing.create({
      sellerId: data.sellerId,
      mcNumber: data.mcNumber,
      dotNumber: data.dotNumber || '',
      legalName: data.legalName || '',
      dbaName: data.dbaName || '',
      title: data.title,
      description: data.description || '',
      price: data.askingPrice,
      city: data.city || 'Unknown',
      state: data.state || '',
      yearsActive: data.yearsActive || 0,
      fleetSize: data.fleetSize || 0,
      totalDrivers: data.totalDrivers || 0,
      safetyRating: data.safetyRating || 'satisfactory',
      insuranceOnFile: data.insuranceOnFile || false,
      bipdCoverage: data.bipdCoverage || 0,
      cargoCoverage: data.cargoCoverage || 0,
      amazonStatus: data.amazonStatus || 'NONE',
      amazonRelayScore: data.amazonRelayScore || '',
      highwaySetup: data.highwaySetup || false,
      sellingWithEmail: data.sellingWithEmail || false,
      sellingWithPhone: data.sellingWithPhone || false,
      cargoTypes: data.cargoTypes ? JSON.stringify(data.cargoTypes) : '[]',
      isPremium: data.isPremium || false,
      status: (data.status as ListingStatus) || ListingStatus.ACTIVE,
      adminNotes: data.adminNotes || '',
    });

    // Record admin action
    await AdminAction.create({
      adminId: data.createdByAdminId,
      action: 'CREATE_LISTING',
      targetType: 'LISTING',
      targetId: listing.id,
      details: {
        mcNumber: data.mcNumber,
        sellerId: data.sellerId,
        status: data.status,
      },
    });

    // Notify seller
    await Notification.create({
      userId: data.sellerId,
      type: NotificationType.SYSTEM,
      title: 'New Listing Created',
      message: `A listing for MC-${data.mcNumber} has been created for your account.`,
      link: `/seller/listings`,
    });

    return listing;
  }
}

export const adminService = new AdminService();
export default adminService;
