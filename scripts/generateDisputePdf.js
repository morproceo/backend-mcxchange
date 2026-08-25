#!/usr/bin/env node
/*
 * Build a clean evidence PDF for a Stripe subscription dispute from the JSON bundle
 * produced by exportDisputeBundle.js.
 *
 * Usage: node scripts/generateDisputePdf.js dispute-bundle-<userId>.json
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Exact consent language shown to buyers in the product (RegisterPage + BuyerSubscriptionPage).
const REGISTER_CONSENT =
  'I agree to the Buyer Terms of Service and Privacy Policy, including all payment terms, ' +
  'subscription billing policies, deposit and refund policies, and dispute resolution provisions contained therein.';
const CHECKOUT_CONSENT =
  'By subscribing, you confirm your agreement to our Terms of Service and Privacy Policy, including the ' +
  'Payment Terms, Subscription Billing, and Dispute Prohibition policies (Article 7). Subscriptions are billed ' +
  'month-to-month. All payments are final and non-refundable. You may cancel a subscription at any time by ' +
  'contacting info@domilea.com.';

function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function main() {
  const jsonArg = process.argv[2];
  if (!jsonArg) {
    console.error('Usage: node scripts/generateDisputePdf.js <dispute-bundle.json>');
    process.exit(1);
  }
  const bundle = JSON.parse(fs.readFileSync(path.resolve(jsonArg), 'utf8'));
  const { user, subscriptions, creditLedger, unlocked, terms } = bundle;
  const sub = subscriptions[0] || {};

  // Optional Stripe data (argv[3]) — real charges + dispute record.
  let stripe = null;
  const stripeArg = process.argv[3];
  if (stripeArg) {
    try { stripe = JSON.parse(fs.readFileSync(path.resolve(stripeArg), 'utf8')); } catch (e) { /* optional */ }
  }
  const stripeTs = (sec) => (sec ? new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—');
  const stripeMoney = (a, c) => (a == null ? '—' : `$${(a / 100).toFixed(2)} ${String(c || '').toUpperCase()}`);

  const outFile = path.resolve(`dispute-evidence-${user.id}.pdf`);
  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
  doc.pipe(fs.createWriteStream(outFile));

  const H = (t) => doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#111').text(t).moveDown(0.2);
  const P = (t) => doc.font('Helvetica').fontSize(10).fillColor('#222').text(t);
  const KV = (k, v) => doc.font('Helvetica-Bold').fontSize(10).fillColor('#222')
    .text(`${k}: `, { continued: true }).font('Helvetica').text(String(v == null || v === '' ? '—' : v));

  // Header
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a')
    .text('Domilea — Subscription Dispute Evidence', { align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#666')
    .text(`Generated ${fmt(new Date().toISOString())} · The Domilea Group`, { align: 'center' });
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#ccc').stroke();

  // 1. Cardholder / account
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
  KV('Plan', sub.plan);
  KV('Status', sub.status);
  KV('Stripe Subscription ID', sub.stripeSubId);
  KV('Started', fmt(sub.startDate));
  KV('Cancelled', fmt(sub.cancelledAt));
  if (stripe?.subscription) {
    KV('Billed', `${stripeMoney(stripe.subscription.price, stripe.subscription.currency)} / ${stripe.subscription.interval}`);
  }

  // 2b. Real Stripe billing record
  if (stripe?.charges?.length) {
    H('2b. Stripe Billing Record (actual charges)');
    const paid = stripe.charges.filter((c) => c.paid);
    P(`The cardholder was successfully charged ${paid.length} time(s) at ${stripeMoney(stripe.subscription?.price, stripe.subscription?.currency)} each:`);
    doc.moveDown(0.2);
    stripe.charges.forEach((c) => {
      doc.font('Helvetica').fontSize(9.5).fillColor('#222').text(
        `   ${stripeTs(c.created)}   ${stripeMoney(c.amount, c.currency)}   ${c.paid ? 'PAID' : 'unpaid'}` +
        `${c.disputed ? '  (DISPUTED)' : ''}   ${c.id}`);
    });
  }

  // 2c. The dispute(s)
  if (stripe?.disputes?.length) {
    H('2c. Dispute Record');
    stripe.disputes.forEach((d) => {
      const active = d.status === 'needs_response' || d.status === 'warning_needs_response';
      doc.font('Helvetica-Bold').fontSize(10).fillColor(active ? '#b45309' : '#222').text(
        `   ${stripeMoney(d.amount, d.currency)}  ·  reason: ${d.reason}  ·  status: ${d.status.toUpperCase()}`);
      doc.font('Helvetica').fontSize(9).fillColor('#444').text(
        `      charge ${d.charge} · opened ${stripeTs(d.created)} · evidence due ${stripeTs(d.due_by)}${active ? '  ← RESPOND BY THIS DATE' : ''}`);
    });
    doc.fillColor('#222');
  }

  // 3. Proof of service usage (strongest evidence)
  H('3. Proof of Service Delivered & Used');
  P(`The customer actively used the paid service. They spent account credits to unlock the private ` +
    `contact details of ${unlocked.length} motor carrier(s):`);
  doc.moveDown(0.3);
  unlocked.forEach((u, i) => {
    doc.font('Helvetica').fontSize(10).fillColor('#222')
      .text(`   ${i + 1}.  ${fmt(u.unlockedAt)}   —   MC ${u.mcNumber || '—'}   ${u.legalName || u.title || ''}   (−${u.creditsUsed} credit)`);
  });
  if (!unlocked.length) P('   (no listings unlocked)');

  // 4. Credit ledger
  H('4. Account Credit Ledger');
  creditLedger.forEach((c) => {
    doc.font('Helvetica').fontSize(9).fillColor('#222')
      .text(`   ${fmt(c.createdAt)}   ${String(c.type).padEnd(12)} ${String(c.amount).padStart(3)}   balance ${String(c.balance).padStart(3)}   ${c.description || ''}`);
  });

  // 5. Terms the customer agreed to
  H('5. Terms Accepted by Customer');
  P('To create an account, the customer was required to check a mandatory agreement box (account creation ' +
    'is blocked otherwise). The exact statement presented and accepted reads:');
  doc.moveDown(0.2);
  doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#444').text(`“${REGISTER_CONSENT}”`, { indent: 15 });
  doc.moveDown(0.4);
  P('At the point of subscribing, the following was also displayed and agreed to:');
  doc.moveDown(0.2);
  doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#444').text(`“${CHECKOUT_CONSENT}”`, { indent: 15 });
  if (terms && terms.length) {
    doc.moveDown(0.4);
    KV('Signed NDA on file', `Yes — "${terms[0].signatureName}" at ${fmt(terms[0].acceptedAt)} (IP ${terms[0].ipAddress || 'n/a'})`);
  }

  // 6. Summary
  H('6. Summary — Rebuttal to "Fraudulent / Unauthorized" Claim');
  P('The chargeback is filed as "fraudulent" (unauthorized). The records show the opposite: the transaction was ' +
    'authorized and used by the legitimate account holder.');
  doc.moveDown(0.2);
  const bullets = [
    `The account holder completed Stripe Identity verification (identityVerified = ${user.identityVerified ? 'YES' : 'no'}) — the same person was identity-checked.`,
    `The account was created on ${fmt(user.memberSince || user.createdAt)} and logged in repeatedly through ${fmt(user.lastLoginAt)}.`,
    `The same card was billed and paid successfully for multiple months before any dispute was raised — inconsistent with an unauthorized/stolen-card charge.`,
    `The account actively consumed the paid service, spending credits to unlock ${unlocked.length} carrier contact record(s) (see §3).`,
    `The cardholder agreed to the Terms of Service at signup, including the payment and dispute provisions (see §5).`,
  ];
  bullets.forEach((b) => doc.font('Helvetica').fontSize(10).fillColor('#222').text(`   •  ${b}`));
  doc.moveDown(0.3);
  P('Taken together, this establishes that the cardholder knowingly authorized the subscription and received the ' +
    'service. We respectfully request the dispute be resolved in the merchant’s favor.');

  doc.end();
  console.log(`✅ Evidence PDF written -> ${outFile}`);
}

main();
