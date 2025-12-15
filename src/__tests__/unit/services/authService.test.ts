/**
 * Auth Service Unit Tests
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock dependencies before importing the service
jest.mock('../../../models', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
  RefreshToken: {
    create: jest.fn(),
    findOne: jest.fn(),
    destroy: jest.fn(),
  },
  PasswordResetToken: {
    create: jest.fn(),
    findOne: jest.fn(),
    destroy: jest.fn(),
  },
  EmailVerificationToken: {
    create: jest.fn(),
    findOne: jest.fn(),
    destroy: jest.fn(),
  },
  UserRole: {
    BUYER: 'buyer',
    SELLER: 'seller',
    ADMIN: 'admin',
  },
  UserStatus: {
    ACTIVE: 'active',
    PENDING: 'pending',
    SUSPENDED: 'suspended',
  },
}));

jest.mock('../../../config/database', () => ({
  __esModule: true,
  default: {
    transaction: jest.fn().mockImplementation((callback) => {
      if (typeof callback === 'function') {
        return callback({});
      }
      return {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
    }),
  },
}));

jest.mock('../../../config', () => ({
  config: {
    jwt: {
      secret: 'test-secret',
      refreshSecret: 'test-refresh-secret',
      expiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    frontendUrl: 'http://localhost:5173',
  },
}));

jest.mock('../../../services/emailService', () => ({
  emailService: {
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  },
}));

import { User, RefreshToken, UserRole, UserStatus } from '../../../models';
import { authService } from '../../../services/authService';

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const mockUserData = {
      email: 'test@example.com',
      password: 'Password123!',
      firstName: 'Test',
      lastName: 'User',
      phone: '555-123-4567',
      role: UserRole.BUYER,
    };

    it('should register a new user successfully', async () => {
      const mockCreatedUser = {
        id: 'user-123',
        ...mockUserData,
        password: 'hashed-password',
        status: UserStatus.ACTIVE,
        emailVerified: false,
        toJSON: () => ({
          id: 'user-123',
          email: mockUserData.email,
          firstName: mockUserData.firstName,
          lastName: mockUserData.lastName,
        }),
      };

      (User.findOne as jest.Mock).mockResolvedValue(null);
      (User.create as jest.Mock).mockResolvedValue(mockCreatedUser);
      (RefreshToken.create as jest.Mock).mockResolvedValue({ token: 'refresh-token' });

      const result = await authService.register(mockUserData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(User.findOne).toHaveBeenCalledWith({ where: { email: mockUserData.email } });
      expect(User.create).toHaveBeenCalled();
    });

    it('should throw error if email already exists', async () => {
      (User.findOne as jest.Mock).mockResolvedValue({
        id: 'existing-user',
        email: mockUserData.email,
      });

      await expect(authService.register(mockUserData)).rejects.toThrow('Email already registered');
    });

    it('should hash password before saving', async () => {
      const mockCreatedUser = {
        id: 'user-123',
        ...mockUserData,
        password: 'hashed-password',
        status: UserStatus.ACTIVE,
        toJSON: () => ({ id: 'user-123' }),
      };

      (User.findOne as jest.Mock).mockResolvedValue(null);
      (User.create as jest.Mock).mockResolvedValue(mockCreatedUser);
      (RefreshToken.create as jest.Mock).mockResolvedValue({ token: 'refresh-token' });

      await authService.register(mockUserData);

      const createCall = (User.create as jest.Mock).mock.calls[0][0];
      expect(createCall.password).not.toBe(mockUserData.password);
    });
  });

  describe('login', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      password: '$2a$10$hashedpassword', // bcrypt hash
      firstName: 'Test',
      lastName: 'User',
      role: UserRole.BUYER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      update: jest.fn(),
      toJSON: () => ({
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
      }),
    };

    it('should login user with valid credentials', async () => {
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (RefreshToken.create as jest.Mock).mockResolvedValue({ token: 'refresh-token' });

      // Mock bcrypt compare
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));

      const result = await authService.login('test@example.com', 'Password123!');

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockUser.update).toHaveBeenCalledWith({ lastLoginAt: expect.any(Date) });
    });

    it('should throw error for invalid email', async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.login('wrong@example.com', 'Password123!')
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for invalid password', async () => {
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false));

      await expect(
        authService.login('test@example.com', 'WrongPassword!')
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for inactive user', async () => {
      const suspendedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      (User.findOne as jest.Mock).mockResolvedValue(suspendedUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));

      await expect(
        authService.login('test@example.com', 'Password123!')
      ).rejects.toThrow('Account is suspended');
    });
  });

  describe('refreshToken', () => {
    it('should generate new tokens with valid refresh token', async () => {
      const mockStoredToken = {
        id: 'token-123',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 86400000), // 1 day from now
        isRevoked: false,
        destroy: jest.fn(),
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        toJSON: () => ({ id: 'user-123' }),
      };

      (RefreshToken.findOne as jest.Mock).mockResolvedValue(mockStoredToken);
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
      (RefreshToken.create as jest.Mock).mockResolvedValue({ token: 'new-refresh-token' });

      // Mock jwt.verify
      jest.spyOn(jwt, 'verify').mockImplementation(() => ({
        id: 'user-123',
        tokenId: 'token-123',
      }));

      const result = await authService.refreshToken('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockStoredToken.destroy).toHaveBeenCalled();
    });

    it('should throw error for expired refresh token', async () => {
      const expiredToken = {
        id: 'token-123',
        userId: 'user-123',
        expiresAt: new Date(Date.now() - 86400000), // 1 day ago
        isRevoked: false,
      };

      (RefreshToken.findOne as jest.Mock).mockResolvedValue(expiredToken);
      jest.spyOn(jwt, 'verify').mockImplementation(() => ({
        id: 'user-123',
        tokenId: 'token-123',
      }));

      await expect(authService.refreshToken('expired-token')).rejects.toThrow();
    });

    it('should throw error for revoked refresh token', async () => {
      const revokedToken = {
        id: 'token-123',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: true,
      };

      (RefreshToken.findOne as jest.Mock).mockResolvedValue(revokedToken);
      jest.spyOn(jwt, 'verify').mockImplementation(() => ({
        id: 'user-123',
        tokenId: 'token-123',
      }));

      await expect(authService.refreshToken('revoked-token')).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('should revoke refresh token on logout', async () => {
      const mockToken = {
        id: 'token-123',
        destroy: jest.fn(),
      };

      (RefreshToken.findOne as jest.Mock).mockResolvedValue(mockToken);
      jest.spyOn(jwt, 'verify').mockImplementation(() => ({
        id: 'user-123',
        tokenId: 'token-123',
      }));

      await authService.logout('valid-refresh-token');

      expect(mockToken.destroy).toHaveBeenCalled();
    });

    it('should not throw error if token not found', async () => {
      (RefreshToken.findOne as jest.Mock).mockResolvedValue(null);
      jest.spyOn(jwt, 'verify').mockImplementation(() => ({
        id: 'user-123',
        tokenId: 'token-123',
      }));

      await expect(authService.logout('non-existent-token')).resolves.not.toThrow();
    });
  });

  describe('changePassword', () => {
    it('should change password with valid current password', async () => {
      const mockUser = {
        id: 'user-123',
        password: '$2a$10$hashedpassword',
        update: jest.fn(),
      };

      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
      jest.spyOn(bcrypt, 'hash').mockImplementation(() => Promise.resolve('new-hashed-password'));

      await authService.changePassword('user-123', 'OldPassword!', 'NewPassword123!');

      expect(mockUser.update).toHaveBeenCalledWith({ password: 'new-hashed-password' });
    });

    it('should throw error for incorrect current password', async () => {
      const mockUser = {
        id: 'user-123',
        password: '$2a$10$hashedpassword',
      };

      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false));

      await expect(
        authService.changePassword('user-123', 'WrongPassword!', 'NewPassword123!')
      ).rejects.toThrow('Current password is incorrect');
    });
  });

  describe('validateToken', () => {
    it('should return decoded token for valid JWT', () => {
      const mockPayload = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'buyer',
      };

      jest.spyOn(jwt, 'verify').mockImplementation(() => mockPayload);

      const result = authService.validateToken('valid-token');

      expect(result).toEqual(mockPayload);
    });

    it('should throw error for invalid JWT', () => {
      jest.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid token');
      });

      expect(() => authService.validateToken('invalid-token')).toThrow();
    });

    it('should throw error for expired JWT', () => {
      jest.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      expect(() => authService.validateToken('expired-token')).toThrow();
    });
  });
});
