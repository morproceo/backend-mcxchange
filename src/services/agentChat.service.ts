import { Op } from 'sequelize';
import { AgentConversation, AgentMessage, AgentMessageRole } from '../models';

class AgentChatService {
  async getOrCreateConversation(args: {
    userId: string;
    agentSlug: string;
    conversationId?: string | null;
    titleHint?: string;
  }): Promise<AgentConversation> {
    if (args.conversationId) {
      const existing = await AgentConversation.findOne({
        where: { id: args.conversationId, userId: args.userId, agentSlug: args.agentSlug },
      });
      if (existing) return existing;
    }
    return await AgentConversation.create({
      userId: args.userId,
      agentSlug: args.agentSlug,
      title: args.titleHint?.slice(0, 80) || null,
      lastMessageAt: new Date(),
    } as any);
  }

  async listConversations(userId: string, agentSlug: string, limit = 50): Promise<AgentConversation[]> {
    return await AgentConversation.findAll({
      where: { userId, agentSlug },
      order: [['lastMessageAt', 'DESC']],
      limit,
    });
  }

  async listMessages(conversationId: string, limit = 100): Promise<AgentMessage[]> {
    return await AgentMessage.findAll({
      where: { conversationId },
      order: [['createdAt', 'ASC']],
      limit,
    });
  }

  async addMessage(args: {
    conversationId: string;
    role: AgentMessageRole;
    content: string;
    steps?: unknown;
  }): Promise<AgentMessage> {
    const msg = await AgentMessage.create({
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      steps: args.steps,
    } as any);
    await AgentConversation.update(
      { lastMessageAt: new Date() } as any,
      { where: { id: args.conversationId } }
    );
    return msg;
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const conv = await AgentConversation.findOne({ where: { id: conversationId, userId } });
    if (!conv) return false;
    await AgentMessage.destroy({ where: { conversationId } });
    await conv.destroy();
    return true;
  }
}

export const agentChatService = new AgentChatService();
export default agentChatService;
