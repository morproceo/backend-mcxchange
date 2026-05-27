import { Request, Response } from 'express';
import { AgentMessageRole, UserRole } from '../../models';
import { evaAgent } from '../../agents/eva/EvaAgent';
import agentChatService from '../../services/agentChat.service';
import logger from '../../utils/logger';

interface AuthedRequest extends Request {
  user?: { id: string; role: UserRole };
}

// POST /api/agents/eva/chat
export async function postChat(req: AuthedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  const { conversationId, message } = req.body as { conversationId?: string | null; message?: string };
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'message required' });
  }

  const userId = req.user!.id;
  const conversation = await agentChatService.getOrCreateConversation({
    userId,
    agentSlug: 'eva',
    conversationId: conversationId || null,
    titleHint: message,
  });

  // Build history from persisted messages (excluding the new user message we'll add now)
  const prior = await agentChatService.listMessages(conversation.id, 50);
  const history = prior.map((m) => ({
    role: m.role === AgentMessageRole.USER ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  await agentChatService.addMessage({
    conversationId: conversation.id,
    role: AgentMessageRole.USER,
    content: message,
  });

  try {
    const { reply, steps } = await evaAgent.chat({ history, message }, { userId, role: req.user.role });
    await agentChatService.addMessage({
      conversationId: conversation.id,
      role: AgentMessageRole.ASSISTANT,
      content: reply,
      steps,
    });
    res.json({
      success: true,
      data: { conversationId: conversation.id, reply, steps },
    });
  } catch (err) {
    logger.warn('Eva chat failed', { error: (err as Error).message });
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

// GET /api/agents/eva/conversations
export async function listConversations(req: AuthedRequest, res: Response) {
  if (!req.user) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }
  const list = await agentChatService.listConversations(req.user!.id, 'eva');
  res.json({ success: true, data: list });
}

// GET /api/agents/eva/conversations/:id
export async function getConversation(req: AuthedRequest, res: Response) {
  if (!req.user) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }
  const { id } = req.params;
  const conversations = await agentChatService.listConversations(req.user!.id, 'eva', 200);
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
  const messages = await agentChatService.listMessages(id);
  res.json({ success: true, data: { conversation: conv, messages } });
}

// DELETE /api/agents/eva/conversations/:id
export async function deleteConversation(req: AuthedRequest, res: Response) {
  if (!req.user) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }
  const ok = await agentChatService.deleteConversation(req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ success: false, error: 'Conversation not found' });
  res.json({ success: true });
}
