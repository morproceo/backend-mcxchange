import { Listing, Truck, TruckPhoto, TruckCondition } from '../models';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

export interface TruckInput {
  make: string;
  model: string;
  year?: number | null;
  mileage?: number | null;
  vin?: string | null;
  condition?: TruckCondition | null;
  description?: string | null;
}

const assertListingOwner = async (listingId: string, userId: string): Promise<Listing> => {
  const listing = await Listing.findByPk(listingId);
  if (!listing) throw new NotFoundError('Listing');
  if (listing.sellerId !== userId) {
    throw new ForbiddenError('You do not own this listing');
  }
  return listing;
};

const assertTruckOwner = async (truckId: string, userId: string): Promise<Truck> => {
  const truck = await Truck.findByPk(truckId);
  if (!truck) throw new NotFoundError('Truck');
  const listing = await Listing.findByPk(truck.listingId);
  if (!listing || listing.sellerId !== userId) {
    throw new ForbiddenError('You do not own this truck');
  }
  return truck;
};

export const truckService = {
  async listByListing(listingId: string) {
    return Truck.findAll({
      where: { listingId },
      include: [{ model: TruckPhoto, as: 'photos' }],
      order: [
        ['displayOrder', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
  },

  async create(listingId: string, userId: string, data: TruckInput) {
    await assertListingOwner(listingId, userId);
    const count = await Truck.count({ where: { listingId } });
    return Truck.create({
      listingId,
      make: data.make,
      model: data.model,
      year: data.year ?? null,
      mileage: data.mileage ?? null,
      vin: data.vin ?? null,
      condition: data.condition ?? null,
      description: data.description ?? null,
      displayOrder: count,
    });
  },

  async createMany(listingId: string, items: TruckInput[]): Promise<Truck[]> {
    if (!items || items.length === 0) return [];
    const rows = items.map((t, i) => ({
      listingId,
      make: t.make,
      model: t.model,
      year: t.year ?? null,
      mileage: t.mileage ?? null,
      vin: t.vin ?? null,
      condition: t.condition ?? null,
      description: t.description ?? null,
      displayOrder: i,
    }));
    return Truck.bulkCreate(rows as any);
  },

  async update(truckId: string, userId: string, data: Partial<TruckInput>) {
    const truck = await assertTruckOwner(truckId, userId);
    await truck.update({
      ...(data.make !== undefined && { make: data.make }),
      ...(data.model !== undefined && { model: data.model }),
      ...(data.year !== undefined && { year: data.year }),
      ...(data.mileage !== undefined && { mileage: data.mileage }),
      ...(data.vin !== undefined && { vin: data.vin }),
      ...(data.condition !== undefined && { condition: data.condition }),
      ...(data.description !== undefined && { description: data.description }),
    });
    return truck;
  },

  async remove(truckId: string, userId: string) {
    const truck = await assertTruckOwner(truckId, userId);
    // Clean up local photos on disk if we're not using S3.
    const photos = await TruckPhoto.findAll({ where: { truckId } });
    if (!config.upload.s3.enabled) {
      for (const p of photos) {
        try {
          const uploadDir = config.upload.uploadDir;
          if (p.filename) {
            const full = path.join(uploadDir, p.filename);
            if (fs.existsSync(full)) fs.unlinkSync(full);
          }
        } catch {
          // best-effort cleanup
        }
      }
    }
    await TruckPhoto.destroy({ where: { truckId } });
    await truck.destroy();
  },

  async addPhotos(
    truckId: string,
    userId: string,
    files: Array<{ url: string; filename?: string | null }>
  ) {
    await assertTruckOwner(truckId, userId);
    if (!files || files.length === 0) return [];
    const existing = await TruckPhoto.count({ where: { truckId } });
    const rows = files.map((f, i) => ({
      truckId,
      url: f.url,
      filename: f.filename ?? null,
      displayOrder: existing + i,
    }));
    return TruckPhoto.bulkCreate(rows as any);
  },

  async removePhoto(truckId: string, photoId: string, userId: string) {
    await assertTruckOwner(truckId, userId);
    const photo = await TruckPhoto.findOne({ where: { id: photoId, truckId } });
    if (!photo) throw new NotFoundError('Photo');
    if (!config.upload.s3.enabled && photo.filename) {
      try {
        const full = path.join(config.upload.uploadDir, photo.filename);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch {
        // best-effort cleanup
      }
    }
    await photo.destroy();
  },
};
