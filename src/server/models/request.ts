import type { MemoryContent } from '../../powermem/types/memory.js';
import { APIError, ErrorCode } from './errors.js';

export interface UserProfileAddRequest {
  messages: MemoryContent;
  agent_id?: string;
  run_id?: string;
  metadata?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  scope?: string;
  memory_type?: string;
  prompt?: string;
  infer: boolean;
  profile_type: 'content' | 'topics';
  custom_topics?: string | Record<string, unknown>;
  strict_mode: boolean;
  include_roles?: string[] | null;
  exclude_roles?: string[] | null;
  native_language?: string;
}

export interface UserProfileUpdateRequest {
  content: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function optionalStringArray(value: unknown, fieldName: string): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new APIError(
      ErrorCode.INVALID_REQUEST,
      `Field "${fieldName}" must be an array of strings`,
      { field: fieldName },
      422,
    );
  }
  return value;
}

export function parseUserProfileAddRequest(body: unknown): UserProfileAddRequest {
  if (!isRecord(body)) {
    throw new APIError(
      ErrorCode.INVALID_REQUEST,
      'Request body must be a JSON object',
      {},
      422,
    );
  }

  if (body.messages === undefined) {
    throw new APIError(
      ErrorCode.INVALID_REQUEST,
      'Request validation failed',
      { errors: [{ loc: ['body', 'messages'], msg: 'Field required', type: 'missing' }] },
      422,
    );
  }

  const profileType = body.profile_type;
  if (profileType !== undefined && profileType !== 'content' && profileType !== 'topics') {
    throw new APIError(
      ErrorCode.INVALID_REQUEST,
      'Field "profile_type" must be either "content" or "topics"',
      { field: 'profile_type' },
      422,
    );
  }

  return {
    messages: body.messages as MemoryContent,
    agent_id: typeof body.agent_id === 'string' ? body.agent_id : undefined,
    run_id: typeof body.run_id === 'string' ? body.run_id : undefined,
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
    filters: isRecord(body.filters) ? body.filters : undefined,
    scope: typeof body.scope === 'string' ? body.scope : undefined,
    memory_type: typeof body.memory_type === 'string' ? body.memory_type : undefined,
    prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
    infer: typeof body.infer === 'boolean' ? body.infer : true,
    profile_type: profileType === 'topics' ? 'topics' : 'content',
    custom_topics: typeof body.custom_topics === 'string' || isRecord(body.custom_topics)
      ? body.custom_topics as string | Record<string, unknown>
      : undefined,
    strict_mode: typeof body.strict_mode === 'boolean' ? body.strict_mode : false,
    include_roles: optionalStringArray(body.include_roles, 'include_roles') ?? ['user'],
    exclude_roles: optionalStringArray(body.exclude_roles, 'exclude_roles') ?? ['assistant'],
    native_language: typeof body.native_language === 'string' ? body.native_language : undefined,
  };
}

export function parseUserProfileUpdateRequest(body: unknown): UserProfileUpdateRequest {
  if (!isRecord(body) || typeof body.content !== 'string' || body.content.trim().length === 0) {
    throw new APIError(
      ErrorCode.INVALID_REQUEST,
      'Request validation failed',
      { errors: [{ loc: ['body', 'content'], msg: 'Field required', type: 'missing' }] },
      422,
    );
  }

  return {
    content: body.content,
    agent_id: typeof body.agent_id === 'string' ? body.agent_id : undefined,
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
  };
}
