import { Router } from 'express';
import {
  healthCheck,
  searchCompanies,
  getCreditReport,
  getCompanyAssessment,
  getAccess,
  lookupCompany,
  searchCompaniesValidation,
  getCreditReportValidation,
} from '../controllers/creditsafeController';
import { authenticate, adminOnly } from '../middleware/auth';
import validate from '../middleware/validate';

const router = Router();

// All Creditsafe routes require authentication and admin role
router.use(authenticate);
router.use(adminOnly);

// Health check
router.get('/health', healthCheck);

// Get subscription access details
router.get('/access', getAccess);

// Search companies
router.get('/companies', validate(searchCompaniesValidation), searchCompanies);

// Get full credit report
router.get('/companies/:connectId', validate(getCreditReportValidation), getCreditReport);

// Get company assessment with summary
router.get('/companies/:connectId/assessment', getCompanyAssessment);

// Quick lookup (convenience endpoint)
router.post('/lookup', lookupCompany);

export default router;
