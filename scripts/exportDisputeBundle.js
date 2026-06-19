#!/usr/bin/env node
/*
 * One-off tool: pull a buyer's full subscription + credit-usage history from the
 * production DB as dispute evidence (chargeback / subscription dispute).
 *
 * Writes dispute-bundle-<userId>.json and prints a readable summary covering:
 *   - account info (signup, last login, Stripe customer id, verification, credits)
 *   - subscription row(s): plan, status, price, start/renewal/cancel dates, Stripe ids
 *   - full credit ledger (SUBSCRIPTION grants, USAGE, etc.)
 *   - unlocked listings (proof the buyer consumed value: which carriers they revealed)
 *   - signed terms acceptance record (signature, timestamp, IP, doc id)
 *
 * Usage:
 *   JAWSDB_URL='mysql://user:pass@host:3306/db' node scripts/exportDisputeBundle.js <email-or-userId>
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function q(conn, sql, params) {
  const [rows] = await conn.execute(sql, params);
  return rows;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/exportDisputeBundle.js <email-or-userId>');
    process.exit(1);
  }
  const dbUrl = process.env.JAWSDB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('Set JAWSDB_URL (or DATABASE_URL) to the production MySQL connection string.');
    process.exit(1);
  }

  const conn = await mysql.createConnection(dbUrl);
  try {
    const users = await q(
      conn,
      `SELECT id, name, email, phone, role, status, verified, identityVerified, emailVerified,
              memberSince, lastLoginAt, companyName, mcNumber, dotNumber,
              totalCredits, usedCredits, stripeCustomerId, createdAt
       FROM users WHERE email = ? OR id = ? LIMIT 1`,
      [arg, arg]
    );
    if (!users.length) {
      console.error(`No user found for "${arg}"`);
      process.exit(2);
    }
    const user = users[0];
    const uid = user.id;

    const subscriptions = await q(
      conn,
      `SELECT id, plan, status, priceMonthly, priceYearly, isYearly, creditsPerMonth, creditsRemaining,
              stripeSubId, stripeCustomerId, startDate, endDate, renewalDate, cancelledAt, createdAt, updatedAt
       FROM subscriptions WHERE userId = ? ORDER BY createdAt DESC`,
      [uid]
    );

    const creditLedger = await q(
      conn,
      `SELECT id, type, amount, balance, description, reference, createdAt
       FROM credit_transactions WHERE userId = ? ORDER BY createdAt ASC`,
      [uid]
    );

    const unlocked = await q(
      conn,
      `SELECT ul.id, ul.creditsUsed, ul.createdAt AS unlockedAt,
              l.id AS listingId, l.mcNumber, l.legalName, l.title, l.askingPrice
       FROM unlocked_listings ul
       LEFT JOIN listings l ON l.id = ul.listingId
       WHERE ul.userId = ? ORDER BY ul.createdAt ASC`,
      [uid]
    );

    const terms = await q(
      conn,
      `SELECT id, termsVersion, signatureName, acceptedAt, ipAddress, userAgent, emailedToAdminAt
       FROM user_terms_acceptances WHERE userId = ? ORDER BY acceptedAt DESC`,
      [uid]
    );

    const bundle = { user, subscriptions, creditLedger, unlocked, terms, generatedAt: new Date().toISOString() };
    const outFile = path.resolve(`dispute-bundle-${uid}.json`);
    fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2));

    // ---- readable summary ----
    const line = '─'.repeat(70);
    console.log(`\n${line}\nDISPUTE EVIDENCE BUNDLE\n${line}`);
    console.log(`Account:        ${user.name} <${user.email}>  (id ${uid})`);
    console.log(`Role/Status:    ${user.role} / ${user.status}   verified=${user.verified} idVerified=${user.identityVerified} emailVerified=${user.emailVerified}`);
    console.log(`Company/MC/DOT: ${user.companyName || '—'} / ${user.mcNumber || '—'} / ${user.dotNumber || '—'}`);
    console.log(`Signed up:      ${fmt(user.memberSince || user.createdAt)}    Last login: ${fmt(user.lastLoginAt)}`);
    console.log(`Stripe cust:    ${user.stripeCustomerId || '—'}`);
    console.log(`Credits:        total=${user.totalCredits}  used=${user.usedCredits}`);

    console.log(`\n${line}\nSUBSCRIPTION(S): ${subscriptions.length}\n${line}`);
    subscriptions.forEach((s) => {
      console.log(`• plan=${s.plan} status=${s.status} price=$${s.priceMonthly}${s.isYearly ? '/yr' : '/mo'} credits/mo=${s.creditsPerMonth} remaining=${s.creditsRemaining}`);
      console.log(`  stripeSubId=${s.stripeSubId || '—'}  stripeCustomerId=${s.stripeCustomerId || '—'}`);
      console.log(`  start=${fmt(s.startDate)}  renewal=${fmt(s.renewalDate)}  cancelled=${fmt(s.cancelledAt)}  end=${fmt(s.endDate)}`);
    });

    console.log(`\n${line}\nCREDIT LEDGER: ${creditLedger.length} entries\n${line}`);
    creditLedger.forEach((c) => {
      console.log(`  ${fmt(c.createdAt)}  ${String(c.type).padEnd(12)} ${String(c.amount).padStart(4)}  bal=${String(c.balance).padStart(4)}  ${c.description || ''}${c.reference ? ' [' + c.reference + ']' : ''}`);
    });

    console.log(`\n${line}\nUNLOCKED LISTINGS (value consumed): ${unlocked.length}\n${line}`);
    unlocked.forEach((u) => {
      console.log(`  ${fmt(u.unlockedAt)}  -${u.creditsUsed} credit(s)  MC ${u.mcNumber || '—'}  ${u.legalName || u.title || '(listing ' + u.listingId + ')'}`);
    });

    console.log(`\n${line}\nSIGNED TERMS ACCEPTANCE: ${terms.length}\n${line}`);
    terms.forEach((t) => {
      console.log(`  signed "${t.signatureName}"  v${t.termsVersion}  at ${fmt(t.acceptedAt)}  IP=${t.ipAddress || '—'}  docId=${t.id}`);
    });

    console.log(`\n✅ Full bundle written -> ${outFile}\n`);
  } finally {
    await conn.end();
  }
}

function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
