import { Request, Response, NextFunction } from 'express';
import { dueDiligenceService } from '../services/dueDiligenceService';

export const dueDiligenceController = {
  /**
   * Run comprehensive due diligence analysis on an MC number
   * GET /api/admin/due-diligence/analyze/:mcNumber
   */
  async analyze(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mcNumber } = req.params;

      if (!mcNumber) {
        res.status(400).json({
          success: false,
          message: 'MC number is required',
        });
        return;
      }

      // Clean and validate MC number
      const cleanMC = mcNumber.replace(/[^0-9]/g, '');
      if (!cleanMC || cleanMC.length < 3) {
        res.status(400).json({
          success: false,
          message: 'Invalid MC number format',
        });
        return;
      }

      console.log(`[DueDiligence] Analyzing MC: ${cleanMC}`);

      const result = await dueDiligenceService.analyze(cleanMC);

      res.json({
        success: true,
        data: result,
      });

    } catch (error) {
      console.error('[DueDiligence] Analysis error:', error);
      next(error);
    }
  },

  /**
   * Health check for the due diligence service
   * GET /api/admin/due-diligence/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      service: 'due-diligence',
      status: 'operational',
      timestamp: new Date().toISOString(),
    });
  },
};

export default dueDiligenceController;
