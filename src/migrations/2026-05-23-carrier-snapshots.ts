/**
 * Migration: Carrier pulse (Block G — phase 1.5).
 *
 * Adds two tables that cache LINQ /report per managed company so:
 *   - the company workspace renders from MySQL (no LINQ round-trip)
 *   - we can diff against the previous snapshot on refresh and emit change events
 *
 * Idempotent.
 */
import { Sequelize } from 'sequelize';

const JAWSDB_URL = process.env.JAWSDB_URL;
if (!JAWSDB_URL) { console.error('JAWSDB_URL required'); process.exit(1); }

const sequelize = new Sequelize(JAWSDB_URL, { dialect: 'mysql', logging: console.log });

async function run() {
  try {
    console.log('=== Migration: carrier snapshots + change events ===\n');

    console.log('1. Creating carrier_snapshots…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS carrier_snapshots (
        managedCompanyId CHAR(36) NOT NULL PRIMARY KEY,
        lastFetchedAt DATETIME NOT NULL,
        payloadJson JSON NOT NULL,
        legalName VARCHAR(255) NULL,
        dbaName VARCHAR(255) NULL,
        mcDocket VARCHAR(32) NULL,
        operatingStatus VARCHAR(32) NULL,
        safetyRating VARCHAR(32) NULL,
        powerUnits INT NULL,
        totalDrivers INT NULL,
        state VARCHAR(2) NULL,
        city VARCHAR(100) NULL,
        phone VARCHAR(50) NULL,
        email VARCHAR(255) NULL,
        earliestCancellationDate DATE NULL,
        totalActiveCoverage DECIMAL(12,2) NULL,
        chameleonRiskLevel VARCHAR(16) NULL,
        chameleonScore INT NULL,
        crashes24mo INT NULL,
        inspections24mo INT NULL,
        driverOosRate DECIMAL(5,2) NULL,
        vehicleOosRate DECIMAL(5,2) NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX carrier_snapshots_status (operatingStatus),
        INDEX carrier_snapshots_safety (safetyRating),
        INDEX carrier_snapshots_cancel (earliestCancellationDate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ carrier_snapshots ready');

    console.log('2. Creating carrier_change_events…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS carrier_change_events (
        id CHAR(36) NOT NULL PRIMARY KEY,
        managedCompanyId CHAR(36) NOT NULL,
        field VARCHAR(120) NOT NULL,
        oldValue JSON NULL,
        newValue JSON NULL,
        severity ENUM('INFO','WARN','CRITICAL') NOT NULL DEFAULT 'INFO',
        description VARCHAR(500) NULL,
        acknowledged TINYINT(1) NOT NULL DEFAULT 0,
        acknowledgedAt DATETIME NULL,
        detectedAt DATETIME NOT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX carrier_change_events_company_time (managedCompanyId, detectedAt),
        INDEX carrier_change_events_sev_ack (severity, acknowledged)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ carrier_change_events ready');

    console.log('\n=== Migration complete ===');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
