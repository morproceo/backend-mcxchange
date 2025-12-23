/**
 * Migration: Add stripeAccountId column to users table
 *
 * This adds support for Stripe Connected Accounts for sellers.
 *
 * Run manually using:
 * npx ts-node src/migrations/add-stripe-account-id.ts
 *
 * Or execute the SQL directly:
 * ALTER TABLE users ADD COLUMN stripeAccountId VARCHAR(255) NULL;
 * CREATE INDEX idx_users_stripe_account_id ON users(stripeAccountId);
 */

import { QueryInterface, DataTypes } from 'sequelize';
import sequelize from '../config/database';

async function up(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  try {
    // Check if column already exists
    const tableDesc = await queryInterface.describeTable('users');

    if (!tableDesc['stripeAccountId']) {
      console.log('Adding stripeAccountId column to users table...');

      await queryInterface.addColumn('users', 'stripeAccountId', {
        type: DataTypes.STRING(255),
        allowNull: true,
      });

      console.log('Column added successfully');
      // Note: Index not added due to MySQL 64 index limit on users table
    } else {
      console.log('stripeAccountId column already exists, skipping...');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

async function down(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  try {
    // Remove index first
    await queryInterface.removeIndex('users', 'idx_users_stripe_account_id');

    // Remove column
    await queryInterface.removeColumn('users', 'stripeAccountId');

    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { up, down };
