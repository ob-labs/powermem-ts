export enum ErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  MEMORY_NOT_FOUND = 'MEMORY_NOT_FOUND',
  MEMORY_CREATE_FAILED = 'MEMORY_CREATE_FAILED',
  MEMORY_UPDATE_FAILED = 'MEMORY_UPDATE_FAILED',
  MEMORY_DELETE_FAILED = 'MEMORY_DELETE_FAILED',
  MEMORY_SEARCH_FAILED = 'MEMORY_SEARCH_FAILED',
  MEMORY_VALIDATION_ERROR = 'MEMORY_VALIDATION_ERROR',
  MEMORY_DUPLICATE = 'MEMORY_DUPLICATE',
  MEMORY_BATCH_LIMIT_EXCEEDED = 'MEMORY_BATCH_LIMIT_EXCEEDED',
  SEARCH_FAILED = 'SEARCH_FAILED',
  INVALID_SEARCH_PARAMS = 'INVALID_SEARCH_PARAMS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_PROFILE_NOT_FOUND = 'USER_PROFILE_NOT_FOUND',
  USER_PROFILE_UPDATE_FAILED = 'USER_PROFILE_UPDATE_FAILED',
  PROFILE_UPDATE_FAILED = 'PROFILE_UPDATE_FAILED',
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  AGENT_MEMORY_ACCESS_DENIED = 'AGENT_MEMORY_ACCESS_DENIED',
  AGENT_MEMORY_SHARE_FAILED = 'AGENT_MEMORY_SHARE_FAILED',
  SYSTEM_STORAGE_ERROR = 'SYSTEM_STORAGE_ERROR',
  SYSTEM_LLM_ERROR = 'SYSTEM_LLM_ERROR',
  SYSTEM_CONFIG_ERROR = 'SYSTEM_CONFIG_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
}

export type ErrorDetails = Record<string, unknown>;

export type PowerMemErrorCode =
  | ErrorCode
  | 'INIT_ERROR'
  | 'STARTUP_ERROR'
  | 'CONNECTION_ERROR'
  | (string & {});

export class PowerMemError extends Error {
  readonly code: PowerMemErrorCode;
  readonly details: ErrorDetails;

  constructor(message: string, code: PowerMemErrorCode, details: ErrorDetails = {}) {
    super(message);
    this.name = 'PowerMemError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): { code: PowerMemErrorCode; message: string; details: ErrorDetails } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export class PowerMemInitError extends PowerMemError {
  constructor(message: string, details: ErrorDetails = {}) {
    super(message, 'INIT_ERROR', details);
    this.name = 'PowerMemInitError';
  }
}

export class PowerMemStartupError extends PowerMemError {
  constructor(message: string, details: ErrorDetails = {}) {
    super(message, 'STARTUP_ERROR', details);
    this.name = 'PowerMemStartupError';
  }
}

export class PowerMemConnectionError extends PowerMemError {
  constructor(message: string, details: ErrorDetails = {}) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'PowerMemConnectionError';
  }
}

export class PowerMemAPIError extends PowerMemError {
  readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number,
    code: PowerMemErrorCode = ErrorCode.INTERNAL_ERROR,
    details: ErrorDetails = {},
  ) {
    super(message, code, details);
    this.name = 'PowerMemAPIError';
    this.statusCode = statusCode;
  }
}
