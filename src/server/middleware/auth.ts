/**
 * API Key authentication middleware.
 * Mirrors Python powermem/src/server/middleware/auth.py.
 *
 * Checks X-API-Key header or api_key query parameter.
 */
import type { Request, Response, NextFunction } from 'express';
import type { ServerConfig } from '../config.js';
import { APIError, ErrorCode } from '../models/errors.js';
import { createErrorResponse } from '../utils/http.js';

export function createAuthMiddleware(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth if disabled
    if (!config.authEnabled) {
      next();
      return;
    }

    // Public routes — no auth required
    if (req.path === '/api/v1/system/health' || req.path === '/') {
      next();
      return;
    }

    // Extract API key from header or query param
    const apiKey =
      (req.headers['x-api-key'] as string | undefined) ??
      (req.query.api_key as string | undefined);

    if (!apiKey) {
      const error = new APIError(
        ErrorCode.UNAUTHORIZED,
        'API key required. Provide X-API-Key header or api_key query parameter.',
        {},
        401,
      );
      res.status(401).json(createErrorResponse(error));
      return;
    }

    if (!config.apiKeys.includes(apiKey)) {
      const error = new APIError(
        ErrorCode.UNAUTHORIZED,
        'Invalid API key',
        {},
        401,
      );
      res.status(401).json(createErrorResponse(error));
      return;
    }

    next();
  };
}
