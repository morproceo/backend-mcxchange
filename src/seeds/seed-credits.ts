import sequelize from '../config/database';
import { User, CreditTransaction, CreditTransactionType } from '../models';

async function seedCredits() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.sync({ force: false });

    const email = 'admin@admin.com';
    const creditsToAdd = 10;

    const user = await User.findOne({ where: { email } });

    if (!user) {
      console.error(`User with email "${email}" not found`);
      process.exit(1);
    }

    const newTotal = user.totalCredits + creditsToAdd;
    const t = await sequelize.transaction();

    try {
      await user.update({ totalCredits: newTotal }, { transaction: t });

      await CreditTransaction.create(
        {
          userId: user.id,
          type: CreditTransactionType.BONUS,
          amount: creditsToAdd,
          balance: newTotal - user.usedCredits,
          description: 'Seed: 10 bonus credits added manually',
          reference: 'seed-script',
        },
        { transaction: t }
      );

      await t.commit();

      console.log(`Successfully added ${creditsToAdd} credits to ${email}`);
      console.log(`  Previous total: ${user.totalCredits}`);
      console.log(`  New total:      ${newTotal}`);
      console.log(`  Used credits:   ${user.usedCredits}`);
      console.log(`  Available:      ${newTotal - user.usedCredits}`);
    } catch (error) {
      await t.rollback();
      throw error;
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seedCredits();
