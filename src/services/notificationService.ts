import {
  Notification,
  NotificationType,
} from '../models';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';
import { getPaginationInfo } from '../utils/helpers';

interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

class NotificationService {
  // Alias for createNotification (used by webhookController)
  async create(data: CreateNotificationData) {
    return this.createNotification(data);
  }

  // Get user's notifications
  async getNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false
  ) {
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = unreadOnly
      ? { userId, read: false }
      : { userId };

    const { rows: notifications, count: total } = await Notification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit,
    });

    return {
      notifications,
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Create a notification
  async createNotification(data: CreateNotificationData) {
    return Notification.create({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      link: data.link,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    });
  }

  // Create multiple notifications (bulk)
  async createBulkNotifications(notifications: CreateNotificationData[]) {
    return Notification.bulkCreate(
      notifications.map(n => ({
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        metadata: n.metadata ? JSON.stringify(n.metadata) : null,
      }))
    );
  }

  // Mark notification as read
  async markAsRead(notificationId: string, userId: string) {
    const notification = await Notification.findByPk(notificationId);

    if (!notification) {
      throw new NotFoundError('Notification');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenError('You can only mark your own notifications as read');
    }

    await notification.update({
      read: true,
      readAt: new Date(),
    });

    return notification;
  }

  // Mark all notifications as read
  async markAllAsRead(userId: string) {
    await Notification.update(
      {
        read: true,
        readAt: new Date(),
      },
      {
        where: {
          userId,
          read: false,
        },
      }
    );

    return { success: true };
  }

  // Delete a notification
  async deleteNotification(notificationId: string, userId: string) {
    const notification = await Notification.findByPk(notificationId);

    if (!notification) {
      throw new NotFoundError('Notification');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenError('You can only delete your own notifications');
    }

    await notification.destroy();

    return { success: true };
  }

  // Clear all notifications
  async clearAll(userId: string) {
    await Notification.destroy({
      where: { userId },
    });

    return { success: true };
  }

  // Get unread notification count
  async getUnreadCount(userId: string): Promise<number> {
    return Notification.count({
      where: {
        userId,
        read: false,
      },
    });
  }

  // Get notification counts by type
  async getCountsByType(userId: string) {
    const notifications = await Notification.findAll({
      where: {
        userId,
        read: false,
      },
      attributes: ['type'],
    });

    const result: Record<string, number> = {};
    for (const notification of notifications) {
      result[notification.type] = (result[notification.type] || 0) + 1;
    }

    return result;
  }

  // Helper: Notify user about listing approval
  async notifyListingApproved(userId: string, listingMcNumber: string) {
    return this.createNotification({
      userId,
      type: NotificationType.VERIFICATION,
      title: 'Listing Approved',
      message: `Your listing MC-${listingMcNumber} has been approved and is now live.`,
      link: '/seller/listings',
    });
  }

  // Helper: Notify user about listing rejection
  async notifyListingRejected(userId: string, listingMcNumber: string, reason: string) {
    return this.createNotification({
      userId,
      type: NotificationType.VERIFICATION,
      title: 'Listing Rejected',
      message: `Your listing MC-${listingMcNumber} was not approved. Reason: ${reason}`,
      link: '/seller/listings',
    });
  }

  // Helper: Notify about new offer
  async notifyNewOffer(sellerId: string, amount: number, listingMcNumber: string) {
    return this.createNotification({
      userId: sellerId,
      type: NotificationType.OFFER,
      title: 'New Offer Received',
      message: `You received a $${amount.toLocaleString()} offer on MC-${listingMcNumber}`,
      link: '/seller/offers',
    });
  }

  // Helper: Notify about offer response
  async notifyOfferResponse(
    buyerId: string,
    status: 'accepted' | 'rejected' | 'countered',
    listingMcNumber: string,
    counterAmount?: number
  ) {
    const titles = {
      accepted: 'Offer Accepted!',
      rejected: 'Offer Declined',
      countered: 'Counter Offer Received',
    };

    const messages = {
      accepted: `Your offer on MC-${listingMcNumber} has been accepted. Please proceed with the deposit.`,
      rejected: `Your offer on MC-${listingMcNumber} has been declined.`,
      countered: `The seller has countered your offer on MC-${listingMcNumber} with $${counterAmount?.toLocaleString()}`,
    };

    return this.createNotification({
      userId: buyerId,
      type: NotificationType.OFFER,
      title: titles[status],
      message: messages[status],
      link: '/buyer/offers',
    });
  }

  // Helper: Notify about transaction status
  async notifyTransactionStatus(
    userId: string,
    title: string,
    message: string,
    transactionId: string
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.TRANSACTION,
      title,
      message,
      link: `/transaction/${transactionId}`,
      metadata: { transactionId },
    });
  }
}

export const notificationService = new NotificationService();
export default notificationService;
