import { Request, Response } from 'express';
import { AgentMessageRole, UserRole } from '../models';
import '../agents'; // side-effect: registers every agent into AgentRegistry
import { AgentRegistry } from '../agents/core/AgentRegistry';
import agentChatService from '../services/agentChat.service';
import logger from '../utils/logger';

interface AuthedRequest extends Request {
  user?: { id: string; role: UserRole };
}

// Look up an agent in the registry, with explicit 404 if missing. Both Eva and
// Dia route here via /api/agents/:slug/chat.
function getAgent(slug: string) {
  const agent: any = (AgentRegistry as any).get?.(slug);
  if (!agent) return null;
  if (typeof agent.chat !== 'function') return null;
  return agent;
}

// POST /api/agents/:slug/chat
export async function postChatBySlug(req: AuthedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  const { slug } = req.params;
  const agent = getAgent(slug);
  if (!agent) return res.status(404).json({ success: false, error: `Agent '${slug}' has no chat handler` });

  const { conversationId, message } = req.body as { conversationId?: string | null; message?: string };
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'message required' });
  }

  const userId = req.user.id;
  const conversation = await agentChatService.getOrCreateConversation({
    userId,
    agentSlug: slug,
    conversationId: conversationId || null,
    titleHint: message,
  });

  const prior = await agentChatService.listMessages(conversation.id, 50);
  const history = prior.map(m => ({
    role: m.role === AgentMessageRole.USER ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  await agentChatService.addMessage({
    conversationId: conversation.id,
    role: AgentMessageRole.USER,
    content: message,
  });

  try {
    const { reply, steps } = await agent.chat({ history, message }, { userId, role: req.user.role });
    await agentChatService.addMessage({
      conversationId: conversation.id,
      role: AgentMessageRole.ASSISTANT,
      content: reply,
      steps,
    });
    res.json({ success: true, data: { conversationId: conversation.id, reply, steps } });
  } catch (err) {
    logger.warn(`${slug} chat failed`, { error: (err as Error).message });
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

// GET /api/agents/:slug/conversations
export async function listConversationsBySlug(req: AuthedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const list = await agentChatService.listConversations(req.user.id, req.params.slug);
  res.json({ success: true, data: list });
}

// GET /api/agents/:slug/conversations/:id
export async function getConversationBySlug(req: AuthedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const { slug, id } = req.params;
  const conversations = await agentChatService.listConversations(req.user.id, slug, 200);
  const conv = conversations.find(c => c.id === id);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
  const messages = await agentChatService.listMessages(id);
  res.json({ success: true, data: { conversation: conv, messages } });
}

// DELETE /api/agents/:slug/conversations/:id
export async function deleteConversationBySlug(req: AuthedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const ok = await agentChatService.deleteConversation(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ success: false, error: 'Conversation not found' });
  res.json({ success: true });
}
