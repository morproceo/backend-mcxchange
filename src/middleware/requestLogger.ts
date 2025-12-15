import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger, { logHttp, logPerformance } from '../utils/logger';
import { config } from '../config';

// Extend Express Request to include custom properties
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

// Fields to redact from logs
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
  'apiKey',
  'secret',
];

/**
 * Redact sensitive data from objects
 */
const redactSensitive = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(redactSensitive);
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redacted[key] = redactSensitive(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
};

/**
 * Get safe request body for logging
 */
const getSafeBody = (body: any): any => {
  if (!body || Object.keys(body).length === 0) return undefined;
  return redactSensitive(body);
};

/**
 * Get safe headers for logging
 */
const getSafeHeaders = (headers: any): Record<string, string> => {
  const safeHeaders: Record<string, string> = {};
  const allowedHeaders = [
    'content-type',
    'content-length',
    'user-agent',
    'accept',
    'accept-language',
    'accept-encoding',
    'origin',
    'referer',
    'x-forwarded-for',
    'x-real-ip',
    'x-request-id',
  ];

  for (const header of allowedHeaders) {
    if (headers[header]) {
      safeHeaders[header] = headers[header];
    }
  }

  // Indicate if auth header present without exposing it
  if (headers.authorization) {
    safeHeaders['authorization'] = '[PRESENT]';
  }

  return safeHeaders;
};

/**
 * Get client IP address
 */
const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = typeof forwarded === 'string' ? forwarded : forwarded[0];
    return ip.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

/**
 * Request logging middleware
 * Logs all incoming requests and their responses
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Generate request ID
  req.requestId = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);

  // Get user ID if authenticated
  const userId = (req as any).user?.id;

  // Log request start (only in verbose mode)
  if (config.nodeEnv === 'development') {
    logger.debug('Incoming request', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
      userId,
    });
  }

  // Capture original end method
  const originalEnd = res.end;
  let responseBody: any;

  // Override res.end to capture response
  const self = res;
  res.end = function(this: Response, chunk?: any, encoding?: BufferEncoding | (() => void), callback?: () => void): Response {
    // Try to capture response body for logging (only small JSON responses)
    if (chunk && self.getHeader('content-type')?.toString().includes('application/json')) {
      try {
        const bodyStr = chunk.toString();
        if (bodyStr.length < 1000) {
          responseBody = JSON.parse(bodyStr);
        }
      } catch {
        // Ignore parsing errors
      }
    }

    // Call original end - use any to bypass strict overload checking
    return (originalEnd as any).call(self, chunk, encoding, callback);
  } as typeof res.end;

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const statusCode = res.statusCode;

    // Determine log level based on status code
    const isError = statusCode >= 400;
    const isServerError = statusCode >= 500;

    // Build log data
    const logData: Record<string, any> = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode,
      duration: `${duration}ms`,
      ip: getClientIp(req),
      userId,
    };

    // Add query params if present
    if (Object.keys(req.query).length > 0) {
      logData.query = req.query;
    }

    // Add request body for non-GET requests (in development or on error)
    if (req.method !== 'GET' && (config.nodeEnv === 'development' || isError)) {
      const safeBody = getSafeBody(req.body);
      if (safeBody) {
        logData.requestBody = safeBody;
      }
    }

    // Add response body on error
    if (isError && responseBody) {
      logData.responseBody = redactSensitive(responseBody);
    }

    // Add user agent on errors
    if (isError) {
      logData.userAgent = req.headers['user-agent'];
    }

    // Log with appropriate level
    if (isServerError) {
      logger.error(`${req.method} ${req.path} ${statusCode}`, logData);
    } else if (isError) {
      logger.warn(`${req.method} ${req.path} ${statusCode}`, logData);
    } else {
      logHttp(`${req.method} ${req.path} ${statusCode}`, logData);
    }

    // Log performance warning for slow requests
    if (duration > 1000) {
      logPerformance(`Slow request: ${req.method} ${req.path}`, duration, {
        requestId: req.requestId,
        statusCode,
      });
    }
  });

  next();
};

/**
 * Error logging middleware
 * Should be placed after routes but before error handler
 */
export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  const duration = req.startTime ? Date.now() - req.startTime : 0;

  logger.error(`Request error: ${err.message}`, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    duration: `${duration}ms`,
    ip: getClientIp(req),
    userId: (req as any).user?.id,
    error: {
      name: err.name,
      message: err.message,
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
    },
    requestBody: getSafeBody(req.body),
    headers: getSafeHeaders(req.headers),
  });

  next(err);
};

/**
 * Skip logging for certain paths
 */
export const skipPaths = [
  '/api/health',
  '/api/health/ready',
  '/api/health/live',
  '/favicon.ico',
];

/**
 * Conditional request logger that skips certain paths
 */
export const conditionalRequestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (skipPaths.some(path => req.path.startsWith(path))) {
    // Still assign request ID even when skipping logs
    req.requestId = req.headers['x-request-id'] as string || uuidv4();
    req.startTime = Date.now();
    res.setHeader('X-Request-ID', req.requestId);
    return next();
  }

  return requestLogger(req, res, next);
};

export default requestLogger;
