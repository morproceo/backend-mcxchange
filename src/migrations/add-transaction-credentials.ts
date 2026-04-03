/**
 * Migration: Create transaction_credentials table
 * Stores encrypted login credentials that sellers provide to buyers.
 *
 * Run with:
 *   npx ts-node src/migrations/add-transaction-credentials.ts
 */
import { Sequelize } from 'sequelize';

const JAWSDB_URL = process.env.JAWSDB_URL;
if (!JAWSDB_URL) {
  console.error('JAWSDB_URL environment variable is required');
  process.exit(1);
}

const sequelize = new Sequelize(JAWSDB_URL, { dialect: 'mysql', logging: console.log });

async function run() {
  try {
    console.log('=== Migration: Create transaction_credentials table ===\n');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS transaction_credentials (
        id CHAR(36) NOT NULL PRIMARY KEY,
        transactionId CHAR(36) NOT NULL,
        label VARCHAR(255) NOT NULL,
        encryptedUsername TEXT NULL,
        encryptedPassword TEXT NOT NULL,
        iv VARCHAR(32) NOT NULL,
        authTag VARCHAR(32) NOT NULL,
        ivUsername VARCHAR(32) NULL,
        authTagUsername VARCHAR(32) NULL,
        releasedToBuyer TINYINT(1) NOT NULL DEFAULT 0,
        releasedAt DATETIME NULL,
        releasedBy CHAR(36) NULL,
        createdBy CHAR(36) NOT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX idx_credentials_transaction (transactionId),
        FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE,
        FOREIGN KEY (createdBy) REFERENCES users(id),
        FOREIGN KEY (releasedBy) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✓ transaction_credentials table created');
    console.log('\n=== Migration complete ===');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
