/**
 * API Key authentication middleware.
 * Mirrors Python powermem/src/server/middleware/auth.py.
 *
 * Checks X-API-Key header or api_key query parameter.
 */
import type { Request, Response, NextFunction } from 'express';
import type { ServerConfig } from '../config.js';

export function createAuthMiddleware(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth if disabled
    if (!config.authEnabled) {
      next();
      return;
    }

    // Public routes — no auth required
    if (req.path === '/api/v1/system/health' || req.path === '/' || req.path.startsWith('/dashboard')) {
      next();
      return;
    }

    // Extract API key from header or query param
    const apiKey =
      (req.headers['x-api-key'] as string | undefined) ??
      (req.query.api_key as string | undefined);

    if (!apiKey) {
      res.status(401).json({
        success: false,
        code: 'unauthorized',
        message: 'API key required. Provide X-API-Key header or api_key query parameter.',
      });
      return;
    }

    if (!config.apiKeys.includes(apiKey)) {
      res.status(401).json({
        success: false,
        code: 'unauthorized',
        message: 'Invalid API key',
      });
      return;
    }

    next();
  };
}
