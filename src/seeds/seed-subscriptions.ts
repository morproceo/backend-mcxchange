import sequelize from '../config/database';
import { Subscription, SubscriptionPlan, SubscriptionStatus, User } from '../models';
import { addMonths, subMonths } from 'date-fns';

/**
 * Seeds subscriptions for multiple users so the admin /admin/users page
 * shows a variety of subscription tier badges and statuses.
 *
 * Run: npx ts-node src/seeds/seed-subscriptions.ts
 */
async function seedSubscriptions() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
    await sequelize.sync({ force: false });

    const plans: Array<{
      email: string;
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      priceMonthly: number;
      credits: number;
    }> = [
      // Admin → Premium (active)
      {
        email: 'admin@admin.com',
        plan: SubscriptionPlan.PREMIUM,
        status: SubscriptionStatus.ACTIVE,
        priceMonthly: 19.99,
        credits: 15,
      },
      // Seller 1 → Starter (active)
      {
        email: 'seller@test.com',
        plan: SubscriptionPlan.STARTER,
        status: SubscriptionStatus.ACTIVE,
        priceMonthly: 9.99,
        credits: 5,
      },
      // Seller 2 → Enterprise (active)
      {
        email: 'seller2@test.com',
        plan: SubscriptionPlan.ENTERPRISE,
        status: SubscriptionStatus.ACTIVE,
        priceMonthly: 39.99,
        credits: 25,
      },
      // Seller 3 → Premium (past due)
      {
        email: 'seller3@test.com',
        plan: SubscriptionPlan.PREMIUM,
        status: SubscriptionStatus.PAST_DUE,
        priceMonthly: 19.99,
        credits: 15,
      },
      // Seller 4 → Starter (cancelled)
      {
        email: 'seller4@test.com',
        plan: SubscriptionPlan.STARTER,
        status: SubscriptionStatus.CANCELLED,
        priceMonthly: 9.99,
        credits: 5,
      },
      // Buyer (VIP) → Enterprise (already exists from seed-all, will update)
      {
        email: 'buyer@test.com',
        plan: SubscriptionPlan.ENTERPRISE,
        status: SubscriptionStatus.ACTIVE,
        priceMonthly: 39.99,
        credits: 25,
      },
      // Buyer 2 → VIP_ACCESS (active)
      {
        email: 'buyer2@test.com',
        plan: SubscriptionPlan.VIP_ACCESS,
        status: SubscriptionStatus.ACTIVE,
        priceMonthly: 99.99,
        credits: 50,
      },
      // Seller 5 → no subscription (skip)
    ];

    for (const p of plans) {
      const user = await User.findOne({ where: { email: p.email } });
      if (!user) {
        console.log(`User not found: ${p.email} — skipping`);
        continue;
      }

      const existing = await Subscription.findOne({ where: { userId: user.id } });

      const data = {
        plan: p.plan,
        status: p.status,
        priceMonthly: p.priceMonthly,
        isYearly: false,
        creditsPerMonth: p.credits,
        creditsRemaining: p.credits,
        startDate: subMonths(new Date(), 2),
        renewalDate: addMonths(new Date(), 1),
        cancelledAt: p.status === SubscriptionStatus.CANCELLED ? new Date() : null,
      };

      if (existing) {
        await existing.update(data);
        console.log(`Updated ${p.email} → ${p.plan} (${p.status})`);
      } else {
        await Subscription.create({ userId: user.id, ...data } as any);
        console.log(`Created ${p.email} → ${p.plan} (${p.status})`);
      }
    }

    console.log('\n========================================');
    console.log('  SUBSCRIPTION SEED COMPLETE!');
    console.log('========================================');
    console.log('');
    console.log('  admin@admin.com     → PREMIUM (Active)');
    console.log('  seller@test.com     → STARTER (Active)');
    console.log('  seller2@test.com    → ENTERPRISE (Active)');
    console.log('  seller3@test.com    → PREMIUM (Past Due)');
    console.log('  seller4@test.com    → STARTER (Cancelled)');
    console.log('  buyer@test.com      → ENTERPRISE (Active)');
    console.log('  buyer2@test.com     → VIP_ACCESS (Active)');
    console.log('  seller5@test.com    → No Plan');
    console.log('========================================\n');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seedSubscriptions();
