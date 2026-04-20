import { Listing, BuyerPreferences, SafetyRating, AmazonRelayStatus } from '../models';

export interface MatchResult {
  score: number; // 0-100, rounded
  reasons: string[];
  matchedCount: number;
  totalCriteria: number;
}

const RELAY_SCORE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

const WEIGHTS = {
  needsAmazon: 20,
  preferredStates: 15,
  price: 15,
  needsRmis: 10,
  minYearsActive: 10,
  needsFactoring: 8,
  minAmazonRelayScore: 8,
  needsHighway: 5,
  preferredSafetyRating: 5,
  minFleetSize: 5,
  cargoTypes: 5,
  needsEmail: 3,
  needsPhone: 3,
  needsInsurance: 3,
};

function parseCargoTypes(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function safetyOk(want?: SafetyRating | null, got?: SafetyRating): boolean {
  if (!want) return true;
  // If they ask for SATISFACTORY we accept SATISFACTORY only.
  // For CONDITIONAL, accept SATISFACTORY or CONDITIONAL.
  // For NONE, accept anything non-UNSATISFACTORY.
  if (want === SafetyRating.SATISFACTORY) return got === SafetyRating.SATISFACTORY;
  if (want === SafetyRating.CONDITIONAL)
    return got === SafetyRating.SATISFACTORY || got === SafetyRating.CONDITIONAL;
  return got !== SafetyRating.UNSATISFACTORY;
}

export function scoreListing(
  listing: Listing,
  prefs: BuyerPreferences
): MatchResult {
  const reasons: string[] = [];
  let total = 0;
  let earned = 0;
  let matchedCount = 0;
  let totalCriteria = 0;

  const push = (ok: boolean, weight: number, label: string) => {
    total += weight;
    totalCriteria += 1;
    if (ok) {
      earned += weight;
      matchedCount += 1;
      reasons.push(`\u2713 ${label}`);
    } else {
      reasons.push(`\u2717 ${label}`);
    }
  };

  // needsAmazon
  if (prefs.needsAmazon != null) {
    const want = prefs.needsAmazon;
    const has = listing.amazonStatus === AmazonRelayStatus.ACTIVE;
    push(want ? has : !has, WEIGHTS.needsAmazon, want ? 'Amazon Active' : 'No Amazon');
  }

  // preferredStates
  if (prefs.preferredStates && prefs.preferredStates.length > 0) {
    const ok = prefs.preferredStates.includes(listing.state);
    push(ok, WEIGHTS.preferredStates, `State in ${prefs.preferredStates.join('/')}`);
  }

  // price range (min/max). Use listingPrice if set, otherwise askingPrice.
  const listingPrice = listing.listingPrice ?? listing.askingPrice;
  if (prefs.minPrice != null || prefs.maxPrice != null) {
    const minOk = prefs.minPrice == null || listingPrice >= Number(prefs.minPrice);
    const maxOk = prefs.maxPrice == null || listingPrice <= Number(prefs.maxPrice);
    const label = `Price ${prefs.minPrice != null ? `\u2265 $${prefs.minPrice}` : ''}${
      prefs.minPrice != null && prefs.maxPrice != null ? ' and ' : ''
    }${prefs.maxPrice != null ? `\u2264 $${prefs.maxPrice}` : ''}`.trim();
    push(minOk && maxOk, WEIGHTS.price, label);
  }

  // needsRmis
  if (prefs.needsRmis != null) {
    const want = prefs.needsRmis;
    const has = Boolean((listing as unknown as { rmisSetup?: boolean }).rmisSetup);
    push(want ? has : !has, WEIGHTS.needsRmis, want ? 'RMIS setup' : 'No RMIS');
  }

  // minYearsActive
  if (prefs.minYearsActive != null) {
    const ok = (listing.yearsActive ?? 0) >= prefs.minYearsActive;
    push(ok, WEIGHTS.minYearsActive, `\u2265 ${prefs.minYearsActive} years active`);
  }

  // needsFactoring
  if (prefs.needsFactoring != null) {
    const want = prefs.needsFactoring;
    const has = listing.hasFactoring;
    push(want ? has : !has, WEIGHTS.needsFactoring, want ? 'Has factoring' : 'No factoring');
  }

  // minAmazonRelayScore
  if (prefs.minAmazonRelayScore) {
    const want = RELAY_SCORE_RANK[prefs.minAmazonRelayScore.toUpperCase()] ?? 0;
    const got = listing.amazonRelayScore
      ? RELAY_SCORE_RANK[listing.amazonRelayScore.toUpperCase()] ?? 0
      : 0;
    push(got >= want, WEIGHTS.minAmazonRelayScore, `Relay \u2265 ${prefs.minAmazonRelayScore}`);
  }

  // needsHighway
  if (prefs.needsHighway != null) {
    const want = prefs.needsHighway;
    const has = listing.highwaySetup;
    push(want ? has : !has, WEIGHTS.needsHighway, want ? 'Highway setup' : 'No Highway');
  }

  // preferredSafetyRating
  if (prefs.preferredSafetyRating) {
    push(
      safetyOk(prefs.preferredSafetyRating, listing.safetyRating),
      WEIGHTS.preferredSafetyRating,
      `Safety \u2265 ${prefs.preferredSafetyRating}`
    );
  }

  // minFleetSize
  if (prefs.minFleetSize != null) {
    const ok = (listing.fleetSize ?? 0) >= prefs.minFleetSize;
    push(ok, WEIGHTS.minFleetSize, `Fleet \u2265 ${prefs.minFleetSize}`);
  }

  // cargoTypes overlap
  if (prefs.cargoTypes && prefs.cargoTypes.length > 0) {
    const listingTypes = parseCargoTypes(listing.cargoTypes);
    const overlap = prefs.cargoTypes.some((t) =>
      listingTypes.some((lt) => lt.toLowerCase() === t.toLowerCase())
    );
    push(overlap, WEIGHTS.cargoTypes, `Cargo overlap: ${prefs.cargoTypes.join(', ')}`);
  }

  // needsEmail / needsPhone / needsInsurance
  if (prefs.needsEmail != null) {
    push(
      prefs.needsEmail ? listing.sellingWithEmail : !listing.sellingWithEmail,
      WEIGHTS.needsEmail,
      prefs.needsEmail ? 'Email included' : 'No email'
    );
  }
  if (prefs.needsPhone != null) {
    push(
      prefs.needsPhone ? listing.sellingWithPhone : !listing.sellingWithPhone,
      WEIGHTS.needsPhone,
      prefs.needsPhone ? 'Phone included' : 'No phone'
    );
  }
  if (prefs.needsInsurance != null) {
    push(
      prefs.needsInsurance ? listing.insuranceOnFile : !listing.insuranceOnFile,
      WEIGHTS.needsInsurance,
      prefs.needsInsurance ? 'Insurance on file' : 'No insurance'
    );
  }

  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  return { score, reasons, matchedCount, totalCriteria };
}

/**
 * Return listings sorted by match score desc, annotated with { matchScore, matchReasons }.
 * Listings are NOT filtered — a low-match listing is still returned (score 0). Caller can
 * optionally slice top N.
 */
export function rankListings(
  listings: Listing[],
  prefs: BuyerPreferences,
  limit?: number
): Array<Listing & { matchScore: number; matchReasons: string[] }> {
  const ranked = listings.map((l) => {
    const { score, reasons } = scoreListing(l, prefs);
    return Object.assign(l, { matchScore: score, matchReasons: reasons });
  });
  ranked.sort((a, b) => b.matchScore - a.matchScore);
  return limit ? ranked.slice(0, limit) : ranked;
}

export function hasAnyCriteria(prefs: BuyerPreferences): boolean {
  const fields: (keyof BuyerPreferences)[] = [
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
  ];
  for (const f of fields) {
    const v = prefs[f];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return true;
  }
  return false;
}
