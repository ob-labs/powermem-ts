import { PowerMemAPIError, PowerMemConnectionError } from '../errors/index.js';
import { toSnakeCase, toCamelCase } from '../utils/case-convert.js';
import type { MemoryProvider } from './index.js';
import type {
  AddParams,
  SearchParams,
  UpdateParams,
  GetAllParams,
  FilterParams,
  BatchItem,
  BatchOptions,
  MemoryRecord,
} from '../types/memory.js';
import type { AddResult, SearchResult, MemoryListResult } from '../types/responses.js';

interface APIResponse {
  success: boolean;
  data: unknown;
  message?: string;
}

export class HttpProvider implements MemoryProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string
  ) {}

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  /** 发送请求，解包 APIResponse.data，并将响应 key 转为 camelCase */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const qs = new URLSearchParams(query).toString();
      if (qs) url += `?${qs}`;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(toSnakeCase(body)) : undefined,
      });
    } catch (err) {
      throw new PowerMemConnectionError(
        `Failed to connect to powermem server: ${String(err)}`
      );
    }

    const json = (await res.json()) as APIResponse;
    if (!res.ok || !json.success) {
      throw new PowerMemAPIError(json.message ?? 'Unknown API error', res.status);
    }

    return toCamelCase(json.data) as T;
  }

  async add(params: AddParams): Promise<AddResult> {
    const data = await this.request<MemoryRecord[]>('POST', '/api/v1/memories', params);
    return {
      memories: data,
      message:
        data.length === 0
          ? 'No memories were created'
          : data.length === 1
            ? 'Memory created successfully'
            : `Created ${data.length} memories successfully`,
    };
  }

  async search(params: SearchParams): Promise<SearchResult> {
    return this.request<SearchResult>('POST', '/api/v1/memories/search', params);
  }

  async get(memoryId: string): Promise<MemoryRecord | null> {
    try {
      return await this.request<MemoryRecord>('GET', `/api/v1/memories/${memoryId}`);
    } catch (err) {
      if (err instanceof PowerMemAPIError && err.statusCode === 404) return null;
      throw err;
    }
  }

  async update(memoryId: string, params: UpdateParams): Promise<MemoryRecord> {
    return this.request<MemoryRecord>('PUT', `/api/v1/memories/${memoryId}`, params);
  }

  async delete(memoryId: string): Promise<boolean> {
    await this.request('DELETE', `/api/v1/memories/${memoryId}`);
    return true;
  }

  async getAll(params: GetAllParams = {}): Promise<MemoryListResult> {
    const query: Record<string, string> = {};
    if (params.userId) query['user_id'] = params.userId;
    if (params.agentId) query['agent_id'] = params.agentId;
    if (params.limit !== undefined) query['limit'] = String(params.limit);
    if (params.offset !== undefined) query['offset'] = String(params.offset);
    return this.request<MemoryListResult>('GET', '/api/v1/memories', undefined, query);
  }

  async addBatch(memories: BatchItem[], options: BatchOptions = {}): Promise<AddResult> {
    const body = { memories, ...options };
    const data = await this.request<{ memories: MemoryRecord[]; createdCount: number }>(
      'POST',
      '/api/v1/memories/batch',
      body
    );
    return {
      memories: data.memories ?? [],
      message: `Created ${data.createdCount ?? data.memories?.length ?? 0} memories`,
    };
  }

  async deleteAll(params: FilterParams = {}): Promise<boolean> {
    const query: Record<string, string> = {};
    if (params.userId) query['user_id'] = params.userId;
    if (params.agentId) query['agent_id'] = params.agentId;
    await this.request('DELETE', '/api/v1/memories', undefined, query);
    return true;
  }

  async count(params: FilterParams = {}): Promise<number> {
    const query: Record<string, string> = {};
    if (params.userId) query['user_id'] = params.userId;
    if (params.agentId) query['agent_id'] = params.agentId;
    return this.request<number>('GET', '/api/v1/memories/count', undefined, query);
  }

  async reset(): Promise<void> {
    await this.deleteAll();
  }

  async close(): Promise<void> {
    // HTTP 无持久连接，无需清理
  }
}
