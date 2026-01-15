import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  getCurrentUser,
  changePassword,
  requestPasswordReset,
  verifyEmail,
  resendVerificationEmail,
  registerValidation,
  loginValidation,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import validate from '../middleware/validate';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public routes (with rate limiting)
router.post('/register', authLimiter, validate(registerValidation), register);
router.post('/login', authLimiter, validate(loginValidation), login);
router.post('/refresh-token', authLimiter, refreshToken);
router.post('/logout', logout);
router.post('/forgot-password', passwordResetLimiter, requestPasswordReset);
router.post('/verify-email', authLimiter, verifyEmail);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/logout-all', authenticate, logoutAll);
router.post('/change-password', authenticate, changePassword);
router.post('/resend-verification', authenticate, resendVerificationEmail);

export default router;
