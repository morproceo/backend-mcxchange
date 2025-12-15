import winston from 'winston';
import path from 'path';
import { config } from '../config';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, requestId, userId, ...metadata }) => {
  let msg = `${timestamp} [${level}]`;

  if (requestId) {
    msg += ` [${requestId}]`;
  }

  if (userId) {
    msg += ` [user:${userId}]`;
  }

  msg += `: ${message}`;

  // Add metadata if present
  const metaKeys = Object.keys(metadata).filter(key => key !== 'stack');
  if (metaKeys.length > 0) {
    const metaStr = metaKeys.map(key => `${key}=${JSON.stringify(metadata[key])}`).join(' ');
    msg += ` ${metaStr}`;
  }

  // Add stack trace for errors
  if (metadata.stack) {
    msg += `\n${metadata.stack}`;
  }

  return msg;
});

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Determine log level based on environment
const level = () => {
  const env = config.nodeEnv || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// Create transports array
const transports: winston.transport[] = [
  // Console transport - always enabled
  new winston.transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      consoleFormat
    ),
  }),
];

// Add file transports in production
if (config.nodeEnv === 'production') {
  // Ensure logs directory exists
  const logsDir = path.join(process.cwd(), 'logs');

  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: combine(
        timestamp(),
        errors({ stack: true }),
        json()
      ),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: combine(
        timestamp(),
        errors({ stack: true }),
        json()
      ),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  // HTTP access log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'access.log'),
      level: 'http',
      format: combine(
        timestamp(),
        json()
      ),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  defaultMeta: { service: 'mc-exchange-api' },
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Create child logger with request context
export const createRequestLogger = (requestId: string, userId?: string) => {
  return logger.child({ requestId, userId });
};

// Export typed logger methods for convenience
export const logError = (message: string, error?: Error, metadata?: Record<string, any>) => {
  logger.error(message, {
    ...metadata,
    ...(error && {
      errorMessage: error.message,
      errorName: error.name,
      stack: error.stack
    }),
  });
};

export const logWarn = (message: string, metadata?: Record<string, any>) => {
  logger.warn(message, metadata);
};

export const logInfo = (message: string, metadata?: Record<string, any>) => {
  logger.info(message, metadata);
};

export const logHttp = (message: string, metadata?: Record<string, any>) => {
  logger.http(message, metadata);
};

export const logDebug = (message: string, metadata?: Record<string, any>) => {
  logger.debug(message, metadata);
};

// Database query logger
export const logQuery = (query: string, duration: number, metadata?: Record<string, any>) => {
  logger.debug('Database query executed', {
    query: query.substring(0, 200), // Truncate long queries
    duration: `${duration}ms`,
    ...metadata,
  });
};

// Audit logger for sensitive operations
export const logAudit = (
  action: string,
  userId: string,
  resource: string,
  resourceId: string,
  metadata?: Record<string, any>
) => {
  logger.info(`AUDIT: ${action}`, {
    audit: true,
    userId,
    resource,
    resourceId,
    ...metadata,
  });
};

// Security event logger
export const logSecurity = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  metadata?: Record<string, any>
) => {
  const logLevel = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  logger.log(logLevel, `SECURITY: ${event}`, {
    security: true,
    severity,
    ...metadata,
  });
};

// Performance logger
export const logPerformance = (
  operation: string,
  duration: number,
  metadata?: Record<string, any>
) => {
  const level = duration > 1000 ? 'warn' : 'debug';
  logger.log(level, `PERFORMANCE: ${operation}`, {
    performance: true,
    duration: `${duration}ms`,
    slow: duration > 1000,
    ...metadata,
  });
};

export default logger;
