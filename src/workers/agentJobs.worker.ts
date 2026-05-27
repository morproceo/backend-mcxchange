import { randomBytes } from 'crypto';
import { AgentRegistry } from '../agents/core/AgentRegistry';
import agentJobsService from '../services/agentJobs.service';
import config from '../config';
import logger from '../utils/logger';
import type { AgentContext } from '../agents/core/types';

const workerId = `worker-${process.pid}-${randomBytes(4).toString('hex')}`;
let timer: NodeJS.Timeout | null = null;
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const job = await agentJobsService.claimNext(workerId);
    if (!job) return;

    const agent = AgentRegistry.get(job.agentSlug);
    if (!agent) {
      logger.error(`Worker: no agent registered for slug '${job.agentSlug}' (job ${job.id})`);
      await agentJobsService.scheduleRetryOrFail(job.id, new Error(`No agent registered for slug '${job.agentSlug}'`));
      return;
    }

    const runner = (agent as any).runTask?.bind(agent);
    if (typeof runner !== 'function') {
      await agentJobsService.scheduleRetryOrFail(
        job.id,
        new Error(`Agent '${job.agentSlug}' does not implement runTask(name, input, ctx)`)
      );
      return;
    }

    const ctx: AgentContext = {
      userId: job.userId ?? null,
      triggeredBy: job.triggeredBy,
      triggeredByUserId: job.triggeredByUserId,
    };

    try {
      const output = await runner(job.taskName, job.inputData || {}, ctx);
      await agentJobsService.complete(job.id, output as any);
    } catch (err) {
      logger.warn(`Worker: task ${job.agentSlug}/${job.taskName} threw`, { error: (err as Error).message });
      await agentJobsService.scheduleRetryOrFail(job.id, err as Error);
    }
  } catch (err) {
    logger.error('Worker tick: unhandled error', { error: (err as Error).message });
  } finally {
    ticking = false;
  }
}

export function startAgentWorker() {
  if (!config.agents.enableWorker) {
    logger.info('Agent worker disabled (ENABLE_AGENT_WORKER != true)');
    return;
  }
  if (timer) {
    logger.warn('Agent worker already started');
    return;
  }
  const interval = config.agents.workerIntervalMs;
  timer = setInterval(tick, interval);
  logger.info(`Agent worker started (${workerId}); polling every ${interval}ms`);
}

export function stopAgentWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Agent worker stopped');
  }
}
