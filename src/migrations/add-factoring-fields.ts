/**
 * Migration: Add factoring fields to listings table
 *
 * Allows sellers to record factoring company info on their listing.
 *
 * Run manually using:
 * npx ts-node src/migrations/add-factoring-fields.ts
 *
 * Or execute the SQL directly:
 * ALTER TABLE listings ADD COLUMN hasFactoring BOOLEAN DEFAULT FALSE;
 * ALTER TABLE listings ADD COLUMN factoringCompany VARCHAR(255) DEFAULT NULL;
 * ALTER TABLE listings ADD COLUMN factoringRate DECIMAL(5,2) DEFAULT NULL;
 */

import { DataTypes } from 'sequelize';
import sequelize from '../config/database';

async function up(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const tableDesc = await queryInterface.describeTable('listings');

    if (!tableDesc['hasFactoring']) {
      console.log('Adding hasFactoring column to listings table...');
      await queryInterface.addColumn('listings', 'hasFactoring', {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      });
      console.log('hasFactoring column added successfully');
    } else {
      console.log('hasFactoring column already exists, skipping');
    }

    if (!tableDesc['factoringCompany']) {
      console.log('Adding factoringCompany column to listings table...');
      await queryInterface.addColumn('listings', 'factoringCompany', {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
      console.log('factoringCompany column added successfully');
    } else {
      console.log('factoringCompany column already exists, skipping');
    }

    if (!tableDesc['factoringRate']) {
      console.log('Adding factoringRate column to listings table...');
      await queryInterface.addColumn('listings', 'factoringRate', {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      });
      console.log('factoringRate column added successfully');
    } else {
      console.log('factoringRate column already exists, skipping');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

up();
