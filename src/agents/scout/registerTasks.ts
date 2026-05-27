/**
 * Registers Scout's heavy tasks. Kept in a separate file to avoid a circular
 * import: ScoutAgent → task module → scoutAgent (default import).
 */
import scoutAgent from './ScoutAgent';
import enrichNewLeadTask from './tasks/enrichNewLead';
import weeklyLeadDigestTask from './tasks/weeklyLeadDigest';

let registered = false;

export function registerScoutTasks() {
  if (registered) return;
  registered = true;
  scoutAgent.registerTask(enrichNewLeadTask);
  scoutAgent.registerTask(weeklyLeadDigestTask);
}
