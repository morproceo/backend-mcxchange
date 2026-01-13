import { PlatformSetting } from '../models';
import { emailService } from './emailService';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Admin Notification Service
 *
 * Handles sending email notifications to configured admin email addresses
 * for various platform events (new users, inquiries, transactions, disputes, consultations).
 *
 * Settings keys:
 * - admin_notification_emails: Comma-separated list of admin email addresses
 * - notify_new_users: boolean - Enable new user notifications
 * - notify_new_inquiries: boolean - Enable new inquiry notifications
 * - notify_new_transactions: boolean - Enable transaction notifications
 * - notify_disputes: boolean - Enable dispute/block notifications
 * - notify_consultations: boolean - Enable consultation notifications
 */

class AdminNotificationService {
  private frontendUrl: string;

  constructor() {
    this.frontendUrl = config.frontendUrl || 'http://localhost:5173';
  }

  /**
   * Get admin notification emails from settings
   */
  private async getAdminEmails(): Promise<string[]> {
    try {
      const setting = await PlatformSetting.findOne({
        where: { key: 'admin_notification_emails' },
      });

      if (!setting || !setting.value) {
        return [];
      }

      // Parse comma-separated emails
      return setting.value
        .split(',')
        .map((email: string) => email.trim())
        .filter((email: string) => email.length > 0 && email.includes('@'));
    } catch (error) {
      logger.error('Failed to get admin emails:', error);
      return [];
    }
  }

  /**
   * Check if a specific notification type is enabled
   */
  private async isNotificationEnabled(settingKey: string): Promise<boolean> {
    try {
      const setting = await PlatformSetting.findOne({
        where: { key: settingKey },
      });

      if (!setting) {
        return true; // Default to enabled if setting doesn't exist
      }

      return setting.value === 'true';
    } catch (error) {
      logger.error(`Failed to check notification setting ${settingKey}:`, error);
      return true; // Default to enabled on error
    }
  }

  /**
   * Notify admins of new user registration
   */
  async notifyNewUser(user: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
  }): Promise<void> {
    try {
      const [emails, enabled] = await Promise.all([
        this.getAdminEmails(),
        this.isNotificationEnabled('notify_new_users'),
      ]);

      if (!enabled || emails.length === 0) {
        return;
      }

      await emailService.sendAdminNewUserNotification(emails, {
        userName: user.name,
        userEmail: user.email,
        userRole: user.role === 'buyer' ? 'Buyer' : user.role === 'seller' ? 'Seller' : 'Admin',
        registeredAt: new Date(user.createdAt).toLocaleString(),
        adminUrl: `${this.frontendUrl}/admin/users`,
      });

      logger.info(`Admin notification sent: New user ${user.email}`);
    } catch (error) {
      // Don't throw - notifications shouldn't break main flow
      logger.error('Failed to send new user admin notification:', error);
    }
  }

  /**
   * Notify admins of new inquiry/message
   */
  async notifyNewInquiry(data: {
    senderName: string;
    senderEmail: string;
    messageContent: string;
    listingInfo?: string;
  }): Promise<void> {
    try {
      const [emails, enabled] = await Promise.all([
        this.getAdminEmails(),
        this.isNotificationEnabled('notify_new_inquiries'),
      ]);

      if (!enabled || emails.length === 0) {
        return;
      }

      // Truncate message for preview
      const messagePreview = data.messageContent.length > 200
        ? data.messageContent.substring(0, 200) + '...'
        : data.messageContent;

      await emailService.sendAdminNewInquiryNotification(emails, {
        senderName: data.senderName,
        senderEmail: data.senderEmail,
        messagePreview,
        listingInfo: data.listingInfo || 'General inquiry',
        adminUrl: `${this.frontendUrl}/admin/messages`,
      });

      logger.info(`Admin notification sent: New inquiry from ${data.senderEmail}`);
    } catch (error) {
      logger.error('Failed to send new inquiry admin notification:', error);
    }
  }

  /**
   * Notify admins of transaction update
   */
  async notifyTransaction(data: {
    transactionId: string;
    mcNumber: string;
    buyerName: string;
    sellerName: string;
    amount: number;
    status: string;
  }): Promise<void> {
    try {
      const [emails, enabled] = await Promise.all([
        this.getAdminEmails(),
        this.isNotificationEnabled('notify_new_transactions'),
      ]);

      if (!enabled || emails.length === 0) {
        return;
      }

      await emailService.sendAdminTransactionNotification(emails, {
        transactionId: data.transactionId,
        mcNumber: data.mcNumber,
        buyerName: data.buyerName,
        sellerName: data.sellerName,
        amount: `$${data.amount.toLocaleString()}`,
        status: data.status.replace(/_/g, ' '),
        adminUrl: `${this.frontendUrl}/admin/transactions`,
      });

      logger.info(`Admin notification sent: Transaction ${data.transactionId} - ${data.status}`);
    } catch (error) {
      logger.error('Failed to send transaction admin notification:', error);
    }
  }

  /**
   * Notify admins of account dispute/block
   */
  async notifyDispute(data: {
    userName: string;
    userEmail: string;
    cardholderName: string;
    accountName: string;
    disputeType: 'blocked' | 'submitted';
    disputeReason?: string;
  }): Promise<void> {
    try {
      const [emails, enabled] = await Promise.all([
        this.getAdminEmails(),
        this.isNotificationEnabled('notify_disputes'),
      ]);

      if (!enabled || emails.length === 0) {
        return;
      }

      await emailService.sendAdminDisputeNotification(emails, {
        userName: data.userName,
        userEmail: data.userEmail,
        cardholderName: data.cardholderName,
        accountName: data.accountName,
        disputeType: data.disputeType === 'blocked' ? 'Account Blocked' : 'Dispute Submitted',
        disputeReason: data.disputeReason,
        adminUrl: `${this.frontendUrl}/admin/disputes`,
      });

      logger.info(`Admin notification sent: Dispute - ${data.userEmail} (${data.disputeType})`);
    } catch (error) {
      logger.error('Failed to send dispute admin notification:', error);
    }
  }

  /**
   * Notify admins of new consultation request
   */
  async notifyConsultation(data: {
    name: string;
    email: string;
    phone: string;
    preferredDate: string;
    preferredTime: string;
    message?: string;
  }): Promise<void> {
    try {
      const [emails, enabled] = await Promise.all([
        this.getAdminEmails(),
        this.isNotificationEnabled('notify_consultations'),
      ]);

      if (!enabled || emails.length === 0) {
        return;
      }

      await emailService.sendAdminConsultationNotification(emails, {
        name: data.name,
        email: data.email,
        phone: data.phone,
        preferredDate: data.preferredDate,
        preferredTime: data.preferredTime,
        message: data.message,
        adminUrl: `${this.frontendUrl}/admin/consultations`,
      });

      logger.info(`Admin notification sent: Consultation request from ${data.email}`);
    } catch (error) {
      logger.error('Failed to send consultation admin notification:', error);
    }
  }
}

export const adminNotificationService = new AdminNotificationService();
export default adminNotificationService;
