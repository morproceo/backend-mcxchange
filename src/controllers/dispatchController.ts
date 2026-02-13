import { Request, Response } from 'express';
import { ghlService } from '../services/ghlService';
import logger from '../utils/logger';

export const submitDispatchForm = async (req: Request, res: Response) => {
  try {
    const { name, company, email, phone, fleetSize, equipmentType, message } = req.body;

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone are required',
      });
    }

    // Create contact in GHL (non-blocking for UX — log errors but still return success)
    try {
      await ghlService.createContact({
        name,
        company,
        email,
        phone,
        fleetSize,
        equipmentType,
        message,
      });
    } catch (error) {
      logger.error('Failed to create GHL contact for dispatch lead:', error as Error);
    }

    res.json({
      success: true,
      message: 'Your dispatch request has been submitted. A specialist will contact you within 24 hours.',
    });
  } catch (error: any) {
    logger.error('Error submitting dispatch form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit dispatch request. Please try again.',
    });
  }
};
