/**
 * Migration: Add payment_consents table
 *
 * Stores the customer's affirmative payment-terms signature captured at each
 * checkout (electronic signature + exact terms text + IP + timestamp). One row
 * per checkout event — no unique constraint — so renewals/upgrades each get their
 * own record. Used as Stripe dispute evidence (customer_signature). Idempotent.
 *
 * Run with:
 *   JAWSDB_URL=<db url> npx ts-node src/migrations/add-payment-consents.ts
 */
import { Sequelize } from 'sequelize';

const JAWSDB_URL = process.env.JAWSDB_URL;
if (!JAWSDB_URL) {
  console.error('JAWSDB_URL environment variable is required');
  process.exit(1);
}

const sequelize = new Sequelize(JAWSDB_URL, { dialect: 'mysql', logging: console.log });

async function run() {
  try {
    console.log('=== Migration: Add payment_consents ===\n');

    console.log('1. Creating payment_consents table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS payment_consents (
        id CHAR(36) NOT NULL PRIMARY KEY,
        userId CHAR(36) NOT NULL,
        signatureName VARCHAR(255) NOT NULL,
        consentText TEXT NOT NULL,
        consentVersion VARCHAR(40) NOT NULL DEFAULT 'checkout-payment-1.0',
        plan VARCHAR(50) NULL,
        amountCents INT NULL,
        currency VARCHAR(10) NULL,
        stripeSessionId VARCHAR(255) NULL,
        stripeSubId VARCHAR(255) NULL,
        ipAddress VARCHAR(45) NULL,
        userAgent TEXT NULL,
        acceptedAt DATETIME NOT NULL,
        createdAt DATETIME NOT NULL,
        INDEX payment_consents_user (userId),
        INDEX payment_consents_accepted (acceptedAt),
        INDEX payment_consents_session (stripeSessionId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ payment_consents table ready');

    console.log('\n=== Migration complete ===');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
