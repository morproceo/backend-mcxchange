import { Request, Response } from 'express';
import { ghlService } from '../services/ghlService';
import logger from '../utils/logger';

export const submitAdminServicesForm = async (req: Request, res: Response) => {
  try {
    const { name, company, email, phone, fleetSize, serviceType, message } = req.body;

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone are required',
      });
    }

    // Create contact in GHL with "Admin services" tag
    try {
      await ghlService.createContact({
        name,
        company,
        email,
        phone,
        fleetSize,
        serviceType,
        message,
        tag: 'Admin services',
      });
    } catch (error) {
      logger.error('Failed to create GHL contact for admin services lead:', error as Error);
    }

    res.json({
      success: true,
      message: 'Your admin services request has been submitted. A specialist will contact you within 24 hours.',
    });
  } catch (error: any) {
    logger.error('Error submitting admin services form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit admin services request. Please try again.',
    });
  }
};
