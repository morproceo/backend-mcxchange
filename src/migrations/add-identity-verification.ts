/**
 * Migration: Add identity verification columns to users table
 *
 * Adds support for Stripe Identity verification:
 * - identityVerified: Boolean flag indicating if user has been verified
 * - identityVerifiedAt: Timestamp of when verification was completed
 * - stripeVerificationSessionId: Stripe Identity verification session ID
 * - identityVerificationStatus: Current status (pending | processing | verified | requires_input | canceled)
 *
 * Run manually using:
 * npx ts-node src/migrations/add-identity-verification.ts
 */

import { DataTypes } from 'sequelize';
import sequelize from '../config/database';

async function up(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const tableDesc = await queryInterface.describeTable('users');

    // Add identityVerified column
    if (!tableDesc['identityVerified']) {
      console.log('Adding identityVerified column to users table...');
      await queryInterface.addColumn('users', 'identityVerified', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      console.log('identityVerified column added');
    } else {
      console.log('identityVerified column already exists, skipping...');
    }

    // Add identityVerifiedAt column
    if (!tableDesc['identityVerifiedAt']) {
      console.log('Adding identityVerifiedAt column to users table...');
      await queryInterface.addColumn('users', 'identityVerifiedAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
      console.log('identityVerifiedAt column added');
    } else {
      console.log('identityVerifiedAt column already exists, skipping...');
    }

    // Add stripeVerificationSessionId column
    if (!tableDesc['stripeVerificationSessionId']) {
      console.log('Adding stripeVerificationSessionId column to users table...');
      await queryInterface.addColumn('users', 'stripeVerificationSessionId', {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
      console.log('stripeVerificationSessionId column added');
    } else {
      console.log('stripeVerificationSessionId column already exists, skipping...');
    }

    // Add identityVerificationStatus column
    if (!tableDesc['identityVerificationStatus']) {
      console.log('Adding identityVerificationStatus column to users table...');
      await queryInterface.addColumn('users', 'identityVerificationStatus', {
        type: DataTypes.STRING(50),
        allowNull: true,
      });
      console.log('identityVerificationStatus column added');
    } else {
      console.log('identityVerificationStatus column already exists, skipping...');
    }

    // Add index on stripeVerificationSessionId
    try {
      await queryInterface.addIndex('users', ['stripeVerificationSessionId'], {
        name: 'idx_users_stripe_verification_session_id',
      });
      console.log('Index on stripeVerificationSessionId added');
    } catch (indexError: any) {
      if (indexError.message?.includes('already exists') || indexError.original?.code === 'ER_DUP_KEYNAME') {
        console.log('Index on stripeVerificationSessionId already exists, skipping...');
      } else {
        throw indexError;
      }
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
    // Remove index
    try {
      await queryInterface.removeIndex('users', 'idx_users_stripe_verification_session_id');
      console.log('Index removed');
    } catch {
      console.log('Index did not exist, skipping...');
    }

    // Remove columns
    await queryInterface.removeColumn('users', 'identityVerificationStatus');
    await queryInterface.removeColumn('users', 'stripeVerificationSessionId');
    await queryInterface.removeColumn('users', 'identityVerifiedAt');
    await queryInterface.removeColumn('users', 'identityVerified');

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
