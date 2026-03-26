/**
 * Migration: Add PACKAGE_TOOL to subscription plan ENUM
 *
 * Run with:
 *   npx ts-node src/migrations/add-package-tool-plan.ts
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
    console.log('Adding PACKAGE_TOOL to subscriptions.plan ENUM...');
    await sequelize.query(
      `ALTER TABLE subscriptions MODIFY COLUMN plan ENUM('PACKAGE_TOOL','STARTER','PROFESSIONAL','PREMIUM','ENTERPRISE','VIP_ACCESS') NOT NULL`
    );
    console.log('✓ PACKAGE_TOOL plan added to ENUM');
  } catch (error: any) {
    if (error.message?.includes('already exists') || error.original?.code === 'ER_DUP_ENTRY') {
      console.log('PACKAGE_TOOL already exists in ENUM, skipping');
    } else {
      console.error('Migration error:', error);
      process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
}

run();
