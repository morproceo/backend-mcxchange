/**
 * Migration: Compliance module (Block G).
 *
 * - Extends users.role enum with COMPLIANCE_MANAGER
 * - Adds users.trialEndsAt column
 * - Extends notifications.type enum with COMPLIANCE (Phase 2 will write to it)
 * - Creates 4 new tables: managed_companies, compliance_documents, drivers, driver_documents
 *
 * Idempotent — safe to re-run. MySQL ALTER ENUM is idempotent (re-stating the
 * same value list is a no-op).
 *
 * Run:
 *   JAWSDB_URL=mysql://… npx ts-node src/migrations/2026-05-22-add-compliance-module.ts
 */
import { Sequelize } from 'sequelize';

const JAWSDB_URL = process.env.JAWSDB_URL;
if (!JAWSDB_URL) {
  console.error('JAWSDB_URL environment variable is required');
  process.exit(1);
}

const sequelize = new Sequelize(JAWSDB_URL, { dialect: 'mysql', logging: console.log });

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'`
  );
  return (rows as unknown[]).length > 0;
}

async function run() {
  try {
    console.log('=== Migration: Compliance module (Block G) ===\n');

    console.log('1. Extending users.role enum with COMPLIANCE_MANAGER…');
    await sequelize.query(
      `ALTER TABLE users MODIFY COLUMN role ENUM('BUYER','SELLER','ADMIN','COMPLIANCE_MANAGER') NOT NULL`
    );
    console.log('   ✓ users.role updated');

    console.log('2. Adding users.trialEndsAt column…');
    if (await columnExists('users', 'trialEndsAt')) {
      console.log('   · already present');
    } else {
      await sequelize.query(`ALTER TABLE users ADD COLUMN trialEndsAt DATETIME NULL`);
      console.log('   ✓ users.trialEndsAt added');
    }

    console.log('3. Extending notifications.type enum with COMPLIANCE…');
    await sequelize.query(
      `ALTER TABLE notifications MODIFY COLUMN type
       ENUM('OFFER','MESSAGE','VERIFICATION','REVIEW','TRANSACTION','SYSTEM','PAYMENT','COMPLIANCE') NOT NULL`
    );
    console.log('   ✓ notifications.type updated');

    console.log('4. Creating managed_companies…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS managed_companies (
        id CHAR(36) NOT NULL PRIMARY KEY,
        userId CHAR(36) NOT NULL,
        dotNumber VARCHAR(20) NOT NULL,
        label VARCHAR(255) NULL,
        notes TEXT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        UNIQUE KEY managed_companies_user_dot (userId, dotNumber),
        INDEX managed_companies_user (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ managed_companies ready');

    console.log('5. Creating compliance_documents…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS compliance_documents (
        id CHAR(36) NOT NULL PRIMARY KEY,
        managedCompanyId CHAR(36) NOT NULL,
        kind ENUM('COI','AUTHORITY','MCS150','IFTA','IRP','UCR','DRUG_PROGRAM','BOC3','OTHER') NOT NULL,
        title VARCHAR(255) NOT NULL,
        expiresOn DATE NULL,
        notes TEXT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX compliance_documents_company_expiry (managedCompanyId, expiresOn),
        INDEX compliance_documents_kind (kind)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ compliance_documents ready');

    console.log('6. Creating drivers…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id CHAR(36) NOT NULL PRIMARY KEY,
        managedCompanyId CHAR(36) NOT NULL,
        fullName VARCHAR(255) NOT NULL,
        cdlNumber VARCHAR(64) NULL,
        cdlState VARCHAR(2) NULL,
        cdlExpiresOn DATE NULL,
        hireDate DATE NULL,
        status ENUM('ACTIVE','INACTIVE','ONBOARDING','TERMINATED') NOT NULL DEFAULT 'ACTIVE',
        notes TEXT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX drivers_company_status (managedCompanyId, status),
        INDEX drivers_cdl_expiry (cdlExpiresOn)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ drivers ready');

    console.log('7. Creating driver_documents…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS driver_documents (
        id CHAR(36) NOT NULL PRIMARY KEY,
        driverId CHAR(36) NOT NULL,
        kind ENUM('MEDICAL_CARD','DOT_PHYSICAL','MVR','DRUG_TEST','ROAD_TEST','EMPLOYMENT_APP','BACKGROUND_CHECK','OTHER') NOT NULL,
        title VARCHAR(255) NOT NULL,
        expiresOn DATE NULL,
        notes TEXT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX driver_documents_driver_expiry (driverId, expiresOn),
        INDEX driver_documents_kind (kind)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ driver_documents ready');

    console.log('\n8. Verifying…');
    const expected = ['managed_companies', 'compliance_documents', 'drivers', 'driver_documents'];
    for (const t of expected) {
      const [rows] = await sequelize.query(`SHOW TABLES LIKE '${t}'`);
      if ((rows as unknown[]).length === 0) throw new Error(`Verification failed: ${t} not found`);
    }
    if (!(await columnExists('users', 'trialEndsAt'))) {
      throw new Error('Verification failed: users.trialEndsAt not present');
    }
    console.log('   ✓ All schema changes verified');

    console.log('\n=== Migration complete ===');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
