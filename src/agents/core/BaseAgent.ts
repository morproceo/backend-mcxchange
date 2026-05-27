import { AgentAction, AgentInference, ActionStatus, InferenceStatus } from '../../models';
import { llmProvider, type CompletionRequest } from './llmProvider';
import { SpendGuardrails } from './SpendGuardrails';
import config from '../../config';
import logger from '../../utils/logger';
import type { AgentContext, ChatStep, LogActionInput, ToolDef } from './types';

export interface AgentIdentity {
  slug: string;
  name: string;
  description: string;
}

export abstract class BaseAgent {
  readonly slug: string;
  readonly name: string;
  readonly description: string;

  constructor(identity: AgentIdentity) {
    this.slug = identity.slug;
    this.name = identity.name;
    this.description = identity.description;
  }

  getDefaultPolicies(): Record<string, unknown> {
    return {};
  }

  // ---- audit ----

  async logAction(input: LogActionInput, ctx: AgentContext): Promise<AgentAction | null> {
    try {
      return await AgentAction.create({
        userId: ctx.userId,
        agentSlug: this.slug,
        actionType: input.actionType,
        targetType: input.targetType,
        targetId: input.targetId,
        inputData: input.inputData,
        outputData: input.outputData,
        status: input.status || ActionStatus.COMPLETED,
        triggeredBy: input.triggeredBy || ctx.triggeredBy,
        inferenceId: input.inferenceId,
        errorMessage: input.errorMessage,
      } as any);
    } catch (err) {
      logger.warn(`logAction failed for ${this.slug}/${input.actionType}`, { error: (err as Error).message });
      return null;
    }
  }

  // ---- single-shot LLM ----

  async callLLM(
    args: {
      promptType: string;
      system?: string;
      messages: CompletionRequest['messages'];
      model?: string;
      maxTokens?: number;
      jsonMode?: boolean;
    },
    ctx: AgentContext
  ): Promise<{ content: string | null; usage: { inputTokens: number; outputTokens: number }; inferenceId: string | null }> {
    const model = args.model || config.agents.defaultReasoningModel;
    const approx = (args.system?.length || 0) + args.messages.reduce((n, m) => n + (m.content?.length || 0), 0);
    const projectedTokens = Math.ceil(approx / 3); // rough char→token heuristic
    await SpendGuardrails.assertLlmTokenBudget(ctx.userId, projectedTokens);

    const start = Date.now();
    let status: InferenceStatus = InferenceStatus.SUCCESS;
    let errorMessage: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
    let content: string | null = null;

    try {
      const res = await llmProvider.complete({
        system: args.system,
        messages: args.messages,
        model,
        maxTokens: args.maxTokens,
        jsonMode: args.jsonMode,
      });
      inputTokens = res.usage.inputTokens;
      outputTokens = res.usage.outputTokens;
      content = res.content;
    } catch (err) {
      status = InferenceStatus.ERROR;
      errorMessage = (err as Error).message;
      logger.warn(`callLLM(${this.slug}/${args.promptType}) failed`, { error: errorMessage });
    }

    const latencyMs = Date.now() - start;
    let inferenceId: string | null = null;
    try {
      const row = await AgentInference.create({
        userId: ctx.userId,
        agentSlug: this.slug,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        promptType: args.promptType,
        status,
        errorMessage,
      } as any);
      inferenceId = row.id;
    } catch (err) {
      logger.warn('AgentInference.create failed (fail-open)', { error: (err as Error).message });
    }

    if (status === InferenceStatus.ERROR) {
      throw new Error(errorMessage || 'LLM call failed');
    }
    return { content, usage: { inputTokens, outputTokens }, inferenceId };
  }

  // ---- chat with tools (OpenAI function-calling loop) ----

  async chatWithTools(
    args: {
      system?: string;
      messages: CompletionRequest['messages'];
      tools: ToolDef[];
      model?: string;
      maxTokens?: number;
      maxIters?: number;
    },
    ctx: AgentContext
  ): Promise<{ content: string; steps: ChatStep[]; usage: { inputTokens: number; outputTokens: number } }> {
    const model = args.model || config.agents.defaultChatModel;
    const maxIters = args.maxIters ?? config.agents.maxChatIterations;
    const toolSchemas = args.tools.map((t) => t.schema);
    const toolMap = new Map(args.tools.map((t) => [t.schema.function.name, t]));
    const steps: ChatStep[] = [];
    let totalIn = 0;
    let totalOut = 0;
    let messages = [...args.messages];
    let finalContent = '';

    for (let i = 0; i < maxIters; i++) {
      const approx = (args.system?.length || 0) + messages.reduce((n, m) => n + (m.content?.length || 0), 0);
      await SpendGuardrails.assertLlmTokenBudget(ctx.userId, Math.ceil(approx / 3));

      const start = Date.now();
      const res = await llmProvider.complete({
        system: args.system,
        messages,
        model,
        maxTokens: args.maxTokens,
        tools: toolSchemas,
        toolChoice: 'auto',
      });
      const latencyMs = Date.now() - start;
      totalIn += res.usage.inputTokens;
      totalOut += res.usage.outputTokens;

      try {
        await AgentInference.create({
          userId: ctx.userId,
          agentSlug: this.slug,
          model,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          latencyMs,
          promptType: `chat_iter_${i}`,
          status: InferenceStatus.SUCCESS,
        } as any);
      } catch {
        /* fail-open */
      }

      const toolCalls = res.toolCalls || [];
      if (!toolCalls.length) {
        finalContent = res.content || '';
        break;
      }

      // Push assistant turn (with tool_calls) into message history
      messages.push({ role: 'assistant', content: res.content ?? '', tool_calls: toolCalls } as any);

      for (const call of toolCalls) {
        const tool = toolMap.get(call.function.name);
        const stepStart = Date.now();
        let ok = true;
        let errMsg: string | undefined;
        let result: unknown = { error: 'unknown tool' };
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(call.function.arguments || '{}');
        } catch {
          parsedArgs = {};
        }
        if (!tool) {
          ok = false;
          errMsg = `unknown tool ${call.function.name}`;
        } else {
          try {
            result = await tool.handler(parsedArgs, ctx);
          } catch (err) {
            ok = false;
            errMsg = (err as Error).message;
            result = { error: errMsg };
          }
        }
        steps.push({
          tool: call.function.name,
          args: parsedArgs,
          ok,
          durationMs: Date.now() - stepStart,
          errorMessage: errMsg,
        });

        let payload = JSON.stringify(result);
        if (payload.length > config.agents.toolResultMaxChars) {
          payload = payload.slice(0, config.agents.toolResultMaxChars) + '… (truncated)';
        }
        messages.push({
          role: 'tool',
          content: payload,
          tool_call_id: call.id,
        } as any);
      }
    }

    if (!finalContent) {
      finalContent =
        'I gathered the data above but ran out of reasoning steps before producing a final answer. Please ask again or narrow the request.';
    }

    return { content: finalContent, steps, usage: { inputTokens: totalIn, outputTokens: totalOut } };
  }
}
