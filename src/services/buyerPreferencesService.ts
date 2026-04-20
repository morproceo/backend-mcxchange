import { BuyerPreferences, SafetyRating } from '../models';

export interface BuyerPreferencesInput {
  minPrice?: number | null;
  maxPrice?: number | null;
  preferredStates?: string[] | null;
  cargoTypes?: string[] | null;
  minYearsActive?: number | null;
  minFleetSize?: number | null;
  preferredSafetyRating?: SafetyRating | null;
  needsAmazon?: boolean | null;
  minAmazonRelayScore?: string | null;
  needsHighway?: boolean | null;
  needsFactoring?: boolean | null;
  needsRmis?: boolean | null;
  needsEmail?: boolean | null;
  needsPhone?: boolean | null;
  needsInsurance?: boolean | null;
  buyerNotes?: string | null;
  adminNotes?: string | null;
}

const BUYER_EDITABLE_FIELDS: (keyof BuyerPreferencesInput)[] = [
  'minPrice',
  'maxPrice',
  'preferredStates',
  'cargoTypes',
  'minYearsActive',
  'minFleetSize',
  'preferredSafetyRating',
  'needsAmazon',
  'minAmazonRelayScore',
  'needsHighway',
  'needsFactoring',
  'needsRmis',
  'needsEmail',
  'needsPhone',
  'needsInsurance',
  'buyerNotes',
];

const ADMIN_EDITABLE_FIELDS: (keyof BuyerPreferencesInput)[] = [
  ...BUYER_EDITABLE_FIELDS,
  'adminNotes',
];

function pick<T extends object>(source: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    if (k in source) out[k] = source[k];
  }
  return out;
}

class BuyerPreferencesService {
  async getByUserId(userId: string) {
    return BuyerPreferences.findOne({ where: { userId } });
  }

  /** Buyer-facing view strips adminNotes. */
  toBuyerView(prefs: BuyerPreferences | null) {
    if (!prefs) return null;
    const json = prefs.toJSON() as Record<string, unknown>;
    delete json.adminNotes;
    return json;
  }

  async upsert(
    userId: string,
    data: BuyerPreferencesInput,
    editedBy: 'BUYER' | 'ADMIN'
  ) {
    const allowed = editedBy === 'ADMIN' ? ADMIN_EDITABLE_FIELDS : BUYER_EDITABLE_FIELDS;
    const updates = pick(data, allowed);

    const existing = await BuyerPreferences.findOne({ where: { userId } });
    if (existing) {
      await existing.update({
        ...updates,
        lastEditedBy: editedBy,
        lastEditedAt: new Date(),
      });
      return existing;
    }

    return BuyerPreferences.create({
      userId,
      ...updates,
      lastEditedBy: editedBy,
      lastEditedAt: new Date(),
    });
  }
}

export const buyerPreferencesService = new BuyerPreferencesService();
export default buyerPreferencesService;
