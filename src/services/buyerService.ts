import { Op } from 'sequelize';
import {
  User,
  Listing,
  Offer,
  Transaction,
  SavedListing,
  UnlockedListing,
  Subscription,
  CreditTransaction,
  Document,
} from '../models';
import { getPaginationInfo } from '../utils/helpers';

class BuyerService {
  // Get buyer dashboard stats
  async getDashboardStats(buyerId: string) {
    const [
      totalOffers,
      pendingOffers,
      acceptedOffers,
      activeTransactions,
      completedTransactions,
      savedListings,
      unlockedListings,
      creditBalance,
    ] = await Promise.all([
      Offer.count({ where: { buyerId } }),
      Offer.count({ where: { buyerId, status: 'PENDING' } }),
      Offer.count({ where: { buyerId, status: 'ACCEPTED' } }),
      Transaction.count({
        where: {
          buyerId,
          status: { [Op.notIn]: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      Transaction.count({
        where: { buyerId, status: 'COMPLETED' },
      }),
      SavedListing.count({ where: { userId: buyerId } }),
      UnlockedListing.count({ where: { userId: buyerId } }),
      User.findByPk(buyerId, {
        attributes: ['totalCredits', 'usedCredits'],
      }),
    ]);

    // Get subscription info
    const subscription = await Subscription.findOne({
      where: { userId: buyerId },
    });

    // Get recent activity
    const recentOffers = await Offer.findAll({
      where: { buyerId },
      order: [['createdAt', 'DESC']],
      limit: 5,
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['mcNumber', 'title', 'price'],
        },
        {
          model: User,
          as: 'seller',
          attributes: ['name'],
        },
      ],
    });

    return {
      offers: {
        total: totalOffers,
        pending: pendingOffers,
        accepted: acceptedOffers,
      },
      transactions: {
        active: activeTransactions,
        completed: completedTransactions,
      },
      savedListings,
      unlockedListings,
      credits: {
        total: creditBalance?.totalCredits || 0,
        used: creditBalance?.usedCredits || 0,
        available: (creditBalance?.totalCredits || 0) - (creditBalance?.usedCredits || 0),
      },
      subscription: subscription ? {
        plan: subscription.plan,
        status: subscription.status,
        creditsRemaining: subscription.creditsRemaining,
        renewalDate: subscription.renewalDate,
      } : null,
      recentOffers,
    };
  }

  // Get buyer's offers
  async getOffers(buyerId: string, status?: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = { buyerId };
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
          attributes: ['id', 'mcNumber', 'dotNumber', 'title', 'price', 'status', 'city', 'state', 'isPremium'],
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'verified', 'trustScore'],
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

  // Get buyer's purchases (completed transactions)
  async getPurchases(buyerId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { rows: transactions, count: total } = await Transaction.findAndCountAll({
      where: { buyerId, status: 'COMPLETED' },
      order: [['completedAt', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'mcNumber', 'dotNumber', 'title', 'legalName', 'city', 'state'],
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'phone'],
        },
      ],
    });

    return {
      purchases: transactions,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get saved listings
  async getSavedListings(buyerId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { rows: saved, count: total } = await SavedListing.findAndCountAll({
      where: { userId: buyerId },
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [{
        model: Listing,
        as: 'listing',
        attributes: [
          'id', 'mcNumber', 'dotNumber', 'title', 'price',
          'city', 'state', 'status', 'isPremium', 'safetyRating',
          'amazonStatus', 'views',
        ],
        include: [{
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'verified', 'trustScore'],
        }],
      }],
    });

    return {
      listings: saved.map(s => ({
        ...s.listing?.toJSON(),
        savedAt: s.createdAt,
      })),
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get unlocked listings
  async getUnlockedListings(buyerId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { rows: unlocked, count: total } = await UnlockedListing.findAndCountAll({
      where: { userId: buyerId },
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [{
        model: Listing,
        as: 'listing',
        include: [
          {
            model: User,
            as: 'seller',
            attributes: ['id', 'name', 'email', 'phone', 'verified', 'trustScore', 'companyName'],
          },
          {
            model: Document,
            as: 'documents',
            where: { status: 'VERIFIED' },
            required: false,
            attributes: ['id', 'type', 'name'],
          },
        ],
      }],
    });

    return {
      listings: unlocked.map(u => ({
        ...u.listing?.toJSON(),
        creditsUsed: u.creditsUsed,
        unlockedAt: u.createdAt,
      })),
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Get subscription details
  async getSubscription(buyerId: string) {
    const subscription = await Subscription.findOne({
      where: { userId: buyerId },
    });

    const user = await User.findByPk(buyerId, {
      attributes: ['totalCredits', 'usedCredits'],
    });

    // Get credit history
    const recentCredits = await CreditTransaction.findAll({
      where: { userId: buyerId },
      order: [['createdAt', 'DESC']],
      limit: 10,
    });

    return {
      subscription,
      credits: {
        total: user?.totalCredits || 0,
        used: user?.usedCredits || 0,
        available: (user?.totalCredits || 0) - (user?.usedCredits || 0),
      },
      recentTransactions: recentCredits,
    };
  }

  // Get buyer's active transactions
  async getTransactions(buyerId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { rows: transactions, count: total } = await Transaction.findAndCountAll({
      where: { buyerId },
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'mcNumber', 'dotNumber', 'title'],
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'trustScore'],
        },
      ],
    });

    return {
      transactions,
      pagination: getPaginationInfo(page, limit, total),
    };
  }
}

export const buyerService = new BuyerService();
export default buyerService;
