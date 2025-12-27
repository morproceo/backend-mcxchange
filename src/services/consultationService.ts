import Stripe from 'stripe';
import { Consultation, ConsultationStatus } from '../models';
import { Op } from 'sequelize';
import { pricingConfigService } from './pricingConfigService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover' as const,
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://mc-xchange.vercel.app';

interface CreateConsultationData {
  name: string;
  email: string;
  phone: string;
  preferredDate: string;
  preferredTime: string;
  message?: string;
}

export const consultationService = {
  /**
   * Create a consultation and return Stripe checkout session URL
   */
  async createCheckoutSession(data: CreateConsultationData): Promise<{ checkoutUrl: string; consultationId: string }> {
    // Get dynamic consultation fee from pricing config
    const consultationFee = await pricingConfigService.getConsultationFee();

    // Create consultation record
    const consultation = await Consultation.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      preferredDate: data.preferredDate,
      preferredTime: data.preferredTime,
      message: data.message || '',
      status: ConsultationStatus.PENDING_PAYMENT,
      amount: consultationFee,
    });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'MC Authority Consultation',
              description: `60-minute expert consultation with a Domilea representative. Scheduled for ${data.preferredDate} at ${data.preferredTime}`,
            },
            unit_amount: Math.round(consultationFee * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${FRONTEND_URL}/consultation/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/consultation/cancel`,
      customer_email: data.email,
      metadata: {
        consultationId: consultation.id,
        type: 'consultation',
      },
    });

    // Update consultation with Stripe session ID
    await consultation.update({
      stripeSessionId: session.id,
    });

    return {
      checkoutUrl: session.url!,
      consultationId: consultation.id,
    };
  },

  /**
   * Handle successful payment webhook
   */
  async handlePaymentSuccess(sessionId: string): Promise<void> {
    const consultation = await Consultation.findOne({
      where: { stripeSessionId: sessionId },
    });

    if (!consultation) {
      console.error('Consultation not found for session:', sessionId);
      return;
    }

    // Get payment intent from session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    await consultation.update({
      status: ConsultationStatus.PAID,
      stripePaymentIntentId: session.payment_intent as string,
      paidAt: new Date(),
    });
  },

  /**
   * Get all consultations for admin
   */
  async getAll(options: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }): Promise<{ consultations: Consultation[]; total: number; pages: number }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (options.status && options.status !== 'all') {
      where.status = options.status;
    }

    if (options.search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${options.search}%` } },
        { email: { [Op.like]: `%${options.search}%` } },
        { phone: { [Op.like]: `%${options.search}%` } },
      ];
    }

    const { rows: consultations, count: total } = await Consultation.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return {
      consultations,
      total,
      pages: Math.ceil(total / limit),
    };
  },

  /**
   * Get consultation by ID
   */
  async getById(id: string): Promise<Consultation | null> {
    return Consultation.findByPk(id);
  },

  /**
   * Update consultation status
   */
  async updateStatus(id: string, status: ConsultationStatus, adminId?: string, notes?: string): Promise<Consultation | null> {
    const consultation = await Consultation.findByPk(id);
    if (!consultation) return null;

    const updateData: any = { status };

    if (status === ConsultationStatus.SCHEDULED) {
      updateData.scheduledAt = new Date();
      if (adminId) {
        updateData.contactedBy = adminId;
        updateData.contactedAt = new Date();
      }
    }

    if (status === ConsultationStatus.COMPLETED) {
      updateData.completedAt = new Date();
    }

    if (notes) {
      updateData.adminNotes = notes;
    }

    await consultation.update(updateData);
    return consultation;
  },

  /**
   * Get consultation statistics
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    paid: number;
    scheduled: number;
    completed: number;
    totalRevenue: number;
  }> {
    const [total, pending, paid, scheduled, completed] = await Promise.all([
      Consultation.count(),
      Consultation.count({ where: { status: ConsultationStatus.PENDING_PAYMENT } }),
      Consultation.count({ where: { status: ConsultationStatus.PAID } }),
      Consultation.count({ where: { status: ConsultationStatus.SCHEDULED } }),
      Consultation.count({ where: { status: ConsultationStatus.COMPLETED } }),
    ]);

    // Calculate total revenue from paid/scheduled/completed consultations
    const paidConsultations = await Consultation.findAll({
      where: {
        status: {
          [Op.in]: [ConsultationStatus.PAID, ConsultationStatus.SCHEDULED, ConsultationStatus.COMPLETED],
        },
      },
      attributes: ['amount'],
    });

    const totalRevenue = paidConsultations.reduce((sum, c) => sum + parseFloat(c.amount as any), 0);

    return {
      total,
      pending,
      paid,
      scheduled,
      completed,
      totalRevenue,
    };
  },

  /**
   * Refund a consultation
   */
  async refund(id: string, adminId: string): Promise<Consultation | null> {
    const consultation = await Consultation.findByPk(id);
    if (!consultation || !consultation.stripePaymentIntentId) return null;

    // Process refund via Stripe
    await stripe.refunds.create({
      payment_intent: consultation.stripePaymentIntentId,
    });

    await consultation.update({
      status: ConsultationStatus.REFUNDED,
      adminNotes: `${consultation.adminNotes || ''}\nRefunded by admin on ${new Date().toISOString()}`,
    });

    return consultation;
  },
};

export default consultationService;
