import type {
  AddParams,
  MemoryContent,
  SearchParams,
  UpdateParams,
  GetAllParams,
  FilterParams,
  BatchItem,
  BatchOptions,
  MemoryRecord,
} from '../types/memory.js';
import type { AddResult, SearchResult, MemoryListResult } from '../types/responses.js';

export abstract class MemoryBase {
  static async init(_options: Record<string, unknown> = {}): Promise<void> {}

  abstract add(content: MemoryContent, options?: Omit<AddParams, 'content'>): Promise<AddResult>;
  abstract search(query: string, options?: Omit<SearchParams, 'query'>): Promise<SearchResult>;
  abstract get(memoryId: string): Promise<MemoryRecord | null>;
  abstract update(memoryId: string, content: string, options?: Omit<UpdateParams, 'content'>): Promise<MemoryRecord>;
  abstract delete(memoryId: string): Promise<boolean>;
  abstract getAll(options?: GetAllParams): Promise<MemoryListResult>;
  abstract count(options?: FilterParams): Promise<number>;
  abstract addBatch(memories: BatchItem[], options?: BatchOptions): Promise<AddResult>;
  abstract deleteAll(options?: FilterParams): Promise<boolean>;
  abstract reset(): Promise<void>;
  abstract close(): Promise<void>;
  abstract getStatistics(options?: FilterParams): Promise<Record<string, unknown>>;
  abstract getUsers(limit?: number): Promise<string[]>;
  abstract optimize(strategy?: string, userId?: string, threshold?: number): Promise<Record<string, unknown>>;
  abstract exportMemories(options?: GetAllParams): Promise<MemoryRecord[]>;
  abstract importMemories(
    memories: Array<{ content: string; metadata?: Record<string, unknown>; userId?: string; agentId?: string }>,
    options?: { infer?: boolean },
  ): Promise<{ imported: number; errors: number }>;
}
