/**
 * Match notification service.
 *
 * When a listing becomes ACTIVE, fan out emails to buyers whose saved
 * preferences match the listing:
 *   - Any buyer with `needsAmazon = true` is emailed whenever a new listing
 *     has Amazon Relay ACTIVE, regardless of other criteria.
 *   - Any buyer whose overall match score against the listing is >= 65%
 *     is emailed with the score + top reasons.
 *
 * Dedupe via `match_notifications_sent` so a buyer/listing/reason tuple is
 * never emailed twice.
 */

import { BuyerPreferences, Listing, MatchNotificationSent, AmazonRelayStatus } from '../models';
import { emailService } from './emailService';
import { scoreListing, hasAnyCriteria } from './matchService';
import { config } from '../config';
import logger, { logError, logInfo } from '../utils/logger';

const SCORE_THRESHOLD = 65;

const formatPrice = (listing: any): string => {
  const n = Number(listing.listingPrice || listing.askingPrice || 0);
  return n > 0 ? n.toLocaleString() : 'Contact for price';
};

const buildListingUrl = (listingId: string) =>
  `${config.frontendUrl}/mc/${listingId}`;

const buildPreferencesUrl = () =>
  `${config.frontendUrl}/buyer/dashboard?tab=preferences`;

const amazonStatusLabel = (status?: AmazonRelayStatus | string | null): string => {
  if (!status) return 'Unknown';
  const s = String(status);
  return s.charAt(0) + s.slice(1).toLowerCase();
};

/**
 * Run match notifications for a listing that just became ACTIVE.
 * Safe to call multiple times — dedupe prevents duplicate emails.
 */
export async function notifyMatchingBuyers(listingId: string): Promise<void> {
  const listing = await Listing.findByPk(listingId);
  if (!listing) {
    logger.warn('notifyMatchingBuyers: listing not found', { listingId });
    return;
  }

  const allPrefs = await BuyerPreferences.findAll({
    include: [{ association: 'user', required: true }],
  });

  const isAmazon = (listing as any).amazonStatus === AmazonRelayStatus.ACTIVE;

  for (const prefs of allPrefs) {
    const user = (prefs as any).user;
    if (!user || !user.email) continue;
    // Only email actual buyer-role users with at least some criteria saved.
    if (user.role && user.role !== 'buyer' && user.role !== 'BUYER') continue;
    if (!hasAnyCriteria(prefs)) continue;

    try {
      if (isAmazon && prefs.needsAmazon) {
        await sendAmazonMatchOnce(user, listing);
      }

      const { score, reasons } = scoreListing(listing, prefs);
      if (score >= SCORE_THRESHOLD) {
        await sendScoreMatchOnce(user, listing, score, reasons);
      }
    } catch (err) {
      logError('matchNotification fan-out failed for buyer', err as Error, {
        buyerId: user.id,
        listingId,
      });
    }
  }
}

async function sendAmazonMatchOnce(user: any, listing: any): Promise<void> {
  const [record, created] = await MatchNotificationSent.findOrCreate({
    where: { buyerId: user.id, listingId: listing.id, reason: 'amazon' },
    defaults: { buyerId: user.id, listingId: listing.id, reason: 'amazon' },
  });
  if (!created) return;

  const scoreLabel = (listing as any).amazonRelayScore
    ? ` (score ${(listing as any).amazonRelayScore})`
    : '';

  const ok = await emailService.sendAmazonMatchNotification(user.email, {
    name: user.name || 'there',
    state: listing.state || 'Unknown',
    price: formatPrice(listing),
    amazonStatus: amazonStatusLabel((listing as any).amazonStatus),
    amazonScoreLine: scoreLabel,
    listingUrl: buildListingUrl(listing.id),
    preferencesUrl: buildPreferencesUrl(),
  });

  if (!ok) {
    // Roll back so a retry can resend.
    await record.destroy().catch(() => {});
  } else {
    logger.info('Sent Amazon match notification', { buyerId: user.id, listingId: listing.id });
  }
}

async function sendScoreMatchOnce(
  user: any,
  listing: any,
  score: number,
  reasons: string[]
): Promise<void> {
  const [record, created] = await MatchNotificationSent.findOrCreate({
    where: { buyerId: user.id, listingId: listing.id, reason: 'score' },
    defaults: {
      buyerId: user.id,
      listingId: listing.id,
      reason: 'score',
      matchScore: score,
    },
  });
  if (!created) return;

  const ok = await emailService.sendScoreMatchNotification(user.email, {
    name: user.name || 'there',
    matchScore: score,
    matchReasons: reasons.slice(0, 4).join(' · ') || 'Matches your saved criteria',
    state: listing.state || 'Unknown',
    price: formatPrice(listing),
    listingUrl: buildListingUrl(listing.id),
    preferencesUrl: buildPreferencesUrl(),
  });

  if (!ok) {
    await record.destroy().catch(() => {});
  } else {
    logger.info('Sent score match notification', {
      buyerId: user.id,
      listingId: listing.id,
      score,
    });
  }
}
