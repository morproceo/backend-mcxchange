import Stripe from 'stripe';
import { Op } from 'sequelize';
import { config } from '../config';
import logger, { logError } from '../utils/logger';
import { BadRequestError, PaymentRequiredError } from '../middleware/errorHandler';
import { User } from '../models';

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

export interface CheckoutSessionParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResult {
  success: boolean;
  sessionId?: string;
  url?: string;
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
   * Validate that a Stripe customer exists, returns null if not found
   */
  async validateCustomer(customerId: string): Promise<Stripe.Customer | null> {
    if (!stripe) return null;

    try {
      const customer = await stripe.customers.retrieve(customerId);
      // Check if customer was deleted
      if ((customer as any).deleted) {
        logger.warn('Stripe customer was deleted', { customerId });
        return null;
      }
      return customer as Stripe.Customer;
    } catch (error: any) {
      // Customer doesn't exist in Stripe
      if (error?.code === 'resource_missing' || error?.statusCode === 404) {
        logger.warn('Stripe customer not found', { customerId });
        return null;
      }
      logError('Failed to validate Stripe customer', error as Error, { customerId });
      return null;
    }
  }

  /**
   * Get or create a Stripe customer for a user
   * Now validates existing customer IDs and recreates if invalid
   */
  async getOrCreateCustomer(
    userId: string,
    email: string,
    name: string,
    existingCustomerId?: string
  ): Promise<Stripe.Customer> {
    if (!stripe) throw new BadRequestError('Payment service not available');

    try {
      // If we have an existing customer ID, validate it first
      if (existingCustomerId) {
        const validCustomer = await this.validateCustomer(existingCustomerId);
        if (validCustomer) {
          // Customer exists and is valid, update metadata if needed
          if (!validCustomer.metadata?.userId) {
            await stripe.customers.update(validCustomer.id, {
              metadata: { ...validCustomer.metadata, userId },
            });
          }
          return validCustomer;
        }
        // Customer ID is invalid, log warning and proceed to create new one
        logger.warn('Stored Stripe customer ID is invalid, creating new customer', {
          userId,
          invalidCustomerId: existingCustomerId,
        });
      }

      // Search for existing customer by email
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
   * Create a Stripe Checkout Session for one-time payment (listing fee)
   */
  async createListingFeeCheckout(params: {
    customerId: string;
    amount: number; // in cents
    sellerId: string;
    mcNumber: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutSessionResult> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const session = await stripe.checkout.sessions.create({
        customer: params.customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'MC Authority Listing Fee',
                description: `Listing activation fee for MC #${params.mcNumber}`,
              },
              unit_amount: params.amount,
            },
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
          type: 'listing_fee',
          sellerId: params.sellerId,
          mcNumber: params.mcNumber,
          ...params.metadata,
        },
      });

      logger.info('Listing fee checkout session created', {
        sessionId: session.id,
        customerId: params.customerId,
        sellerId: params.sellerId,
        mcNumber: params.mcNumber,
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url || undefined,
      };
    } catch (error) {
      logError('Failed to create listing fee checkout session', error as Error, {
        customerId: params.customerId,
        sellerId: params.sellerId,
      });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create a Stripe Checkout Session for MC deposit payment
   */
  async createDepositCheckout(params: {
    customerId: string;
    amount: number; // in cents (default 100000 = $1000)
    buyerId: string;
    transactionId: string;
    offerId: string;
    mcNumber: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutSessionResult> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const session = await stripe.checkout.sessions.create({
        customer: params.customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'MC Authority Deposit',
                description: `Refundable deposit for MC #${params.mcNumber} purchase`,
              },
              unit_amount: params.amount,
            },
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
          type: 'deposit',
          buyerId: params.buyerId,
          transactionId: params.transactionId,
          offerId: params.offerId,
          mcNumber: params.mcNumber,
          ...params.metadata,
        },
      });

      logger.info('Deposit checkout session created', {
        sessionId: session.id,
        customerId: params.customerId,
        buyerId: params.buyerId,
        transactionId: params.transactionId,
        mcNumber: params.mcNumber,
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url || undefined,
      };
    } catch (error) {
      logError('Failed to create deposit checkout session', error as Error, {
        customerId: params.customerId,
        buyerId: params.buyerId,
        transactionId: params.transactionId,
      });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create a Stripe Checkout Session for credit pack purchase (one-time payment)
   */
  async createCreditPackCheckout(params: {
    customerId: string;
    priceId: string;
    packId: string;
    credits: number;
    userId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutSessionResult> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const session = await stripe.checkout.sessions.create({
        customer: params.customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price: params.priceId,
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
          type: 'credit_pack',
          packId: params.packId,
          credits: params.credits.toString(),
          userId: params.userId,
          ...params.metadata,
        },
      });

      logger.info('Credit pack checkout session created', {
        sessionId: session.id,
        customerId: params.customerId,
        packId: params.packId,
        credits: params.credits,
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url || undefined,
      };
    } catch (error) {
      logError('Failed to create credit pack checkout session', error as Error, {
        customerId: params.customerId,
        packId: params.packId,
      });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create a Stripe Checkout Session for subscription
   */
  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const session = await stripe.checkout.sessions.create({
        customer: params.customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: params.priceId,
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
        subscription_data: {
          metadata: params.metadata,
        },
      });

      logger.info('Checkout session created', {
        sessionId: session.id,
        customerId: params.customerId,
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url || undefined,
      };
    } catch (error) {
      logError('Failed to create checkout session', error as Error, {
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

  /**
   * Get all charges/payments for a customer
   */
  async getCustomerCharges(
    customerId: string,
    limit: number = 100
  ): Promise<Stripe.Charge[]> {
    if (!stripe) return [];

    try {
      const charges = await stripe.charges.list({
        customer: customerId,
        limit,
      });

      return charges.data;
    } catch (error) {
      logError('Failed to get customer charges', error as Error, { customerId });
      return [];
    }
  }

  /**
   * Get all payment intents for a customer
   */
  async getCustomerPaymentIntents(
    customerId: string,
    limit: number = 100
  ): Promise<Stripe.PaymentIntent[]> {
    if (!stripe) return [];

    try {
      const paymentIntents = await stripe.paymentIntents.list({
        customer: customerId,
        limit,
      });

      return paymentIntents.data;
    } catch (error) {
      logError('Failed to get customer payment intents', error as Error, { customerId });
      return [];
    }
  }

  /**
   * Get checkout sessions for a customer
   */
  async getCustomerCheckoutSessions(
    customerId: string,
    limit: number = 100
  ): Promise<Stripe.Checkout.Session[]> {
    if (!stripe) return [];

    try {
      const sessions = await stripe.checkout.sessions.list({
        customer: customerId,
        limit,
      });

      return sessions.data;
    } catch (error) {
      logError('Failed to get customer checkout sessions', error as Error, { customerId });
      return [];
    }
  }

  /**
   * Get comprehensive payment history for a customer
   * Combines charges, payment intents, and checkout sessions
   */
  async getCustomerPaymentHistory(customerId: string): Promise<{
    charges: Stripe.Charge[];
    paymentIntents: Stripe.PaymentIntent[];
    checkoutSessions: Stripe.Checkout.Session[];
    subscriptions: Stripe.Subscription[];
  }> {
    if (!stripe) {
      return { charges: [], paymentIntents: [], checkoutSessions: [], subscriptions: [] };
    }

    try {
      const [charges, paymentIntents, checkoutSessions, subscriptions] = await Promise.all([
        this.getCustomerCharges(customerId),
        this.getCustomerPaymentIntents(customerId),
        this.getCustomerCheckoutSessions(customerId),
        stripe.subscriptions.list({ customer: customerId, limit: 10 }).then(s => s.data),
      ]);

      return { charges, paymentIntents, checkoutSessions, subscriptions };
    } catch (error) {
      logError('Failed to get customer payment history', error as Error, { customerId });
      return { charges: [], paymentIntents: [], checkoutSessions: [], subscriptions: [] };
    }
  }

  // ============================================
  // Connected Accounts (for Sellers to receive payouts)
  // ============================================

  /**
   * Create a Stripe Connected Account for a seller
   * This enables the seller to receive payouts from the platform
   */
  async createConnectedAccount(params: {
    userId: string;
    email: string;
    businessName?: string;
    country?: string;
  }): Promise<{
    success: boolean;
    accountId?: string;
    error?: string;
  }> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const account = await stripe.accounts.create({
        type: 'express', // Express accounts are easiest for marketplaces
        country: params.country || 'US',
        email: params.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          userId: params.userId,
          platform: 'mc-exchange',
        },
        business_profile: {
          name: params.businessName,
          product_description: 'MC Authority Sales',
        },
      });

      logger.info('Stripe connected account created', {
        accountId: account.id,
        userId: params.userId,
        email: params.email,
      });

      return {
        success: true,
        accountId: account.id,
      };
    } catch (error) {
      logError('Failed to create Stripe connected account', error as Error, {
        userId: params.userId,
        email: params.email,
      });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create an account link for onboarding (Stripe-hosted onboarding flow)
   */
  async createAccountLink(params: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const accountLink = await stripe.accountLinks.create({
        account: params.accountId,
        refresh_url: params.refreshUrl,
        return_url: params.returnUrl,
        type: 'account_onboarding',
      });

      return {
        success: true,
        url: accountLink.url,
      };
    } catch (error) {
      logError('Failed to create account link', error as Error, {
        accountId: params.accountId,
      });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get connected account details
   */
  async getConnectedAccount(accountId: string): Promise<Stripe.Account | null> {
    if (!stripe) return null;

    try {
      return await stripe.accounts.retrieve(accountId);
    } catch (error) {
      logError('Failed to retrieve connected account', error as Error, { accountId });
      return null;
    }
  }

  /**
   * Check if connected account has completed onboarding
   */
  async isAccountOnboarded(accountId: string): Promise<boolean> {
    const account = await this.getConnectedAccount(accountId);
    if (!account) return false;

    return account.details_submitted && account.charges_enabled && account.payouts_enabled;
  }

  /**
   * Create a login link for the seller's Stripe dashboard
   */
  async createLoginLink(accountId: string): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const loginLink = await stripe.accounts.createLoginLink(accountId);

      return {
        success: true,
        url: loginLink.url,
      };
    } catch (error) {
      logError('Failed to create login link', error as Error, { accountId });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create a transfer to a connected account (for paying sellers)
   */
  async createTransfer(params: {
    amount: number; // In cents
    destinationAccountId: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<{
    success: boolean;
    transferId?: string;
    error?: string;
  }> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: params.amount,
        currency: 'usd',
        destination: params.destinationAccountId,
        description: params.description,
        metadata: params.metadata,
      });

      logger.info('Transfer created', {
        transferId: transfer.id,
        amount: params.amount,
        destination: params.destinationAccountId,
      });

      return {
        success: true,
        transferId: transfer.id,
      };
    } catch (error) {
      logError('Failed to create transfer', error as Error, {
        destinationAccountId: params.destinationAccountId,
        amount: params.amount,
      });
      return {
        success: false,
        error: (error as Error).message,
      };
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

  // ============================================
  // Admin: Get All Transactions
  // ============================================

  /**
   * Get all Stripe transactions with full customer and billing details (for Admin)
   */
  async getAllTransactions(params: {
    limit?: number;
    startingAfter?: string;
    endingBefore?: string;
    status?: 'succeeded' | 'pending' | 'failed';
    type?: 'all' | 'payment_intent' | 'checkout_session' | 'charge';
  } = {}): Promise<{
    success: boolean;
    transactions?: Array<{
      id: string;
      type: 'payment_intent' | 'checkout_session' | 'charge';
      amount: number;
      amountFormatted: string;
      currency: string;
      status: string;
      created: number;
      createdDate: string;
      description: string | null;
      customer: {
        id: string | null;
        email: string | null;
        name: string | null;
        phone: string | null;
      };
      billing: {
        name: string | null;
        email: string | null;
        phone: string | null;
        address: {
          line1: string | null;
          line2: string | null;
          city: string | null;
          state: string | null;
          postalCode: string | null;
          country: string | null;
        } | null;
      };
      paymentMethod: {
        type: string | null;
        brand: string | null;
        last4: string | null;
        expMonth: number | null;
        expYear: number | null;
        cardholderName: string | null;
      } | null;
      // User verification
      matchedUser: {
        id: string;
        name: string;
        email: string;
      } | null;
      nameMatchStatus: 'match' | 'partial' | 'mismatch' | 'unknown';
      metadata: Record<string, string>;
      receiptUrl: string | null;
      refunded: boolean;
      refundedAmount: number;
    }>;
    hasMore: boolean;
    error?: string;
  }> {
    if (!stripe) {
      return { success: false, transactions: [], hasMore: false, error: 'Payment service not available' };
    }

    const limit = params.limit || 50;

    // Helper function to normalize names for comparison
    const normalizeName = (name: string | null | undefined): string => {
      if (!name) return '';
      return name.toLowerCase().trim().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ');
    };

    // Helper function to calculate name match status
    const calculateNameMatch = (cardholderName: string | null, userName: string | null): 'match' | 'partial' | 'mismatch' | 'unknown' => {
      if (!cardholderName || !userName) return 'unknown';

      const normalizedCardholder = normalizeName(cardholderName);
      const normalizedUser = normalizeName(userName);

      if (!normalizedCardholder || !normalizedUser) return 'unknown';

      // Exact match
      if (normalizedCardholder === normalizedUser) return 'match';

      // Check if one contains the other (partial match for names like "John Smith" vs "John")
      const cardholderParts = normalizedCardholder.split(' ').filter(Boolean);
      const userParts = normalizedUser.split(' ').filter(Boolean);

      // Check if any significant parts match (first or last name)
      const matchingParts = cardholderParts.filter(part =>
        userParts.some(userPart => userPart === part || part.includes(userPart) || userPart.includes(part))
      );

      if (matchingParts.length >= 1 && (matchingParts.length >= cardholderParts.length / 2 || matchingParts.length >= userParts.length / 2)) {
        return 'partial';
      }

      return 'mismatch';
    };

    try {
      const transactions: Array<any> = [];

      // Fetch Payment Intents (main transaction type)
      if (params.type === 'all' || params.type === 'payment_intent' || !params.type) {
        const paymentIntentsParams: Stripe.PaymentIntentListParams = {
          limit,
          expand: ['data.customer', 'data.payment_method', 'data.latest_charge'],
        };

        if (params.startingAfter) paymentIntentsParams.starting_after = params.startingAfter;
        if (params.endingBefore) paymentIntentsParams.ending_before = params.endingBefore;

        const paymentIntents = await stripe.paymentIntents.list(paymentIntentsParams);

        for (const pi of paymentIntents.data) {
          // Filter by status if specified
          if (params.status) {
            if (params.status === 'succeeded' && pi.status !== 'succeeded') continue;
            if (params.status === 'pending' && !['processing', 'requires_action', 'requires_confirmation'].includes(pi.status)) continue;
            if (params.status === 'failed' && !['canceled', 'requires_payment_method'].includes(pi.status)) continue;
          }

          const customer = pi.customer as Stripe.Customer | null;
          const paymentMethod = pi.payment_method as Stripe.PaymentMethod | null;
          const charge = pi.latest_charge as Stripe.Charge | null;

          // Get cardholder name from payment method billing details
          const cardholderName = paymentMethod?.billing_details?.name || charge?.billing_details?.name || null;

          transactions.push({
            id: pi.id,
            type: 'payment_intent',
            amount: pi.amount,
            amountFormatted: `$${(pi.amount / 100).toFixed(2)}`,
            currency: pi.currency.toUpperCase(),
            status: pi.status,
            created: pi.created,
            createdDate: new Date(pi.created * 1000).toISOString(),
            description: pi.description,
            customer: {
              id: customer?.id || null,
              email: customer?.email || charge?.billing_details?.email || pi.receipt_email || null,
              name: customer?.name || charge?.billing_details?.name || null,
              phone: customer?.phone || charge?.billing_details?.phone || null,
            },
            billing: {
              name: charge?.billing_details?.name || customer?.name || null,
              email: charge?.billing_details?.email || customer?.email || pi.receipt_email || null,
              phone: charge?.billing_details?.phone || customer?.phone || null,
              address: charge?.billing_details?.address ? {
                line1: charge.billing_details.address.line1 || null,
                line2: charge.billing_details.address.line2 || null,
                city: charge.billing_details.address.city || null,
                state: charge.billing_details.address.state || null,
                postalCode: charge.billing_details.address.postal_code || null,
                country: charge.billing_details.address.country || null,
              } : null,
            },
            paymentMethod: paymentMethod?.card ? {
              type: paymentMethod.type,
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              expMonth: paymentMethod.card.exp_month,
              expYear: paymentMethod.card.exp_year,
              cardholderName: cardholderName,
            } : null,
            // Placeholder - will be filled after user lookup
            matchedUser: null as { id: string; name: string; email: string } | null,
            nameMatchStatus: 'unknown' as 'match' | 'partial' | 'mismatch' | 'unknown',
            _lookupEmail: customer?.email || charge?.billing_details?.email || pi.receipt_email || pi.metadata?.userId || null,
            _cardholderName: cardholderName,
            metadata: pi.metadata || {},
            receiptUrl: charge?.receipt_url || null,
            refunded: charge?.refunded || false,
            refundedAmount: charge?.amount_refunded || 0,
          });
        }
      }

      // Fetch Checkout Sessions (for subscription and one-time purchases)
      if (params.type === 'all' || params.type === 'checkout_session' || !params.type) {
        const sessionsParams: Stripe.Checkout.SessionListParams = {
          limit,
          expand: ['data.customer', 'data.payment_intent'],
        };

        const sessions = await stripe.checkout.sessions.list(sessionsParams);

        for (const session of sessions.data) {
          // Filter by status if specified
          if (params.status) {
            if (params.status === 'succeeded' && session.payment_status !== 'paid') continue;
            if (params.status === 'pending' && session.payment_status !== 'unpaid') continue;
            if (params.status === 'failed' && session.status !== 'expired') continue;
          }

          // Skip if we already have the payment intent from the payment_intents list
          if (session.payment_intent && transactions.some(t => t.id === (session.payment_intent as Stripe.PaymentIntent)?.id)) {
            continue;
          }

          const customer = session.customer as Stripe.Customer | null;
          const pi = session.payment_intent as Stripe.PaymentIntent | null;

          // For checkout sessions, the "cardholder" is the customer details name
          const sessionCardholderName = session.customer_details?.name || null;

          transactions.push({
            id: session.id,
            type: 'checkout_session',
            amount: session.amount_total || 0,
            amountFormatted: `$${((session.amount_total || 0) / 100).toFixed(2)}`,
            currency: (session.currency || 'usd').toUpperCase(),
            status: session.payment_status,
            created: session.created,
            createdDate: new Date(session.created * 1000).toISOString(),
            description: session.metadata?.type ? `${session.metadata.type} - ${session.metadata.mcNumber || session.metadata.packId || ''}` : null,
            customer: {
              id: customer?.id || null,
              email: session.customer_email || customer?.email || session.customer_details?.email || null,
              name: customer?.name || session.customer_details?.name || null,
              phone: customer?.phone || session.customer_details?.phone || null,
            },
            billing: {
              name: session.customer_details?.name || customer?.name || null,
              email: session.customer_details?.email || customer?.email || null,
              phone: session.customer_details?.phone || customer?.phone || null,
              address: session.customer_details?.address ? {
                line1: session.customer_details.address.line1 || null,
                line2: session.customer_details.address.line2 || null,
                city: session.customer_details.address.city || null,
                state: session.customer_details.address.state || null,
                postalCode: session.customer_details.address.postal_code || null,
                country: session.customer_details.address.country || null,
              } : null,
            },
            paymentMethod: sessionCardholderName ? {
              type: 'card',
              brand: null,
              last4: null,
              expMonth: null,
              expYear: null,
              cardholderName: sessionCardholderName,
            } : null,
            // Placeholder - will be filled after user lookup
            matchedUser: null as { id: string; name: string; email: string } | null,
            nameMatchStatus: 'unknown' as 'match' | 'partial' | 'mismatch' | 'unknown',
            _lookupEmail: session.customer_email || customer?.email || session.customer_details?.email || session.metadata?.userId || null,
            _cardholderName: sessionCardholderName,
            metadata: session.metadata || {},
            receiptUrl: null,
            refunded: false,
            refundedAmount: 0,
          });
        }
      }

      // Sort by created date descending
      transactions.sort((a, b) => b.created - a.created);

      // Batch lookup users by email and userId from metadata
      const lookupEmails = transactions
        .map(t => t._lookupEmail)
        .filter((email): email is string => !!email);

      const lookupUserIds = transactions
        .map(t => t.metadata?.userId)
        .filter((id): id is string => !!id);

      // Query users by email or ID using Sequelize
      const users = await User.findAll({
        where: {
          [Op.or]: [
            { email: { [Op.in]: lookupEmails } },
            { id: { [Op.in]: lookupUserIds } },
          ],
        },
        attributes: ['id', 'name', 'email'],
        raw: true,
      });

      // Create lookup maps
      const usersByEmail = new Map(users.map((u: { id: string; name: string; email: string }) => [u.email.toLowerCase(), u]));
      const usersById = new Map(users.map((u: { id: string; name: string; email: string }) => [u.id, u]));

      // Fill in matched users and calculate name match status
      for (const txn of transactions) {
        // Try to find user by userId metadata first, then by email
        let matchedUser = txn.metadata?.userId ? usersById.get(txn.metadata.userId) : null;
        if (!matchedUser && txn._lookupEmail) {
          matchedUser = usersByEmail.get(txn._lookupEmail.toLowerCase()) || null;
        }

        if (matchedUser) {
          txn.matchedUser = {
            id: matchedUser.id,
            name: matchedUser.name,
            email: matchedUser.email,
          };
          txn.nameMatchStatus = calculateNameMatch(txn._cardholderName, matchedUser.name);
        }

        // Remove internal lookup fields before returning
        delete txn._lookupEmail;
        delete txn._cardholderName;
      }

      logger.info('Retrieved all Stripe transactions with user matching', {
        count: transactions.length,
        type: params.type || 'all',
        status: params.status || 'all',
        matchedUsers: transactions.filter(t => t.matchedUser).length,
      });

      return {
        success: true,
        transactions: transactions.slice(0, limit),
        hasMore: transactions.length > limit,
      };
    } catch (error) {
      logError('Failed to get all Stripe transactions', error as Error);
      return {
        success: false,
        transactions: [],
        hasMore: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get balance transactions (for seeing all money movement)
   */
  async getBalanceTransactions(params: {
    limit?: number;
    startingAfter?: string;
  } = {}): Promise<{
    success: boolean;
    data?: Stripe.BalanceTransaction[];
    hasMore?: boolean;
    error?: string;
  }> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const balanceTransactions = await stripe.balanceTransactions.list({
        limit: params.limit || 50,
        starting_after: params.startingAfter,
        expand: ['data.source'],
      });

      return {
        success: true,
        data: balanceTransactions.data,
        hasMore: balanceTransactions.has_more,
      };
    } catch (error) {
      logError('Failed to get balance transactions', error as Error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get Stripe account balance summary
   */
  async getAccountBalance(): Promise<{
    success: boolean;
    balance?: {
      available: number;
      pending: number;
      currency: string;
    };
    error?: string;
  }> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      const balance = await stripe.balance.retrieve();

      const availableUSD = balance.available.find(b => b.currency === 'usd');
      const pendingUSD = balance.pending.find(b => b.currency === 'usd');

      return {
        success: true,
        balance: {
          available: availableUSD?.amount || 0,
          pending: pendingUSD?.amount || 0,
          currency: 'USD',
        },
      };
    } catch (error) {
      logError('Failed to get account balance', error as Error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * List checkout sessions with a specific transaction ID in metadata
   * Used to verify payment status when webhook doesn't fire
   */
  async listCheckoutSessions(transactionId: string): Promise<{
    success: boolean;
    sessions?: Stripe.Checkout.Session[];
    error?: string;
  }> {
    if (!stripe) {
      return { success: false, error: 'Payment service not available' };
    }

    try {
      // List recent checkout sessions (last 24 hours)
      const sessions = await stripe.checkout.sessions.list({
        limit: 20,
        created: {
          gte: Math.floor(Date.now() / 1000) - 86400, // Last 24 hours
        },
      });

      // Filter sessions with matching transaction ID
      const matchingSessions = sessions.data.filter(
        (session) => session.metadata?.transactionId === transactionId
      );

      logger.info('Listed checkout sessions for transaction', {
        transactionId,
        totalSessions: sessions.data.length,
        matchingSessions: matchingSessions.length,
      });

      return {
        success: true,
        sessions: matchingSessions,
      };
    } catch (error) {
      logError('Failed to list checkout sessions', error as Error, {
        transactionId,
      });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

// Export singleton instance
export const stripeService = new StripeService();
export default stripeService;
