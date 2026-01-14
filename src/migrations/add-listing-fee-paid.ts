/**
 * Migration: Add listingFeePaid column to listings table
 *
 * This adds support for tracking whether a listing fee has been paid.
 * Required for the listing payment toggle feature.
 *
 * Run manually using:
 * npx ts-node src/migrations/add-listing-fee-paid.ts
 *
 * Or execute the SQL directly:
 * ALTER TABLE listings ADD COLUMN listingFeePaid BOOLEAN DEFAULT false NOT NULL;
 */

import { QueryInterface, DataTypes } from 'sequelize';
import sequelize from '../config/database';

async function up(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  try {
    // Check if column already exists
    const tableDesc = await queryInterface.describeTable('listings');

    if (!tableDesc['listingFeePaid']) {
      console.log('Adding listingFeePaid column to listings table...');

      await queryInterface.addColumn('listings', 'listingFeePaid', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });

      console.log('Column added successfully');
    } else {
      console.log('listingFeePaid column already exists, skipping...');
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
    // Remove column
    await queryInterface.removeColumn('listings', 'listingFeePaid');

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
