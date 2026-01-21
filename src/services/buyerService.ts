import { Op } from 'sequelize';
import sequelize from '../config/database';
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
  Payment,
  SubscriptionStatus,
  SubscriptionPlan,
  PremiumRequest,
  PremiumRequestStatus,
} from '../models';
import { getPaginationInfo } from '../utils/helpers';
import { stripeService } from './stripeService';
import { NotFoundError, BadRequestError } from '../middleware/errorHandler';
import { SUBSCRIPTION_PLANS } from '../types';
import logger from '../utils/logger';

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
          attributes: ['id', 'mcNumber', 'dotNumber', 'title', 'price'],
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'phone', 'trustScore'],
        },
        {
          model: Payment,
          as: 'payments',
          attributes: ['id', 'type', 'amount', 'status', 'method', 'stripePaymentId', 'reference', 'verifiedAt', 'description', 'createdAt'],
          order: [['createdAt', 'DESC']],
        },
      ],
    });

    return {
      transactions,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Cancel subscription
  async cancelSubscription(buyerId: string) {
    const subscription = await Subscription.findOne({
      where: { userId: buyerId },
    });

    if (!subscription) {
      throw new NotFoundError('No active subscription found');
    }

    if (subscription.status !== 'ACTIVE') {
      throw new BadRequestError('Subscription is not active');
    }

    // Cancel in Stripe
    if (subscription.stripeSubId) {
      const cancelled = await stripeService.cancelSubscription(subscription.stripeSubId, false);
      if (!cancelled) {
        throw new BadRequestError('Failed to cancel subscription');
      }
    }

    // Update subscription status
    await subscription.update({
      status: 'CANCELLED',
      cancelledAt: new Date(),
    });

    return {
      message: 'Subscription cancelled successfully',
      subscription,
    };
  }

  // Verify and fulfill subscription after Stripe checkout
  // This checks Stripe for the user's subscription and adds credits if not already processed
  async verifyAndFulfillSubscription(buyerId: string) {
    const user = await User.findByPk(buyerId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if user has a Stripe customer ID
    if (!user.stripeCustomerId) {
      logger.info('User has no Stripe customer ID', { buyerId });
      return { fulfilled: false, message: 'No Stripe customer found' };
    }

    // Get the Stripe instance
    const stripe = stripeService.getStripe();
    if (!stripe) {
      throw new BadRequestError('Stripe service not available');
    }

    // Get user's subscriptions from Stripe
    const stripeSubscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    if (stripeSubscriptions.data.length === 0) {
      logger.info('No active Stripe subscription found', { buyerId, customerId: user.stripeCustomerId });
      return { fulfilled: false, message: 'No active subscription found in Stripe' };
    }

    const stripeSubscription = stripeSubscriptions.data[0];
    const metadata = stripeSubscription.metadata;
    // Plan in metadata is lowercase (starter, professional, enterprise) but SUBSCRIPTION_PLANS keys are uppercase
    const planFromMetadata = (metadata?.plan || 'starter').toUpperCase();
    const plan = planFromMetadata as SubscriptionPlan;
    const isYearly = metadata?.isYearly === 'true';

    // Calculate renewal date from Stripe subscription period end
    // Stripe returns timestamps in seconds, we need milliseconds
    const periodEnd = (stripeSubscription as any).current_period_end;
    const renewalDate = periodEnd && typeof periodEnd === 'number'
      ? new Date(periodEnd * 1000)
      : new Date(Date.now() + (isYearly ? 365 : 30) * 24 * 60 * 60 * 1000); // Fallback: 30 days or 1 year from now

    logger.info('Stripe subscription details', {
      buyerId,
      periodEnd,
      renewalDate: renewalDate.toISOString(),
      plan,
      isYearly,
    });

    // Check if we already have this subscription in our database
    let subscription = await Subscription.findOne({
      where: { userId: buyerId },
    });

    // If subscription already active with credits, don't fulfill again
    if (subscription && subscription.status === SubscriptionStatus.ACTIVE && subscription.stripeSubId === stripeSubscription.id) {
      logger.info('Subscription already fulfilled', { buyerId, subscriptionId: subscription.id });
      return {
        fulfilled: true,
        message: 'Subscription already active',
        subscription: await this.getSubscription(buyerId),
      };
    }

    // Get plan details - use type assertion for SUBSCRIPTION_PLANS index
    const planDetails = SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS];
    if (!planDetails) {
      logger.error('Invalid plan from Stripe metadata', { plan, buyerId });
      throw new BadRequestError('Invalid subscription plan');
    }

    const t = await sequelize.transaction();

    try {
      // Create or update subscription in our database
      // NOTE: Credits are NOT added here - they are granted via webhook (customer.subscription.created)
      // to avoid double credit granting. This method only syncs the subscription record.
      if (subscription) {
        await subscription.update({
          plan,
          status: SubscriptionStatus.ACTIVE,
          priceMonthly: planDetails.priceMonthly,
          priceYearly: planDetails.priceYearly,
          isYearly,
          creditsPerMonth: planDetails.credits,
          creditsRemaining: planDetails.credits,
          startDate: new Date(),
          renewalDate,
          stripeSubId: stripeSubscription.id,
          cancelledAt: null,
        }, { transaction: t });
      } else {
        subscription = await Subscription.create({
          userId: buyerId,
          plan,
          status: SubscriptionStatus.ACTIVE,
          priceMonthly: planDetails.priceMonthly,
          priceYearly: planDetails.priceYearly,
          isYearly,
          creditsPerMonth: planDetails.credits,
          creditsRemaining: planDetails.credits,
          renewalDate,
          stripeSubId: stripeSubscription.id,
        }, { transaction: t });
      }

      await t.commit();

      logger.info('Subscription record synced successfully', {
        buyerId,
        plan,
        stripeSubscriptionId: stripeSubscription.id,
      });

      return {
        fulfilled: true,
        message: 'Subscription verified and synced',
        subscription: await this.getSubscription(buyerId),
      };
    } catch (error) {
      await t.rollback();
      logger.error('Failed to fulfill subscription', { buyerId, error });
      throw error;
    }
  }

  // Create a premium request to access a premium listing
  async createPremiumRequest(buyerId: string, listingId: string, message?: string) {
    // Check if listing exists and is premium
    const listing = await Listing.findByPk(listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (!listing.isPremium) {
      throw new BadRequestError('This listing is not premium. You can unlock it directly.');
    }

    // Check if buyer already has access (already unlocked)
    const existingUnlock = await UnlockedListing.findOne({
      where: { userId: buyerId, listingId },
    });
    if (existingUnlock) {
      throw new BadRequestError('You already have access to this listing');
    }

    // Check if there's already a pending request
    const existingRequest = await PremiumRequest.findOne({
      where: {
        buyerId,
        listingId,
        status: { [Op.in]: [PremiumRequestStatus.PENDING, PremiumRequestStatus.CONTACTED, PremiumRequestStatus.IN_PROGRESS] },
      },
    });
    if (existingRequest) {
      throw new BadRequestError('You already have a pending request for this listing');
    }

    // Check if buyer has enough credits
    const user = await User.findByPk(buyerId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const availableCredits = user.totalCredits - user.usedCredits;
    if (availableCredits < 1) {
      throw new BadRequestError('Insufficient credits. Please purchase more credits to request premium access.');
    }

    // Create the premium request
    const request = await PremiumRequest.create({
      buyerId,
      listingId,
      message,
      status: PremiumRequestStatus.PENDING,
    });

    logger.info('Premium request created', { buyerId, listingId, requestId: request.id });

    return request;
  }

  // Get buyer's premium requests
  async getPremiumRequests(buyerId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { rows: requests, count: total } = await PremiumRequest.findAndCountAll({
      where: { buyerId },
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [{
        model: Listing,
        as: 'listing',
        attributes: ['id', 'mcNumber', 'dotNumber', 'title', 'price', 'city', 'state', 'isPremium'],
      }],
    });

    return {
      requests,
      pagination: getPaginationInfo(page, limit, total),
    };
  }
}

export const buyerService = new BuyerService();
export default buyerService;
