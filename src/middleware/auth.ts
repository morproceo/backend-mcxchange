import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthRequest, JWTPayload } from '../types';
import { User, UserRole, Subscription, SubscriptionPlan } from '../models';

// Verify JWT token
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.',
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access denied. Invalid token format.',
      });
      return;
    }

    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

    // Verify user still exists and is active
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'email', 'role', 'name', 'status', 'stripeCustomerId'],
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found.',
      });
      return;
    }

    if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
      res.status(403).json({
        success: false,
        error: 'Account is suspended or blocked.',
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      stripeCustomerId: user.stripeCustomerId,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token.',
      });
      return;
    }
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Authentication error.',
    });
  }
};

// Role-based authorization
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient permissions.',
      });
      return;
    }

    next();
  };
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      next();
      return;
    }

    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'email', 'role', 'name', 'status'],
    });

    if (user && user.status === 'ACTIVE') {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      };
    }

    next();
  } catch {
    // Silently continue without auth for optional routes
    next();
  }
};

// Seller only middleware
export const sellerOnly = authorize(UserRole.SELLER, UserRole.ADMIN);

// Buyer only middleware
export const buyerOnly = authorize(UserRole.BUYER, UserRole.ADMIN);

// Admin only middleware
export const adminOnly = authorize(UserRole.ADMIN);

// Require active subscription for buyers
export const requireSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated.',
      });
      return;
    }

    // Admins bypass subscription check
    if (req.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    // Check for active subscription
    const subscription = await Subscription.findOne({
      where: {
        userId: req.user.id,
        status: 'ACTIVE',
      },
    });

    if (!subscription) {
      res.status(403).json({
        success: false,
        error: 'Active subscription required.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
      return;
    }

    // Check if subscription is expired
    if (subscription.endDate && new Date(subscription.endDate) < new Date()) {
      res.status(403).json({
        success: false,
        error: 'Your subscription has expired.',
        code: 'SUBSCRIPTION_EXPIRED',
      });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error checking subscription status.',
    });
  }
};

// Require active Professional (or higher) subscription
export const requireProfessionalSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated.',
      });
      return;
    }

    // Admins bypass subscription check
    if (req.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    // Check for active Professional or Enterprise subscription
    const subscription = await Subscription.findOne({
      where: {
        userId: req.user.id,
        status: 'ACTIVE',
      },
    });

    if (!subscription) {
      res.status(403).json({
        success: false,
        error: 'Professional subscription required.',
        code: 'PROFESSIONAL_REQUIRED',
      });
      return;
    }

    // Check if subscription is expired
    if (subscription.endDate && new Date(subscription.endDate) < new Date()) {
      res.status(403).json({
        success: false,
        error: 'Your subscription has expired.',
        code: 'SUBSCRIPTION_EXPIRED',
      });
      return;
    }

    // Only Professional and Enterprise have access
    if (subscription.plan !== SubscriptionPlan.PROFESSIONAL && subscription.plan !== SubscriptionPlan.ENTERPRISE) {
      res.status(403).json({
        success: false,
        error: 'Professional subscription required.',
        code: 'PROFESSIONAL_REQUIRED',
      });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error checking subscription status.',
    });
  }
};
