import { Request, Response } from 'express';
import { fmcsaService } from '../services/fmcsaService';
import { asyncHandler } from '../middleware/errorHandler';

// Lookup carrier by DOT number
export const lookupByDOT = asyncHandler(async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  if (!dotNumber) {
    res.status(400).json({
      success: false,
      error: 'DOT number is required',
    });
    return;
  }

  const carrier = await fmcsaService.lookupByDOT(dotNumber);

  if (!carrier) {
    res.status(404).json({
      success: false,
      error: 'Carrier not found',
    });
    return;
  }

  res.json({
    success: true,
    data: carrier,
  });
});

// Lookup carrier by MC number
export const lookupByMC = asyncHandler(async (req: Request, res: Response) => {
  const { mcNumber } = req.params;

  if (!mcNumber) {
    res.status(400).json({
      success: false,
      error: 'MC number is required',
    });
    return;
  }

  const carrier = await fmcsaService.lookupByMC(mcNumber);

  if (!carrier) {
    res.status(404).json({
      success: false,
      error: 'Carrier not found',
    });
    return;
  }

  res.json({
    success: true,
    data: carrier,
  });
});

// Get full carrier snapshot
export const getCarrierSnapshot = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = req.params;
  const type = (req.query.type as 'MC' | 'DOT') || 'DOT';

  if (!identifier) {
    res.status(400).json({
      success: false,
      error: 'Identifier is required',
    });
    return;
  }

  const snapshot = await fmcsaService.getCarrierSnapshot(identifier, type);

  if (!snapshot.carrier) {
    res.status(404).json({
      success: false,
      error: 'Carrier not found',
    });
    return;
  }

  res.json({
    success: true,
    data: snapshot,
  });
});

// Get authority history
export const getAuthorityHistory = asyncHandler(async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  if (!dotNumber) {
    res.status(400).json({
      success: false,
      error: 'DOT number is required',
    });
    return;
  }

  const history = await fmcsaService.getAuthorityHistory(dotNumber);

  if (!history) {
    res.status(404).json({
      success: false,
      error: 'Authority history not found',
    });
    return;
  }

  res.json({
    success: true,
    data: history,
  });
});

// Get insurance history
export const getInsuranceHistory = asyncHandler(async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  if (!dotNumber) {
    res.status(400).json({
      success: false,
      error: 'DOT number is required',
    });
    return;
  }

  const history = await fmcsaService.getInsuranceHistory(dotNumber);

  if (!history) {
    res.status(404).json({
      success: false,
      error: 'Insurance history not found',
    });
    return;
  }

  res.json({
    success: true,
    data: history,
  });
});

// Verify MC number
export const verifyMC = asyncHandler(async (req: Request, res: Response) => {
  const { mcNumber } = req.params;

  if (!mcNumber) {
    res.status(400).json({
      success: false,
      error: 'MC number is required',
    });
    return;
  }

  const result = await fmcsaService.verifyMC(mcNumber);

  res.json({
    success: true,
    data: result,
  });
});

// Get SMS (Safety Measurement System) data - inspections, crashes, BASIC scores
export const getSMSData = asyncHandler(async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  if (!dotNumber) {
    res.status(400).json({
      success: false,
      error: 'DOT number is required',
    });
    return;
  }

  const smsData = await fmcsaService.getSMSData(dotNumber);

  if (!smsData) {
    res.status(404).json({
      success: false,
      error: 'SMS data not found for this carrier',
    });
    return;
  }

  res.json({
    success: true,
    data: smsData,
  });
});
