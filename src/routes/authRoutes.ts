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
  registerValidation,
  loginValidation,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import validate from '../middleware/validate';

const router = Router();

// Public routes
router.post('/register', validate(registerValidation), register);
router.post('/login', validate(loginValidation), login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.post('/forgot-password', requestPasswordReset);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/logout-all', authenticate, logoutAll);
router.post('/change-password', authenticate, changePassword);

export default router;
