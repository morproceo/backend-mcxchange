import { Response } from 'express';
import { notificationService } from '../services/notificationService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { parseIntParam, parseBooleanParam } from '../utils/helpers';

// Get notifications
export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const page = parseIntParam(req.query.page as string) || 1;
  const limit = parseIntParam(req.query.limit as string) || 20;
  const unreadOnly = parseBooleanParam(req.query.unreadOnly as string);

  const result = await notificationService.getNotifications(
    req.user.id,
    page,
    limit,
    unreadOnly || false
  );

  res.json({
    success: true,
    data: result.notifications,
    pagination: result.pagination,
  });
});

// Mark notification as read
export const markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  await notificationService.markAsRead(id, req.user.id);

  res.json({
    success: true,
    message: 'Notification marked as read',
  });
});

// Mark all notifications as read
export const markAllAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  await notificationService.markAllAsRead(req.user.id);

  res.json({
    success: true,
    message: 'All notifications marked as read',
  });
});

// Delete notification
export const deleteNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;

  await notificationService.deleteNotification(id, req.user.id);

  res.json({
    success: true,
    message: 'Notification deleted',
  });
});

// Clear all notifications
export const clearAll = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  await notificationService.clearAll(req.user.id);

  res.json({
    success: true,
    message: 'All notifications cleared',
  });
});

// Get unread count
export const getUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const count = await notificationService.getUnreadCount(req.user.id);

  res.json({
    success: true,
    data: { count },
  });
});

// Get counts by type
export const getCountsByType = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const counts = await notificationService.getCountsByType(req.user.id);

  res.json({
    success: true,
    data: counts,
  });
});
