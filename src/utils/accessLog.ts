import { Request } from 'express';
import { UserAccessLog } from '../models';
import logger from './logger';

// Pull the real client IP — first hop of X-Forwarded-For (Heroku/Vercel proxy) or req.ip.
export function clientIp(req: Request): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).split(',')[0].trim();
  return req.ip;
}

// Record an authenticated access event with IP + user-agent. Never throws — access
// logging must not break the request it is observing.
export function recordAccess(userId: string, event: string, req: Request, detail?: string): void {
  if (!userId) return;
  UserAccessLog.create({
    userId,
    event,
    ipAddress: clientIp(req),
    userAgent: req.headers['user-agent'],
    detail,
  }).catch((err) => {
    logger.error('Failed to record access log', { userId, event, error: err });
  });
}
