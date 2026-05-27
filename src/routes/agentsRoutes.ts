import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth';
import {
  getCatalog,
  getActive,
  hire,
  cancel,
  getPolicies,
  putPolicies,
  getTasks,
  getActivity,
  getActivityGlobal,
  getJobs,
  cancelJob,
  getSpend,
  adminRunScoutTask,
} from '../controllers/agentsController';
import {
  postChat,
  listConversations,
  getConversation,
  deleteConversation,
} from '../controllers/eva/evaChatController';
import {
  postChatBySlug,
  listConversationsBySlug,
  getConversationBySlug,
  deleteConversationBySlug,
} from '../controllers/agentChatController';

const router = Router();

router.use(authenticate);

router.get('/catalog', getCatalog);
router.get('/active', getActive);
router.get('/activity', adminOnly, getActivityGlobal);
router.get('/jobs', adminOnly, getJobs);
router.post('/jobs/:id/cancel', adminOnly, cancelJob);
router.get('/spend', adminOnly, getSpend);
router.post('/admin/scout/run', adminOnly, adminRunScoutTask);

// Eva chat (kept as explicit routes for backward compat with existing frontend client)
router.post('/eva/chat', postChat);
router.get('/eva/conversations', listConversations);
router.get('/eva/conversations/:id', getConversation);
router.delete('/eva/conversations/:id', deleteConversation);

// Generic chat for any registered agent (used by Dia at /dia/chat, and future agents)
router.post('/:slug/chat', postChatBySlug);
router.get('/:slug/conversations', listConversationsBySlug);
router.get('/:slug/conversations/:id', getConversationBySlug);
router.delete('/:slug/conversations/:id', deleteConversationBySlug);

router.post('/:slug/hire', hire);
router.post('/:slug/cancel', cancel);
router.get('/:slug/policies', getPolicies);
router.put('/:slug/policies', putPolicies);
router.get('/:slug/tasks', getTasks);
router.get('/:slug/activity', getActivity);

export default router;
