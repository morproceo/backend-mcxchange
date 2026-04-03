/**
 * Migration: Add admin-first offer flow
 * - Add PENDING_ADMIN and FORWARDED to offers.status ENUM
 * - Add sellerAmount column to offers table
 * - Add sellerPayout column to transactions table
 * - Migrate existing PENDING offers to PENDING_ADMIN
 *
 * Run with:
 *   npx ts-node src/migrations/add-offer-admin-flow.ts
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
    console.log('=== Migration: Add offer admin flow ===\n');

    // 1. Update offers.status ENUM to include PENDING_ADMIN and FORWARDED
    console.log('1. Updating offers.status ENUM...');
    await sequelize.query(
      `ALTER TABLE offers MODIFY COLUMN status ENUM('PENDING_ADMIN','FORWARDED','PENDING','ACCEPTED','APPROVED','REJECTED','COUNTERED','EXPIRED','WITHDRAWN') NOT NULL DEFAULT 'PENDING_ADMIN'`
    );
    console.log('   ✓ Added PENDING_ADMIN and FORWARDED to offers.status ENUM');

    // 2. Add sellerAmount column to offers
    console.log('2. Adding sellerAmount column to offers...');
    try {
      await sequelize.query(
        `ALTER TABLE offers ADD COLUMN sellerAmount DECIMAL(12,2) NULL AFTER counterAt`
      );
      console.log('   ✓ sellerAmount column added');
    } catch (error: any) {
      if (error.original?.code === 'ER_DUP_FIELDNAME') {
        console.log('   sellerAmount column already exists, skipping');
      } else {
        throw error;
      }
    }

    // 3. Add sellerPayout column to transactions
    console.log('3. Adding sellerPayout column to transactions...');
    try {
      await sequelize.query(
        `ALTER TABLE transactions ADD COLUMN sellerPayout DECIMAL(12,2) NULL AFTER agreedPrice`
      );
      console.log('   ✓ sellerPayout column added');
    } catch (error: any) {
      if (error.original?.code === 'ER_DUP_FIELDNAME') {
        console.log('   sellerPayout column already exists, skipping');
      } else {
        throw error;
      }
    }

    console.log('\n=== Migration complete ===');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
