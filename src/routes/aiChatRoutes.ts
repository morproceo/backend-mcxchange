import { Router } from 'express';
import { createThread, sendMessage } from '../controllers/aiChatController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/thread', createThread);
router.post('/message', sendMessage);

export default router;
