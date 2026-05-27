import { UserAgent, UserAgentStatus, AgentCatalog } from '../../models';
import { PolicyEngine } from './PolicyEngine';
import agentJobsService, { type EnqueueInput } from '../../services/agentJobs.service';
import logger from '../../utils/logger';

interface GateInput extends EnqueueInput {
  agentSlug: string;
  taskName: string;
  policyKey?: string;
  policyDefault?: boolean;
}

/**
 * Triple-gate enqueue:
 *   (a) agent is admin-global OR target user has hired the agent
 *   (b) policy is on (defaults to true if not specified)
 *   (c) no duplicate pending/running job for the same (agent, task, user, target)
 *
 * Silent no-op if any gate fails. Logs at debug level for diagnosis.
 */
export async function gateAndEnqueue(input: GateInput): Promise<'enqueued' | 'duplicate' | 'not-hired' | 'policy-off' | 'error'> {
  try {
    // Gate A — hired-or-admin-global
    const catalogRow = await AgentCatalog.findByPk(input.agentSlug);
    if (!catalogRow) {
      logger.warn(`gateAndEnqueue: no catalog row for '${input.agentSlug}'`);
      return 'error';
    }
    if (!catalogRow.isAdminOnly && input.userId) {
      const hired = await UserAgent.findOne({
        where: { userId: input.userId, agentSlug: input.agentSlug, status: UserAgentStatus.ACTIVE },
      });
      if (!hired) return 'not-hired';
    }

    // Gate B — policy on
    if (input.policyKey) {
      const policyValue = await PolicyEngine.getPolicy(
        input.userId ?? null,
        input.agentSlug,
        input.policyKey,
        input.policyDefault ?? true
      );
      if (!policyValue) return 'policy-off';
    }

    // Gate C — no duplicate
    const { created } = await agentJobsService.enqueueIfNoDuplicate(input);
    return created ? 'enqueued' : 'duplicate';
  } catch (err) {
    logger.warn(`gateAndEnqueue(${input.agentSlug}/${input.taskName}) failed (fail-open)`, {
      error: (err as Error).message,
    });
    return 'error';
  }
}
