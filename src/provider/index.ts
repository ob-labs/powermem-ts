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
}
