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
    const values = Object.values(AuthorityType);
    const enumSql = values.map((v) => `'${v}'`).join(',');

    if (!tableDesc['authorityType']) {
      console.log('Adding authorityType column to listings table...');
      await queryInterface.addColumn('listings', 'authorityType', {
        type: DataTypes.ENUM(...values),
        defaultValue: AuthorityType.MOTOR_CARRIER,
        allowNull: false,
      });
      console.log('authorityType column added successfully');
    } else {
      // The column exists, but sync({ force: false }) never widens an ENUM.
      // A column missing BROKER stores '' for every broker listing instead of
      // erroring, so force the full value list from the model.
      const currentType = String(tableDesc['authorityType'].type || '');
      const missing = values.filter((v) => !currentType.includes(`'${v}'`));

      if (missing.length > 0) {
        console.log(`authorityType ENUM is missing ${missing.join(', ')} — widening...`);
        await sequelize.query(
          `ALTER TABLE listings MODIFY COLUMN authorityType ENUM(${enumSql}) NOT NULL DEFAULT '${AuthorityType.MOTOR_CARRIER}'`
        );
        console.log('authorityType ENUM widened successfully');
      } else {
        console.log('authorityType column already holds every authority type, skipping');
      }
    }

    // '' is what a too-narrow ENUM silently stores. NULL only shows up if the
    // column predates allowNull: false. Both mean "unknown" — treat as carrier.
    console.log('Backfilling listings with no authority type to MOTOR_CARRIER...');
    const [, backfilled] = await sequelize.query(
      `UPDATE listings SET authorityType = '${AuthorityType.MOTOR_CARRIER}' WHERE authorityType IS NULL OR authorityType = ''`
    );
    console.log('Backfill complete', backfilled);

    // Verify rather than assume — the whole point is catching a narrow ENUM.
    const afterDesc = await queryInterface.describeTable('listings');
    console.log('authorityType is now:', afterDesc['authorityType']?.type);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

up();
