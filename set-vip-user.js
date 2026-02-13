const mysql = require('mysql2/promise');
const crypto = require('crypto');

async function setVipUser() {
  const conn = await mysql.createConnection(process.env.JAWSDB_URL);
  console.log('Connected to database');

  // Find user yamil@morpro.io
  const [users] = await conn.query("SELECT id, email, name, role, stripeCustomerId FROM users WHERE email = 'yamil@morpro.io'");
  if (users.length === 0) {
    console.log('User yamil@morpro.io not found!');
    await conn.end();
    return;
  }

  const user = users[0];
  console.log('Found user:', user.id, user.email, user.name, 'role:', user.role);

  // Check if user already has a subscription
  const [subs] = await conn.query("SELECT id, plan, status FROM subscriptions WHERE userId = ?", [user.id]);
  if (subs.length > 0) {
    console.log('Existing subscription:', subs[0].id, 'plan:', subs[0].plan, 'status:', subs[0].status);
    // Update existing subscription to VIP_ACCESS
    await conn.query(
      "UPDATE subscriptions SET plan = 'VIP_ACCESS', status = 'ACTIVE', creditsPerMonth = 999, creditsRemaining = 999, startDate = NOW(), endDate = DATE_ADD(NOW(), INTERVAL 1 YEAR), renewalDate = DATE_ADD(NOW(), INTERVAL 1 MONTH), updatedAt = NOW() WHERE userId = ?",
      [user.id]
    );
    console.log('Updated existing subscription to VIP_ACCESS');
  } else {
    // Create new VIP subscription
    const id = crypto.randomUUID();
    await conn.query(
      "INSERT INTO subscriptions (id, plan, status, priceMonthly, priceYearly, isYearly, creditsPerMonth, creditsRemaining, stripeCustomerId, startDate, endDate, renewalDate, userId, createdAt, updatedAt) VALUES (?, 'VIP_ACCESS', 'ACTIVE', 0, 0, 0, 999, 999, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), DATE_ADD(NOW(), INTERVAL 1 MONTH), ?, NOW(), NOW())",
      [id, user.stripeCustomerId || null, user.id]
    );
    console.log('Created new VIP_ACCESS subscription:', id);
  }

  // Verify
  const [result] = await conn.query("SELECT id, plan, status, creditsPerMonth, creditsRemaining, startDate, endDate FROM subscriptions WHERE userId = ?", [user.id]);
  console.log('Verified subscription:', result[0]);

  await conn.end();
  console.log('Done!');
}

setVipUser().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
