import bcrypt from 'bcryptjs';
import sequelize from '../config/database';
import config from '../config';
import { User, UserRole, UserStatus } from '../models';

const EMAIL = process.env.ADMIN_EMAIL || 'info@domilea.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'kvKaidJjrDyZJFBc';
const NAME = process.env.ADMIN_NAME || 'Domilea Admin';

(async () => {
  await sequelize.authenticate();

  const hashed = await bcrypt.hash(PASSWORD, config.security.bcryptRounds);
  const existing = await User.findOne({ where: { email: EMAIL.toLowerCase() } });

  if (existing) {
    await existing.update({
      password: hashed,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      verified: true,
    });
    console.log(`Updated existing user → ADMIN: ${EMAIL}`);
  } else {
    await User.create({
      email: EMAIL.toLowerCase(),
      password: hashed,
      name: NAME,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      verified: true,
      trustScore: 100,
      totalCredits: 0,
      usedCredits: 0,
    });
    console.log(`Created ADMIN user: ${EMAIL}`);
  }

  console.log(`Password: ${PASSWORD}`);
  await sequelize.close();
})().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
