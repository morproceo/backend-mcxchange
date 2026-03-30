import { Request, Response } from 'express';
import { ghlService } from '../services/ghlService';
import { emailService } from '../services/emailService';
import logger from '../utils/logger';

export const submitRecruitingForm = async (req: Request, res: Response) => {
  try {
    const { name, company, email, phone, driversNeeded, driverType, message } = req.body;

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
        message,
        tag: 'Recruiting lead',
      });
    } catch (error) {
      logger.error('Failed to create GHL contact for recruiting lead:', error as Error);
    }

    // Send email notification
    try {
      await emailService.sendServiceInquiryNotification({
        serviceName: 'Recruiting Services',
        name,
        company,
        email,
        phone,
        driversNeeded,
        driverType,
        message,
      });
    } catch (error) {
      logger.error('Failed to send recruiting inquiry email:', error as Error);
    }

    res.json({
      success: true,
      message: 'Your recruiting request has been submitted. A specialist will contact you within 24 hours.',
    });
  } catch (error: any) {
    logger.error('Error submitting recruiting form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit recruiting request. Please try again.',
    });
  }
};
