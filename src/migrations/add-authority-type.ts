/**
 * Migration: Add authorityType column to listings table
 *
 * Marks what type of FMCSA authority the listing represents
 * (motor carrier, broker, both, or freight forwarder). Existing rows
 * are backfilled to MOTOR_CARRIER since the platform was implicitly
 * carrier-only before this column existed.
 *
 * Run manually using:
 * npx ts-node src/migrations/add-authority-type.ts
 */

import { DataTypes } from 'sequelize';
import sequelize from '../config/database';
import { AuthorityType } from '../models';

async function up(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const tableDesc = await queryInterface.describeTable('listings');

    if (!tableDesc['authorityType']) {
      console.log('Adding authorityType column to listings table...');
      await queryInterface.addColumn('listings', 'authorityType', {
        type: DataTypes.ENUM(...Object.values(AuthorityType)),
        defaultValue: AuthorityType.MOTOR_CARRIER,
        allowNull: false,
      });
      console.log('authorityType column added successfully');
    } else {
      console.log('authorityType column already exists, skipping add');
    }

    console.log('Backfilling existing listings to MOTOR_CARRIER where null...');
    const [result] = await sequelize.query(
      `UPDATE listings SET authorityType = 'MOTOR_CARRIER' WHERE authorityType IS NULL`
    );
    console.log('Backfill complete', result);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

up();
