import { Router } from 'express';
import { authenticate, complianceManagerOnly } from '../middleware/auth';
import {
  listCompanies, addCompany, getCompany, updateCompany, deleteCompany,
  refreshCompany, getCompanyChanges, acknowledgeChange,
  listCompanyDocuments, createDocument, updateDocument, deleteDocument, listAllDocuments,
  listCompanyDrivers, createDriver, getDriver, updateDriver, deleteDriver, listAllDrivers,
  listDriverDocuments, createDriverDocument, updateDriverDocument, deleteDriverDocument,
  getDashboardSummary,
} from '../controllers/complianceController';

const router = Router();

router.use(authenticate);
router.use(complianceManagerOnly);

// Dashboard
router.get('/dashboard/summary', getDashboardSummary);

// Companies
router.get('/companies', listCompanies);
router.post('/companies', addCompany);
router.get('/companies/:id', getCompany);
router.patch('/companies/:id', updateCompany);
router.delete('/companies/:id', deleteCompany);
router.post('/companies/:id/refresh', refreshCompany);
router.get('/companies/:id/changes', getCompanyChanges);
router.post('/changes/:id/acknowledge', acknowledgeChange);

// Documents (scoped to a company)
router.get('/companies/:id/documents', listCompanyDocuments);
router.post('/companies/:id/documents', createDocument);

// Documents (flat across caller's companies)
router.get('/documents', listAllDocuments);
router.patch('/documents/:id', updateDocument);
router.delete('/documents/:id', deleteDocument);

// Drivers (scoped to a company)
router.get('/companies/:id/drivers', listCompanyDrivers);
router.post('/companies/:id/drivers', createDriver);

// Drivers (flat across caller's companies)
router.get('/drivers', listAllDrivers);
router.get('/drivers/:id', getDriver);
router.patch('/drivers/:id', updateDriver);
router.delete('/drivers/:id', deleteDriver);

// Driver documents (scoped to a driver)
router.get('/drivers/:id/documents', listDriverDocuments);
router.post('/drivers/:id/documents', createDriverDocument);

router.patch('/driver-documents/:id', updateDriverDocument);
router.delete('/driver-documents/:id', deleteDriverDocument);

export default router;
