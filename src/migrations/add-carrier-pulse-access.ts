/**
 * Migration: Add CarrierPulse access columns to users table
 *
 * - carrierPulseAccess: Boolean flag for standalone CarrierPulse subscription
 * - carrierPulseStripeSubId: Stripe subscription ID for CarrierPulse
 *
 * Run manually using:
 * npx ts-node src/migrations/add-carrier-pulse-access.ts
 */

import { DataTypes } from 'sequelize';
import sequelize from '../config/database';

async function up(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const tableDesc = await queryInterface.describeTable('users');

    if (!tableDesc['carrierPulseAccess']) {
      console.log('Adding carrierPulseAccess column to users table...');
      await queryInterface.addColumn('users', 'carrierPulseAccess', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      console.log('✓ carrierPulseAccess column added');
    } else {
      console.log('carrierPulseAccess column already exists, skipping');
    }

    if (!tableDesc['carrierPulseStripeSubId']) {
      console.log('Adding carrierPulseStripeSubId column to users table...');
      await queryInterface.addColumn('users', 'carrierPulseStripeSubId', {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
      console.log('✓ carrierPulseStripeSubId column added');
    } else {
      console.log('carrierPulseStripeSubId column already exists, skipping');
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
    await queryInterface.removeColumn('users', 'carrierPulseStripeSubId');
    await queryInterface.removeColumn('users', 'carrierPulseAccess');
    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

// Run migration
const command = process.argv[2];
if (command === 'down') {
  down().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  up().then(() => process.exit(0)).catch(() => process.exit(1));
}
