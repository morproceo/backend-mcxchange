import { Op } from 'sequelize';
import { Listing, Offer, Transaction, ListingStatus, OfferStatus, SavedListing, UnlockedListing } from '../../../models';
import type { ToolDef } from '../../core/types';

export function buildSellerTools(): ToolDef[] {
  return [
    {
      schema: {
        type: 'function',
        function: {
          name: 'get_my_listings',
          description: 'List the seller’s own listings. Optional filter by status.',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: Object.values(ListingStatus) },
              limit: { type: 'integer' },
            },
            additionalProperties: false,
          },
        },
      },
      handler: async (args: any, ctx) => {
        if (!ctx.userId) return { error: 'no user in context' };
        const where: any = { sellerId: ctx.userId };
        if (args.status) where.status = args.status;
        const limit = Math.min(100, Math.max(1, args.limit || 25));
        const rows = await Listing.findAll({
          where,
          order: [['updatedAt', 'DESC']],
          limit,
          attributes: [
            'id', 'title', 'mcNumber', 'dotNumber', 'askingPrice', 'status', 'visibility',
            'city', 'state', 'fleetSize', 'totalDrivers', 'safetyRating', 'isPremium', 'createdAt',
          ],
        });
        return { count: rows.length, listings: rows };
      },
    },

    {
      schema: {
        type: 'function',
        function: {
          name: 'get_my_offers',
          description: 'Offers received on the seller’s listings. Optional filter by status.',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: Object.values(OfferStatus) },
              limit: { type: 'integer' },
            },
            additionalProperties: false,
          },
        },
      },
      handler: async (args: any, ctx) => {
        if (!ctx.userId) return { error: 'no user in context' };
        const where: any = { sellerId: ctx.userId };
        if (args.status) where.status = args.status;
        const limit = Math.min(100, Math.max(1, args.limit || 25));
        const rows = await Offer.findAll({
          where,
          order: [['createdAt', 'DESC']],
          limit,
          include: [{ model: Listing, as: 'listing', attributes: ['id', 'title', 'mcNumber', 'askingPrice'] }],
        });
        return { count: rows.length, offers: rows };
      },
    },

    {
      schema: {
        type: 'function',
        function: {
          name: 'get_my_transactions',
          description: 'In-flight and completed transactions where the seller is selling.',
          parameters: {
            type: 'object',
            properties: { limit: { type: 'integer' } },
            additionalProperties: false,
          },
        },
      },
      handler: async (args: any, ctx) => {
        if (!ctx.userId) return { error: 'no user in context' };
        const limit = Math.min(100, Math.max(1, args.limit || 25));
        const rows = await Transaction.findAll({
          where: { sellerId: ctx.userId },
          order: [['createdAt', 'DESC']],
          limit,
        });
        return { count: rows.length, transactions: rows };
      },
    },

    {
      schema: {
        type: 'function',
        function: {
          name: 'get_listing_analytics',
          description: 'Stats for one of the seller’s listings: saves, unlocks, offer counts by status, transaction status.',
          parameters: {
            type: 'object',
            properties: { listingId: { type: 'string' } },
            required: ['listingId'],
            additionalProperties: false,
          },
        },
      },
      handler: async (args: any, ctx) => {
        if (!ctx.userId) return { error: 'no user in context' };
        const listing = await Listing.findOne({ where: { id: args.listingId, sellerId: ctx.userId } });
        if (!listing) return { error: 'listing not found or not owned by you' };

        const [saves, unlocks, offers, txs] = await Promise.all([
          SavedListing.count({ where: { listingId: listing.id } }),
          UnlockedListing.count({ where: { listingId: listing.id } }),
          Offer.findAll({
            where: { listingId: listing.id },
            attributes: ['status'],
            raw: true,
          }) as Promise<Array<{ status: string }>>,
          Transaction.findAll({ where: { listingId: listing.id }, attributes: ['id', 'status'], raw: true }),
        ]);

        const offersByStatus: Record<string, number> = {};
        for (const o of offers) offersByStatus[o.status] = (offersByStatus[o.status] || 0) + 1;

        return {
          listingId: listing.id,
          title: listing.title,
          status: listing.status,
          saves,
          unlocks,
          offers: { total: offers.length, byStatus: offersByStatus },
          transactions: txs,
        };
      },
    },
  ];
}
