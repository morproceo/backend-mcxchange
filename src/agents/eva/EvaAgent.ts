import { BaseAgent } from '../core/BaseAgent';
import { AgentRegistry } from '../core/AgentRegistry';
import { buildAdminTools } from './tools/adminTools';
import { buildSellerTools } from './tools/sellerTools';
import { buildBuyerTools } from './tools/buyerTools';
import { UserRole } from '../../models';
import type { AgentContext, ChatStep, ToolDef } from '../core/types';

const SYSTEM_PROMPT = `You are Eva, Domilea's admin operator. Domilea is a marketplace for motor carrier (MC) authorities — trucking businesses being bought and sold. Reps use you to prospect leads, look up carriers, and review marketplace state.

Rules:
- Never guess a number, name, status, or date. Call a tool for every fact.
- If a tool returns empty results, say so plainly — do not invent rows.
- Prefer search_carriers (fast, local snapshot) for filtering. Use get_carrier only for one carrier at a time when you need a full live profile.
- Quote DOT numbers, MC dockets, dates verbatim from tool output.
- Keep responses tight. Use short bullets for lists; one-line summaries when you can.
- If a question is ambiguous (e.g. unspecified state), ask one clarifying question before searching.
- The user is always an admin in this Phase. Don't refuse legitimate prospecting tasks.`;

interface ChatArgs {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
}

class EvaAgent extends BaseAgent {
  constructor() {
    super({
      slug: 'eva',
      name: 'Eva',
      description: 'Admin operator. Ask anything about leads, carriers, listings, or platform health — Eva calls the right tools and answers from real data.',
    });
  }

  getDefaultPolicies() {
    return { chat_enabled: true };
  }

  // Eva is chat-only — no scheduled/reactive tasks. Throw clearly if poked.
  async runTask(name: string): Promise<never> {
    throw new Error(`Eva has no task '${name}'; she's a chat orchestrator.`);
  }

  async chat(args: ChatArgs, ctx: AgentContext): Promise<{ reply: string; steps: ChatStep[] }> {
    const tools = toolsForRole(ctx.role);
    const today = new Date().toISOString().slice(0, 10);
    const roleNote =
      ctx.role === UserRole.ADMIN
        ? 'The user is an admin — full marketplace + carrier intelligence access.'
        : ctx.role === UserRole.SELLER
        ? 'The user is a seller — only their own listings, offers, transactions, and analytics are accessible.'
        : 'The user is a buyer — they can search the public marketplace, see their saved listings, their offers sent, and their credits.';
    const system = `${SYSTEM_PROMPT}\nToday is ${today}.\n${roleNote}`;
    const messages: any[] = [
      ...args.history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: args.message },
    ];
    const res = await this.chatWithTools({ system, messages, tools }, ctx);
    return { reply: res.content, steps: res.steps };
  }
}

function toolsForRole(role: string | undefined): ToolDef[] {
  if (role === UserRole.ADMIN) return buildAdminTools();
  if (role === UserRole.SELLER) return buildSellerTools();
  if (role === UserRole.BUYER) return buildBuyerTools();
  // Unknown / unauthenticated → minimal buyer set (read-only marketplace search)
  return buildBuyerTools();
}

export const evaAgent = new EvaAgent();
AgentRegistry.register('eva', evaAgent);
export default evaAgent;
