#!/usr/bin/env node
/*
 * Pull real charge/invoice history (and any disputes) for a Stripe subscription or
 * customer — the authoritative $ amounts to cite in a chargeback rebuttal.
 *
 * Usage:
 *   STRIPE_SECRET_KEY='sk_live_...' node scripts/stripeCharges.js <sub_... | cus_...>
 */
const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');
const collected = { subscription: null, charges: [], disputes: [] };

function money(amount, currency) {
  if (amount == null) return '—';
  return `${(amount / 100).toFixed(2)} ${String(currency || '').toUpperCase()}`;
}
function ts(sec) {
  return sec ? new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';
}

async function main() {
  const id = process.argv[2];
  const key = process.env.STRIPE_SECRET_KEY;
  if (!id || !key) {
    console.error('Usage: STRIPE_SECRET_KEY=sk_live_... node scripts/stripeCharges.js <sub_... | cus_...>');
    process.exit(1);
  }
  const stripe = new Stripe(key);

  let customerId = id.startsWith('cus_') ? id : null;
  const line = '─'.repeat(70);

  if (id.startsWith('sub_')) {
    const sub = await stripe.subscriptions.retrieve(id);
    customerId = sub.customer;
    collected.subscription = {
      id: sub.id, status: sub.status, customer: sub.customer, created: sub.created,
      canceled_at: sub.canceled_at,
      price: (sub.items?.data?.[0]?.price?.unit_amount), currency: (sub.items?.data?.[0]?.price?.currency),
      interval: (sub.items?.data?.[0]?.price?.recurring?.interval),
    };
    console.log(`\n${line}\nSUBSCRIPTION ${sub.id}\n${line}`);
    console.log(`status=${sub.status}  customer=${sub.customer}`);
    console.log(`created=${ts(sub.created)}  current_period=${ts(sub.current_period_start)} → ${ts(sub.current_period_end)}`);
    console.log(`cancel_at_period_end=${sub.cancel_at_period_end}  canceled_at=${ts(sub.canceled_at)}`);
    (sub.items?.data || []).forEach((it) =>
      console.log(`item: ${money(it.price?.unit_amount, it.price?.currency)} / ${it.price?.recurring?.interval}  (price ${it.price?.id})`)
    );
  }

  const section = async (title, fn) => {
    console.log(`\n${line}\n${title}\n${line}`);
    try {
      await fn();
    } catch (e) {
      console.log(`  ⚠️  skipped — ${e.message}`);
    }
  };

  // Invoices
  await section('INVOICES', async () => {
    const invParams = id.startsWith('sub_') ? { subscription: id, limit: 100 } : { customer: customerId, limit: 100 };
    const invoices = await stripe.invoices.list(invParams);
    console.log(`  count: ${invoices.data.length}`);
    invoices.data.forEach((inv) => {
      console.log(`  ${ts(inv.created)}  ${String(inv.status).padEnd(9)} paid=${money(inv.amount_paid, inv.currency)}  ${inv.number || inv.id}  ${inv.hosted_invoice_url || ''}`);
    });
  });

  // Charges
  await section('CHARGES', async () => {
    const charges = await stripe.charges.list({ customer: customerId, limit: 100 });
    console.log(`  count: ${charges.data.length}`);
    charges.data.forEach((ch) => {
      console.log(`  ${ts(ch.created)}  ${money(ch.amount, ch.currency)}  ${ch.paid ? 'PAID' : 'UNPAID'}` +
        `${ch.refunded ? ' REFUNDED' : ''}${ch.disputed ? ' DISPUTED' : ''}  ${ch.id}  ${ch.receipt_url || ''}`);
      collected.charges.push({ id: ch.id, created: ch.created, amount: ch.amount, currency: ch.currency,
        paid: ch.paid, refunded: ch.refunded, disputed: ch.disputed, receipt_url: ch.receipt_url });
    });
  });

  // Payment intents (fallback amount source if charges/invoices are blocked)
  await section('PAYMENT INTENTS', async () => {
    const pis = await stripe.paymentIntents.list({ customer: customerId, limit: 100 });
    console.log(`  count: ${pis.data.length}`);
    pis.data.forEach((pi) => {
      console.log(`  ${ts(pi.created)}  ${money(pi.amount, pi.currency)}  status=${pi.status}  ${pi.id}`);
    });
  });

  // Disputes
  await section('DISPUTES (account-wide, recent)', async () => {
    const disputes = await stripe.disputes.list({ limit: 100 });
    console.log(`  count: ${disputes.data.length}`);
    const myCharges = new Set(collected.charges.map((c) => c.id));
    disputes.data.forEach((d) => {
      const mine = myCharges.has(d.charge);
      console.log(`  ${mine ? '➤ ' : '  '}${ts(d.created)}  ${money(d.amount, d.currency)}  status=${d.status}  reason=${d.reason}  charge=${d.charge}`);
      if (d.evidence_details) console.log(`      evidence due: ${ts(d.evidence_details.due_by)}  submitted=${d.evidence_details.submission_count}`);
      if (mine) collected.disputes.push({ id: d.id, created: d.created, amount: d.amount, currency: d.currency,
        status: d.status, reason: d.reason, charge: d.charge,
        due_by: d.evidence_details?.due_by, submission_count: d.evidence_details?.submission_count });
    });
  });

  const outFile = path.resolve(`stripe-${customerId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(collected, null, 2));
  console.log(`\n✅ Stripe data (this customer) written -> ${outFile}`);

  console.log('');
}

main().catch((e) => {
  console.error('Stripe error:', e.message);
  process.exit(1);
});
