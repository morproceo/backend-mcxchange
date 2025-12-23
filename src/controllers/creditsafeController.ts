import { Response } from 'express';
import { query } from 'express-validator';
import { creditsafeService } from '../services/creditsafeService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

// Validation rules
export const searchCompaniesValidation = [
  query('countries').trim().notEmpty().withMessage('Countries parameter is required (ISO-2 codes)'),
  query('name').optional().trim(),
  query('regNo').optional().trim(),
  query('vatNo').optional().trim(),
  query('postCode').optional().trim(),
  query('city').optional().trim(),
  query('state').optional().trim(),
  query('exact').optional().isBoolean().withMessage('exact must be a boolean'),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize must be between 1 and 100'),
];

export const getCreditReportValidation = [
  query('language').optional().trim(),
  query('includeIndicators').optional().isBoolean().withMessage('includeIndicators must be a boolean'),
];

/**
 * Health check for Creditsafe service
 * GET /api/admin/creditsafe/health
 */
export const healthCheck = asyncHandler(async (req: AuthRequest, res: Response) => {
  const health = await creditsafeService.healthCheck();

  res.json({
    success: true,
    data: health,
  });
});

/**
 * Search for companies in Creditsafe database
 * GET /api/admin/creditsafe/companies
 */
export const searchCompanies = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    countries,
    name,
    regNo,
    vatNo,
    postCode,
    city,
    state,
    exact,
    page,
    pageSize,
  } = req.query;

  const result = await creditsafeService.searchCompanies({
    countries: countries as string,
    name: name as string | undefined,
    regNo: regNo as string | undefined,
    vatNo: vatNo as string | undefined,
    postCode: postCode as string | undefined,
    city: city as string | undefined,
    state: state as string | undefined,
    exact: exact === 'true',
    page: page ? parseInt(page as string, 10) : undefined,
    pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
  });

  res.json({
    success: true,
    data: {
      companies: result.companies || [],
      totalResults: result.totalSize || 0,
    },
  });
});

/**
 * Get full credit report for a company
 * GET /api/admin/creditsafe/companies/:connectId
 */
export const getCreditReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { connectId } = req.params;
  const { language, includeIndicators } = req.query;

  if (!connectId) {
    res.status(400).json({
      success: false,
      error: 'connectId parameter is required',
    });
    return;
  }

  const report = await creditsafeService.getCreditReport(connectId, {
    language: language as string | undefined,
    includeIndicators: includeIndicators === 'true',
  });

  res.json({
    success: true,
    data: report,
  });
});

/**
 * Get company assessment with summary
 * GET /api/admin/creditsafe/companies/:connectId/assessment
 */
export const getCompanyAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { connectId } = req.params;

  if (!connectId) {
    res.status(400).json({
      success: false,
      error: 'connectId parameter is required',
    });
    return;
  }

  const assessment = await creditsafeService.getCompanyAssessment(connectId);

  res.json({
    success: true,
    data: assessment,
  });
});

/**
 * Get user's subscription access details
 * GET /api/admin/creditsafe/access
 */
export const getAccess = asyncHandler(async (req: AuthRequest, res: Response) => {
  const access = await creditsafeService.getAccess();

  res.json({
    success: true,
    data: access,
  });
});

/**
 * Quick company lookup (search + optional assessment)
 * POST /api/admin/creditsafe/lookup
 */
export const lookupCompany = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { country, name, regNo, state, city } = req.body;

  if (!country) {
    res.status(400).json({
      success: false,
      error: 'country is required',
    });
    return;
  }

  if (!name && !regNo) {
    res.status(400).json({
      success: false,
      error: 'Either name or regNo is required',
    });
    return;
  }

  const result = await creditsafeService.lookupCompany({
    country,
    name,
    regNo,
    state,
    city,
  });

  res.json({
    success: true,
    data: result,
  });
});
