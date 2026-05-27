import { AgentPolicy, PolicyScope } from '../../models';
import logger from '../../utils/logger';

/**
 * Per-user policy override > agent default > caller default.
 * userId === null falls back to scope=platform overrides only.
 */
class Engine {
  async getPolicy<T = unknown>(
    userId: string | null,
    agentSlug: string,
    key: string,
    defaultValue: T
  ): Promise<T> {
    try {
      if (userId) {
        const userRow = await AgentPolicy.findOne({
          where: { scope: PolicyScope.USER, userId, agentSlug, key },
        });
        if (userRow) return userRow.value as T;
      }
      const platformRow = await AgentPolicy.findOne({
        where: { scope: PolicyScope.PLATFORM, agentSlug, key },
      });
      if (platformRow) return platformRow.value as T;
      return defaultValue;
    } catch (err) {
      logger.warn(`PolicyEngine.getPolicy(${agentSlug}/${key}) failed, falling back to default`, {
        error: (err as Error).message,
      });
      return defaultValue;
    }
  }

  async setPolicy(
    scope: PolicyScope,
    userId: string | null,
    agentSlug: string,
    key: string,
    value: unknown
  ) {
    const existing = await AgentPolicy.findOne({ where: { scope, userId, agentSlug, key } });
    if (existing) {
      await existing.update({ value });
      return existing;
    }
    return await AgentPolicy.create({ scope, userId, agentSlug, key, value } as any);
  }

  async listPolicies(userId: string | null, agentSlug: string) {
    return await AgentPolicy.findAll({
      where: userId
        ? { agentSlug, userId, scope: PolicyScope.USER }
        : { agentSlug, scope: PolicyScope.PLATFORM },
    });
  }
}

export const PolicyEngine = new Engine();
