/**
 * Import-only barrel: importing this file triggers every agent's
 * AgentRegistry.register(...) side effect. Used by src/index.ts (HTTP process)
 * and the worker (when run separately) to populate the registry.
 */
import './scout/ScoutAgent';
import './eva/EvaAgent';

export { AgentRegistry } from './core/AgentRegistry';
