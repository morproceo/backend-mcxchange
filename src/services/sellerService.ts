import { Op, fn, col } from 'sequelize';
import {
  User,
  Listing,
  Offer,
  Transaction,
  Review,
  Document,
  ListingStatus,
} from '../models';
import { NotFoundError } from '../middleware/errorHandler';
import { getPaginationInfo } from '../utils/helpers';

class SellerService {
  // Get seller dashboard stats
  async getDashboardStats(sellerId: string) {
    const [
      totalListings,
      activeListings,
      pendingListings,
      soldListings,
      reservedListings,
      totalOffers,
      pendingOffers,
      activeTransactions,
      completedTransactions,
      totalViews,
      totalSaves,
    ] = await Promise.all([
      Listing.count({ where: { sellerId } }),
      Listing.count({ where: { sellerId, status: 'ACTIVE' } }),
      Listing.count({ where: { sellerId, status: 'PENDING_REVIEW' } }),
      Listing.count({ where: { sellerId, status: 'SOLD' } }),
      Listing.count({ where: { sellerId, status: 'RESERVED' } }),
      Offer.count({ where: { sellerId } }),
      Offer.count({ where: { sellerId, status: 'PENDING' } }),
      Transaction.count({
        where: {
          sellerId,
          status: { [Op.notIn]: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      Transaction.count({
        where: { sellerId, status: 'COMPLETED' },
      }),
      Listing.sum('views', { where: { sellerId } }),
      Listing.sum('saves', { where: { sellerId } }),
    ]);

    // Calculate total earnings from completed transactions
    const [earningsTotal, platformFeeTotal] = await Promise.all([
      Transaction.sum('agreedPrice', { where: { sellerId, status: 'COMPLETED' } }),
      Transaction.sum('platformFee', { where: { sellerId, status: 'COMPLETED' } }),
    ]);

    // Get recent activity
    const recentOffers = await Offer.findAll({
      where: { sellerId },
      order: [['createdAt', 'DESC']],
      limit: 5,
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['mcNumber', 'title'],
        },
        {
          model: User,
          as: 'buyer',
          attributes: ['name', 'trustScore'],
        },
      ],
    });

    return {
      listings: {
        total: totalListings,
        active: activeListings,
        pending: pendingListings,
        sold: soldListings,
        reserved: reservedListings,
      },
      offers: {
        total: totalOffers,
        pending: pendingOffers,
      },
      transactions: {
        active: activeTransactions,
        completed: completedTransactions,
      },
      analytics: {
        totalViews: totalViews || 0,
        totalSaves: totalSaves || 0,
      },
      earnings: {
        total: Number(earningsTotal) || 0,
        fees: Number(platformFeeTotal) || 0,
        net: (Number(earningsTotal) || 0) - (Number(platformFeeTotal) || 0),
      },
      recentOffers,
    };
  }

  // Get seller's listings with full details
  async getListings(sellerId: string, status?: ListingStatus, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = status
      ? { sellerId, status }
      : { sellerId };

    const { rows: listings, count: total } = await Listing.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit,
    });

    // Batch query: get offer counts for all listings in one query
    const listingIds = listings.map(l => l.id);
    const offerCounts = listingIds.length > 0 ? await Offer.findAll({
      where: { listingId: { [Op.in]: listingIds } },
      attributes: ['listingId', [fn('COUNT', col('id')), 'count']],
      group: ['listingId'],
      raw: true,
    }) as unknown as Array<{ listingId: string; count: string }> : [];

    const offerCountMap = new Map<string, number>();
    for (const row of offerCounts) {
      offerCountMap.set(row.listingId, parseInt(row.count, 10));
    }

    const listingsWithCounts = listings.map((listing) => ({
      ...listing.toJSON(),
      _count: {
        offers: offerCountMap.get(listing.id) || 0,
        savedBy: listing.saves,
      },
    }));

    return {
      listings: listingsWithCounts,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get seller's offers
  async getOffers(sellerId: string, status?: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = { sellerId };
    if (status) {
      where.status = status;
    }

    const { rows: offers, count: total } = await Offer.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'mcNumber', 'dotNumber', 'title', 'price', 'status'],
        },
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'name', 'email', 'verified', 'trustScore'],
        },
        {
          model: Transaction,
          as: 'transaction',
          attributes: ['id', 'status'],
        },
      ],
    });

    return {
      offers,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get seller's earnings breakdown
  async getEarnings(sellerId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    // Get completed transactions with earnings
    const { rows: transactions, count: total } = await Transaction.findAndCountAll({
      where: { sellerId, status: 'COMPLETED' },
      order: [['completedAt', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['mcNumber', 'title'],
        },
        {
          model: User,
          as: 'buyer',
          attributes: ['name'],
        },
      ],
    });

    // Calculate totals
    const [totalGross, totalFees] = await Promise.all([
      Transaction.sum('agreedPrice', { where: { sellerId, status: 'COMPLETED' } }),
      Transaction.sum('platformFee', { where: { sellerId, status: 'COMPLETED' } }),
    ]);

    return {
      transactions: transactions.map(t => ({
        id: t.id,
        listing: t.listing,
        buyer: t.buyer,
        agreedPrice: t.agreedPrice,
        platformFee: t.platformFee,
        netEarnings: Number(t.agreedPrice) - Number(t.platformFee || 0),
        completedAt: t.completedAt,
      })),
      totals: {
        gross: Number(totalGross) || 0,
        fees: Number(totalFees) || 0,
        net: (Number(totalGross) || 0) - (Number(totalFees) || 0),
      },
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get seller verification status
  async getVerificationStatus(sellerId: string) {
    const user = await User.findByPk(sellerId, {
      attributes: [
        'verified', 'verifiedAt', 'sellerVerified',
        'sellerVerifiedAt', 'trustScore',
      ],
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Get counts
    const [activeListings, completedTransactions, reviewsCount] = await Promise.all([
      Listing.count({ where: { sellerId, status: 'ACTIVE' } }),
      Transaction.count({ where: { sellerId, status: 'COMPLETED' } }),
      Review.count({ where: { toUserId: sellerId } }),
    ]);

    // Calculate average rating
    const ratings = await Review.findOne({
      where: { toUserId: sellerId },
      attributes: [[fn('AVG', col('rating')), 'avgRating']],
      raw: true,
    }) as unknown as { avgRating: string | null };

    // Count documents uploaded
    const documentsCount = await Document.count({
      where: { uploaderId: sellerId },
    });

    return {
      emailVerified: user.verified,
      emailVerifiedAt: user.verifiedAt,
      sellerVerified: user.sellerVerified,
      sellerVerifiedAt: user.sellerVerifiedAt,
      trustScore: user.trustScore,
      stats: {
        activeListings,
        completedDeals: completedTransactions,
        totalReviews: reviewsCount,
        averageRating: ratings?.avgRating ? parseFloat(ratings.avgRating) : 0,
        documentsUploaded: documentsCount,
      },
    };
  }

  // Get all seller documents
  async getDocuments(sellerId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { rows: documents, count: total } = await Document.findAndCountAll({
      where: { uploaderId: sellerId },
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [{
        model: Listing,
        as: 'listing',
        attributes: ['id', 'mcNumber', 'title'],
      }],
    });

    return {
      documents,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get seller analytics
  async getAnalytics(sellerId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get listings with counts
    const listings = await Listing.findAll({
      where: { sellerId },
      attributes: ['id', 'mcNumber', 'title', 'views', 'saves', 'createdAt'],
    });

    // Batch query: get offer counts for all listings in one query
    const analyticsListingIds = listings.map(l => l.id);
    const analyticsOfferCounts = analyticsListingIds.length > 0 ? await Offer.findAll({
      where: { listingId: { [Op.in]: analyticsListingIds } },
      attributes: ['listingId', [fn('COUNT', col('id')), 'count']],
      group: ['listingId'],
      raw: true,
    }) as unknown as Array<{ listingId: string; count: string }> : [];

    const analyticsOfferMap = new Map<string, number>();
    for (const row of analyticsOfferCounts) {
      analyticsOfferMap.set(row.listingId, parseInt(row.count, 10));
    }

    const listingsWithOffers = listings.map((listing) => {
      const offersCount = analyticsOfferMap.get(listing.id) || 0;
      return {
        ...listing.toJSON(),
        offerCount: offersCount,
        conversionRate: listing.views > 0
          ? ((offersCount / listing.views) * 100).toFixed(2)
          : 0,
      };
    });

    // Get offer trends
    const offers = await Offer.findAll({
      where: {
        sellerId,
        createdAt: { [Op.gte]: startDate },
      },
      attributes: ['createdAt'],
      order: [['createdAt', 'ASC']],
    });

    // Get completed transactions
    const completedTransactions = await Transaction.findAll({
      where: {
        sellerId,
        status: 'COMPLETED',
        completedAt: { [Op.not]: null },
      },
      attributes: ['completedAt', 'agreedPrice'],
      order: [['completedAt', 'ASC']],
    });

    return {
      listings: listingsWithOffers,
      offerTrends: offers.map(o => ({ createdAt: o.createdAt })),
      revenueTrends: completedTransactions.map(t => ({
        completedAt: t.completedAt,
        agreedPrice: t.agreedPrice,
      })),
      summary: {
        totalViews: listings.reduce((sum, l) => sum + l.views, 0),
        totalSaves: listings.reduce((sum, l) => sum + l.saves, 0),
        totalOffers: listingsWithOffers.reduce((sum, l) => sum + l.offerCount, 0),
        averageConversionRate: listings.length > 0
          ? (listingsWithOffers.reduce((sum, l) => {
              const rate = typeof l.conversionRate === 'string'
                ? parseFloat(l.conversionRate)
                : l.conversionRate;
              return sum + rate;
            }, 0) / listings.length).toFixed(2)
          : 0,
      },
    };
  }
}

export const sellerService = new SellerService();
export default sellerService;
