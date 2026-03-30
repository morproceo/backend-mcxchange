import { Request, Response } from 'express';
import { ghlService } from '../services/ghlService';
import { emailService } from '../services/emailService';
import logger from '../utils/logger';

export const submitFuelProgramForm = async (req: Request, res: Response) => {
  try {
    const { name, company, email, phone, fleetSize, message } = req.body;

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
        fleetSize,
        message,
        tag: 'Fuel program',
      });
    } catch (error) {
      logger.error('Failed to create GHL contact for fuel program lead:', error as Error);
    }

    // Send email notification
    try {
      await emailService.sendServiceInquiryNotification({
        serviceName: 'Fuel Program',
        name,
        company,
        email,
        phone,
        fleetSize,
        message,
      });
    } catch (error) {
      logger.error('Failed to send fuel program inquiry email:', error as Error);
    }

    res.json({
      success: true,
      message: 'Your fuel program request has been submitted. A specialist will contact you within 24 hours.',
    });
  } catch (error: any) {
    logger.error('Error submitting fuel program form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit fuel program request. Please try again.',
    });
  }
};
