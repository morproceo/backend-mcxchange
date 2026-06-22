#!/usr/bin/env node
/*
 * Dispute monitor (CLI): list open Stripe disputes (needs_response) with their
 * evidence deadlines, sorted by urgency, matched to the Domilea user.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=rk_live_... JAWSDB_URL=mysql://... node scripts/openDisputes.js
 *   (JAWSDB_URL optional — without it, customer matching is skipped.)
 */
const Stripe = require('stripe');

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { console.error('Set STRIPE_SECRET_KEY'); process.exit(1); }
  const stripe = new Stripe(key);

  const res = await stripe.disputes.list({ limit: 100 });
  const open = res.data.filter((d) => d.status === 'needs_response' || d.status === 'warning_needs_response');

  const rows = [];
  for (const d of open) {
    const chargeId = typeof d.charge === 'string' ? d.charge : d.charge?.id;
    let customerId, email;
    if (chargeId) {
      try {
        const ch = await stripe.charges.retrieve(chargeId);
        customerId = typeof ch.customer === 'string' ? ch.customer : ch.customer?.id;
        email = ch.billing_details?.email || ch.receipt_email;
      } catch {}
    }
    rows.push({ id: d.id, amount: d.amount, currency: d.currency, reason: d.reason, status: d.status,
      dueBy: d.evidence_details?.due_by, submitted: d.evidence_details?.submission_count || 0, customerId, email });
  }

  // Optional DB enrichment
  if (process.env.JAWSDB_URL) {
    try {
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection(process.env.JAWSDB_URL);
      const ids = [...new Set(rows.map((r) => r.customerId).filter(Boolean))];
      if (ids.length) {
        const [users] = await conn.query(
          'SELECT id,name,email,stripeCustomerId FROM users WHERE stripeCustomerId IN (?)', [ids]);
        const byCust = new Map(users.map((u) => [u.stripeCustomerId, u]));
        rows.forEach((r) => { const u = byCust.get(r.customerId); if (u) { r.userId = u.id; r.name = u.name; r.email = u.email; } });
      }
      await conn.end();
    } catch (e) { console.error('(DB enrichment skipped:', e.message + ')'); }
  }

  rows.sort((a, b) => (a.dueBy || Infinity) - (b.dueBy || Infinity));

  const line = '─'.repeat(78);
  console.log(`\n${line}\nOPEN STRIPE DISPUTES NEEDING RESPONSE: ${rows.length}\n${line}`);
  if (!rows.length) { console.log('  🎉 none — nothing to respond to.\n'); return; }
  for (const r of rows) {
    const dl = r.dueBy ? Math.ceil((r.dueBy * 1000 - Date.now()) / 86400000) : null;
    const due = r.dueBy ? new Date(r.dueBy * 1000).toISOString().slice(0, 10) : '—';
    const flag = dl !== null && dl <= 3 ? '🔴' : '🟠';
    console.log(`${flag} due ${due} (${dl === null ? '?' : dl + 'd'})  $${(r.amount / 100).toFixed(2)} ${r.currency.toUpperCase()}  ${r.reason}`);
    console.log(`   user: ${r.name || '(unmatched)'} <${r.email || '—'}>  userId=${r.userId || '—'}  dispute=${r.id}`);
  }
  console.log('');
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
