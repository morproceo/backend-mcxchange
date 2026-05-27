/**
 * @deprecated Replaced by `/api/agents/eva/chat` (see `src/routes/agentsRoutes.ts`).
 * All routes here return 410 Gone with a redirect hint. Remove this file
 * and `src/services/aiChatService.ts` after one release window.
 */
import { Router, Request, Response } from 'express';

const router = Router();

const goneHandler = (_req: Request, res: Response) =>
  res.status(410).json({
    success: false,
    code: 'GONE',
    error: 'This endpoint has been retired. Use /api/agents/eva/chat instead.',
    redirect: '/api/agents/eva/chat',
  });

// Catch every method + every path under this router with middleware (Express-5-safe).
router.use(goneHandler);

export default router;
