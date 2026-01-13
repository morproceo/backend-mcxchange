import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config';
import logger, { logError } from '../utils/logger';
import path from 'path';
import fs from 'fs';

// Email types
export type EmailType =
  | 'welcome'
  | 'email-verification'
  | 'password-reset'
  | 'offer-notification'
  | 'offer-accepted'
  | 'offer-rejected'
  | 'offer-countered'
  | 'transaction-update'
  | 'listing-approved'
  | 'listing-rejected'
  | 'payment-received'
  | 'payment-reminder'
  | 'account-blocked';

// Email data interfaces
export interface WelcomeEmailData {
  name: string;
  role: string;
}

export interface VerificationEmailData {
  name: string;
  verificationUrl: string;
  expiresIn: string;
}

export interface PasswordResetEmailData {
  name: string;
  resetUrl: string;
  expiresIn: string;
}

export interface OfferNotificationData {
  sellerName: string;
  buyerName: string;
  mcNumber: string;
  listingTitle: string;
  offerAmount: number;
  message?: string;
  offerUrl: string;
}

export interface OfferResponseData {
  buyerName: string;
  sellerName: string;
  mcNumber: string;
  listingTitle: string;
  offerAmount: number;
  status: 'accepted' | 'rejected' | 'countered';
  counterAmount?: number;
  message?: string;
  actionUrl: string;
}

export interface TransactionUpdateData {
  userName: string;
  mcNumber: string;
  listingTitle: string;
  status: string;
  statusDescription: string;
  transactionUrl: string;
  actionRequired?: string;
}

export interface ListingStatusData {
  sellerName: string;
  mcNumber: string;
  listingTitle: string;
  status: 'approved' | 'rejected';
  reason?: string;
  listingUrl?: string;
}

export interface PaymentData {
  userName: string;
  mcNumber: string;
  amount: number;
  paymentType: string;
  transactionUrl?: string;
}

export interface AccountBlockedData {
  userName: string;
  cardholderName: string;
  accountName: string;
  disputeUrl: string;
}

// Admin notification data interfaces
export interface AdminNewUserData {
  userName: string;
  userEmail: string;
  userRole: string;
  registeredAt: string;
  adminUrl: string;
}

export interface AdminNewInquiryData {
  senderName: string;
  senderEmail: string;
  messagePreview: string;
  listingInfo?: string;
  adminUrl: string;
}

export interface AdminNewTransactionData {
  transactionId: string;
  mcNumber: string;
  buyerName: string;
  sellerName: string;
  amount: string;
  status: string;
  adminUrl: string;
}

export interface AdminDisputeData {
  userName: string;
  userEmail: string;
  cardholderName: string;
  accountName: string;
  disputeType: string; // 'Account Blocked' | 'Dispute Submitted' or similar
  disputeReason?: string;
  adminUrl: string;
}

export interface AdminConsultationData {
  name: string;
  email: string;
  phone: string;
  preferredDate: string;
  preferredTime: string;
  message?: string;
  adminUrl: string;
}

// Email template
interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private enabled: boolean = false;
  private templatesDir: string;

  constructor() {
    this.templatesDir = path.join(__dirname, '../templates/emails');

    // Initialize Nodemailer with SMTP settings
    if (config.smtp.host && config.smtp.user) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure, // true for 465, false for other ports
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });
      this.enabled = true;
      logger.info(`Email service initialized with SMTP (${config.smtp.host}:${config.smtp.port})`);
    } else {
      logger.warn('Email service disabled - SMTP not configured (set SMTP_HOST and SMTP_USER)');
    }
  }

  /**
   * Check if email service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send an email
   */
  private async send(
    to: string,
    subject: string,
    html: string,
    text?: string
  ): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      logger.warn('Email not sent - service disabled', { to, subject });
      return false;
    }

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: `${config.smtp.fromName} <${config.smtp.fromEmail}>`,
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
      };

      // Add replyTo if configured
      if (config.smtp.replyTo) {
        mailOptions.replyTo = config.smtp.replyTo;
      }

      const result = await this.transporter.sendMail(mailOptions);

      logger.info('Email sent successfully', {
        to,
        subject,
        messageId: result.messageId,
      });

      return true;
    } catch (error) {
      logError('Failed to send email', error as Error, { to, subject });
      return false;
    }
  }

  /**
   * Convert HTML to plain text (simple version)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Load and compile an email template
   */
  private compileTemplate(
    templateName: string,
    data: Record<string, any>
  ): EmailTemplate {
    // For now, use inline templates
    // In production, you'd load from files
    const templates = this.getTemplates();
    const template = templates[templateName];

    if (!template) {
      throw new Error(`Email template '${templateName}' not found`);
    }

    // Simple template variable replacement
    let html = template.html;
    let text = template.text;
    const subject = this.replaceVariables(template.subject, data);

    html = this.replaceVariables(html, data);
    text = this.replaceVariables(text, data);

    return { subject, html, text };
  }

  /**
   * Replace template variables
   */
  private replaceVariables(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  /**
   * Get all email templates
   */
  private getTemplates(): Record<string, EmailTemplate> {
    const baseStyles = `
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
        .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .highlight { background: #f0f7ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .amount { font-size: 24px; font-weight: bold; color: #667eea; }
      </style>
    `;

    return {
      welcome: {
        subject: 'Welcome to MC Exchange!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to MC Exchange!</h1>
              </div>
              <div class="content">
                <h2>Hi {{name}},</h2>
                <p>Welcome to MC Exchange - the premier marketplace for Motor Carrier authorities!</p>
                <p>Your account has been created as a <strong>{{role}}</strong>.</p>
                <div class="highlight">
                  <p><strong>What's next?</strong></p>
                  <ul>
                    <li>Complete your profile</li>
                    <li>Verify your email address</li>
                    <li>Start exploring the marketplace</li>
                  </ul>
                </div>
                <a href="{{dashboardUrl}}" class="button">Go to Dashboard</a>
                <p>If you have any questions, our support team is here to help.</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
                <p>This email was sent to you because you created an account on MC Exchange.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Welcome to MC Exchange!

          Hi {{name}},

          Welcome to MC Exchange - the premier marketplace for Motor Carrier authorities!

          Your account has been created as a {{role}}.

          What's next?
          - Complete your profile
          - Verify your email address
          - Start exploring the marketplace

          Visit your dashboard: {{dashboardUrl}}

          If you have any questions, our support team is here to help.
        `,
      },

      'email-verification': {
        subject: 'Verify your email address',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Verify Your Email</h1>
              </div>
              <div class="content">
                <h2>Hi {{name}},</h2>
                <p>Please verify your email address to complete your MC Exchange registration.</p>
                <p>Click the button below to verify your email:</p>
                <a href="{{verificationUrl}}" class="button">Verify Email Address</a>
                <div class="highlight">
                  <p><strong>Note:</strong> This link will expire in {{expiresIn}}.</p>
                </div>
                <p>If you didn't create an account on MC Exchange, you can safely ignore this email.</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Verify Your Email Address

          Hi {{name}},

          Please verify your email address to complete your MC Exchange registration.

          Click here to verify: {{verificationUrl}}

          Note: This link will expire in {{expiresIn}}.

          If you didn't create an account on MC Exchange, you can safely ignore this email.
        `,
      },

      'password-reset': {
        subject: 'Reset your password',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Password Reset</h1>
              </div>
              <div class="content">
                <h2>Hi {{name}},</h2>
                <p>We received a request to reset your password for your MC Exchange account.</p>
                <p>Click the button below to reset your password:</p>
                <a href="{{resetUrl}}" class="button">Reset Password</a>
                <div class="highlight">
                  <p><strong>Note:</strong> This link will expire in {{expiresIn}}.</p>
                </div>
                <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Password Reset

          Hi {{name}},

          We received a request to reset your password for your MC Exchange account.

          Click here to reset your password: {{resetUrl}}

          Note: This link will expire in {{expiresIn}}.

          If you didn't request a password reset, you can safely ignore this email.
        `,
      },

      'offer-notification': {
        subject: 'New offer on your MC listing - {{mcNumber}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header">
                <h1>New Offer Received!</h1>
              </div>
              <div class="content">
                <h2>Hi {{sellerName}},</h2>
                <p>Great news! You've received a new offer on your MC listing.</p>
                <div class="highlight">
                  <p><strong>Listing:</strong> {{listingTitle}}</p>
                  <p><strong>MC Number:</strong> {{mcNumber}}</p>
                  <p><strong>Offer Amount:</strong> <span class="amount">\${{offerAmount}}</span></p>
                  <p><strong>Buyer:</strong> {{buyerName}}</p>
                  {{#if message}}
                  <p><strong>Message:</strong> {{message}}</p>
                  {{/if}}
                </div>
                <a href="{{offerUrl}}" class="button">Review Offer</a>
                <p>Log in to your dashboard to accept, reject, or counter this offer.</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          New Offer Received!

          Hi {{sellerName}},

          Great news! You've received a new offer on your MC listing.

          Listing: {{listingTitle}}
          MC Number: {{mcNumber}}
          Offer Amount: \${{offerAmount}}
          Buyer: {{buyerName}}

          Review the offer: {{offerUrl}}
        `,
      },

      'offer-accepted': {
        subject: 'Your offer has been accepted! - {{mcNumber}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);">
                <h1>Offer Accepted!</h1>
              </div>
              <div class="content">
                <h2>Congratulations {{buyerName}}!</h2>
                <p>Your offer has been accepted by the seller.</p>
                <div class="highlight">
                  <p><strong>Listing:</strong> {{listingTitle}}</p>
                  <p><strong>MC Number:</strong> {{mcNumber}}</p>
                  <p><strong>Accepted Amount:</strong> <span class="amount">\${{offerAmount}}</span></p>
                </div>
                <p><strong>Next Steps:</strong></p>
                <ol>
                  <li>A transaction room has been created</li>
                  <li>Review and accept the terms</li>
                  <li>Pay the deposit to proceed</li>
                </ol>
                <a href="{{actionUrl}}" class="button">Go to Transaction</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Offer Accepted!

          Congratulations {{buyerName}}!

          Your offer has been accepted by the seller.

          Listing: {{listingTitle}}
          MC Number: {{mcNumber}}
          Accepted Amount: \${{offerAmount}}

          Next Steps:
          1. A transaction room has been created
          2. Review and accept the terms
          3. Pay the deposit to proceed

          Go to transaction: {{actionUrl}}
        `,
      },

      'offer-rejected': {
        subject: 'Update on your offer - {{mcNumber}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: #666;">
                <h1>Offer Update</h1>
              </div>
              <div class="content">
                <h2>Hi {{buyerName}},</h2>
                <p>Unfortunately, the seller has declined your offer.</p>
                <div class="highlight">
                  <p><strong>Listing:</strong> {{listingTitle}}</p>
                  <p><strong>MC Number:</strong> {{mcNumber}}</p>
                  <p><strong>Your Offer:</strong> \${{offerAmount}}</p>
                </div>
                <p>Don't be discouraged! There are many other great MC authorities available on our marketplace.</p>
                <a href="{{actionUrl}}" class="button">Browse Listings</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Offer Update

          Hi {{buyerName}},

          Unfortunately, the seller has declined your offer.

          Listing: {{listingTitle}}
          MC Number: {{mcNumber}}
          Your Offer: \${{offerAmount}}

          Browse more listings: {{actionUrl}}
        `,
      },

      'offer-countered': {
        subject: 'Counter offer received - {{mcNumber}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                <h1>Counter Offer!</h1>
              </div>
              <div class="content">
                <h2>Hi {{buyerName}},</h2>
                <p>The seller has made a counter offer on your bid.</p>
                <div class="highlight">
                  <p><strong>Listing:</strong> {{listingTitle}}</p>
                  <p><strong>MC Number:</strong> {{mcNumber}}</p>
                  <p><strong>Your Offer:</strong> \${{offerAmount}}</p>
                  <p><strong>Counter Offer:</strong> <span class="amount">\${{counterAmount}}</span></p>
                </div>
                <a href="{{actionUrl}}" class="button">Review Counter Offer</a>
                <p>Log in to accept, reject, or make a new offer.</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Counter Offer Received!

          Hi {{buyerName}},

          The seller has made a counter offer on your bid.

          Listing: {{listingTitle}}
          MC Number: {{mcNumber}}
          Your Offer: \${{offerAmount}}
          Counter Offer: \${{counterAmount}}

          Review counter offer: {{actionUrl}}
        `,
      },

      'transaction-update': {
        subject: 'Transaction Update - {{mcNumber}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Transaction Update</h1>
              </div>
              <div class="content">
                <h2>Hi {{userName}},</h2>
                <p>There's an update on your transaction.</p>
                <div class="highlight">
                  <p><strong>MC Number:</strong> {{mcNumber}}</p>
                  <p><strong>Listing:</strong> {{listingTitle}}</p>
                  <p><strong>New Status:</strong> {{status}}</p>
                  <p>{{statusDescription}}</p>
                </div>
                {{#if actionRequired}}
                <p><strong>Action Required:</strong> {{actionRequired}}</p>
                {{/if}}
                <a href="{{transactionUrl}}" class="button">View Transaction</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Transaction Update

          Hi {{userName}},

          There's an update on your transaction.

          MC Number: {{mcNumber}}
          Listing: {{listingTitle}}
          New Status: {{status}}
          {{statusDescription}}

          View transaction: {{transactionUrl}}
        `,
      },

      'listing-approved': {
        subject: 'Your listing has been approved! - {{mcNumber}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);">
                <h1>Listing Approved!</h1>
              </div>
              <div class="content">
                <h2>Congratulations {{sellerName}}!</h2>
                <p>Your MC listing has been approved and is now live on the marketplace.</p>
                <div class="highlight">
                  <p><strong>Listing:</strong> {{listingTitle}}</p>
                  <p><strong>MC Number:</strong> {{mcNumber}}</p>
                </div>
                <a href="{{listingUrl}}" class="button">View Your Listing</a>
                <p>Potential buyers can now view and make offers on your listing.</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Listing Approved!

          Congratulations {{sellerName}}!

          Your MC listing has been approved and is now live on the marketplace.

          Listing: {{listingTitle}}
          MC Number: {{mcNumber}}

          View your listing: {{listingUrl}}
        `,
      },

      'listing-rejected': {
        subject: 'Update on your listing - {{mcNumber}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: #666;">
                <h1>Listing Update</h1>
              </div>
              <div class="content">
                <h2>Hi {{sellerName}},</h2>
                <p>Unfortunately, your listing could not be approved at this time.</p>
                <div class="highlight">
                  <p><strong>Listing:</strong> {{listingTitle}}</p>
                  <p><strong>MC Number:</strong> {{mcNumber}}</p>
                  <p><strong>Reason:</strong> {{reason}}</p>
                </div>
                <p>Please review the feedback and resubmit your listing after making the necessary changes.</p>
                <a href="{{dashboardUrl}}" class="button">Go to Dashboard</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Listing Update

          Hi {{sellerName}},

          Unfortunately, your listing could not be approved at this time.

          Listing: {{listingTitle}}
          MC Number: {{mcNumber}}
          Reason: {{reason}}

          Please review the feedback and resubmit after making necessary changes.
        `,
      },

      'payment-received': {
        subject: 'Payment Confirmed - MC Exchange',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);">
                <h1>Payment Confirmed</h1>
              </div>
              <div class="content">
                <h2>Hi {{userName}},</h2>
                <p>We've received your payment.</p>
                <div class="highlight">
                  <p><strong>Amount:</strong> <span class="amount">\${{amount}}</span></p>
                  <p><strong>Type:</strong> {{paymentType}}</p>
                  <p><strong>MC Number:</strong> {{mcNumber}}</p>
                </div>
                <a href="{{transactionUrl}}" class="button">View Transaction</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Payment Confirmed

          Hi {{userName}},

          We've received your payment.

          Amount: \${{amount}}
          Type: {{paymentType}}
          MC Number: {{mcNumber}}

          View transaction: {{transactionUrl}}
        `,
      },

      'account-blocked': {
        subject: 'Important: Your Account Has Been Blocked - Action Required',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);">
                <h1>Account Blocked</h1>
              </div>
              <div class="content">
                <h2>Hi {{userName}},</h2>
                <p>Your MC Exchange account has been temporarily blocked due to a payment verification issue.</p>

                <div class="highlight" style="background: #fef2f2; border: 1px solid #fecaca;">
                  <p><strong>Reason:</strong> The cardholder name on a recent payment does not match your account name.</p>
                  <p><strong>Cardholder Name:</strong> {{cardholderName}}</p>
                  <p><strong>Account Name:</strong> {{accountName}}</p>
                </div>

                <p>This security measure helps protect our users from unauthorized transactions.</p>

                <h3>What can you do?</h3>
                <p>If this payment was made by you or with your permission, you can submit a dispute to restore your account. After submitting the dispute form, your account will be automatically restored within 24 hours.</p>

                <a href="{{disputeUrl}}" class="button" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">Submit Dispute Form</a>

                <div class="highlight" style="background: #f0f9ff; border: 1px solid #bae6fd;">
                  <p><strong>Important:</strong></p>
                  <ul>
                    <li>You will need to provide your email and explain the name discrepancy</li>
                    <li>After submission, your account will be reviewed</li>
                    <li>Your account will be restored within 24 hours if no issues are found</li>
                    <li>An admin may restore your account sooner</li>
                  </ul>
                </div>

                <p>If you did not make this payment or have any concerns, please contact our support team immediately.</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange. All rights reserved.</p>
                <p>Need help? Contact us at support@domilea.io</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Account Blocked - Action Required

          Hi {{userName}},

          Your MC Exchange account has been temporarily blocked due to a payment verification issue.

          Reason: The cardholder name on a recent payment does not match your account name.
          Cardholder Name: {{cardholderName}}
          Account Name: {{accountName}}

          This security measure helps protect our users from unauthorized transactions.

          What can you do?
          If this payment was made by you or with your permission, you can submit a dispute to restore your account.

          Submit your dispute here: {{disputeUrl}}

          After submission, your account will be reviewed and restored within 24 hours if no issues are found.

          If you did not make this payment or have any concerns, please contact our support team at support@domilea.io.
        `,
      },

      // ============================================
      // Admin Notification Templates
      // ============================================

      'admin-new-user': {
        subject: 'New User Registration - {{userName}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
                <h1>New User Registration</h1>
              </div>
              <div class="content">
                <h2>Admin Alert</h2>
                <p>A new user has registered on MC Exchange.</p>
                <div class="highlight">
                  <p><strong>Name:</strong> {{userName}}</p>
                  <p><strong>Email:</strong> {{userEmail}}</p>
                  <p><strong>Role:</strong> {{userRole}}</p>
                  <p><strong>Registered:</strong> {{registeredAt}}</p>
                </div>
                <a href="{{adminUrl}}" class="button">View in Admin Panel</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange - Admin Notification</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          New User Registration

          A new user has registered on MC Exchange.

          Name: {{userName}}
          Email: {{userEmail}}
          Role: {{userRole}}
          Registered: {{registeredAt}}

          View in Admin Panel: {{adminUrl}}
        `,
      },

      'admin-new-inquiry': {
        subject: 'New Inquiry from {{senderName}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);">
                <h1>New Inquiry Received</h1>
              </div>
              <div class="content">
                <h2>Admin Alert</h2>
                <p>A new inquiry has been submitted.</p>
                <div class="highlight">
                  <p><strong>From:</strong> {{senderName}}</p>
                  <p><strong>Email:</strong> {{senderEmail}}</p>
                  <p><strong>Listing:</strong> {{listingInfo}}</p>
                </div>
                <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p style="margin: 0; font-style: italic;">"{{messagePreview}}"</p>
                </div>
                <a href="{{adminUrl}}" class="button">View Message</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange - Admin Notification</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          New Inquiry Received

          From: {{senderName}}
          Email: {{senderEmail}}
          Listing: {{listingInfo}}

          Message:
          "{{messagePreview}}"

          View Message: {{adminUrl}}
        `,
      },

      'admin-new-transaction': {
        subject: 'Transaction Update - MC#{{mcNumber}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                <h1>Transaction Update</h1>
              </div>
              <div class="content">
                <h2>Admin Alert</h2>
                <p>A transaction has been updated.</p>
                <div class="highlight">
                  <p><strong>Transaction ID:</strong> {{transactionId}}</p>
                  <p><strong>MC Number:</strong> {{mcNumber}}</p>
                  <p><strong>Buyer:</strong> {{buyerName}}</p>
                  <p><strong>Seller:</strong> {{sellerName}}</p>
                  <p><strong>Amount:</strong> <span class="amount">{{amount}}</span></p>
                  <p><strong>Status:</strong> {{status}}</p>
                </div>
                <a href="{{adminUrl}}" class="button">View Transaction</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange - Admin Notification</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Transaction Update

          Transaction ID: {{transactionId}}
          MC Number: {{mcNumber}}
          Buyer: {{buyerName}}
          Seller: {{sellerName}}
          Amount: {{amount}}
          Status: {{status}}

          View Transaction: {{adminUrl}}
        `,
      },

      'admin-dispute': {
        subject: 'Account Dispute Alert - {{userName}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                <h1>Account Dispute Alert</h1>
              </div>
              <div class="content">
                <h2>Admin Alert</h2>
                <p>An account dispute requires attention.</p>
                <div class="highlight" style="background: #fef2f2; border: 1px solid #fecaca;">
                  <p><strong>User:</strong> {{userName}}</p>
                  <p><strong>Email:</strong> {{userEmail}}</p>
                  <p><strong>Cardholder Name:</strong> {{cardholderName}}</p>
                  <p><strong>Account Name:</strong> {{accountName}}</p>
                  <p><strong>Status:</strong> {{disputeType}}</p>
                </div>
                {{#if disputeReason}}
                <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p style="margin: 0;"><strong>Reason:</strong> {{disputeReason}}</p>
                </div>
                {{/if}}
                <a href="{{adminUrl}}" class="button">Review Dispute</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange - Admin Notification</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Account Dispute Alert

          User: {{userName}}
          Email: {{userEmail}}
          Cardholder Name: {{cardholderName}}
          Account Name: {{accountName}}
          Status: {{disputeType}}
          Reason: {{disputeReason}}

          Review Dispute: {{adminUrl}}
        `,
      },

      'admin-consultation': {
        subject: 'New Consultation Request - {{name}}',
        html: `
          <!DOCTYPE html>
          <html>
          <head>${baseStyles}</head>
          <body>
            <div class="container">
              <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                <h1>New Consultation Request</h1>
              </div>
              <div class="content">
                <h2>Admin Alert</h2>
                <p>A new consultation has been requested.</p>
                <div class="highlight">
                  <p><strong>Name:</strong> {{name}}</p>
                  <p><strong>Email:</strong> {{email}}</p>
                  <p><strong>Phone:</strong> {{phone}}</p>
                  <p><strong>Preferred Date:</strong> {{preferredDate}}</p>
                  <p><strong>Preferred Time:</strong> {{preferredTime}}</p>
                </div>
                {{#if message}}
                <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p style="margin: 0;"><strong>Message:</strong> {{message}}</p>
                </div>
                {{/if}}
                <a href="{{adminUrl}}" class="button">View Request</a>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MC Exchange - Admin Notification</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          New Consultation Request

          Name: {{name}}
          Email: {{email}}
          Phone: {{phone}}
          Preferred Date: {{preferredDate}}
          Preferred Time: {{preferredTime}}
          Message: {{message}}

          View Request: {{adminUrl}}
        `,
      },
    };
  }

  // ============================================
  // Public Email Methods
  // ============================================

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    to: string,
    data: WelcomeEmailData
  ): Promise<boolean> {
    const template = this.compileTemplate('welcome', {
      ...data,
      dashboardUrl: `${config.frontendUrl}/dashboard`,
    });
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(
    to: string,
    data: VerificationEmailData
  ): Promise<boolean> {
    const template = this.compileTemplate('email-verification', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    to: string,
    data: PasswordResetEmailData
  ): Promise<boolean> {
    const template = this.compileTemplate('password-reset', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send new offer notification to seller
   */
  async sendOfferNotification(
    to: string,
    data: OfferNotificationData
  ): Promise<boolean> {
    const template = this.compileTemplate('offer-notification', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send offer accepted notification to buyer
   */
  async sendOfferAccepted(
    to: string,
    data: OfferResponseData
  ): Promise<boolean> {
    const template = this.compileTemplate('offer-accepted', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send offer rejected notification to buyer
   */
  async sendOfferRejected(
    to: string,
    data: OfferResponseData
  ): Promise<boolean> {
    const template = this.compileTemplate('offer-rejected', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send counter offer notification to buyer
   */
  async sendOfferCountered(
    to: string,
    data: OfferResponseData
  ): Promise<boolean> {
    const template = this.compileTemplate('offer-countered', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send transaction status update
   */
  async sendTransactionUpdate(
    to: string,
    data: TransactionUpdateData
  ): Promise<boolean> {
    const template = this.compileTemplate('transaction-update', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send listing approved notification
   */
  async sendListingApproved(
    to: string,
    data: ListingStatusData
  ): Promise<boolean> {
    const template = this.compileTemplate('listing-approved', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send listing rejected notification
   */
  async sendListingRejected(
    to: string,
    data: ListingStatusData & { dashboardUrl: string }
  ): Promise<boolean> {
    const template = this.compileTemplate('listing-rejected', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send payment received notification
   */
  async sendPaymentReceived(
    to: string,
    data: PaymentData
  ): Promise<boolean> {
    const template = this.compileTemplate('payment-received', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  /**
   * Send a custom email
   */
  async sendCustomEmail(
    to: string,
    subject: string,
    html: string,
    text?: string
  ): Promise<boolean> {
    return this.send(to, subject, html, text);
  }

  /**
   * Send account blocked notification
   */
  async sendAccountBlockedEmail(
    to: string,
    data: AccountBlockedData
  ): Promise<boolean> {
    const template = this.compileTemplate('account-blocked', data);
    return this.send(to, template.subject, template.html, template.text);
  }

  // ============================================
  // Admin Notification Methods
  // ============================================

  /**
   * Send to multiple email addresses
   */
  private async sendToMultiple(
    emails: string[],
    subject: string,
    html: string,
    text?: string
  ): Promise<boolean> {
    const results = await Promise.all(
      emails.map((email) => this.send(email.trim(), subject, html, text))
    );
    return results.some((result) => result === true);
  }

  /**
   * Send admin notification for new user registration
   */
  async sendAdminNewUserNotification(
    emails: string[],
    data: AdminNewUserData
  ): Promise<boolean> {
    if (!emails || emails.length === 0) return false;
    const template = this.compileTemplate('admin-new-user', data);
    return this.sendToMultiple(emails, template.subject, template.html, template.text);
  }

  /**
   * Send admin notification for new inquiry
   */
  async sendAdminNewInquiryNotification(
    emails: string[],
    data: AdminNewInquiryData
  ): Promise<boolean> {
    if (!emails || emails.length === 0) return false;
    const template = this.compileTemplate('admin-new-inquiry', data);
    return this.sendToMultiple(emails, template.subject, template.html, template.text);
  }

  /**
   * Send admin notification for transaction update
   */
  async sendAdminTransactionNotification(
    emails: string[],
    data: AdminNewTransactionData
  ): Promise<boolean> {
    if (!emails || emails.length === 0) return false;
    const template = this.compileTemplate('admin-new-transaction', data);
    return this.sendToMultiple(emails, template.subject, template.html, template.text);
  }

  /**
   * Send admin notification for dispute/block
   */
  async sendAdminDisputeNotification(
    emails: string[],
    data: AdminDisputeData
  ): Promise<boolean> {
    if (!emails || emails.length === 0) return false;
    const template = this.compileTemplate('admin-dispute', data);
    return this.sendToMultiple(emails, template.subject, template.html, template.text);
  }

  /**
   * Send admin notification for consultation request
   */
  async sendAdminConsultationNotification(
    emails: string[],
    data: AdminConsultationData
  ): Promise<boolean> {
    if (!emails || emails.length === 0) return false;
    const template = this.compileTemplate('admin-consultation', data);
    return this.sendToMultiple(emails, template.subject, template.html, template.text);
  }
}

// Export singleton instance
export const emailService = new EmailService();
export default emailService;
