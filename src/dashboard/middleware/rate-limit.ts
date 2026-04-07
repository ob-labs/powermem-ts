/**
 * Simple in-memory rate limiter — sliding window per IP.
 * Mirrors Python powermem/src/server/middleware/rate_limit.py (slowapi).
 */
import type { Request, Response, NextFunction } from 'express';
import type { ServerConfig } from '../config.js';

interface WindowEntry {
  timestamps: number[];
}

export function createRateLimitMiddleware(config: ServerConfig) {
  const store = new Map<string, WindowEntry>();
  const windowMs = 60_000; // 1 minute

  // Periodic cleanup every 5 minutes
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, 300_000);
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.rateLimitEnabled) {
      next();
      return;
    }

    // Public routes skip rate limiting
    if (req.path === '/api/v1/system/health') {
      next();
      return;
    }

    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();

    let entry = store.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(ip, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

    if (entry.timestamps.length >= config.rateLimitPerMinute) {
      const oldest = entry.timestamps[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        code: 'rate_limit_exceeded',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      });
      return;
    }

    entry.timestamps.push(now);
    next();
  };
}
