/**
 * Migration: Add insuranceCompany and monthlyInsurancePremium columns to listings table
 *
 * These fields allow sellers to record their insurance company name
 * and what they pay monthly for insurance.
 *
 * Run manually using:
 * npx ts-node src/migrations/add-insurance-fields.ts
 *
 * Or execute the SQL directly:
 * ALTER TABLE listings ADD COLUMN insuranceCompany VARCHAR(255) DEFAULT NULL;
 * ALTER TABLE listings ADD COLUMN monthlyInsurancePremium DECIMAL(10,2) DEFAULT NULL;
 */

import { DataTypes } from 'sequelize';
import sequelize from '../config/database';

async function up(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const tableDesc = await queryInterface.describeTable('listings');

    if (!tableDesc['insuranceCompany']) {
      console.log('Adding insuranceCompany column to listings table...');
      await queryInterface.addColumn('listings', 'insuranceCompany', {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
      console.log('insuranceCompany column added successfully');
    } else {
      console.log('insuranceCompany column already exists, skipping...');
    }

    if (!tableDesc['monthlyInsurancePremium']) {
      console.log('Adding monthlyInsurancePremium column to listings table...');
      await queryInterface.addColumn('listings', 'monthlyInsurancePremium', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      });
      console.log('monthlyInsurancePremium column added successfully');
    } else {
      console.log('monthlyInsurancePremium column already exists, skipping...');
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
    await queryInterface.removeColumn('listings', 'insuranceCompany');
    await queryInterface.removeColumn('listings', 'monthlyInsurancePremium');
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
