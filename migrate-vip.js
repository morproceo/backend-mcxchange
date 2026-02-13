const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection(process.env.JAWSDB_URL);
  console.log('Connected to database');

  // Check if isVip column exists
  const [cols] = await conn.query("SHOW COLUMNS FROM listings LIKE 'isVip'");
  if (cols.length > 0) {
    console.log('isVip column already exists');
  } else {
    await conn.query('ALTER TABLE listings ADD COLUMN isVip TINYINT(1) DEFAULT 0');
    console.log('Added isVip column to listings table');
  }

  // Add indexes safely
  try {
    await conn.query('ALTER TABLE listings ADD INDEX listings_is_vip (isVip)');
    console.log('Added isVip index');
  } catch (e) {
    console.log('isVip index skipped:', e.message);
  }

  try {
    await conn.query('ALTER TABLE listings ADD INDEX idx_listings_search_filters (status, state, isPremium, isVip)');
    console.log('Added composite search filters index');
  } catch (e) {
    console.log('Composite index skipped:', e.message);
  }

  await conn.end();
  console.log('Migration complete!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
