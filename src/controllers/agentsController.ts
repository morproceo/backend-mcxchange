import { Request, Response } from 'express';
import { Op, fn, literal } from 'sequelize';
import {
  AgentCatalog,
  UserAgent,
  UserAgentStatus,
  AgentAction,
  AgentInference,
  AgentJob,
  JobStatus,
  UserRole,
} from '../models';
import config from '../config';
import { AgentRegistry } from '../agents/core/AgentRegistry';
import { PolicyEngine } from '../agents/core/PolicyEngine';
import { PolicyScope } from '../models';
import agentJobsService from '../services/agentJobs.service';
import logger from '../utils/logger';

interface AuthedRequest extends Request {
  user?: { id: string; role: UserRole };
}

async function loadVisibleCatalog(role: UserRole) {
  const rows = await AgentCatalog.findAll({ where: { isActive: true }, order: [['name', 'ASC']] });
  return role === UserRole.ADMIN ? rows : rows.filter((r) => !r.isAdminOnly);
}

function assertCanSee(role: UserRole | undefined, catalogRow: AgentCatalog) {
  if (!catalogRow.isAdminOnly) return;
  if (role !== UserRole.ADMIN) {
    const err: any = new Error('Agent is admin-only');
    err.statusCode = 403;
    throw err;
  }
}

// GET /api/agents/catalog
export async function getCatalog(req: AuthedRequest, res: Response) {
  const role = req.user!.role;
  const rows = await loadVisibleCatalog(role);
  res.json({ success: true, data: rows });
}

// GET /api/agents/active
export async function getActive(req: AuthedRequest, res: Response) {
  const userId = req.user!.id;
  const rows = await UserAgent.findAll({
    where: { userId, status: UserAgentStatus.ACTIVE },
    include: [{ model: AgentCatalog, as: 'catalogEntry' }],
  });
  res.json({ success: true, data: rows });
}

// POST /api/agents/:slug/hire
export async function hire(req: AuthedRequest, res: Response) {
  const userId = req.user!.id;
  const { slug } = req.params;
  const catalogRow = await AgentCatalog.findByPk(slug);
  if (!catalogRow) return res.status(404).json({ success: false, error: 'Agent not found' });
  assertCanSee(req.user!.role, catalogRow);

  const [row, created] = await UserAgent.findOrCreate({
    where: { userId, agentSlug: slug },
    defaults: {
      userId,
      agentSlug: slug,
      status: UserAgentStatus.ACTIVE,
      subscriptionStartedAt: new Date(),
    } as any,
  });
  if (!created && row.status !== UserAgentStatus.ACTIVE) {
    await row.update({ status: UserAgentStatus.ACTIVE, subscriptionCancelledAt: null } as any);
  }
  res.status(created ? 201 : 200).json({ success: true, data: row });
}

// POST /api/agents/:slug/cancel
export async function cancel(req: AuthedRequest, res: Response) {
  const userId = req.user!.id;
  const { slug } = req.params;
  const row = await UserAgent.findOne({ where: { userId, agentSlug: slug } });
  if (!row) return res.status(404).json({ success: false, error: 'Not hired' });
  await row.update({ status: UserAgentStatus.CANCELLED, subscriptionCancelledAt: new Date() } as any);
  res.json({ success: true, data: row });
}

// GET /api/agents/:slug/policies
export async function getPolicies(req: AuthedRequest, res: Response) {
  const userId = req.user!.id;
  const { slug } = req.params;
  const agent = AgentRegistry.get(slug);
  const defaults = agent ? agent.getDefaultPolicies() : {};
  const overrides = await PolicyEngine.listPolicies(userId, slug);
  const overridesMap = Object.fromEntries(overrides.map((p) => [p.key, p.value]));
  const merged: Record<string, unknown> = { ...defaults };
  for (const k of Object.keys(overridesMap)) merged[k] = overridesMap[k];
  res.json({ success: true, data: { defaults, overrides: overridesMap, merged } });
}

// PUT /api/agents/:slug/policies
export async function putPolicies(req: AuthedRequest, res: Response) {
  const userId = req.user!.id;
  const { slug } = req.params;
  const updates = req.body as Record<string, unknown>;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, error: 'Body must be an object of policy keys' });
  }
  for (const [key, value] of Object.entries(updates)) {
    await PolicyEngine.setPolicy(PolicyScope.USER, userId, slug, key, value);
  }
  res.json({ success: true });
}

// GET /api/agents/:slug/tasks
export async function getTasks(req: AuthedRequest, res: Response) {
  const { slug } = req.params;
  const agent = AgentRegistry.get(slug);
  if (!agent) return res.status(404).json({ success: false, error: 'Agent not registered' });
  const list = (agent as any).listTasks?.() ?? [];
  const manifest = list.map((t: any) => ({
    name: t.name,
    summary: t.summary,
    policyKeys: t.policyKeys || [],
    decisionAuthority: t.decisionAuthority,
  }));
  res.json({ success: true, data: manifest });
}

// GET /api/agents/:slug/activity
export async function getActivity(req: AuthedRequest, res: Response) {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { slug } = req.params;
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));

  const where: any = { agentSlug: slug };
  if (role !== UserRole.ADMIN) where.userId = userId;

  const rows = await AgentAction.findAll({ where, order: [['createdAt', 'DESC']], limit });
  res.json({ success: true, data: rows });
}

// GET /api/agents/jobs
export async function getJobs(req: AuthedRequest, res: Response) {
  const status = req.query.status as JobStatus | undefined;
  const slug = req.query.agentSlug as string | undefined;
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10)));
  const rows = await agentJobsService.listRecent({ agentSlug: slug, status, limit });
  res.json({ success: true, data: rows });
}

// GET /api/agents/activity — global activity feed across all agents (admin-only).
// Optional filters: ?agentSlug=, ?status=, ?targetType=, ?limit=
export async function getActivityGlobal(req: AuthedRequest, res: Response) {
  const where: any = {};
  if (req.query.agentSlug) where.agentSlug = String(req.query.agentSlug);
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.targetType) where.targetType = String(req.query.targetType);
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10)));
  const rows = await AgentAction.findAll({ where, order: [['createdAt', 'DESC']], limit });
  res.json({ success: true, data: rows });
}

// POST /api/agents/jobs/:id/cancel — cancel a PENDING job
export async function cancelJob(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  await agentJobsService.cancel(id);
  res.json({ success: true });
}

// GET /api/agents/spend?from=YYYY-MM-DD&to=YYYY-MM-DD — daily token totals by agent
export async function getSpend(req: AuthedRequest, res: Response) {
  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 13 * 86_400_000); // last 14 days
  const from = req.query.from ? new Date(String(req.query.from)) : defaultFrom;
  const to = req.query.to ? new Date(String(req.query.to)) : today;
  // Snap to date boundaries
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const rows = (await AgentInference.findAll({
    attributes: [
      [literal('DATE(createdAt)'), 'day'],
      'agentSlug',
      [fn('SUM', literal('COALESCE(inputTokens,0)')), 'inputTokens'],
      [fn('SUM', literal('COALESCE(outputTokens,0)')), 'outputTokens'],
      [fn('COUNT', literal('*')), 'calls'],
    ],
    where: {
      createdAt: { [Op.between]: [from, to] },
    },
    group: [literal('DATE(createdAt)') as any, 'agentSlug'],
    order: [[literal('DATE(createdAt)') as any, 'ASC'], ['agentSlug', 'ASC']],
    raw: true,
  })) as unknown as Array<{ day: string; agentSlug: string; inputTokens: string; outputTokens: string; calls: string }>;

  const series = rows.map(r => ({
    day: String(r.day).slice(0, 10),
    agentSlug: r.agentSlug,
    inputTokens: Number(r.inputTokens || 0),
    outputTokens: Number(r.outputTokens || 0),
    totalTokens: Number(r.inputTokens || 0) + Number(r.outputTokens || 0),
    calls: Number(r.calls || 0),
  }));

  // Aggregate totals by agent
  const byAgent: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; calls: number }> = {};
  for (const r of series) {
    if (!byAgent[r.agentSlug]) byAgent[r.agentSlug] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 };
    byAgent[r.agentSlug].inputTokens += r.inputTokens;
    byAgent[r.agentSlug].outputTokens += r.outputTokens;
    byAgent[r.agentSlug].totalTokens += r.totalTokens;
    byAgent[r.agentSlug].calls += r.calls;
  }

  // Today's usage against the platform cap
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayRow = (await AgentInference.findOne({
    attributes: [[fn('SUM', literal('COALESCE(inputTokens,0) + COALESCE(outputTokens,0)')), 'totalTokens']],
    where: { createdAt: { [Op.gte]: todayStart } },
    raw: true,
  })) as unknown as { totalTokens: string | null };
  const todayUsed = Number(todayRow?.totalTokens || 0);

  res.json({
    success: true,
    data: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      series,
      byAgent,
      today: {
        used: todayUsed,
        platformCap: config.agents.dailyTokenBudgetPlatform,
        userCap: config.agents.dailyTokenBudgetUser,
      },
    },
  });
}

// POST /api/agents/admin/scout/run  { task: "ping", input?: {...} }
export async function adminRunScoutTask(req: AuthedRequest, res: Response) {
  const { task, input } = req.body as { task: string; input?: Record<string, unknown> };
  if (!task) return res.status(400).json({ success: false, error: 'task required' });
  const job = await agentJobsService.enqueue({
    userId: req.user!.id,
    agentSlug: 'scout',
    taskName: task,
    inputData: input || {},
    triggeredBy: 'admin:manual',
    triggeredByUserId: req.user!.id,
    priority: 9,
  });
  logger.info(`Admin ${req.user!.id} enqueued scout/${task} (job ${job.id})`);
  res.status(201).json({ success: true, data: { jobId: job.id } });
}
