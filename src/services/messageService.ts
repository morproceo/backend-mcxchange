import { Op, fn, col } from 'sequelize';
import {
  Message,
  User,
  Notification,
  UserRole,
} from '../models';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';
import { getPaginationInfo } from '../utils/helpers';
import { adminNotificationService } from './adminNotificationService';
import { emailService } from './emailService';
import logger from '../utils/logger';

interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
  listingId?: string;
  listingTitle?: string;
}

class MessageService {
  // Get conversations for a user
  async getConversations(userId: string): Promise<Conversation[]> {
    // Get all messages where user is sender or receiver
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar'],
        },
        {
          model: User,
          as: 'receiver',
          attributes: ['id', 'name', 'avatar'],
        },
      ],
    });

    // Batch query: get all unread counts grouped by sender in one query
    const unreadCounts = await Message.findAll({
      where: { receiverId: userId, read: false },
      attributes: ['senderId', [fn('COUNT', col('id')), 'count']],
      group: ['senderId'],
      raw: true,
    }) as unknown as Array<{ senderId: string; count: string }>;

    const unreadMap = new Map<string, number>();
    for (const row of unreadCounts) {
      unreadMap.set(row.senderId, parseInt(row.count, 10));
    }

    // Group messages by conversation partner
    const conversationsMap = new Map<string, Conversation>();

    for (const message of messages) {
      const partnerId = message.senderId === userId
        ? message.receiverId
        : message.senderId;

      const partner = message.senderId === userId
        ? message.receiver
        : message.sender;

      if (!conversationsMap.has(partnerId) && partner) {
        conversationsMap.set(partnerId, {
          id: partnerId,
          participantId: partner.id,
          participantName: partner.name,
          participantAvatar: partner.avatar || null,
          lastMessage: message.content.substring(0, 100),
          lastMessageAt: message.createdAt,
          unreadCount: unreadMap.get(partnerId) || 0,
          listingId: message.listingId || undefined,
        });
      }
    }

    return Array.from(conversationsMap.values());
  }

  // Get messages in a conversation
  async getMessages(
    userId: string,
    partnerId: string,
    page: number = 1,
    limit: number = 50
  ) {
    const offset = (page - 1) * limit;

    const { rows: messages, count: total } = await Message.findAndCountAll({
      where: {
        [Op.or]: [
          { senderId: userId, receiverId: partnerId },
          { senderId: partnerId, receiverId: userId },
        ],
      },
      order: [['createdAt', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar'],
        },
      ],
    });

    // Mark unread messages as read
    await Message.update(
      {
        read: true,
        readAt: new Date(),
      },
      {
        where: {
          senderId: partnerId,
          receiverId: userId,
          read: false,
        },
      }
    );

    return {
      messages: messages.reverse(), // Return in chronological order
      pagination: getPaginationInfo(page, limit, total),
    };
  }

  // Send a message
  async sendMessage(
    senderId: string,
    receiverId: string,
    content: string,
    listingId?: string
  ) {
    // Check if receiver exists
    const receiver = await User.findByPk(receiverId);

    if (!receiver) {
      throw new NotFoundError('User');
    }

    // Don't allow sending message to yourself
    if (senderId === receiverId) {
      throw new ForbiddenError('Cannot send message to yourself');
    }

    // Create message
    const message = await Message.create({
      senderId,
      receiverId,
      content,
      listingId,
    });

    const messageWithSender = await Message.findByPk(message.id, {
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar'],
        },
      ],
    });

    // Create notification for receiver
    await Notification.create({
      userId: receiverId,
      type: 'MESSAGE',
      title: 'New Message',
      message: `You have a new message from ${messageWithSender?.sender?.name}`,
      link: `/messages/${senderId}`,
      metadata: JSON.stringify({ messageId: message.id, senderId }),
    });

    // Get sender info for notifications
    const sender = await User.findByPk(senderId, { attributes: ['name', 'email', 'role'] });

    // If sender is admin, email the receiver so they know they got a message
    if (sender?.role === UserRole.ADMIN && receiver.email) {
      const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
      emailService.sendCustomEmail(
        receiver.email,
        'New message from Domilea Support',
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">You have a new message from Domilea Support</h2>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; color: #333;">${preview}</p>
          </div>
          <p style="color: #666;">Log in to your seller dashboard to view and reply.</p>
          <a href="https://www.domilea.com/seller/dashboard" style="display: inline-block; background: #1a1a2e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 8px;">View Messages</a>
        </div>`,
        `You have a new message from Domilea Support:\n\n${preview}\n\nLog in to view and reply: https://www.domilea.com/seller/dashboard`
      ).catch(err => {
        logger.error('Failed to send message notification email to user', err);
      });
    } else {
      // Notify admins of new inquiry/message from user (async, don't wait)
      adminNotificationService.notifyNewInquiry({
        senderName: sender?.name || 'Unknown',
        senderEmail: sender?.email || 'Unknown',
        messageContent: content,
        listingInfo: listingId ? `Listing ID: ${listingId}` : undefined,
      }).catch(err => {
        logger.error('Failed to send admin notification for new message', err);
      });
    }

    return messageWithSender;
  }

  // Mark message as read
  async markAsRead(messageId: string, userId: string) {
    const message = await Message.findByPk(messageId);

    if (!message) {
      throw new NotFoundError('Message');
    }

    if (message.receiverId !== userId) {
      throw new ForbiddenError('You can only mark your own messages as read');
    }

    await message.update({
      read: true,
      readAt: new Date(),
    });

    return message;
  }

  // Mark all messages from a user as read
  async markConversationAsRead(userId: string, partnerId: string) {
    await Message.update(
      {
        read: true,
        readAt: new Date(),
      },
      {
        where: {
          senderId: partnerId,
          receiverId: userId,
          read: false,
        },
      }
    );

    return { success: true };
  }

  // Get unread message count
  async getUnreadCount(userId: string): Promise<number> {
    return Message.count({
      where: {
        receiverId: userId,
        read: false,
      },
    });
  }

  // Delete a message (soft delete - only hide from sender)
  async deleteMessage(messageId: string, userId: string) {
    const message = await Message.findByPk(messageId);

    if (!message) {
      throw new NotFoundError('Message');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenError('You can only delete your own messages');
    }

    // For now, we'll do a hard delete. Could add a deletedAt field for soft delete
    await message.destroy();

    return { success: true };
  }
}

export const messageService = new MessageService();
export default messageService;
