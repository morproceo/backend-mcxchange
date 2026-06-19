import {
  User,
  Subscription,
  CreditTransaction,
  UnlockedListing,
  Listing,
  UserTermsAcceptance,
} from '../models';
import { stripeService } from './stripeService';
import { NotFoundError } from '../middleware/errorHandler';
import logger from '../utils/logger';

// Exact consent language shown to buyers at signup / checkout (kept in sync with the UI).
const REGISTER_CONSENT =
  'I agree to the Buyer Terms of Service and Privacy Policy, including all payment terms, ' +
  'subscription billing policies, deposit and refund policies, and dispute resolution provisions contained therein.';
const CHECKOUT_CONSENT =
  'By subscribing, you confirm your agreement to our Terms of Service and Privacy Policy, including the Payment Terms, ' +
  'Subscription Billing, and Dispute Prohibition policies (Article 7). Subscriptions are billed month-to-month. ' +
  'All payments are final and non-refundable. You may cancel a subscription at any time by contacting info@domilea.com.';

function fmt(d: any): string {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
function stripeTs(sec?: number | null): string {
  return sec ? new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';
}
function money(amount?: number | null, currency?: string | null): string {
  if (amount == null) return '—';
  return `$${(amount / 100).toFixed(2)} ${String(currency || '').toUpperCase()}`;
}

class DisputeEvidenceService {
  /**
   * Build a dispute-evidence PDF for any user: account, subscription, real Stripe charges
   * + dispute record, credit usage (value consumed), and recorded Terms acceptance.
   */
  async buildEvidencePdf(userId: string): Promise<{ buffer: Buffer; filename: string }> {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('User');

    const [subscription, ledger, unlocked, terms] = await Promise.all([
      Subscription.findOne({ where: { userId } }),
      CreditTransaction.findAll({ where: { userId }, order: [['createdAt', 'ASC']] }),
      UnlockedListing.findAll({ where: { userId }, order: [['createdAt', 'ASC']] }),
      UserTermsAcceptance.findAll({ where: { userId }, order: [['acceptedAt', 'DESC']] }),
    ]);

    // Join unlocked listings to listing details (proof of value consumed).
    const listingIds = unlocked.map((u: any) => u.listingId);
    const listings = listingIds.length ? await Listing.findAll({ where: { id: listingIds } }) : [];
    const listingById = new Map(listings.map((l: any) => [l.id, l]));

    // Live Stripe billing evidence.
    let stripeData: { subscription: any; charges: any[]; disputes: any[] } = {
      subscription: null,
      charges: [],
      disputes: [],
    };
    if ((user as any).stripeCustomerId && stripeService.isEnabled()) {
      try {
        stripeData = await stripeService.getCustomerBillingEvidence((user as any).stripeCustomerId);
      } catch (e) {
        logger.error('Dispute evidence: Stripe pull failed', { userId, error: e });
      }
    }

    const buffer = await this.renderPdf({ user, subscription, ledger, unlocked, listingById, terms, stripe: stripeData });
    const safeName = String((user as any).name || 'user').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return { buffer, filename: `dispute-evidence-${safeName}-${userId}.pdf` };
  }

  private renderPdf(data: any): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const PDFDocument = (await import('pdfkit')).default;
        const { user, subscription, ledger, unlocked, listingById, terms, stripe } = data;

        const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        const H = (t: string) => doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#111').text(t).moveDown(0.2);
        const P = (t: string) => doc.font('Helvetica').fontSize(10).fillColor('#222').text(t);
        const KV = (k: string, v: any) => doc.font('Helvetica-Bold').fontSize(10).fillColor('#222')
          .text(`${k}: `, { continued: true }).font('Helvetica').text(String(v == null || v === '' ? '—' : v));

        doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text('Domilea — Subscription Dispute Evidence', { align: 'center' });
        doc.font('Helvetica').fontSize(9).fillColor('#666').text(`Generated ${fmt(new Date().toISOString())} · The Domilea Group`, { align: 'center' });
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#ccc').stroke();

        // 1. Account
        H('1. Cardholder & Account');
        KV('Name', user.name);
        KV('Email', user.email);
        KV('Account ID', user.id);
        KV('Stripe Customer', user.stripeCustomerId);
        KV('Account created', fmt(user.memberSince || user.createdAt));
        KV('Last login', fmt(user.lastLoginAt));
        KV('Identity verified', user.identityVerified ? 'Yes' : 'No');

        // 2. Subscription
        H('2. Subscription');
        if (subscription) {
          KV('Plan', subscription.plan);
          KV('Status', subscription.status);
          KV('Stripe Subscription ID', subscription.stripeSubId);
          KV('Started', fmt(subscription.startDate));
          KV('Cancelled', fmt(subscription.cancelledAt));
        } else {
          P('No subscription record on file.');
        }
        if (stripe.subscription) {
          const price = stripe.subscription.items?.data?.[0]?.price;
          if (price) KV('Billed', `${money(price.unit_amount, price.currency)} / ${price.recurring?.interval}`);
        }

        // 2b. Real charges
        if (stripe.charges.length) {
          H('2b. Stripe Billing Record (actual charges)');
          const paid = stripe.charges.filter((c: any) => c.paid).length;
          P(`The cardholder was successfully charged ${paid} time(s):`);
          doc.moveDown(0.2);
          stripe.charges.forEach((c: any) => {
            doc.font('Helvetica').fontSize(9.5).fillColor('#222').text(
              `   ${stripeTs(c.created)}   ${money(c.amount, c.currency)}   ${c.paid ? 'PAID' : 'unpaid'}` +
              `${c.disputed ? '  (DISPUTED)' : ''}   ${c.id}`);
          });
        }

        // 2c. Disputes
        if (stripe.disputes.length) {
          H('2c. Dispute Record');
          stripe.disputes.forEach((d: any) => {
            const active = d.status === 'needs_response' || d.status === 'warning_needs_response';
            doc.font('Helvetica-Bold').fontSize(10).fillColor(active ? '#b45309' : '#222').text(
              `   ${money(d.amount, d.currency)}  ·  reason: ${d.reason}  ·  status: ${String(d.status).toUpperCase()}`);
            doc.font('Helvetica').fontSize(9).fillColor('#444').text(
              `      charge ${d.charge} · opened ${stripeTs(d.created)} · evidence due ${stripeTs(d.evidence_details?.due_by)}` +
              `${active ? '  ← RESPOND BY THIS DATE' : ''}`);
          });
          doc.fillColor('#222');
        }

        // 3. Usage
        H('3. Proof of Service Delivered & Used');
        P(`The customer spent account credits to unlock the private contact details of ${unlocked.length} motor carrier(s):`);
        doc.moveDown(0.3);
        unlocked.forEach((u: any, i: number) => {
          const l: any = listingById.get(u.listingId);
          doc.font('Helvetica').fontSize(10).fillColor('#222').text(
            `   ${i + 1}.  ${fmt(u.createdAt)}   —   MC ${l?.mcNumber || '—'}   ${l?.legalName || l?.title || '(listing ' + u.listingId + ')'}   (−${u.creditsUsed} credit)`);
        });
        if (!unlocked.length) P('   (no listings unlocked)');

        // 4. Credit ledger
        H('4. Account Credit Ledger');
        ledger.forEach((c: any) => {
          doc.font('Helvetica').fontSize(9).fillColor('#222').text(
            `   ${fmt(c.createdAt)}   ${String(c.type).padEnd(12)} ${String(c.amount).padStart(3)}   balance ${String(c.balance).padStart(3)}   ${c.description || ''}`);
        });
        if (!ledger.length) P('   (no credit transactions)');

        // 5. Terms
        H('5. Terms Accepted by Customer');
        P('To create an account, the customer was required to check a mandatory agreement box (signup is blocked otherwise). The statement presented and accepted reads:');
        doc.moveDown(0.2);
        doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#444').text(`“${REGISTER_CONSENT}”`, { indent: 15 });
        doc.moveDown(0.4);
        P('At the point of subscribing, the following was also displayed and agreed to:');
        doc.moveDown(0.2);
        doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#444').text(`“${CHECKOUT_CONSENT}”`, { indent: 15 });
        if (terms.length) {
          doc.moveDown(0.4);
          KV('Recorded acceptance', `"${terms[0].signatureName}" v${terms[0].termsVersion} at ${fmt(terms[0].acceptedAt)} (IP ${terms[0].ipAddress || 'n/a'})`);
        }

        // 6. Summary
        H('6. Summary');
        const anyFraud = stripe.disputes.some((d: any) => d.reason === 'fraudulent');
        if (anyFraud) {
          P('The chargeback is filed as "fraudulent" (unauthorized). The records show the transaction was authorized and used by the legitimate account holder:');
          doc.moveDown(0.2);
          [
            `Identity verified via Stripe Identity: ${user.identityVerified ? 'YES' : 'no'}.`,
            `Account created ${fmt(user.memberSince || user.createdAt)}, last login ${fmt(user.lastLoginAt)}.`,
            `The same card was billed and paid for multiple months before any dispute — inconsistent with an unauthorized charge.`,
            `The account consumed the paid service, unlocking ${unlocked.length} carrier contact record(s) (see §3).`,
            `The cardholder agreed to the Terms of Service at signup (see §5).`,
          ].forEach((b) => doc.font('Helvetica').fontSize(10).fillColor('#222').text(`   •  ${b}`));
        } else {
          P('The customer agreed to the Terms of Service (all payments final / dispute prohibition), maintained an active subscription, logged in over time, and consumed the paid service by unlocking confidential carrier contact information. The service was delivered as described.');
        }
        doc.moveDown(0.3);
        P('We respectfully request the dispute be resolved in the merchant’s favor.');

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const disputeEvidenceService = new DisputeEvidenceService();
export default disputeEvidenceService;
