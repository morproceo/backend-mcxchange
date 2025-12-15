/**
 * Auth API Integration Tests
 */

import request from 'supertest';
import express, { Express } from 'express';
import { createMockUser, randomEmail } from '../setup';

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, res, next) => {
    req.user = { id: 'user-123', role: 'buyer' };
    next();
  }),
  requireRole: () => jest.fn((req, res, next) => next()),
}));

// Mock services
jest.mock('../../services/authService', () => ({
  authService: {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerificationEmail: jest.fn(),
  },
}));

import authRoutes from '../../routes/authRoutes';
import { authService } from '../../services/authService';

describe('Auth API', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);

    // Error handler
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    const validRegistration = {
      email: 'newuser@example.com',
      password: 'SecurePassword123!',
      firstName: 'New',
      lastName: 'User',
      phone: '555-123-4567',
      role: 'buyer',
    };

    it('should register a new user successfully', async () => {
      const mockResult = {
        user: createMockUser({ email: validRegistration.email }),
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      };

      (authService.register as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistration)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          email: validRegistration.email,
        })
      );
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegistration, email: 'invalid-email' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for weak password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegistration, password: '123' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 409 for existing email', async () => {
      (authService.register as jest.Mock).mockRejectedValue({
        statusCode: 409,
        message: 'Email already registered',
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistration)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Email already registered');
    });
  });

  describe('POST /api/auth/login', () => {
    const validLogin = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
    };

    it('should login successfully with valid credentials', async () => {
      const mockResult = {
        user: createMockUser(),
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      };

      (authService.login as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLogin)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should return 401 for invalid credentials', async () => {
      (authService.login as jest.Mock).mockRejectedValue({
        statusCode: 401,
        message: 'Invalid email or password',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLogin)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: validLogin.password })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: validLogin.email })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      const mockResult = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      (authService.refreshToken as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should return 401 for invalid refresh token', async () => {
      (authService.refreshToken as jest.Mock).mockRejectedValue({
        statusCode: 401,
        message: 'Invalid refresh token',
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      (authService.logout as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer test-token')
        .send({ refreshToken: 'refresh-token' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should request password reset successfully', async () => {
      (authService.requestPasswordReset as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('password reset');
    });

    it('should return success even for non-existent email (security)', async () => {
      (authService.requestPasswordReset as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reset password successfully', async () => {
      (authService.resetPassword as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'valid-reset-token',
          password: 'NewSecurePassword123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for invalid token', async () => {
      (authService.resetPassword as jest.Mock).mockRejectedValue({
        statusCode: 400,
        message: 'Invalid or expired reset token',
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: 'NewSecurePassword123!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for weak password', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'valid-token',
          password: '123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should change password successfully', async () => {
      (authService.changePassword as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', 'Bearer test-token')
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for incorrect current password', async () => {
      (authService.changePassword as jest.Mock).mockRejectedValue({
        statusCode: 400,
        message: 'Current password is incorrect',
      });

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', 'Bearer test-token')
        .send({
          currentPassword: 'WrongPassword!',
          newPassword: 'NewPassword123!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('should verify email successfully', async () => {
      (authService.verifyEmail as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'valid-verification-token' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for invalid verification token', async () => {
      (authService.verifyEmail as jest.Mock).mockRejectedValue({
        statusCode: 400,
        message: 'Invalid or expired verification token',
      });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'invalid-token' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    it('should resend verification email', async () => {
      (authService.resendVerificationEmail as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
