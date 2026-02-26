import sequelize from '../config/database';
import { Subscription, SubscriptionPlan, SubscriptionStatus, User } from '../models';
import { pricingConfigService } from '../services/pricingConfigService';
import { addMonths } from 'date-fns';

async function seedAdminSubscription() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.sync({ force: false });

    const email = 'admin@admin.com';
    const user = await User.findOne({ where: { email } });

    if (!user) {
      console.error(`User with email "${email}" not found`);
      process.exit(1);
    }

    const planKey = SubscriptionPlan.PREMIUM;
    const planDetails = await pricingConfigService.getSubscriptionPlan(planKey);

    const renewalDate = addMonths(new Date(), 1);

    const existing = await Subscription.findOne({ where: { userId: user.id } });

    if (existing) {
      await existing.update({
        plan: planKey,
        status: SubscriptionStatus.ACTIVE,
        priceMonthly: planDetails.priceMonthly,
        priceYearly: planDetails.priceYearly,
        isYearly: false,
        creditsPerMonth: planDetails.credits,
        creditsRemaining: planDetails.credits,
        startDate: new Date(),
        renewalDate,
        cancelledAt: null,
      });
      console.log(`Updated subscription for ${email} to ${planKey}`);
    } else {
      await Subscription.create({
        userId: user.id,
        plan: planKey,
        status: SubscriptionStatus.ACTIVE,
        priceMonthly: planDetails.priceMonthly,
        priceYearly: planDetails.priceYearly,
        isYearly: false,
        creditsPerMonth: planDetails.credits,
        creditsRemaining: planDetails.credits,
        startDate: new Date(),
        renewalDate,
      });
      console.log(`Created subscription for ${email}: ${planKey}`);
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seedAdminSubscription();
