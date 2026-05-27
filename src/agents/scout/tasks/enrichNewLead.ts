import { Lead, ActionStatus } from '../../../models';
import { PolicyEngine } from '../../core/PolicyEngine';
import scoutAgent from '../ScoutAgent';
import morproLinqService from '../../../services/morproLinqService';
import type { AgentContext, TaskDef } from '../../core/types';
import logger from '../../../utils/logger';

interface Input { leadId: string }

interface EnrichmentJson {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  summary: string;
  next_action: string;
  confidence: number; // 0-1
}

const SYSTEM = `You are Scout, Domilea's lead-intelligence specialist. Score a new lead based on the carrier data we have. Always respond with strict JSON matching this schema:
{
  "priority": "HIGH" | "MEDIUM" | "LOW",
  "summary": string,          // 1-2 sentences on signal quality and fit
  "next_action": string,      // single concrete next step for the rep
  "confidence": number        // 0..1
}
Heuristics:
- HIGH: active for-hire authority, real fleet (>=3 power units), recent contact info on file, no red flags. Also HIGH when insurance_cancellation_date is within 60 days — that's a hot urgency signal for a buyer.
- MEDIUM: active but small/unknown fleet, or partial contact info, or older carrier with limited safety data.
- LOW: revoked/inactive authority, no contact info, very small/new entity with unclear signal.
- When insurance_cancellation_date is set, lead with it in the summary (mention the date and days until cancellation), and tailor next_action toward urgency.
Be concise. Never invent fields not in the schema.`;

export const enrichNewLeadTask: TaskDef<Input> = {
  name: 'enrich_lead',
  agent: 'scout',
  summary: 'Scores a newly-saved lead and drafts a suggested next action using live LINQ data.',
  policyKeys: ['auto_enrich_enabled', 'auto_enrich_confidence_min'],
  decisionAuthority: 'auto-execute',

  async run(input: Input, ctx: AgentContext) {
    // GATHER — pull fresh data live from LINQ (no local mirror).
    const lead = await Lead.findByPk(input.leadId);
    if (!lead) return { ok: false, reason: 'lead not found' };

    if (!morproLinqService.isConfigured()) {
      return { ok: false, reason: 'LINQ not configured' };
    }

    const [carrier, insurance] = await Promise.all([
      morproLinqService.getCarrier(lead.dotNumber),
      morproLinqService.getInsurance(lead.dotNumber),
    ]);
    const cj: any = carrier || {};

    const carrierName: string | null = cj.legal_name || null;
    const phone: string | null = cj.phone || cj.cell_phone || null;
    const email: string | null = cj.email || null;
    const insuranceCancel: string | null = insurance?.summary?.earliest_cancellation_date || null;

    // Refresh the Lead's denormalized snapshot fields so the Leads UI list
    // shows the latest contact info + cancellation date without re-fetching LINQ.
    const leadPatch: Record<string, unknown> = {};
    if (carrierName && carrierName !== lead.carrierNameSnapshot) leadPatch.carrierNameSnapshot = carrierName;
    if (phone && phone !== lead.phoneSnapshot) leadPatch.phoneSnapshot = phone;
    if (email && email !== lead.emailSnapshot) leadPatch.emailSnapshot = email;
    if (insuranceCancel && String(insuranceCancel) !== String(lead.insuranceCancellationSnapshot)) {
      leadPatch.insuranceCancellationSnapshot = insuranceCancel;
    }
    if (Object.keys(leadPatch).length > 0) {
      try {
        await lead.update(leadPatch as any);
      } catch (err) {
        logger.warn('enrich_lead: failed to update lead snapshot fields', { error: (err as Error).message });
      }
    }

    const daysToCancellation = insuranceCancel
      ? Math.max(0, Math.ceil((new Date(String(insuranceCancel)).getTime() - Date.now()) / 86_400_000))
      : null;

    const firstActivePolicy = insurance?.active_policies?.find((p: any) => p?.cancellation_date) || insurance?.active_policies?.[0] || null;

    const gathered = {
      dotNumber: lead.dotNumber,
      carrierName,
      dba: cj.dba_name || null,
      state: cj.physical_address?.state || null,
      city: cj.physical_address?.city || null,
      authorityStatus: cj.operating_status || null,
      safetyRating: cj.safety_rating || null,
      totalPowerUnits: typeof cj.power_units === 'number' ? cj.power_units : null,
      totalDrivers: typeof cj.total_drivers === 'number' ? cj.total_drivers : null,
      phone,
      email,
      addedDate: cj.add_date || null,
      insuranceCancellationDate: insuranceCancel,
      daysToCancellation,
      insuranceCompany: firstActivePolicy?.company || null,
      insuranceCoverageAmount: firstActivePolicy?.coverage_amount || null,
    };

    // REASON
    let enrichment: EnrichmentJson | null = null;
    let inferenceId: string | null = null;
    try {
      const { content, inferenceId: iid } = await scoutAgent.callLLM(
        {
          promptType: 'enrich_lead',
          system: SYSTEM,
          messages: [{ role: 'user', content: `Carrier data:\n${JSON.stringify(gathered, null, 2)}` }],
          jsonMode: true,
          maxTokens: 300,
        },
        ctx
      );
      inferenceId = iid;
      enrichment = content ? (JSON.parse(content) as EnrichmentJson) : null;
    } catch (err) {
      await scoutAgent.logAction(
        {
          actionType: 'enrich_lead',
          targetType: 'lead',
          targetId: lead.id,
          status: ActionStatus.FAILED,
          errorMessage: (err as Error).message,
          inputData: gathered,
        },
        ctx
      );
      return { ok: false, reason: 'llm_failed', error: (err as Error).message };
    }

    if (!enrichment) {
      await scoutAgent.logAction(
        {
          actionType: 'enrich_lead',
          targetType: 'lead',
          targetId: lead.id,
          status: ActionStatus.FAILED,
          errorMessage: 'empty LLM response',
          inputData: gathered,
          inferenceId: inferenceId || undefined,
        },
        ctx
      );
      return { ok: false, reason: 'empty_response' };
    }

    // GATE — auto-execute only when policy on AND confidence high
    const autoEnabled = await PolicyEngine.getPolicy<boolean>(ctx.userId ?? null, 'scout', 'auto_enrich_enabled', true);
    const minConfidence = await PolicyEngine.getPolicy<number>(ctx.userId ?? null, 'scout', 'auto_enrich_confidence_min', 0.7);
    const willAutoApply = autoEnabled && enrichment.confidence >= minConfidence;

    // ACT — append to Lead.notes (reversible)
    if (willAutoApply) {
      const stamp = `\n\n[Scout · ${new Date().toISOString().slice(0, 10)} · priority=${enrichment.priority} · conf=${enrichment.confidence.toFixed(2)}]\n${enrichment.summary}\nNext: ${enrichment.next_action}`;
      const prior = lead.notes || '';
      const next = (prior + stamp).slice(0, 8000);
      try {
        await lead.update({ notes: next });
      } catch (err) {
        logger.warn(`enrich_lead: failed to write notes for lead ${lead.id}`, { error: (err as Error).message });
      }
    }

    // AUDIT
    await scoutAgent.logAction(
      {
        actionType: 'enrich_lead',
        targetType: 'lead',
        targetId: lead.id,
        triggeredBy: ctx.triggeredBy,
        inputData: { dotNumber: lead.dotNumber, carrierName, insuranceCancellationDate: insuranceCancel },
        outputData: {
          priority: enrichment.priority,
          confidence: enrichment.confidence,
          summary: enrichment.summary,
          next_action: enrichment.next_action,
          applied: willAutoApply,
          gateReason: willAutoApply ? 'auto-applied' : autoEnabled ? 'below_confidence_threshold' : 'policy_off',
          daysToCancellation,
        },
        inferenceId: inferenceId || undefined,
      },
      ctx
    );

    return {
      ok: true,
      applied: willAutoApply,
      priority: enrichment.priority,
      confidence: enrichment.confidence,
      daysToCancellation,
    };
  },
};

export default enrichNewLeadTask;
