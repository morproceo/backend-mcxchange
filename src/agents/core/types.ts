import type { ActionStatus } from '../../models';

export interface AgentContext {
  userId: string | null; // null = admin-global / platform run
  role?: 'BUYER' | 'SELLER' | 'ADMIN' | 'COMPLIANCE_MANAGER';
  triggeredBy?: string;
  triggeredByUserId?: string;
}

export type DecisionAuthority = 'advise' | 'auto-execute' | 'confirm';

export interface TaskDef<Input = Record<string, unknown>, Output = Record<string, unknown>> {
  name: string;
  agent: string;
  summary: string;
  policyKeys?: string[];
  decisionAuthority: DecisionAuthority;
  run(input: Input, ctx: AgentContext): Promise<Output>;
}

export interface ToolDef {
  schema: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
  handler: (args: Record<string, unknown>, ctx: AgentContext) => Promise<unknown>;
}

export interface LogActionInput {
  actionType: string;
  targetType?: string;
  targetId?: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  status?: ActionStatus;
  triggeredBy?: string;
  inferenceId?: string;
  errorMessage?: string;
}

export interface ChatStep {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  durationMs?: number;
  errorMessage?: string;
}
