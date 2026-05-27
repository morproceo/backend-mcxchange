import { BaseAgent } from '../core/BaseAgent';
import { AgentRegistry } from '../core/AgentRegistry';
import type { AgentContext, TaskDef } from '../core/types';

/**
 * Scout — Lead Intelligence specialist.
 * Tasks:
 *   - ping (no-op, foundation health check)
 *   - enrich_lead (reactive on Lead.afterCreate)
 *   - weekly_lead_digest (scheduled, self-rescheduling per admin rep)
 */
class ScoutAgent extends BaseAgent {
  private tasks = new Map<string, TaskDef>();

  constructor() {
    super({
      slug: 'scout',
      name: 'Scout',
      description: 'Hunts and qualifies leads, enriches carrier data, and surfaces what to chase this week.',
    });
    this.registerTask({
      name: 'ping',
      agent: 'scout',
      summary: 'Health-check task — proves the queue→worker→action loop with no LLM call.',
      decisionAuthority: 'advise',
      run: async (input, ctx) => this.runPing(input, ctx),
    });
  }

  getDefaultPolicies() {
    return {
      auto_enrich_enabled: true,
      auto_enrich_confidence_min: 0.7,
      weekly_digest_enabled: true,
      weekly_digest_day_of_week: 1,
    };
  }

  registerTask(def: TaskDef<any, any>) {
    this.tasks.set(def.name, def as TaskDef);
  }

  listTasks(): TaskDef[] {
    return Array.from(this.tasks.values());
  }

  async runTask(name: string, input: Record<string, unknown>, ctx: AgentContext) {
    const task = this.tasks.get(name);
    if (!task) throw new Error(`Scout has no task '${name}'`);
    return await task.run(input, ctx);
  }

  // ---- tasks ----

  private async runPing(input: Record<string, unknown>, ctx: AgentContext) {
    const startedAt = new Date().toISOString();
    await this.logAction(
      {
        actionType: 'ping',
        triggeredBy: ctx.triggeredBy || 'manual',
        inputData: input,
        outputData: { ok: true, startedAt, message: 'Scout is alive.' },
      },
      ctx
    );
    return { ok: true, startedAt };
  }
}

export const scoutAgent = new ScoutAgent();
AgentRegistry.register('scout', scoutAgent);
export default scoutAgent;
