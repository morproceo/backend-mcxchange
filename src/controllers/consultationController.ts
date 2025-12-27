import { Request, Response } from 'express';
import { consultationService } from '../services/consultationService';
import { ConsultationStatus } from '../models';

/**
 * Create consultation checkout session (public - no auth required)
 */
export const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, preferredDate, preferredTime, message } = req.body;

    // Validation
    if (!name || !email || !phone || !preferredDate || !preferredTime) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone, preferred date and time are required',
      });
    }

    const result = await consultationService.createCheckoutSession({
      name,
      email,
      phone,
      preferredDate,
      preferredTime,
      message,
    });

    res.json({
      success: true,
      checkoutUrl: result.checkoutUrl,
      consultationId: result.consultationId,
    });
  } catch (error: any) {
    console.error('Error creating consultation checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message,
    });
  }
};

/**
 * Handle Stripe webhook for consultation payments
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // Check if this is a consultation payment
      if (session.metadata?.type === 'consultation') {
        await consultationService.handlePaymentSuccess(session.id);
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(400).json({
      success: false,
      message: 'Webhook error',
      error: error.message,
    });
  }
};

/**
 * Get all consultations (admin only)
 */
export const getAll = async (req: Request, res: Response) => {
  try {
    const { page, limit, status, search } = req.query;

    const result = await consultationService.getAll({
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      status: status as string,
      search: search as string,
    });

    res.json({
      success: true,
      data: result.consultations,
      pagination: {
        total: result.total,
        pages: result.pages,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      },
    });
  } catch (error: any) {
    console.error('Error getting consultations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get consultations',
      error: error.message,
    });
  }
};

/**
 * Get consultation by ID (admin only)
 */
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const consultation = await consultationService.getById(id);

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found',
      });
    }

    res.json({
      success: true,
      data: consultation,
    });
  } catch (error: any) {
    console.error('Error getting consultation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get consultation',
      error: error.message,
    });
  }
};

/**
 * Update consultation status (admin only)
 */
export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const adminId = (req as any).user?.id;

    // Validate status
    if (!Object.values(ConsultationStatus).includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    const consultation = await consultationService.updateStatus(id, status, adminId, notes);

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found',
      });
    }

    res.json({
      success: true,
      data: consultation,
    });
  } catch (error: any) {
    console.error('Error updating consultation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update consultation',
      error: error.message,
    });
  }
};

/**
 * Get consultation statistics (admin only)
 */
export const getStats = async (_req: Request, res: Response) => {
  try {
    const stats = await consultationService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error getting consultation stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message,
    });
  }
};

/**
 * Refund consultation (admin only)
 */
export const refund = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user?.id;

    const consultation = await consultationService.refund(id, adminId);

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found or no payment to refund',
      });
    }

    res.json({
      success: true,
      data: consultation,
      message: 'Refund processed successfully',
    });
  } catch (error: any) {
    console.error('Error refunding consultation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message,
    });
  }
};
