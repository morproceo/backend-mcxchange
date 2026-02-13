const mysql = require('mysql2/promise');

async function fixVipEnum() {
  const conn = await mysql.createConnection(process.env.JAWSDB_URL);
  console.log('Connected to database');

  // Check current ENUM values for plan column
  const [cols] = await conn.query("SHOW COLUMNS FROM subscriptions LIKE 'plan'");
  console.log('Current plan column:', cols[0].Type);

  // Alter the ENUM to include VIP_ACCESS
  await conn.query("ALTER TABLE subscriptions MODIFY COLUMN plan ENUM('STARTER','PROFESSIONAL','ENTERPRISE','VIP_ACCESS') NOT NULL");
  console.log('Updated ENUM to include VIP_ACCESS');

  // Now set the user's plan to VIP_ACCESS
  const [users] = await conn.query("SELECT id FROM users WHERE email = 'yamil@morpro.io'");
  if (users.length > 0) {
    await conn.query("UPDATE subscriptions SET plan = 'VIP_ACCESS', updatedAt = NOW() WHERE userId = ?", [users[0].id]);
    console.log('Set user subscription plan to VIP_ACCESS');

    // Verify
    const [subs] = await conn.query("SELECT id, plan, status, creditsPerMonth, creditsRemaining, startDate, endDate FROM subscriptions WHERE userId = ?", [users[0].id]);
    console.log('Verified subscription:', subs[0]);
  }

  await conn.end();
  console.log('Done!');
}

fixVipEnum().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
