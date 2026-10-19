import { Request, Response, NextFunction, RequestHandler } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60000;
let cleanupTimer: NodeJS.Timeout | null = null;

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const {
    windowMs = 60000,
    maxRequests = 10,
    message = 'Too many requests, please try again later.',
  } = options;

  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL);
    cleanupTimer.unref();
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);

      const groupId = extractGroupId(req);

      if (!groupId) {
        next();
        return;
      }

      const key = `${clientIp}:${groupId}`;

      const entry = rateLimitStore.get(key);
      const now = Date.now();

      if (entry) {
        if (now > entry.resetTime) {
          rateLimitStore.set(key, {
            count: 1,
            resetTime: now + windowMs,
          });
          setRateLimitHeaders(res, maxRequests, now + windowMs);
          next();
          return;
        }

        if (entry.count >= maxRequests) {
          const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

          res.set('Retry-After', retryAfter.toString());
          res.set('X-RateLimit-Limit', maxRequests.toString());
          res.set('X-RateLimit-Remaining', '0');
          res.set('X-RateLimit-Reset', entry.resetTime.toString());

          res.status(429).json({
            error: message,
            retry_after: retryAfter,
          });
          return;
        }

        entry.count++;
        setRateLimitHeaders(res, maxRequests, entry.resetTime);
        next();
        return;
      }

      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      setRateLimitHeaders(res, maxRequests, now + windowMs);
      next();

    } catch (error) {
      next();
    }
  };
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0];
    return ips.trim();
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}

function extractGroupId(req: Request): string | null {
  if (req.body?.invite_code) {
    return req.body.invite_code.toUpperCase();
  }

  if (req.params?.groupId) {
    return req.params.groupId;
  }

  return null;
}

function setRateLimitHeaders(
  res: Response,
  limit: number,
  resetTime: number
): void {
  res.set('X-RateLimit-Limit', limit.toString());
  res.set('X-RateLimit-Reset', resetTime.toString());
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

export function resetRateLimit(ip: string, groupId: string): void {
  rateLimitStore.delete(`${ip}:${groupId}`);
}

export function getRateLimitStatus(ip: string, groupId: string): RateLimitEntry | null {
  return rateLimitStore.get(`${ip}:${groupId}`) || null;
}
