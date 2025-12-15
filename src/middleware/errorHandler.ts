import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';
import { config } from '../config';
import logger, { logError, logSecurity } from '../utils/logger';

// ============================================
// Custom Error Classes
// ============================================

// Base application error
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Not found error (404)
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// Validation error (400)
export class ValidationError extends AppError {
  errors: { field: string; message: string }[];

  constructor(errors: { field: string; message: string }[]) {
    super('Validation failed', 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

// Bad request error (400)
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

// Unauthorized error (401)
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// Forbidden error (403)
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

// Conflict error (409)
export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

// Too many requests error (429)
export class TooManyRequestsError extends AppError {
  retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, 'TOO_MANY_REQUESTS');
    this.retryAfter = retryAfter;
  }
}

// Service unavailable error (503)
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

// Payment required error (402)
export class PaymentRequiredError extends AppError {
  constructor(message: string = 'Payment required') {
    super(message, 402, 'PAYMENT_REQUIRED');
  }
}

// Internal server error (500)
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

// ============================================
// Error Response Builder
// ============================================

interface ErrorResponse extends ApiResponse {
  code?: string;
  requestId?: string;
  timestamp?: string;
  path?: string;
  stack?: string;
}

const buildErrorResponse = (
  err: Error | AppError,
  req: Request,
  statusCode: number,
  message: string,
  errors?: { field: string; message: string }[]
): ErrorResponse => {
  const response: ErrorResponse = {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };

  // Add request ID if available
  if (req.requestId) {
    response.requestId = req.requestId;
  }

  // Add error code if AppError
  if (err instanceof AppError && err.code) {
    response.code = err.code;
  }

  // Add validation errors if present
  if (errors) {
    response.errors = errors;
  }

  // Add retry-after header value if applicable
  if (err instanceof TooManyRequestsError && err.retryAfter) {
    response.retryAfter = err.retryAfter;
  }

  // Add stack trace only in development for non-operational errors
  if (config.isDevelopment && !(err instanceof AppError && err.isOperational)) {
    response.stack = err.stack;
  }

  return response;
};

// ============================================
// Sanitize Error Messages for Production
// ============================================

const sanitizeErrorMessage = (err: Error, statusCode: number): string => {
  // In production, hide internal error details
  if (config.isProduction && statusCode === 500) {
    return 'An unexpected error occurred. Please try again later.';
  }

  return err.message;
};

// ============================================
// Global Error Handler Middleware
// ============================================

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Default error values
  let statusCode = 500;
  let message = 'Internal server error';
  let errors: { field: string; message: string }[] | undefined;

  // ----------------------------------------
  // Handle AppError instances
  // ----------------------------------------
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;

    if (err instanceof ValidationError) {
      errors = err.errors;
    }
  }
  // ----------------------------------------
  // Handle Sequelize errors
  // ----------------------------------------
  else if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    const seqError = err as any;
    const field = seqError.errors?.[0]?.path || 'field';
    message = `A record with this ${field} already exists`;
  } else if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    const seqError = err as any;
    errors = seqError.errors?.map((e: any) => ({
      field: e.path,
      message: e.message,
    }));
    message = 'Validation failed';
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Invalid reference to related resource';
  } else if (err.name === 'SequelizeDatabaseError') {
    statusCode = 500;
    message = config.isProduction
      ? 'Database error occurred'
      : (err as any).message;
  }
  // ----------------------------------------
  // Handle JWT errors
  // ----------------------------------------
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
    logSecurity('Invalid JWT token', 'medium', {
      requestId: req.requestId,
      ip: req.ip,
      path: req.path,
    });
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired';
  } else if (err.name === 'NotBeforeError') {
    statusCode = 401;
    message = 'Authentication token not yet valid';
  }
  // ----------------------------------------
  // Handle Multer (file upload) errors
  // ----------------------------------------
  else if (err.name === 'MulterError') {
    statusCode = 400;
    const multerError = err as any;
    switch (multerError.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      default:
        message = 'File upload error';
    }
  }
  // ----------------------------------------
  // Handle Stripe errors
  // ----------------------------------------
  else if (err.name === 'StripeError' || (err as any).type?.startsWith('Stripe')) {
    const stripeError = err as any;
    statusCode = stripeError.statusCode || 400;
    message = config.isProduction
      ? 'Payment processing error'
      : stripeError.message;
    logError('Stripe error', err, { type: stripeError.type });
  }
  // ----------------------------------------
  // Handle syntax errors (malformed JSON)
  // ----------------------------------------
  else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  }
  // ----------------------------------------
  // Handle other errors
  // ----------------------------------------
  else {
    // Log unexpected errors
    logError('Unexpected error', err, {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
    });
  }

  // Sanitize message for production
  message = sanitizeErrorMessage(err, statusCode);

  // Build and send response
  const response = buildErrorResponse(err, req, statusCode, message, errors);

  // Set retry-after header if applicable
  if (err instanceof TooManyRequestsError && err.retryAfter) {
    res.setHeader('Retry-After', err.retryAfter);
  }

  // Log the error (skip 4xx client errors in production unless they're suspicious)
  if (statusCode >= 500 || config.isDevelopment) {
    logger.error(`${statusCode} ${req.method} ${req.path}: ${message}`, {
      requestId: req.requestId,
      statusCode,
      error: err.message,
      stack: err.stack,
    });
  }

  res.status(statusCode).json(response);
};

// ============================================
// Async Handler Wrapper
// ============================================

export const asyncHandler = <T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================
// 404 Handler for Unknown Routes
// ============================================

export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ErrorResponse = {
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    code: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };

  if (req.requestId) {
    response.requestId = req.requestId;
  }

  res.status(404).json(response);
};

// ============================================
// Unhandled Rejection & Exception Handlers
// ============================================

export const setupGlobalErrorHandlers = (): void => {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any) => {
    logError('Unhandled Promise Rejection', reason instanceof Error ? reason : new Error(String(reason)));

    // In production, we might want to gracefully shutdown
    if (config.isProduction) {
      logger.error('Unhandled rejection in production - initiating graceful shutdown');
      // Give time for logging before exit
      setTimeout(() => process.exit(1), 1000);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logError('Uncaught Exception', error);

    // Uncaught exceptions are severe - always exit
    logger.error('Uncaught exception - initiating immediate shutdown');
    setTimeout(() => process.exit(1), 1000);
  });

  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received - initiating graceful shutdown');
  });

  // Handle SIGINT for graceful shutdown (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('SIGINT received - initiating graceful shutdown');
  });
};

// Export all error classes
export {
  AppError as default,
};
