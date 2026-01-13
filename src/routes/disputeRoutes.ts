import { Router } from 'express';
import { body } from 'express-validator';
import { Response, Request } from 'express';
import validate from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import adminService from '../services/adminService';

const router = Router();

// Validation for dispute submission
const submitDisputeValidation = [
  body('disputeEmail').isEmail().withMessage('Valid email is required'),
  body('disputeInfo').notEmpty().withMessage('Additional information is required'),
  body('disputeReason').notEmpty().withMessage('Reason for mismatch is required'),
];

// Get dispute by ID (public - no auth required)
// This allows blocked users to access their dispute form
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const dispute = await adminService.getDispute(id);

  // Only return safe fields for public access
  res.json({
    success: true,
    data: {
      id: dispute.id,
      cardholderName: dispute.cardholderName,
      userName: dispute.userName,
      status: dispute.status,
      createdAt: dispute.createdAt,
      submittedAt: dispute.submittedAt,
      autoUnblockAt: dispute.autoUnblockAt,
    },
  });
}));

// Submit dispute form (public - no auth required)
// Blocked users fill out this form to appeal their block
router.post('/:id/submit', validate(submitDisputeValidation), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { disputeEmail, disputeInfo, disputeReason } = req.body;

  const dispute = await adminService.submitDispute(id, {
    disputeEmail,
    disputeInfo,
    disputeReason,
  });

  res.json({
    success: true,
    data: {
      id: dispute.id,
      status: dispute.status,
      submittedAt: dispute.submittedAt,
      autoUnblockAt: dispute.autoUnblockAt,
    },
    message: 'Your dispute has been submitted. Your account will be reviewed and restored within 24 hours.',
  });
}));

export default router;
