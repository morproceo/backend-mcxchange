import Stripe from 'stripe';
import { config } from '../config';
import logger, { logError } from '../utils/logger';
import { BadRequestError, PaymentRequiredError } from '../middleware/errorHandler';

// Initialize Stripe client
const stripe = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey, {
      apiVersion: '2025-11-17.clover' as const,
      typescript: true,
    })
  : null;

// ============================================
// Types
// ============================================

export interface CreatePaymentIntentParams {
  amount: number; // In cents
  currency?: string;
  customerId?: string;
  metadata?: Record<string, string>;
  description?: string;
  receiptEmail?: string;
}

export interface CreateSubscriptionParams {
  customerId: string;
  priceId: string;
  metadata?: Record<string, string>;
}

export interface CustomerData {
  email: string;
  name: string;
  phone?: string;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  status?: string;
  error?: string;
}

export interface SubscriptionResult {
  success: boolean;
  subscriptionId?: string;
  status?: string;
  clientSecret?: string;
  error?: string;
}

// Stripe price IDs for subscription plans (configure in Stripe dashboard)
export const SUBSCRIPTION_PRICE_IDS = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly',
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY || 'price_starter_yearly',
  },
  professional: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || 'price_professional_monthly',
    yearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY || 'price_professional_yearly',
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || 'price_enterprise_monthly',
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || 'price_enterprise_yearly',
  },
};

class StripeService {
  private enabled: boolean = false;

  constructor() {
    if (stripe) {
      this.enabled = true;
      logger.info('Stripe service initialized');
    } else {
      logger.warn('Stripe service disabled - STRIPE_SECRET_KEY not configured');
    }
  }

  /**
   * Check if Stripe is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get Stripe instance (for direct access if needed)
   */
  getStripe(): Stripe | null {
    return stripe;
  }

  // ============================================
  // Customer Management
  // ============================================

  /**
   * Create a Stripe customer
   */
  async createCustomer(data: CustomerData): Promise<Stripe.Customer> {
    if (!stripe) throw new BadRequestError('Payment service not available');

    try {
      const customer = await stripe.customers.create({
        email: data.email,
        name: data.name,
        phone: data.phone,
        metadata: data.metadata,
      });

      logger.info('Stripe customer created', { customerId: customer.id, email: data.email });
      return customer;
    } catch (error) {
      logError('Failed to create Stripe customer', error as Error, { email: data.email });
      throw new BadRequestError('Failed to create payment profile');
    }
  }

  /**
   * Get or create a Stripe customer for a user
   */
  async getOrCreateCustomer(
    userId: string,
    email: string,
    name: string
  ): Promise<Stripe.Customer> {
    if (!stripe) throw new BadRequestError('Payment service not available');

    try {
      // Search for existing customer by metadata
      const existingCustomers = await stripe.customers.list({
        email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        const existing = existingCustomers.data[0];
        // Update metadata if userId not set
        if (!existing.metadata?.userId) {
          await stripe.customers.update(existing.id, {
            metadata: { ...existing.metadata, userId },
          });
        }
        return existing;
      }

      // Create new customer
      return this.createCustomer({
        email,
        name,
        metadata: { userId },
      });
    } catch (error) {
      logError('Failed to get/create Stripe customer', error as Error, { userId });
      throw new BadRequestError('Failed to access payment profile');
    }
  }

  /**
   * Update customer information
   */
  async updateCustomer(
    customerId: string,
    data: Partial<CustomerData>
  ): Promise<Stripe.Customer> {
    if (!stripe) throw new BadRequestError('Payment service not available');

    try {
      return await stripe.customers.update(customerId, {
        email: data.email,
        name: data.name,
        phone: data.phone,
        metadata: data.metadata,
      });
    } catch (error) {
      logError('Failed to update Stripe customer', error as Error, { customerId });
      throw new BadRequestError('Failed to update payment profile');
    }
  }

  /**
   * Delete a customer
   */
  async deleteCustomer(customerId: string): Promise<boolean> {
    if (!stripe) return false;

    try {
      await stripe.customers.del(customerId);
      logger.info('Stripe customer deleted', { customerId });
      return true;
    } catch (error) {
      logError('Failed to delete Stripe customer', error as Error, { customerId });
      return false;
    }
  }

  // ============================================
  // Payment Intents
  // ============================================

  /**
   * Create a payment intent for one-time payments (deposits, final payments)
   */
  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentResult> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: params.amount,
        currency: params.currency || 'usd',
        customer: params.customerId,
        metadata: params.metadata,
        description: params.description,
        receipt_email: params.receiptEmail,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      logger.info('Payment intent created', {
        paymentIntentId: paymentIntent.id,
        amount: params.amount,
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret || undefined,
        status: paymentIntent.status,
      };
    } catch (error) {
      logError('Failed to create payment intent', error as Error, { amount: params.amount });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Retrieve a payment intent
   */
  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    if (!stripe) return null;

    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      logError('Failed to retrieve payment intent', error as Error, { paymentIntentId });
      return null;
    }
  }

  /**
   * Confirm a payment intent (server-side confirmation)
   */
  async confirmPaymentIntent(paymentIntentId: string): Promise<PaymentResult> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);

      return {
        success: paymentIntent.status === 'succeeded',
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
    } catch (error) {
      logError('Failed to confirm payment intent', error as Error, { paymentIntentId });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Cancel a payment intent
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<boolean> {
    if (!stripe) return false;

    try {
      await stripe.paymentIntents.cancel(paymentIntentId);
      logger.info('Payment intent cancelled', { paymentIntentId });
      return true;
    } catch (error) {
      logError('Failed to cancel payment intent', error as Error, { paymentIntentId });
      return false;
    }
  }

  // ============================================
  // Subscriptions
  // ============================================

  /**
   * Create a subscription
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const subscription = await stripe.subscriptions.create({
        customer: params.customerId,
        items: [{ price: params.priceId }],
        metadata: params.metadata,
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = (invoice as any).payment_intent as Stripe.PaymentIntent;

      logger.info('Subscription created', {
        subscriptionId: subscription.id,
        customerId: params.customerId,
      });

      return {
        success: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret: paymentIntent?.client_secret || undefined,
      };
    } catch (error) {
      logError('Failed to create subscription', error as Error, {
        customerId: params.customerId,
      });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    if (!stripe) return null;

    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      logError('Failed to retrieve subscription', error as Error, { subscriptionId });
      return null;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelImmediately: boolean = false
  ): Promise<boolean> {
    if (!stripe) return false;

    try {
      if (cancelImmediately) {
        await stripe.subscriptions.cancel(subscriptionId);
      } else {
        // Cancel at period end
        await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }

      logger.info('Subscription cancelled', { subscriptionId, immediate: cancelImmediately });
      return true;
    } catch (error) {
      logError('Failed to cancel subscription', error as Error, { subscriptionId });
      return false;
    }
  }

  /**
   * Update subscription (change plan)
   */
  async updateSubscription(
    subscriptionId: string,
    newPriceId: string
  ): Promise<SubscriptionResult> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      // Get current subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const currentItemId = subscription.items.data[0]?.id;

      if (!currentItemId) {
        throw new Error('No subscription item found');
      }

      // Update the subscription
      const updated = await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: currentItemId,
            price: newPriceId,
          },
        ],
        proration_behavior: 'create_prorations',
      });

      logger.info('Subscription updated', { subscriptionId, newPriceId });

      return {
        success: true,
        subscriptionId: updated.id,
        status: updated.status,
      };
    } catch (error) {
      logError('Failed to update subscription', error as Error, { subscriptionId });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Reactivate a cancelled subscription (before period ends)
   */
  async reactivateSubscription(subscriptionId: string): Promise<boolean> {
    if (!stripe) return false;

    try {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      logger.info('Subscription reactivated', { subscriptionId });
      return true;
    } catch (error) {
      logError('Failed to reactivate subscription', error as Error, { subscriptionId });
      return false;
    }
  }

  // ============================================
  // Refunds
  // ============================================

  /**
   * Create a refund
   */
  async createRefund(
    paymentIntentId: string,
    amount?: number,
    reason?: string
  ): Promise<{ success: boolean; refundId?: string; error?: string }> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount, // If undefined, refunds the entire amount
        reason: reason as Stripe.RefundCreateParams.Reason,
      });

      logger.info('Refund created', {
        refundId: refund.id,
        paymentIntentId,
        amount: refund.amount,
      });

      return {
        success: true,
        refundId: refund.id,
      };
    } catch (error) {
      logError('Failed to create refund', error as Error, { paymentIntentId });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // ============================================
  // Webhook Handling
  // ============================================

  /**
   * Construct and verify webhook event
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string
  ): Stripe.Event | null {
    if (!stripe || !config.stripe.webhookSecret) {
      logger.error('Webhook verification failed - missing configuration');
      return null;
    }

    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripe.webhookSecret
      );
    } catch (error) {
      logError('Webhook signature verification failed', error as Error);
      return null;
    }
  }

  // ============================================
  // Payment Methods
  // ============================================

  /**
   * List customer payment methods
   */
  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    if (!stripe) return [];

    try {
      const methods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      return methods.data;
    } catch (error) {
      logError('Failed to list payment methods', error as Error, { customerId });
      return [];
    }
  }

  /**
   * Detach a payment method from customer
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<boolean> {
    if (!stripe) return false;

    try {
      await stripe.paymentMethods.detach(paymentMethodId);
      return true;
    } catch (error) {
      logError('Failed to detach payment method', error as Error, { paymentMethodId });
      return false;
    }
  }

  /**
   * Set default payment method for customer
   */
  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<boolean> {
    if (!stripe) return false;

    try {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      return true;
    } catch (error) {
      logError('Failed to set default payment method', error as Error, {
        customerId,
        paymentMethodId,
      });
      return false;
    }
  }

  // ============================================
  // Setup Intents (for saving payment methods)
  // ============================================

  /**
   * Create a setup intent for saving payment methods
   */
  async createSetupIntent(customerId: string): Promise<{
    success: boolean;
    clientSecret?: string;
    error?: string;
  }> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        success: true,
        clientSecret: setupIntent.client_secret || undefined,
      };
    } catch (error) {
      logError('Failed to create setup intent', error as Error, { customerId });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // ============================================
  // Invoices
  // ============================================

  /**
   * Get customer invoices
   */
  async getInvoices(
    customerId: string,
    limit: number = 10
  ): Promise<Stripe.Invoice[]> {
    if (!stripe) return [];

    try {
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit,
      });

      return invoices.data;
    } catch (error) {
      logError('Failed to get invoices', error as Error, { customerId });
      return [];
    }
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<Stripe.Invoice | null> {
    if (!stripe) return null;

    try {
      return await stripe.invoices.retrieve(invoiceId);
    } catch (error) {
      logError('Failed to get invoice', error as Error, { invoiceId });
      return null;
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Convert dollars to cents
   */
  dollarsToCents(dollars: number): number {
    return Math.round(dollars * 100);
  }

  /**
   * Convert cents to dollars
   */
  centsToDollars(cents: number): number {
    return cents / 100;
  }

  /**
   * Get price ID for a subscription plan
   */
  getPriceId(
    plan: 'starter' | 'professional' | 'enterprise',
    interval: 'monthly' | 'yearly'
  ): string {
    return SUBSCRIPTION_PRICE_IDS[plan][interval];
  }
}

// Export singleton instance
export const stripeService = new StripeService();
export default stripeService;
