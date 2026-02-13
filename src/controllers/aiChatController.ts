import { Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { aiChatService } from '../services/aiChatService';

export const createThread = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const threadId = await aiChatService.createThread();

  res.json({
    success: true,
    threadId,
  });
});

export const sendMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { threadId, message } = req.body;

  if (!threadId) {
    res.status(400).json({ success: false, error: 'threadId is required' });
    return;
  }

  if (!message || typeof message !== 'string') {
    res.status(400).json({ success: false, error: 'message is required' });
    return;
  }

  if (message.length > 2000) {
    res.status(400).json({ success: false, error: 'Message must be 2000 characters or less' });
    return;
  }

  const response = await aiChatService.sendMessage(threadId, message);

  res.json({
    success: true,
    response,
  });
});
