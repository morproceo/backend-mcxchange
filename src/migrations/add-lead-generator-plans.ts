/**
 * Migration: Add LEAD_GENERATOR_BUYER and LEAD_GENERATOR_BROKER to the
 * subscriptions.plan ENUM, and create the lead_generator_saves table that
 * backs the new Lead Generator product.
 *
 * Run with:
 *   npx ts-node src/migrations/add-lead-generator-plans.ts
 */
import { Sequelize } from 'sequelize';

const JAWSDB_URL = process.env.JAWSDB_URL;
if (!JAWSDB_URL) {
  console.error('JAWSDB_URL environment variable is required');
  process.exit(1);
}

const sequelize = new Sequelize(JAWSDB_URL, { dialect: 'mysql', logging: false });

async function run() {
  try {
    console.log('Widening subscriptions.plan ENUM with LEAD_GENERATOR_BUYER and LEAD_GENERATOR_BROKER...');
    await sequelize.query(
      `ALTER TABLE subscriptions MODIFY COLUMN plan ENUM(
        'PACKAGE_TOOL',
        'STARTER',
        'PROFESSIONAL',
        'PREMIUM',
        'ENTERPRISE',
        'VIP_ACCESS',
        'LEAD_GENERATOR_BUYER',
        'LEAD_GENERATOR_BROKER'
      ) NOT NULL`
    );
    console.log('  ENUM widened.');

    console.log('Creating lead_generator_saves table if missing...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS lead_generator_saves (
        id CHAR(36) NOT NULL,
        userId CHAR(36) NOT NULL,
        dotNumber VARCHAR(20) NOT NULL,
        carrierName VARCHAR(255) NULL,
        carrierStateCode VARCHAR(2) NULL,
        notes TEXT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_user_dot (userId, dotNumber),
        KEY idx_user_created (userId, createdAt),
        KEY idx_dot (dotNumber)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('  Table ready.');
  } catch (error: any) {
    console.error('Migration error:', error?.message || error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
