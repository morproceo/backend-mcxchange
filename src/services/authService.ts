import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import {
  User,
  RefreshToken,
  PasswordResetToken,
  EmailVerificationToken,
  UserRole,
  UserStatus
} from '../models';
import { JWTPayload } from '../types';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError
} from '../middleware/errorHandler';
import { addDays, addMonths, addHours } from 'date-fns';
import { emailService } from './emailService';
import { stripeService } from './stripeService';
import logger from '../utils/logger';
import { Op } from 'sequelize';

interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone?: string;
  companyName?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  verified: boolean;
  emailVerified: boolean;
  trustScore: number;
  memberSince: Date;
  avatar?: string | null;
  totalCredits?: number;
  usedCredits?: number;
}

class AuthService {
  // Register a new user
  async register(data: RegisterData): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    // Check if user already exists
    const existingUser = await User.findOne({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, config.security.bcryptRounds);

    // Create user
    const user = await User.create({
      email: data.email.toLowerCase(),
      password: hashedPassword,
      name: data.name,
      role: data.role,
      phone: data.phone,
      companyName: data.companyName,
      status: UserStatus.ACTIVE,
      trustScore: 50,
      totalCredits: data.role === UserRole.BUYER ? 0 : 0,
      usedCredits: 0,
      emailVerified: false,
    });

    // Create Stripe customer for the user (async, don't block registration)
    this.createStripeCustomer(user).catch(err => {
      logger.error('Failed to create Stripe customer during registration', { userId: user.id, error: err });
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Send welcome email (async, don't wait)
    this.sendWelcomeAndVerificationEmails(user).catch(err => {
      logger.error('Failed to send welcome/verification emails', err);
    });

    // Return user without password
    const userResponse: UserResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      verified: user.verified,
      emailVerified: (user as any).emailVerified || false,
      trustScore: user.trustScore,
      memberSince: user.memberSince,
      avatar: user.avatar,
      totalCredits: user.totalCredits,
      usedCredits: user.usedCredits,
    };

    return { user: userResponse, tokens };
  }

  // Create Stripe customer for a user
  private async createStripeCustomer(user: User): Promise<void> {
    if (!stripeService.isEnabled()) {
      logger.warn('Stripe is not enabled, skipping customer creation', { userId: user.id });
      return;
    }

    try {
      const customer = await stripeService.createCustomer({
        email: user.email,
        name: user.name,
        phone: user.phone,
        metadata: {
          userId: user.id,
          role: user.role,
        },
      });

      // Update user with Stripe customer ID
      await user.update({ stripeCustomerId: customer.id });

      logger.info('Stripe customer created for user', {
        userId: user.id,
        stripeCustomerId: customer.id,
      });
    } catch (error) {
      logger.error('Failed to create Stripe customer', {
        userId: user.id,
        error: error instanceof Error ? error.message : error,
      });
      // Don't throw - we don't want to fail registration if Stripe fails
    }
  }

  // Send welcome and verification emails
  private async sendWelcomeAndVerificationEmails(user: User): Promise<void> {
    // Send welcome email
    await emailService.sendWelcomeEmail(user.email, {
      name: user.name,
      role: user.role === UserRole.BUYER ? 'Buyer' : user.role === UserRole.SELLER ? 'Seller' : 'Admin',
    });

    // Create verification token and send verification email
    await this.createAndSendVerificationEmail(user);
  }

  // Create and send verification email
  async createAndSendVerificationEmail(user: User): Promise<void> {
    // Delete any existing verification tokens for this user
    await EmailVerificationToken.destroy({
      where: { userId: user.id },
    });

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Create token record (expires in 24 hours)
    await EmailVerificationToken.create({
      token,
      tokenHash,
      userId: user.id,
      email: user.email,
      expiresAt: addHours(new Date(), 24),
    });

    // Build verification URL
    const verificationUrl = `${config.frontendUrl}/verify-email?token=${token}`;

    // Send email
    await emailService.sendVerificationEmail(user.email, {
      name: user.name,
      verificationUrl,
      expiresIn: '24 hours',
    });

    logger.info('Verification email sent', { userId: user.id, email: user.email });
  }

  // Login user
  async login(data: LoginData): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    // Find user
    const user = await User.findOne({
      where: { email: data.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(data.password, user.password);

    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check status
    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedError('Your account has been blocked');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedError('Your account has been suspended');
    }

    // Update last login
    await user.update({ lastLoginAt: new Date() });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Return user without password
    const userResponse: UserResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      verified: user.verified,
      emailVerified: (user as any).emailVerified || false,
      trustScore: user.trustScore,
      memberSince: user.memberSince,
      avatar: user.avatar,
      totalCredits: user.totalCredits,
      usedCredits: user.usedCredits,
    };

    return { user: userResponse, tokens };
  }

  // Refresh access token
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    // Verify refresh token
    const storedToken = await RefreshToken.findOne({
      where: { token: refreshToken },
      include: [{ model: User, as: 'user' }],
    });

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Check expiration
    if (storedToken.expiresAt < new Date()) {
      await storedToken.destroy();
      throw new UnauthorizedError('Refresh token expired');
    }

    // Verify JWT
    try {
      jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch {
      await storedToken.destroy();
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Get user from association
    const user = await User.findByPk(storedToken.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Delete old refresh token
    await storedToken.destroy();

    // Generate new tokens
    return this.generateTokens(user);
  }

  // Logout (invalidate refresh token)
  async logout(refreshToken: string): Promise<void> {
    await RefreshToken.destroy({
      where: { token: refreshToken },
    });
  }

  // Logout from all devices
  async logoutAll(userId: string): Promise<void> {
    await RefreshToken.destroy({
      where: { userId },
    });
  }

  // Verify email token
  async verifyEmail(token: string): Promise<{ message: string }> {
    // Find token
    const verificationToken = await EmailVerificationToken.findOne({
      where: {
        token,
        verifiedAt: null,
      },
      include: [{ model: User, as: 'user' }],
    });

    if (!verificationToken) {
      throw new BadRequestError('Invalid or expired verification token');
    }

    // Check expiration
    if (verificationToken.expiresAt < new Date()) {
      await verificationToken.destroy();
      throw new BadRequestError('Verification token has expired. Please request a new one.');
    }

    // Get user
    const user = await User.findByPk(verificationToken.userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Update user email verification status
    await user.update({
      emailVerified: true,
      status: user.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : user.status,
    });

    // Mark token as used
    await verificationToken.update({ verifiedAt: new Date() });

    logger.info('Email verified successfully', { userId: user.id, email: user.email });

    return { message: 'Email verified successfully' };
  }

  // Resend verification email
  async resendVerificationEmail(userId: string): Promise<{ message: string }> {
    const user = await User.findByPk(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    if ((user as any).emailVerified) {
      throw new BadRequestError('Email is already verified');
    }

    // Rate limit: Check if a verification email was sent in the last 5 minutes
    const recentToken = await EmailVerificationToken.findOne({
      where: {
        userId: user.id,
        createdAt: {
          [Op.gte]: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        },
      },
    });

    if (recentToken) {
      throw new BadRequestError('Please wait 5 minutes before requesting a new verification email');
    }

    await this.createAndSendVerificationEmail(user);

    return { message: 'Verification email sent' };
  }

  // Request password reset
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const user = await User.findOne({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      logger.info('Password reset requested for non-existent email', { email });
      return { message: 'If an account exists with this email, a password reset link will be sent.' };
    }

    // Delete any existing reset tokens for this user
    await PasswordResetToken.destroy({
      where: { userId: user.id },
    });

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Create token record (expires in 1 hour)
    await PasswordResetToken.create({
      token,
      tokenHash,
      userId: user.id,
      expiresAt: addHours(new Date(), 1),
    });

    // Build reset URL
    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;

    // Send email
    await emailService.sendPasswordResetEmail(user.email, {
      name: user.name,
      resetUrl,
      expiresIn: '1 hour',
    });

    logger.info('Password reset email sent', { userId: user.id, email: user.email });

    return { message: 'If an account exists with this email, a password reset link will be sent.' };
  }

  // Reset password with token
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // Find token
    const resetToken = await PasswordResetToken.findOne({
      where: {
        token,
        usedAt: null,
      },
      include: [{ model: User, as: 'user' }],
    });

    if (!resetToken) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    // Check expiration
    if (resetToken.expiresAt < new Date()) {
      await resetToken.destroy();
      throw new BadRequestError('Reset token has expired. Please request a new password reset.');
    }

    // Get user
    const user = await User.findByPk(resetToken.userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Validate new password
    if (newPassword.length < config.security.passwordMinLength) {
      throw new BadRequestError(`Password must be at least ${config.security.passwordMinLength} characters`);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    // Update password
    await user.update({ password: hashedPassword });

    // Mark token as used
    await resetToken.update({ usedAt: new Date() });

    // Invalidate all refresh tokens (log out from all devices)
    await this.logoutAll(user.id);

    logger.info('Password reset successful', { userId: user.id });

    return { message: 'Password reset successful. Please log in with your new password.' };
  }

  // Change password (when logged in)
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    const user = await User.findByPk(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Validate new password
    if (newPassword.length < config.security.passwordMinLength) {
      throw new BadRequestError(`Password must be at least ${config.security.passwordMinLength} characters`);
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    // Update password
    await user.update({ password: hashedPassword });

    // Invalidate all refresh tokens
    await this.logoutAll(userId);

    logger.info('Password changed', { userId });

    return { message: 'Password changed successfully. Please log in again.' };
  }

  // Generate access and refresh tokens
  private async generateTokens(user: {
    id: string;
    email: string;
    role: UserRole;
    name: string;
  }): Promise<AuthTokens> {
    const payload: JWTPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    // Generate access token
    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as string,
    } as jwt.SignOptions);

    // Generate refresh token
    const refreshTokenValue = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn as string,
    } as jwt.SignOptions);

    // Parse expiration for refresh token
    const expiresIn = config.jwt.refreshExpiresIn;
    let expiresAt: Date;
    if (expiresIn.endsWith('d')) {
      expiresAt = addDays(new Date(), parseInt(expiresIn));
    } else if (expiresIn.endsWith('m')) {
      expiresAt = addMonths(new Date(), parseInt(expiresIn));
    } else {
      expiresAt = addDays(new Date(), 30); // Default 30 days
    }

    // Store refresh token
    await RefreshToken.create({
      token: refreshTokenValue,
      userId: user.id,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: config.jwt.expiresIn,
    };
  }

  // Get user by ID
  async getUserById(userId: string): Promise<UserResponse | null> {
    const user = await User.findByPk(userId);

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      verified: user.verified,
      emailVerified: (user as any).emailVerified || false,
      trustScore: user.trustScore,
      memberSince: user.memberSince,
      avatar: user.avatar,
      totalCredits: user.totalCredits,
      usedCredits: user.usedCredits,
    };
  }

  // Clean up expired tokens (should be called periodically)
  async cleanupExpiredTokens(): Promise<{ deleted: number }> {
    const now = new Date();

    // Delete expired refresh tokens
    const deletedRefreshTokens = await RefreshToken.destroy({
      where: {
        expiresAt: { [Op.lt]: now },
      },
    });

    // Delete expired password reset tokens
    const deletedPasswordResetTokens = await PasswordResetToken.destroy({
      where: {
        [Op.or]: [
          { expiresAt: { [Op.lt]: now } },
          { usedAt: { [Op.ne]: null } }, // Also clean up used tokens
        ],
      },
    });

    // Delete expired/used email verification tokens
    const deletedVerificationTokens = await EmailVerificationToken.destroy({
      where: {
        [Op.or]: [
          { expiresAt: { [Op.lt]: now } },
          { verifiedAt: { [Op.ne]: null } }, // Also clean up verified tokens
        ],
      },
    });

    const total = deletedRefreshTokens + deletedPasswordResetTokens + deletedVerificationTokens;

    if (total > 0) {
      logger.info('Cleaned up expired tokens', {
        refreshTokens: deletedRefreshTokens,
        passwordResetTokens: deletedPasswordResetTokens,
        verificationTokens: deletedVerificationTokens,
      });
    }

    return { deleted: total };
  }
}

export const authService = new AuthService();
export default authService;
