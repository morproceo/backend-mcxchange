import { Request, Response } from 'express';
import { ghlService } from '../services/ghlService';
import { emailService } from '../services/emailService';
import logger from '../utils/logger';

export const submitSafetyForm = async (req: Request, res: Response) => {
  try {
    const { name, company, email, phone, mcNumber, serviceType, message } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone are required',
      });
    }

    // Create contact in GHL
    try {
      await ghlService.createContact({
        name,
        company,
        email,
        phone,
        serviceType,
        message,
        tag: 'Safety services',
      });
    } catch (error) {
      logger.error('Failed to create GHL contact for safety lead:', error as Error);
    }

    // Send email notification
    try {
      await emailService.sendServiceInquiryNotification({
        serviceName: 'Safety Services',
        name,
        company,
        email,
        phone,
        mcNumber,
        serviceType,
        message,
      });
    } catch (error) {
      logger.error('Failed to send safety inquiry email:', error as Error);
    }

    res.json({
      success: true,
      message: 'Your safety services request has been submitted. A specialist will contact you within 24 hours.',
    });
  } catch (error: any) {
    logger.error('Error submitting safety form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit safety request. Please try again.',
    });
  }
};
