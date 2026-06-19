#!/usr/bin/env node
/*
 * Pull real charge/invoice history (and any disputes) for a Stripe subscription or
 * customer — the authoritative $ amounts to cite in a chargeback rebuttal.
 *
 * Usage:
 *   STRIPE_SECRET_KEY='sk_live_...' node scripts/stripeCharges.js <sub_... | cus_...>
 */
const Stripe = require('stripe');

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
    console.log(`\n${line}\nSUBSCRIPTION ${sub.id}\n${line}`);
    console.log(`status=${sub.status}  customer=${sub.customer}`);
    console.log(`created=${ts(sub.created)}  current_period=${ts(sub.current_period_start)} → ${ts(sub.current_period_end)}`);
    console.log(`cancel_at_period_end=${sub.cancel_at_period_end}  canceled_at=${ts(sub.canceled_at)}`);
    (sub.items?.data || []).forEach((it) =>
      console.log(`item: ${money(it.price?.unit_amount, it.price?.currency)} / ${it.price?.recurring?.interval}  (price ${it.price?.id})`)
    );
  }

  // Invoices
  const invParams = id.startsWith('sub_') ? { subscription: id, limit: 100 } : { customer: customerId, limit: 100 };
  const invoices = await stripe.invoices.list(invParams);
  console.log(`\n${line}\nINVOICES: ${invoices.data.length}\n${line}`);
  invoices.data.forEach((inv) => {
    console.log(`  ${ts(inv.created)}  ${String(inv.status).padEnd(9)} paid=${money(inv.amount_paid, inv.currency)}  ${inv.number || inv.id}  ${inv.hosted_invoice_url || ''}`);
  });

  // Charges
  const charges = await stripe.charges.list({ customer: customerId, limit: 100 });
  console.log(`\n${line}\nCHARGES: ${charges.data.length}\n${line}`);
  const disputedCharges = [];
  charges.data.forEach((ch) => {
    console.log(`  ${ts(ch.created)}  ${money(ch.amount, ch.currency)}  ${ch.paid ? 'PAID' : 'UNPAID'}` +
      `${ch.refunded ? ' REFUNDED' : ''}${ch.disputed ? ' DISPUTED' : ''}  ${ch.id}  ${ch.receipt_url || ''}`);
    if (ch.disputed) disputedCharges.push(ch.id);
  });

  // Disputes
  const disputes = await stripe.disputes.list({ limit: 100 });
  const mine = disputes.data.filter((d) => !customerId || disputedCharges.includes(d.charge) || (d.payment_intent && true));
  console.log(`\n${line}\nDISPUTES (account-wide, recent): ${disputes.data.length}\n${line}`);
  disputes.data.forEach((d) => {
    console.log(`  ${ts(d.created)}  ${money(d.amount, d.currency)}  status=${d.status}  reason=${d.reason}  charge=${d.charge}`);
    if (d.evidence_details) console.log(`      evidence due: ${ts(d.evidence_details.due_by)}  submitted=${d.evidence_details.submission_count}`);
  });

  console.log('');
}

main().catch((e) => {
  console.error('Stripe error:', e.message);
  process.exit(1);
});
