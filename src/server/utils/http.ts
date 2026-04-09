import type { Response } from 'express';
import { APIError, ErrorCode } from '../models/errors.js';

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

export function createApiResponse<T>(data: T, message?: string): { success: true; data: T; message?: string; timestamp: string } {
  return {
    success: true,
    data,
    ...(message ? { message } : {}),
    timestamp: getCurrentTimestamp(),
  };
}

export function createErrorResponse(error: APIError): { success: false; error: Record<string, unknown>; timestamp: string } {
  return {
    success: false,
    error: error.toDict(),
    timestamp: getCurrentTimestamp(),
  };
}

export function sendApiError(res: Response, err: unknown): void {
  if (err instanceof APIError) {
    res.status(err.statusCode).json(createErrorResponse(err));
    return;
  }

  const error = new APIError(
    ErrorCode.INTERNAL_ERROR,
    'Internal server error',
    {},
    500,
  );
  res.status(500).json(createErrorResponse(error));
}

export function requireService<T>(service: T | null | undefined, serviceName: string): T {
  if (!service) {
    throw new APIError(
      ErrorCode.SERVICE_UNAVAILABLE,
      `${serviceName} unavailable: storage backend initialization failed`,
      {},
      503,
    );
  }
  return service;
}
