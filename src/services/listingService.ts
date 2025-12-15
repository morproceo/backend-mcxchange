import { Op, WhereOptions, Order } from 'sequelize';
import sequelize from '../config/database';
import {
  Listing,
  User,
  Document,
  SavedListing,
  UnlockedListing,
  CreditTransaction,
  ListingStatus,
  ListingVisibility,
  SafetyRating,
  AmazonRelayStatus,
  CreditTransactionType,
} from '../models';
import { ListingQueryParams, CreateListingData, PaginationInfo } from '../types';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';
import { getPaginationInfo } from '../utils/helpers';

class ListingService {
  // Get all listings with filters and pagination
  async getListings(params: ListingQueryParams) {
    const {
      page = 1,
      limit = 20,
      search,
      minPrice,
      maxPrice,
      state,
      safetyRating,
      amazonStatus,
      verified,
      premium,
      highwaySetup,
      hasEmail,
      hasPhone,
      minYears,
      sortBy = 'newest',
      status,
      sellerId,
    } = params;

    const offset = (page - 1) * limit;

    // Build where clause
    const where: WhereOptions = {
      status: status ? status : ListingStatus.ACTIVE,
      visibility: ListingVisibility.PUBLIC,
    };

    // Search
    if (search) {
      (where as Record<string, unknown>)[Op.or as unknown as string] = [
        { mcNumber: { [Op.like]: `%${search}%` } },
        { dotNumber: { [Op.like]: `%${search}%` } },
        { title: { [Op.like]: `%${search}%` } },
        { legalName: { [Op.like]: `%${search}%` } },
        { dbaName: { [Op.like]: `%${search}%` } },
        { state: { [Op.like]: `%${search}%` } },
        { city: { [Op.like]: `%${search}%` } },
      ];
    }

    // Price filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter: Record<symbol, number> = {};
      if (minPrice !== undefined) priceFilter[Op.gte] = minPrice;
      if (maxPrice !== undefined) priceFilter[Op.lte] = maxPrice;
      (where as Record<string, unknown>).price = priceFilter;
    }

    // State filter
    if (state) {
      (where as Record<string, unknown>).state = state.toUpperCase();
    }

    // Safety rating filter
    if (safetyRating) {
      (where as Record<string, unknown>).safetyRating = safetyRating.toUpperCase();
    }

    // Amazon status filter
    if (amazonStatus) {
      (where as Record<string, unknown>).amazonStatus = amazonStatus.toUpperCase();
    }

    // Premium filter
    if (premium !== undefined) {
      (where as Record<string, unknown>).isPremium = premium;
    }

    // Highway setup filter
    if (highwaySetup !== undefined) {
      (where as Record<string, unknown>).highwaySetup = highwaySetup;
    }

    // Email filter
    if (hasEmail !== undefined) {
      (where as Record<string, unknown>).sellingWithEmail = hasEmail;
    }

    // Phone filter
    if (hasPhone !== undefined) {
      (where as Record<string, unknown>).sellingWithPhone = hasPhone;
    }

    // Minimum years filter
    if (minYears !== undefined) {
      (where as Record<string, unknown>).yearsActive = { [Op.gte]: minYears };
    }

    // Seller filter
    if (sellerId) {
      (where as Record<string, unknown>).sellerId = sellerId;
    }

    // Build orderBy
    let order: Order = [['createdAt', 'DESC']];
    switch (sortBy) {
      case 'price_asc':
        order = [['price', 'ASC']];
        break;
      case 'price_desc':
        order = [['price', 'DESC']];
        break;
      case 'newest':
        order = [['createdAt', 'DESC']];
        break;
      case 'oldest':
        order = [['createdAt', 'ASC']];
        break;
      case 'years_active':
        order = [['yearsActive', 'DESC']];
        break;
    }

    // Execute query
    const { rows: listings, count: total } = await Listing.findAndCountAll({
      where,
      order,
      offset,
      limit,
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'verified', 'trustScore', 'avatar'],
          where: verified !== undefined ? { verified } : undefined,
          required: verified !== undefined,
        },
      ],
    });

    const pagination = getPaginationInfo(page, limit, total);

    return { listings, pagination };
  }

  // Get single listing by ID
  async getListingById(id: string, userId?: string) {
    const listing = await Listing.findByPk(id, {
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'phone', 'verified', 'trustScore', 'avatar', 'memberSince', 'companyName'],
        },
        {
          model: Document,
          as: 'documents',
          where: { status: 'VERIFIED' },
          required: false,
          attributes: ['id', 'type', 'name', 'status'],
        },
      ],
    });

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    // Increment views
    await listing.update({ views: listing.views + 1 });

    // Check if user has unlocked this listing
    let isUnlocked = false;
    let isSaved = false;
    if (userId) {
      const [unlocked, saved] = await Promise.all([
        UnlockedListing.findOne({ where: { userId, listingId: id } }),
        SavedListing.findOne({ where: { userId, listingId: id } }),
      ]);
      isUnlocked = !!unlocked;
      isSaved = !!saved;
    }

    // Check if user is the seller
    const isOwner = userId === listing.sellerId;

    const listingData = listing.toJSON();

    return {
      ...listingData,
      isUnlocked,
      isSaved,
      isOwner,
      // Hide sensitive info if not unlocked and not owner
      seller: !isUnlocked && !isOwner
        ? {
            ...listingData.seller,
            email: null,
            phone: null,
          }
        : listingData.seller,
    };
  }

  // Create new listing
  async createListing(sellerId: string, data: CreateListingData) {
    const listing = await Listing.create({
      sellerId,
      mcNumber: data.mcNumber,
      dotNumber: data.dotNumber,
      legalName: data.legalName,
      dbaName: data.dbaName,
      title: data.title,
      description: data.description,
      price: data.price,
      city: data.city,
      state: data.state.toUpperCase(),
      address: data.address,
      yearsActive: data.yearsActive || 0,
      fleetSize: data.fleetSize || 0,
      totalDrivers: data.totalDrivers || 0,
      safetyRating: (data.safetyRating?.toUpperCase() as SafetyRating) || SafetyRating.NONE,
      insuranceOnFile: data.insuranceOnFile || false,
      bipdCoverage: data.bipdCoverage,
      cargoCoverage: data.cargoCoverage,
      bondAmount: data.bondAmount,
      amazonStatus: (data.amazonStatus?.toUpperCase() as AmazonRelayStatus) || AmazonRelayStatus.NONE,
      amazonRelayScore: data.amazonRelayScore,
      highwaySetup: data.highwaySetup || false,
      sellingWithEmail: data.sellingWithEmail || false,
      sellingWithPhone: data.sellingWithPhone || false,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      cargoTypes: data.cargoTypes ? JSON.stringify(data.cargoTypes) : null,
      visibility: (data.visibility?.toUpperCase() as ListingVisibility) || ListingVisibility.PUBLIC,
      isPremium: data.isPremium || false,
      status: ListingStatus.DRAFT,
    });

    const listingWithSeller = await Listing.findByPk(listing.id, {
      include: [{
        model: User,
        as: 'seller',
        attributes: ['id', 'name', 'verified', 'trustScore'],
      }],
    });

    return listingWithSeller;
  }

  // Update listing
  async updateListing(id: string, userId: string, data: Partial<CreateListingData>) {
    const listing = await Listing.findByPk(id);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenError('You can only update your own listings');
    }

    // Can't update sold or reserved listings
    if (listing.status === ListingStatus.SOLD || listing.status === ListingStatus.RESERVED) {
      throw new ForbiddenError('Cannot update sold or reserved listings');
    }

    await listing.update({
      ...(data.title && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.price && { price: data.price }),
      ...(data.city && { city: data.city }),
      ...(data.state && { state: data.state.toUpperCase() }),
      ...(data.yearsActive !== undefined && { yearsActive: data.yearsActive }),
      ...(data.fleetSize !== undefined && { fleetSize: data.fleetSize }),
      ...(data.totalDrivers !== undefined && { totalDrivers: data.totalDrivers }),
      ...(data.safetyRating && { safetyRating: data.safetyRating.toUpperCase() }),
      ...(data.insuranceOnFile !== undefined && { insuranceOnFile: data.insuranceOnFile }),
      ...(data.bipdCoverage !== undefined && { bipdCoverage: data.bipdCoverage }),
      ...(data.cargoCoverage !== undefined && { cargoCoverage: data.cargoCoverage }),
      ...(data.amazonStatus && { amazonStatus: data.amazonStatus.toUpperCase() }),
      ...(data.amazonRelayScore !== undefined && { amazonRelayScore: data.amazonRelayScore }),
      ...(data.highwaySetup !== undefined && { highwaySetup: data.highwaySetup }),
      ...(data.sellingWithEmail !== undefined && { sellingWithEmail: data.sellingWithEmail }),
      ...(data.sellingWithPhone !== undefined && { sellingWithPhone: data.sellingWithPhone }),
      ...(data.cargoTypes && { cargoTypes: JSON.stringify(data.cargoTypes) }),
      ...(data.visibility && { visibility: data.visibility.toUpperCase() }),
      ...(data.isPremium !== undefined && { isPremium: data.isPremium }),
    });

    const updated = await Listing.findByPk(id, {
      include: [{
        model: User,
        as: 'seller',
        attributes: ['id', 'name', 'verified', 'trustScore'],
      }],
    });

    return updated;
  }

  // Submit listing for review
  async submitForReview(id: string, userId: string) {
    const listing = await Listing.findByPk(id);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenError('You can only submit your own listings');
    }

    if (listing.status !== ListingStatus.DRAFT && listing.status !== ListingStatus.REJECTED) {
      throw new ForbiddenError('Only draft or rejected listings can be submitted for review');
    }

    await listing.update({ status: ListingStatus.PENDING_REVIEW });

    return listing;
  }

  // Delete listing
  async deleteListing(id: string, userId: string) {
    const listing = await Listing.findByPk(id);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenError('You can only delete your own listings');
    }

    if (listing.status === ListingStatus.SOLD || listing.status === ListingStatus.RESERVED) {
      throw new ForbiddenError('Cannot delete sold or reserved listings');
    }

    await listing.destroy();

    return { success: true };
  }

  // Save listing
  async saveListing(listingId: string, userId: string) {
    const listing = await Listing.findByPk(listingId);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    await SavedListing.findOrCreate({
      where: { userId, listingId },
      defaults: { userId, listingId },
    });

    // Update saves count
    await listing.update({ saves: listing.saves + 1 });

    return { success: true };
  }

  // Unsave listing
  async unsaveListing(listingId: string, userId: string) {
    const listing = await Listing.findByPk(listingId);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    await SavedListing.destroy({ where: { userId, listingId } });

    // Update saves count
    await listing.update({ saves: Math.max(0, listing.saves - 1) });

    return { success: true };
  }

  // Get saved listings
  async getSavedListings(userId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { rows: savedListings, count: total } = await SavedListing.findAndCountAll({
      where: { userId },
      offset,
      limit,
      order: [['createdAt', 'DESC']],
      include: [{
        model: Listing,
        as: 'listing',
        include: [{
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'verified', 'trustScore'],
        }],
      }],
    });

    const pagination = getPaginationInfo(page, limit, total);

    return {
      listings: savedListings.map((sl) => sl.listing),
      pagination,
    };
  }

  // Get seller's listings
  async getSellerListings(sellerId: string, status?: ListingStatus) {
    const where: WhereOptions = { sellerId };
    if (status) {
      (where as Record<string, unknown>).status = status;
    }

    const listings = await Listing.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    return listings;
  }

  // Unlock listing (use credit)
  async unlockListing(listingId: string, userId: string) {
    const listing = await Listing.findByPk(listingId);

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    // Check if already unlocked
    const existing = await UnlockedListing.findOne({ where: { userId, listingId } });

    if (existing) {
      return { success: true, alreadyUnlocked: true };
    }

    // Check user credits
    const user = await User.findByPk(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    const availableCredits = user.totalCredits - user.usedCredits;
    if (availableCredits < 1) {
      throw new ForbiddenError('Insufficient credits. Please purchase more credits.');
    }

    // Use transaction to unlock and deduct credit
    const t = await sequelize.transaction();

    try {
      // Create unlocked record
      await UnlockedListing.create(
        { userId, listingId, creditsUsed: 1 },
        { transaction: t }
      );

      // Deduct credit
      await user.update(
        { usedCredits: user.usedCredits + 1 },
        { transaction: t }
      );

      // Record credit transaction
      await CreditTransaction.create(
        {
          userId,
          type: CreditTransactionType.USAGE,
          amount: -1,
          balance: availableCredits - 1,
          description: `Unlocked listing MC-${listing.mcNumber}`,
          reference: listingId,
        },
        { transaction: t }
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }

    return { success: true, alreadyUnlocked: false };
  }

  // Get unlocked listings
  async getUnlockedListings(userId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { rows: unlockedListings, count: total } = await UnlockedListing.findAndCountAll({
      where: { userId },
      offset,
      limit,
      order: [['createdAt', 'DESC']],
      include: [{
        model: Listing,
        as: 'listing',
        include: [{
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'phone', 'verified', 'trustScore'],
        }],
      }],
    });

    const pagination = getPaginationInfo(page, limit, total);

    return {
      listings: unlockedListings.map((ul) => ({
        ...(ul.listing as Listing).toJSON(),
        unlockedAt: ul.createdAt,
      })),
      pagination,
    };
  }
}

export const listingService = new ListingService();
export default listingService;
