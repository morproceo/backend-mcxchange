import { AgentAction, ActionStatus } from '../models';
import logger from '../utils/logger';

// Universal Lead activity log — piggybacks on the agent_actions table so we
// share a single typed-event timeline with Scout's enrichments.
//
// agent_actions columns used:
//   agentSlug: 'system'      (vs 'scout' / 'eva' for real agents)
//   userId:    the rep who triggered the action
//   actionType: 'call_logged' | 'email_logged' | 'voicemail_logged' |
//               'status_changed' | 'assignee_changed' | 'note_updated'
//   targetType: 'lead'
//   targetId:   Lead.id
//   triggeredBy: 'user:<uuid>'  (Scout uses 'reactive:lead_created' etc.)
//   inputData:  optional free text from the rep (call outcome, email body preview)
//   outputData: structured state delta when applicable (status from→to)

export type LeadActivityKind =
  | 'call_logged'
  | 'email_logged'
  | 'voicemail_logged'
  | 'note_updated'
  | 'status_changed'
  | 'assignee_changed';

interface LogLeadActivityInput {
  leadId: string;
  userId: string;
  actionType: LeadActivityKind;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
}

export async function logLeadActivity(input: LogLeadActivityInput): Promise<void> {
  try {
    await AgentAction.create({
      userId: input.userId,
      agentSlug: 'system',
      actionType: input.actionType,
      targetType: 'lead',
      targetId: input.leadId,
      inputData: input.inputData,
      outputData: input.outputData,
      status: ActionStatus.COMPLETED,
      triggeredBy: `user:${input.userId}`,
    } as any);
  } catch (err) {
    logger.warn(`logLeadActivity failed for lead ${input.leadId} / ${input.actionType}`, {
      error: (err as Error).message,
    });
  }
}
