import { Lead, LeadStatus, Notification, NotificationType, ActionStatus, User, UserRole } from '../../../models';
import scoutAgent from '../ScoutAgent';
import agentJobsService from '../../../services/agentJobs.service';
import { PolicyEngine } from '../../core/PolicyEngine';
import type { AgentContext, TaskDef } from '../../core/types';

interface Input {
  adminUserId: string;
}

const SYSTEM = `You are Scout, Domilea's lead-intelligence specialist. Produce a tight weekly digest for an admin rep. Output Markdown:

# Weekly digest – {date}
**Pipeline:** counts by status, plain English.
**Chase first (oldest CONTACTED):** up to 3 bullets, name + last touch + suggested next step.
**Insurance expiring next 14 days:** up to 5 bullets with DOT, name, cancel date.
**Notes:** one short observation about the rep's pipeline shape.

Stay under 250 words. Never invent rows; if a section has no data, write "none this week".`;

interface PipelineSummary {
  byStatus: Record<LeadStatus, number>;
  oldestContacted: Array<{ id: string; carrier: string; lastContactedAt: string | null; dotNumber: string }>;
  upcomingCancels: Array<{ dotNumber: string; carrier: string; cancelDate: string }>;
  totalLeads: number;
}

async function buildSummary(adminUserId: string): Promise<PipelineSummary> {
  const leads = await Lead.findAll({
    where: { assignedToUserId: adminUserId },
    order: [['lastContactedAt', 'ASC']],
  });
  const byStatus = {} as Record<LeadStatus, number>;
  for (const s of Object.values(LeadStatus)) byStatus[s] = 0;
  for (const l of leads) byStatus[l.status] = (byStatus[l.status] || 0) + 1;

  const oldestContacted = leads
    .filter((l) => l.status === LeadStatus.CONTACTED)
    .slice(0, 3)
    .map((l) => ({
      id: l.id,
      carrier: l.carrierNameSnapshot || `DOT ${l.dotNumber}`,
      lastContactedAt: l.lastContactedAt ? l.lastContactedAt.toISOString().slice(0, 10) : null,
      dotNumber: l.dotNumber,
    }));

  // Upcoming cancellations come from the Lead's own denormalized snapshot field
  // (populated by Scout's enrich_lead on save + refresh).
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const upcomingCancels = leads
    .filter((l) => {
      const d = l.insuranceCancellationSnapshot ? String(l.insuranceCancellationSnapshot) : null;
      return d && d >= today && d <= horizon;
    })
    .sort((a, b) => String(a.insuranceCancellationSnapshot).localeCompare(String(b.insuranceCancellationSnapshot)))
    .slice(0, 5)
    .map((l) => ({
      dotNumber: l.dotNumber,
      carrier: l.carrierNameSnapshot || `DOT ${l.dotNumber}`,
      cancelDate: String(l.insuranceCancellationSnapshot).slice(0, 10),
    }));

  return {
    byStatus,
    oldestContacted,
    upcomingCancels,
    totalLeads: leads.length,
  };
}

function nextMondayMorning(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun … 6=Sat
  const daysUntilMonday = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(8, 0, 0, 0);
  return d;
}

export const weeklyLeadDigestTask: TaskDef<Input> = {
  name: 'weekly_lead_digest',
  agent: 'scout',
  summary: 'Per-admin weekly summary of what to chase this week; advisory only (no mutations). Self-reschedules.',
  policyKeys: ['weekly_digest_enabled'],
  decisionAuthority: 'advise',

  async run(input: Input, ctx: AgentContext) {
    if (!input.adminUserId) return { ok: false, reason: 'adminUserId required' };

    // Policy check (in addition to the gate, since manual triggers don't gate)
    const enabled = await PolicyEngine.getPolicy<boolean>(
      input.adminUserId,
      'scout',
      'weekly_digest_enabled',
      true
    );
    if (!enabled) {
      await scoutAgent.logAction(
        {
          actionType: 'weekly_lead_digest',
          status: ActionStatus.COMPLETED,
          targetType: 'user',
          targetId: input.adminUserId,
          outputData: { skipped: 'policy_off' },
          triggeredBy: ctx.triggeredBy,
        },
        { ...ctx, userId: input.adminUserId }
      );
      return { ok: true, skipped: 'policy_off' };
    }

    // GATHER
    const summary = await buildSummary(input.adminUserId);

    // REASON
    let digest = '';
    let inferenceId: string | null = null;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { content, inferenceId: iid } = await scoutAgent.callLLM(
        {
          promptType: 'weekly_lead_digest',
          system: SYSTEM.replace('{date}', today),
          messages: [{ role: 'user', content: `Rep pipeline:\n${JSON.stringify(summary, null, 2)}` }],
          model: 'gpt-4o',
          maxTokens: 600,
          jsonMode: false,
        },
        { ...ctx, userId: input.adminUserId }
      );
      inferenceId = iid;
      digest = content || '';
    } catch (err) {
      await scoutAgent.logAction(
        {
          actionType: 'weekly_lead_digest',
          targetType: 'user',
          targetId: input.adminUserId,
          status: ActionStatus.FAILED,
          errorMessage: (err as Error).message,
          triggeredBy: ctx.triggeredBy,
        },
        { ...ctx, userId: input.adminUserId }
      );
      // Still self-reschedule even on failure
      await selfReschedule(input.adminUserId);
      return { ok: false, reason: 'llm_failed', error: (err as Error).message };
    }

    // ACT — write a Notification for the rep
    try {
      await Notification.create({
        userId: input.adminUserId,
        type: NotificationType.SYSTEM,
        title: 'Scout · Weekly lead digest',
        message: digest.slice(0, 4000),
        link: '/admin/team/scout',
      } as any);
    } catch (err) {
      // log but don't fail the task
      console.warn('weekly_lead_digest: Notification.create failed', err);
    }

    // AUDIT
    await scoutAgent.logAction(
      {
        actionType: 'weekly_lead_digest',
        targetType: 'user',
        targetId: input.adminUserId,
        triggeredBy: ctx.triggeredBy,
        inputData: { totalLeads: summary.totalLeads },
        outputData: {
          summary: digest.slice(0, 500),
          byStatus: summary.byStatus,
          upcomingCancels: summary.upcomingCancels.length,
        },
        inferenceId: inferenceId || undefined,
      },
      { ...ctx, userId: input.adminUserId }
    );

    // Self-reschedule
    await selfReschedule(input.adminUserId);

    return { ok: true, digestPreview: digest.slice(0, 200) };
  },
};

async function selfReschedule(adminUserId: string) {
  await agentJobsService.enqueueIfNoDuplicate({
    userId: adminUserId,
    agentSlug: 'scout',
    taskName: 'weekly_lead_digest',
    inputData: { adminUserId },
    triggeredBy: 'scheduled:weekly_digest',
    scheduledFor: nextMondayMorning(),
    priority: 4,
    targetType: 'user',
    targetId: adminUserId,
  });
}

/**
 * Idempotent: for every active admin, ensure a pending digest job exists.
 * Called at boot. Re-runs do nothing if a job is already pending.
 */
export async function armScoutDigests(): Promise<{ checked: number; armed: number }> {
  const admins = await User.findAll({ where: { role: UserRole.ADMIN }, attributes: ['id'] });
  let armed = 0;
  for (const a of admins) {
    const { created } = await agentJobsService.enqueueIfNoDuplicate({
      userId: a.id,
      agentSlug: 'scout',
      taskName: 'weekly_lead_digest',
      inputData: { adminUserId: a.id },
      triggeredBy: 'boot:arm',
      scheduledFor: nextMondayMorning(),
      priority: 4,
      targetType: 'user',
      targetId: a.id,
    });
    if (created) armed++;
  }
  return { checked: admins.length, armed };
}

export default weeklyLeadDigestTask;
