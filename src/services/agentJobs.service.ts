import { randomBytes } from 'crypto';
import { Op } from 'sequelize';
import { AgentJob, JobStatus, sequelize } from '../models';
import logger from '../utils/logger';

export interface EnqueueInput {
  userId?: string | null;
  agentSlug: string;
  taskName: string;
  inputData?: Record<string, unknown>;
  priority?: number;
  scheduledFor?: Date;
  targetType?: string;
  targetId?: string;
  triggeredBy?: string;
  triggeredByUserId?: string;
  maxRetries?: number;
}

class AgentJobsService {
  async enqueue(input: EnqueueInput): Promise<AgentJob> {
    return await AgentJob.create({
      userId: input.userId ?? null,
      agentSlug: input.agentSlug,
      taskName: input.taskName,
      inputData: input.inputData,
      status: JobStatus.PENDING,
      priority: input.priority ?? 5,
      scheduledFor: input.scheduledFor || null,
      targetType: input.targetType,
      targetId: input.targetId,
      triggeredBy: input.triggeredBy,
      triggeredByUserId: input.triggeredByUserId,
      maxRetries: input.maxRetries ?? 3,
    } as any);
  }

  /**
   * Atomic claim using a random token to prevent races between concurrent workers.
   * Returns the claimed job, or null if none eligible.
   */
  async claimNext(workerId: string): Promise<AgentJob | null> {
    const token = `${workerId}-${randomBytes(8).toString('hex')}`;
    const now = new Date();

    const [affected] = await sequelize.query(
      `UPDATE agent_jobs
         SET status = :running, claimedBy = :token, startedAt = :now
       WHERE status = :pending
         AND (scheduledFor IS NULL OR scheduledFor <= :now)
       ORDER BY priority DESC, createdAt ASC
       LIMIT 1`,
      {
        replacements: {
          running: JobStatus.RUNNING,
          pending: JobStatus.PENDING,
          token,
          now,
        },
      }
    );

    // affected count not exposed for UPDATE on all dialects; look up by token instead
    const job = await AgentJob.findOne({ where: { claimedBy: token } });
    if (!job) return null;
    return job;
  }

  async complete(jobId: string, outputData?: Record<string, unknown>): Promise<void> {
    await AgentJob.update(
      {
        status: JobStatus.COMPLETED,
        outputData,
        completedAt: new Date(),
      } as any,
      { where: { id: jobId } }
    );
  }

  async scheduleRetryOrFail(jobId: string, error: Error): Promise<void> {
    const job = await AgentJob.findByPk(jobId);
    if (!job) {
      logger.warn(`scheduleRetryOrFail: job ${jobId} not found`);
      return;
    }
    const nextRetry = job.retryCount + 1;
    if (nextRetry > job.maxRetries) {
      await job.update({
        status: JobStatus.FAILED,
        errorMessage: error.message,
        completedAt: new Date(),
        lastErrorAt: new Date(),
      } as any);
      return;
    }
    const backoffMs = Math.min(60_000, 1000 * Math.pow(2, nextRetry));
    await job.update({
      status: JobStatus.PENDING,
      retryCount: nextRetry,
      scheduledFor: new Date(Date.now() + backoffMs),
      errorMessage: error.message,
      lastErrorAt: new Date(),
      claimedBy: null,
      startedAt: null,
    } as any);
  }

  async cancel(jobId: string): Promise<void> {
    await AgentJob.update(
      { status: JobStatus.CANCELLED, completedAt: new Date() } as any,
      { where: { id: jobId, status: { [Op.in]: [JobStatus.PENDING, JobStatus.RUNNING] } } }
    );
  }

  async listRecent(filters: { agentSlug?: string; status?: JobStatus; limit?: number } = {}) {
    return await AgentJob.findAll({
      where: {
        ...(filters.agentSlug ? { agentSlug: filters.agentSlug } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      order: [['createdAt', 'DESC']],
      limit: filters.limit ?? 100,
    });
  }

  /**
   * Triple-gate enqueue: caller has already checked (a) "hired or admin-global"
   * and (b) policy is on; this just enforces (c) no duplicate pending/running
   * job for the same target. Returns the existing or newly-created job.
   */
  async enqueueIfNoDuplicate(input: EnqueueInput): Promise<{ job: AgentJob; created: boolean }> {
    const where: Record<string, unknown> = {
      agentSlug: input.agentSlug,
      taskName: input.taskName,
      status: { [Op.in]: [JobStatus.PENDING, JobStatus.RUNNING] },
    };
    if (input.userId !== undefined) where.userId = input.userId ?? null;
    if (input.targetType) where.targetType = input.targetType;
    if (input.targetId) where.targetId = input.targetId;

    const existing = await AgentJob.findOne({ where });
    if (existing) return { job: existing, created: false };
    const job = await this.enqueue(input);
    return { job, created: true };
  }
}

export const agentJobsService = new AgentJobsService();
export default agentJobsService;
