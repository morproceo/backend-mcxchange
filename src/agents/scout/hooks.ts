import { Lead } from '../../models';
import { gateAndEnqueue } from '../core/gateAndEnqueue';
import logger from '../../utils/logger';

let installed = false;

export function installScoutHooks() {
  if (installed) {
    logger.warn('Scout hooks already installed; skipping');
    return;
  }
  installed = true;

  Lead.addHook('afterCreate', 'scout_enrich_lead', async (lead: Lead) => {
    try {
      await gateAndEnqueue({
        userId: null, // admin-global agent
        agentSlug: 'scout',
        taskName: 'enrich_lead',
        policyKey: 'auto_enrich_enabled',
        policyDefault: true,
        targetType: 'lead',
        targetId: lead.id,
        inputData: { leadId: lead.id },
        triggeredBy: 'reactive:lead_created',
        priority: 6,
      });
    } catch (err) {
      logger.warn('Scout afterCreate hook failed (suppressed)', { error: (err as Error).message });
    }
  });

  logger.info('Scout hooks installed (Lead.afterCreate → enrich_lead)');
}
