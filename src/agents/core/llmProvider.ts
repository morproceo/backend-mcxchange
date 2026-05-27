/**
 * Thin abstraction over the LLM provider so we can swap OpenAI <-> Anthropic
 * by editing one file. Phase 1 supports OpenAI only.
 */
import OpenAI from 'openai';
import config from '../../config';

export interface CompletionRequest {
  system?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; name?: string; tool_calls?: any }>;
  model: string;
  maxTokens?: number;
  jsonMode?: boolean;
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface CompletionResponse {
  content: string | null;
  toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  usage: { inputTokens: number; outputTokens: number };
  raw: unknown;
}

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: config.agents.openaiApiKey });
  }
  return _client;
}

export const llmProvider = {
  name: 'openai',

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const openai = client();
    const sysMessage = req.system ? [{ role: 'system' as const, content: req.system }] : [];
    const res = await openai.chat.completions.create({
      model: req.model,
      messages: [...sysMessage, ...(req.messages as any)],
      max_tokens: req.maxTokens,
      response_format: req.jsonMode ? { type: 'json_object' } : undefined,
      tools: req.tools,
      tool_choice: req.toolChoice as any,
    });

    const choice = res.choices?.[0];
    const msg = choice?.message;
    return {
      content: msg?.content ?? null,
      toolCalls: (msg as any)?.tool_calls,
      usage: {
        inputTokens: res.usage?.prompt_tokens || 0,
        outputTokens: res.usage?.completion_tokens || 0,
      },
      raw: res,
    };
  },
};
