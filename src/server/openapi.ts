/**
 * OpenAPI 3.0 specification — generated programmatically.
 * Mirrors Python FastAPI auto-generated /openapi.json.
 */

export function buildOpenAPISpec(version: string) {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const apiEnvelope = (schema?: object) => ({
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: schema ?? { type: 'object' },
      message: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
    },
    required: ['success', 'data', 'timestamp'],
  });
  const ok = (desc: string, schema?: object) => ({
    '200': {
      description: desc,
      content: {
        'application/json': {
          schema: apiEnvelope(schema),
        },
      },
    },
  });
  const err = {
    '401': { description: 'Unauthorized', content: { 'application/json': { schema: ref('ErrorResponse') } } },
    '422': { description: 'Validation error', content: { 'application/json': { schema: ref('ErrorResponse') } } },
    '500': { description: 'Server error', content: { 'application/json': { schema: ref('ErrorResponse') } } },
    '503': { description: 'Service unavailable', content: { 'application/json': { schema: ref('ErrorResponse') } } },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'PowerMem API',
      version,
      description: 'PowerMem TypeScript REST API — memory management with vector search, multi-tenant isolation, and intelligent features.',
      contact: { name: 'PowerMem', url: 'https://github.com/nicepkg/powermem-ts' },
    },
    servers: [{ url: '/api/v1', description: 'API v1' }],
    tags: [
      { name: 'system', description: 'Health, status, and metrics' },
      { name: 'memories', description: 'Memory CRUD operations' },
      { name: 'search', description: 'Vector + hybrid search' },
      { name: 'agents', description: 'Agent-scoped memory operations' },
      { name: 'users', description: 'User profiles and user-scoped memories' },
    ],
    paths: {
      // ─── System ──────────────────────────────────
      '/system/health': {
        get: { summary: 'Health check (public)', tags: ['system'], security: [], responses: ok('OK', ref('HealthResponse')) },
      },
      '/system/status': {
        get: { summary: 'System status', tags: ['system'], responses: { ...ok('Status', ref('StatusResponse')), ...err } },
      },
      '/system/metrics': {
        get: { summary: 'Prometheus metrics', tags: ['system'], responses: { '200': { description: 'Prometheus text format', content: { 'text/plain': { schema: { type: 'string' } } } } } },
      },
      '/system/delete-all-memories': {
        delete: { summary: 'Delete all memories (admin)', tags: ['system'], parameters: userAgentParams(), responses: { ...ok('Deleted'), ...err } },
      },
      // ─── Memories ────────────────────────────────
      '/memories': {
        get: { summary: 'List memories', tags: ['memories'], parameters: [...userAgentParams(), intParam('limit', 20), intParam('offset', 0), strParam('sort_by'), strParam('order')], responses: { ...ok('Memory list', ref('MemoryListResponse')), ...err } },
        post: { summary: 'Create memory', tags: ['memories'], requestBody: jsonBody(ref('CreateMemoryRequest')), responses: { ...ok('Created', ref('AddResult')), ...err } },
        delete: { summary: 'Delete all memories', tags: ['memories'], parameters: userAgentParams(), responses: { ...ok('Deleted'), ...err } },
      },
      '/memories/{id}': {
        get: { summary: 'Get memory by ID', tags: ['memories'], parameters: [pathParam('id')], responses: { ...ok('Memory', ref('MemoryRecord')), '404': { description: 'Not found' }, ...err } },
        put: { summary: 'Update memory', tags: ['memories'], parameters: [pathParam('id')], requestBody: jsonBody(ref('UpdateMemoryRequest')), responses: { ...ok('Updated', ref('MemoryRecord')), ...err } },
        delete: { summary: 'Delete memory', tags: ['memories'], parameters: [pathParam('id')], responses: { ...ok('Deleted'), ...err } },
      },
      '/memories/search': {
        get: { summary: 'Search (query params)', tags: ['search'], parameters: [strParam('query', true), ...userAgentParams(), intParam('limit', 10)], responses: { ...ok('Results', ref('SearchResult')), ...err } },
        post: { summary: 'Search (body)', tags: ['search'], requestBody: jsonBody(ref('SearchRequest')), responses: { ...ok('Results', ref('SearchResult')), ...err } },
      },
      '/memories/stats': {
        get: { summary: 'Memory statistics', tags: ['memories'], parameters: userAgentParams(), responses: { ...ok('Stats'), ...err } },
      },
      '/memories/count': {
        get: { summary: 'Memory count', tags: ['memories'], parameters: userAgentParams(), responses: { ...ok('Count', { type: 'object', properties: { count: { type: 'integer' } } }), ...err } },
      },
      '/memories/users': {
        get: { summary: 'Unique users', tags: ['memories'], parameters: [intParam('limit', 1000)], responses: { ...ok('Users', { type: 'object', properties: { users: { type: 'array', items: { type: 'string' } } } }), ...err } },
      },
      '/memories/export': {
        get: { summary: 'Export memories', tags: ['memories'], parameters: [...userAgentParams(), intParam('limit', 10000)], responses: { ...ok('Exported'), ...err } },
      },
      '/memories/import': {
        post: { summary: 'Import memories', tags: ['memories'], requestBody: jsonBody({ type: 'object', properties: { memories: { type: 'array', items: ref('ImportItem') }, infer: { type: 'boolean', default: false } } }), responses: { ...ok('Import result'), ...err } },
      },
      '/memories/batch': {
        post: { summary: 'Batch create', tags: ['memories'], requestBody: jsonBody({ type: 'object', properties: { memories: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] } }, user_id: { type: 'string' }, agent_id: { type: 'string' } } }), responses: { ...ok('Batch result', ref('AddResult')), ...err } },
        put: { summary: 'Batch update', tags: ['memories'], requestBody: jsonBody({ type: 'object', properties: { updates: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, content: { type: 'string' } } } } } }), responses: { ...ok('Updated'), ...err } },
        delete: { summary: 'Batch delete', tags: ['memories'], requestBody: jsonBody({ type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } } }), responses: { ...ok('Deleted'), ...err } },
      },
      // ─── Agents ──────────────────────────────────
      '/agents/{agentId}/memories': {
        get: { summary: 'List agent memories', tags: ['agents'], parameters: [pathParam('agentId'), intParam('limit', 100), intParam('offset', 0)], responses: { ...ok('Memories', ref('MemoryListResponse')), ...err } },
        post: { summary: 'Add agent memory', tags: ['agents'], parameters: [pathParam('agentId')], requestBody: jsonBody(ref('CreateMemoryRequest')), responses: { ...ok('Created', ref('AddResult')), ...err } },
      },
      '/agents/{agentId}/memories/share': {
        get: { summary: 'Get shared memories', tags: ['agents'], parameters: [pathParam('agentId')], responses: { ...ok('Shared memories'), ...err } },
        post: { summary: 'Share memories', tags: ['agents'], parameters: [pathParam('agentId')], requestBody: jsonBody({ type: 'object', properties: { memory_ids: { type: 'array', items: { type: 'string' } }, target_agent_id: { type: 'string' } } }), responses: { ...ok('Share result'), ...err } },
      },
      // ─── Users ───────────────────────────────────
      '/users/profiles': {
        get: {
          summary: 'List user profiles',
          tags: ['users'],
          parameters: [
            strParam('user_id'),
            boolParam('fuzzy'),
            strParam('main_topic'),
            strParam('sub_topic'),
            strParam('topic_value'),
            intParam('limit', 20),
            intParam('offset', 0),
          ],
          responses: { ...ok('Profiles', ref('UserProfileListResponse')), ...err },
        },
      },
      '/users/{userId}/profile': {
        get: {
          summary: 'Get user profile',
          tags: ['users'],
          parameters: [pathParam('userId')],
          responses: {
            ...ok('Profile', ref('UserProfileResponse')),
            '404': { description: 'User profile not found' },
            ...err,
          },
        },
        post: {
          summary: 'Add messages and extract user profile',
          tags: ['users'],
          parameters: [pathParam('userId')],
          requestBody: jsonBody(ref('UserProfileAddRequest')),
          responses: { ...ok('Extraction result', ref('UserProfileAddResult')), ...err },
        },
        delete: {
          summary: 'Delete user profile',
          tags: ['users'],
          parameters: [pathParam('userId')],
          responses: {
            ...ok('Deleted', ref('UserProfileDeleteResponse')),
            '404': { description: 'User profile not found' },
            ...err,
          },
        },
      },
      '/users/{userId}/memories': {
        get: { summary: 'List user memories', tags: ['users'], parameters: [pathParam('userId'), intParam('limit', 100), intParam('offset', 0)], responses: { ...ok('Memories', ref('UserMemoryListResponse')), ...err } },
        delete: { summary: 'Delete all user memories', tags: ['users'], parameters: [pathParam('userId')], responses: { ...ok('Deleted', ref('DeleteUserMemoriesResponse')), ...err } },
      },
      '/users/{userId}/memories/{memoryId}': {
        put: { summary: 'Update user memory', tags: ['users'], parameters: [pathParam('userId'), pathParam('memoryId')], requestBody: jsonBody(ref('UserProfileUpdateRequest')), responses: { ...ok('Updated', ref('UserMemoryResponse')), ...err } },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        ApiKeyQuery: { type: 'apiKey', in: 'query', name: 'api_key' },
      },
      schemas: {
        HealthResponse: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { status: { type: 'string' } } } } },
        StatusResponse: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { version: { type: 'string' }, uptime: { type: 'integer' }, status: { type: 'string' }, nodeVersion: { type: 'string' } } } } },
        MemoryRecord: { type: 'object', properties: { id: { type: 'string' }, memoryId: { type: 'string' }, content: { type: 'string' }, userId: { type: 'string' }, agentId: { type: 'string' }, runId: { type: 'string' }, actorId: { type: 'string' }, metadata: { type: 'object' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, scope: { type: 'string' }, category: { type: 'string' }, accessCount: { type: 'integer' } } },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [false] },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
              required: ['code', 'message', 'details'],
            },
            timestamp: { type: 'string', format: 'date-time' },
          },
          required: ['success', 'error', 'timestamp'],
        },
        AddResult: { type: 'object', properties: { memories: { type: 'array', items: { $ref: '#/components/schemas/MemoryRecord' } }, message: { type: 'string' } } },
        SearchResult: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { memoryId: { type: 'string' }, content: { type: 'string' }, score: { type: 'number' }, userId: { type: 'string' }, agentId: { type: 'string' }, runId: { type: 'string' }, actorId: { type: 'string' }, metadata: { type: 'object' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } } }, total: { type: 'integer' }, query: { type: 'string' }, relations: { type: 'array', items: { type: 'object' } } } },
        MemoryListResponse: { type: 'object', properties: { memories: { type: 'array', items: { $ref: '#/components/schemas/MemoryRecord' } }, total: { type: 'integer' }, limit: { type: 'integer' }, offset: { type: 'integer' } } },
        CreateMemoryRequest: { type: 'object', required: ['content'], properties: { content: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'object' } }] }, user_id: { type: 'string' }, agent_id: { type: 'string' }, run_id: { type: 'string' }, infer: { type: 'boolean', default: false }, metadata: { type: 'object' } } },
        UpdateMemoryRequest: { type: 'object', properties: { content: { type: 'string' }, metadata: { type: 'object' } } },
        SearchRequest: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, user_id: { type: 'string' }, agent_id: { type: 'string' }, limit: { type: 'integer', default: 10 } } },
        ImportItem: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, userId: { type: 'string' }, agentId: { type: 'string' }, metadata: { type: 'object' } } },
        MessageInput: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            content: {
              oneOf: [
                { type: 'string' },
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      text: { type: 'string' },
                      image_url: { type: 'object', properties: { url: { type: 'string' }, detail: { type: 'string' } } },
                      audio_url: { type: 'string' },
                    },
                  },
                },
              ],
            },
          },
        },
        UserMemoryResponse: {
          type: 'object',
          properties: {
            memory_id: { type: 'string' },
            id: { type: 'string' },
            content: { type: 'string' },
            user_id: { type: 'string' },
            agent_id: { type: 'string' },
            run_id: { type: 'string' },
            metadata: { type: 'object' },
            created_at: { type: 'string', format: 'date-time', nullable: true },
            updated_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        UserMemoryListResponse: {
          type: 'object',
          properties: {
            memories: { type: 'array', items: ref('UserMemoryResponse') },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
        },
        UserProfileResponse: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            profile_content: { type: 'string', nullable: true },
            topics: { type: 'object', nullable: true },
            updated_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        UserProfileListResponse: {
          type: 'object',
          properties: {
            profiles: { type: 'array', items: ref('UserProfileResponse') },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
        },
        UserProfileAddRequest: {
          type: 'object',
          required: ['messages'],
          properties: {
            messages: {
              oneOf: [
                { type: 'string' },
                ref('MessageInput'),
                { type: 'array', items: ref('MessageInput') },
              ],
            },
            agent_id: { type: 'string' },
            run_id: { type: 'string' },
            metadata: { type: 'object' },
            filters: { type: 'object' },
            scope: { type: 'string' },
            memory_type: { type: 'string' },
            prompt: { type: 'string' },
            infer: { type: 'boolean', default: true },
            profile_type: { type: 'string', enum: ['content', 'topics'], default: 'content' },
            custom_topics: { oneOf: [{ type: 'string' }, { type: 'object' }] },
            strict_mode: { type: 'boolean', default: false },
            include_roles: { type: 'array', items: { type: 'string' } },
            exclude_roles: { type: 'array', items: { type: 'string' } },
            native_language: { type: 'string' },
          },
        },
        UserProfileAddResult: {
          type: 'object',
          properties: {
            memories: { type: 'array', items: ref('UserMemoryResponse') },
            message: { type: 'string' },
            profile_extracted: { type: 'boolean' },
            profile_content: { type: 'string' },
            topics: { type: 'object' },
          },
        },
        UserProfileUpdateRequest: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string' },
            agent_id: { type: 'string' },
            metadata: { type: 'object' },
          },
        },
        UserProfileDeleteResponse: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            deleted: { type: 'boolean' },
          },
        },
        DeleteUserMemoriesResponse: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            deleted_count: { type: 'integer' },
            failed_count: { type: 'integer' },
            total: { type: 'integer' },
          },
        },
      },
    },
    security: [{ ApiKeyHeader: [] }, { ApiKeyQuery: [] }],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pathParam(name: string) {
  return { name, in: 'path' as const, required: true, schema: { type: 'string' as const } };
}

function strParam(name: string, required = false) {
  return { name, in: 'query' as const, required, schema: { type: 'string' as const } };
}

function intParam(name: string, defaultValue?: number) {
  return { name, in: 'query' as const, schema: { type: 'integer' as const, ...(defaultValue !== undefined ? { default: defaultValue } : {}) } };
}

function boolParam(name: string, defaultValue?: boolean) {
  return { name, in: 'query' as const, schema: { type: 'boolean' as const, ...(defaultValue !== undefined ? { default: defaultValue } : {}) } };
}

function userAgentParams() {
  return [strParam('user_id'), strParam('agent_id')];
}

function jsonBody(schema: object) {
  return { required: true, content: { 'application/json': { schema } } };
}
