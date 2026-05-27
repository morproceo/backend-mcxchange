import type { BaseAgent } from './BaseAgent';
import logger from '../../utils/logger';

class Registry {
  private agents = new Map<string, BaseAgent>();

  register(slug: string, agent: BaseAgent) {
    if (this.agents.has(slug)) {
      logger.warn(`AgentRegistry: re-registering '${slug}' (likely hot-reload)`);
    }
    this.agents.set(slug, agent);
  }

  get(slug: string): BaseAgent | undefined {
    return this.agents.get(slug);
  }

  all(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  slugs(): string[] {
    return Array.from(this.agents.keys());
  }
}

export const AgentRegistry = new Registry();
