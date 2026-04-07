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

export interface MemoryProvider {
  add(params: AddParams): Promise<AddResult>;
  search(params: SearchParams): Promise<SearchResult>;
  get(memoryId: string): Promise<MemoryRecord | null>;
  update(memoryId: string, params: UpdateParams): Promise<MemoryRecord>;
  delete(memoryId: string): Promise<boolean>;
  getAll(params?: GetAllParams): Promise<MemoryListResult>;
  addBatch(memories: BatchItem[], options?: BatchOptions): Promise<AddResult>;
  count(params?: FilterParams): Promise<number>;
  deleteAll(params?: FilterParams): Promise<boolean>;
  reset(): Promise<void>;
  close(): Promise<void>;

  // Extended API (optional — not all providers support these)
  getStatistics?(params?: FilterParams): Promise<Record<string, unknown>>;
  getUsers?(limit?: number): Promise<string[]>;
  optimize?(strategy?: string, userId?: string, threshold?: number): Promise<Record<string, unknown>>;
  exportMemories?(params?: GetAllParams): Promise<MemoryRecord[]>;
  importMemories?(memories: Array<{ content: string; metadata?: Record<string, unknown>; userId?: string; agentId?: string }>, options?: { infer?: boolean }): Promise<{ imported: number; errors: number }>;
}
