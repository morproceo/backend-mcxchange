import { Op, fn, col, literal } from 'sequelize';
import { AgentInference } from '../../models';
import config from '../../config';
import logger from '../../utils/logger';

export class SpendBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpendBudgetExceededError';
  }
}

class Guard {
  /**
   * Fail-open on the check itself (DB error = allow); block hard when over budget.
   * userId === null counts against the platform budget.
   */
  async assertLlmTokenBudget(userId: string | null, requestedTokens: number): Promise<void> {
    const cap = userId ? config.agents.dailyTokenBudgetUser : config.agents.dailyTokenBudgetPlatform;
    if (!cap || cap <= 0) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    try {
      const result = (await AgentInference.findOne({
        attributes: [[fn('SUM', literal('COALESCE(inputTokens,0) + COALESCE(outputTokens,0)')), 'totalTokens']],
        where: {
          createdAt: { [Op.gte]: todayStart },
          ...(userId ? { userId } : { userId: null }),
        },
        raw: true,
      })) as any;

      const usedToday = parseInt(result?.totalTokens || '0', 10) || 0;
      const projected = usedToday + Math.max(0, requestedTokens);

      if (projected > cap) {
        throw new SpendBudgetExceededError(
          `Daily token budget exceeded for ${userId ? `user ${userId}` : 'platform'}: ` +
            `${usedToday} used + ${requestedTokens} requested > cap ${cap}`
        );
      }
    } catch (err) {
      if (err instanceof SpendBudgetExceededError) throw err;
      logger.warn('SpendGuardrails.assertLlmTokenBudget: check failed (failing open)', {
        error: (err as Error).message,
      });
    }
  }
}

export const SpendGuardrails = new Guard();
