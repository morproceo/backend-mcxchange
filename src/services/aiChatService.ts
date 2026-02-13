import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

function getAssistantId(): string {
  return process.env.OPENAI_ASSISTANT_ID || '';
}

class AIChatService {
  async createThread(): Promise<string> {
    const thread = await getClient().beta.threads.create();
    return thread.id;
  }

  async sendMessage(threadId: string, userMessage: string): Promise<string> {
    const client = getClient();

    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: userMessage,
    });

    const assistantId = getAssistantId();
    console.log('[AI Chat] Using assistant_id:', assistantId);

    const run = await client.beta.threads.runs.createAndPoll(threadId, {
      assistant_id: assistantId,
    });

    if (run.status !== 'completed') {
      throw new Error(`Run ended with status: ${run.status}`);
    }

    const messages = await client.beta.threads.messages.list(threadId, {
      limit: 1,
      order: 'desc',
    });

    const assistantMessage = messages.data[0];
    if (!assistantMessage || assistantMessage.role !== 'assistant') {
      throw new Error('No assistant response received');
    }

    const textBlock = assistantMessage.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in assistant response');
    }

    return textBlock.text.value;
  }
}

export const aiChatService = new AIChatService();
