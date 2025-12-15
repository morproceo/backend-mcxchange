import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAll,
  getUnreadCount,
  getCountsByType,
} from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// Get notifications
router.get('/', getNotifications);

// Get unread count
router.get('/unread-count', getUnreadCount);

// Get counts by type
router.get('/counts', getCountsByType);

// Mark all as read
router.put('/read-all', markAllAsRead);

// Clear all
router.delete('/clear', clearAll);

// Single notification operations
router.put('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

export default router;
