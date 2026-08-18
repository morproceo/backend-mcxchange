/**
 * Grant lifetime Lead Generator — Broker access to a single user.
 *
 * "Lifetime" here follows the VIP / Deal Access Pass precedent in
 * src/services/vipPassService.ts: an ACTIVE subscription row with no Stripe
 * subscription behind it (stripeSubId = NULL) and a renewalDate 100 years out.
 * Nothing recurs, nothing invoices, and no payment-failure webhook can touch
 * it — webhooks only match rows by stripeSubId, so a NULL one is inert.
 *
 * Access is resolved by getLeadGeneratorAccess() in src/services/
 * entitlementService.ts, which grants tier BROKER for plan
 * LEAD_GENERATOR_BROKER + status ACTIVE. That is exactly what this writes.
 *
 * Run on a dyno where JAWSDB_URL is already in the environment:
 *   heroku run -a mcxchange --exit-code "node scripts/grantLeadGeneratorBroker.js <email>"
 *
 * Add --force-replace to overwrite a subscription that still has a live Stripe
 * subscription attached. Without it the script refuses, because subscriptions
 * .userId is UNIQUE: granting would overwrite the only row the user has and
 * orphan a Stripe subscription that keeps billing them.
 *
 * Re-running is safe — the grant is idempotent.
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const PLAN = 'LEAD_GENERATOR_BROKER';
const LIFETIME_YEARS = 100;

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const forceReplace = args.includes('--force-replace');

  if (!email) {
    console.error('Usage: node scripts/grantLeadGeneratorBroker.js <email> [--force-replace]');
    process.exit(1);
  }
  if (!process.env.JAWSDB_URL) {
    console.error('JAWSDB_URL is not set. Run this on a dyno: heroku run -a mcxchange ...');
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.JAWSDB_URL);
  let exitCode = 0;

  try {
    // 1. The plan ENUM must already include LEAD_GENERATOR_BROKER. sync({force:
    //    false}) never widens ENUMs, so on a database where the migration was
    //    not run MySQL stores '' instead of the plan and the grant silently
    //    yields no access. Check rather than discover it later.
    const [cols] = await conn.query("SHOW COLUMNS FROM subscriptions LIKE 'plan'");
    const enumType = cols[0] && cols[0].Type ? cols[0].Type : '';
    if (!enumType.includes(PLAN)) {
      console.error(`subscriptions.plan ENUM is missing ${PLAN}.`);
      console.error(`  Current: ${enumType}`);
      console.error('  Run the migration first:');
      console.error('    heroku run -a mcxchange --exit-code "node dist/migrations/add-lead-generator-plans.js"');
      process.exit(1);
    }

    // 2. Resolve the user.
    const [users] = await conn.query(
      'SELECT id, email, name, role, status, stripeCustomerId FROM users WHERE email = ?',
      [email]
    );
    if (users.length === 0) {
      console.error(`No user found with email ${email}. Nothing changed.`);
      process.exit(1);
    }
    const user = users[0];
    console.log('User:', {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    });
    if (user.status && String(user.status).toUpperCase() === 'BLOCKED') {
      console.warn('  WARNING: this user is BLOCKED (see adminService.blockUserForChargeback).');
      console.warn('  The grant will be written, but the account still cannot sign in.');
    }

    // 3. Show what is there now — this row is what we are about to overwrite.
    const [subs] = await conn.query(
      `SELECT id, plan, status, priceMonthly, creditsPerMonth, creditsRemaining,
              stripeSubId, stripeCustomerId, startDate, endDate, renewalDate, cancelledAt
         FROM subscriptions WHERE userId = ?`,
      [user.id]
    );
    const existing = subs[0] || null;
    console.log('Existing subscription:', existing || '(none)');

    if (existing && existing.plan === PLAN && existing.status === 'ACTIVE' && !existing.stripeSubId) {
      console.log('Already on a lifetime Broker grant — nothing to change.');
    } else {
      // 4. Refuse to silently orphan a live Stripe subscription.
      if (existing && existing.stripeSubId && !forceReplace) {
        console.error(`\nRefusing to overwrite: this user has Stripe subscription ${existing.stripeSubId}.`);
        console.error('  subscriptions.userId is UNIQUE, so this grant replaces their only row.');
        console.error('  Cancel or migrate that subscription in Stripe first, then re-run;');
        console.error('  or pass --force-replace if you have already handled the Stripe side.');
        process.exit(1);
      }
      if (existing && existing.stripeSubId && forceReplace) {
        console.warn(`\n--force-replace: detaching Stripe subscription ${existing.stripeSubId} from this row.`);
        console.warn('  This does NOT cancel it in Stripe. Cancel it there or the user keeps being billed.');
      }

      const renewalSql = `DATE_ADD(NOW(), INTERVAL ${LIFETIME_YEARS} YEAR)`;

      if (existing) {
        // creditsRemaining is left untouched: the Broker plan grants no credits,
        // and zeroing it would destroy a balance the user paid for under a
        // previous plan.
        await conn.query(
          `UPDATE subscriptions
              SET plan = ?, status = 'ACTIVE', priceMonthly = 0, priceYearly = NULL,
                  isYearly = 0, creditsPerMonth = 0, stripeSubId = NULL,
                  startDate = NOW(), endDate = NULL, renewalDate = ${renewalSql},
                  cancelledAt = NULL, updatedAt = NOW()
            WHERE userId = ?`,
          [PLAN, user.id]
        );
        console.log(`Updated existing subscription ${existing.id} → lifetime ${PLAN}.`);
      } else {
        const id = crypto.randomUUID();
        await conn.query(
          `INSERT INTO subscriptions
             (id, plan, status, priceMonthly, priceYearly, isYearly, creditsPerMonth,
              creditsRemaining, stripeSubId, stripeCustomerId, startDate, endDate,
              renewalDate, userId, createdAt, updatedAt)
           VALUES (?, ?, 'ACTIVE', 0, NULL, 0, 0, 0, NULL, ?, NOW(), NULL, ${renewalSql}, ?, NOW(), NOW())`,
          [id, PLAN, user.stripeCustomerId || null, user.id]
        );
        console.log(`Created subscription ${id} → lifetime ${PLAN}.`);
      }
    }

    // 5. Read back what is actually stored. An empty plan here means the ENUM
    //    check above was passed but the write still did not take.
    const [after] = await conn.query(
      `SELECT id, plan, status, priceMonthly, creditsPerMonth, creditsRemaining,
              stripeSubId, startDate, renewalDate, cancelledAt
         FROM subscriptions WHERE userId = ?`,
      [user.id]
    );
    console.log('Resulting subscription:', after[0]);

    const ok = after[0] && after[0].plan === PLAN && after[0].status === 'ACTIVE';
    console.log(
      ok
        ? `\nOK — ${email} now resolves to Lead Generator tier BROKER, with no billing attached.`
        : `\nFAILED — expected plan ${PLAN} / status ACTIVE. Check the row above.`
    );
    if (!ok) exitCode = 1;
  } catch (err) {
    console.error('Failed:', err && err.message ? err.message : err);
    exitCode = 1;
  } finally {
    await conn.end();
  }

  process.exit(exitCode);
}

main();
