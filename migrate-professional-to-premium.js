const mysql = require('mysql2/promise');

async function migrateProfessionalToPremium() {
  const conn = await mysql.createConnection(process.env.JAWSDB_URL);
  console.log('Connected to database');

  // Check current ENUM values for plan column
  const [cols] = await conn.query("SHOW COLUMNS FROM subscriptions LIKE 'plan'");
  console.log('Current plan column:', cols[0].Type);

  // Step 1: Add PREMIUM to the ENUM (keep PROFESSIONAL temporarily)
  await conn.query("ALTER TABLE subscriptions MODIFY COLUMN plan ENUM('STARTER','PROFESSIONAL','PREMIUM','ENTERPRISE','VIP_ACCESS') NOT NULL");
  console.log('Step 1: Added PREMIUM to ENUM');

  // Step 2: Migrate all PROFESSIONAL rows to PREMIUM
  const [result] = await conn.query("UPDATE subscriptions SET plan = 'PREMIUM' WHERE plan = 'PROFESSIONAL'");
  console.log(`Step 2: Migrated ${result.affectedRows} rows from PROFESSIONAL to PREMIUM`);

  // Step 3: Remove PROFESSIONAL from the ENUM
  await conn.query("ALTER TABLE subscriptions MODIFY COLUMN plan ENUM('STARTER','PREMIUM','ENTERPRISE','VIP_ACCESS') NOT NULL");
  console.log('Step 3: Removed PROFESSIONAL from ENUM');

  // Step 4: Rename platform_settings keys from professional_* to premium_*
  const keysToRename = [
    ['professional_credits', 'premium_credits'],
    ['professional_price_monthly', 'premium_price_monthly'],
    ['professional_price_yearly', 'premium_price_yearly'],
    ['professional_stripe_monthly', 'premium_stripe_monthly'],
    ['professional_stripe_yearly', 'premium_stripe_yearly'],
    ['professional_features', 'premium_features'],
  ];

  for (const [oldKey, newKey] of keysToRename) {
    const [updateResult] = await conn.query(
      "UPDATE platform_settings SET `key` = ? WHERE `key` = ?",
      [newKey, oldKey]
    );
    if (updateResult.affectedRows > 0) {
      console.log(`Step 4: Renamed ${oldKey} → ${newKey}`);
    } else {
      console.log(`Step 4: Key ${oldKey} not found (may not exist yet)`);
    }
  }

  // Verify
  const [verCols] = await conn.query("SHOW COLUMNS FROM subscriptions LIKE 'plan'");
  console.log('\nFinal plan column:', verCols[0].Type);

  const [subs] = await conn.query("SELECT id, plan, status FROM subscriptions");
  console.log('Current subscriptions:', subs);

  await conn.end();
  console.log('\nMigration complete!');
}

migrateProfessionalToPremium().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
