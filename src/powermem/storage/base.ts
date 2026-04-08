/**
 * VectorStore interface — abstract async storage layer.
 *
 * SQLiteStore and SeekDBStore are the current implementations.
 * Future backends (PgVector, etc.) implement this same interface.
 */

export interface VectorStoreRecord {
  id: string;
  content: string;
  userId?: string;
  agentId?: string;
  runId?: string;
  hash?: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
  scope?: string;
  category?: string;
  accessCount?: number;
}

export interface VectorStoreFilter {
  userId?: string;
  agentId?: string;
  runId?: string;
  scope?: string;
  category?: string;
  [key: string]: unknown;
}

export interface VectorStoreSearchMatch {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  accessCount?: number;
}

export interface VectorStoreListOptions {
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface VectorStore {
  insert(id: string, vector: number[], payload: Record<string, unknown>): Promise<void>;
  getById(id: string, userId?: string, agentId?: string): Promise<VectorStoreRecord | null>;
  update(id: string, vector: number[], payload: Record<string, unknown>): Promise<void>;
  remove(id: string): Promise<boolean>;
  list(
    filters?: VectorStoreFilter,
    limit?: number,
    offset?: number,
    options?: VectorStoreListOptions
  ): Promise<{ records: VectorStoreRecord[]; total: number }>;
  search(
    queryVector: number[],
    filters?: VectorStoreFilter,
    limit?: number
  ): Promise<VectorStoreSearchMatch[]>;
  count(filters?: VectorStoreFilter): Promise<number>;
  incrementAccessCount(id: string): Promise<void>;
  incrementAccessCountBatch(ids: string[]): Promise<void>;
  removeAll(filters?: VectorStoreFilter): Promise<void>;
  close(): Promise<void>;
}

/**
 * GraphStoreBase — abstract interface for graph storage.
 * Port of Python powermem/storage/base.py GraphStoreBase.
 */
export interface GraphStoreBase {
  add(data: string, filters: Record<string, unknown>): Promise<Record<string, unknown>>;
  search(query: string, filters: Record<string, unknown>, limit?: number): Promise<Array<Record<string, unknown>>>;
  deleteAll(filters: Record<string, unknown>): Promise<void>;
  getAll(filters: Record<string, unknown>, limit?: number): Promise<Array<Record<string, unknown>>>;
  reset(): Promise<void>;
  getStatistics(filters?: Record<string, unknown>): Promise<Record<string, unknown>>;
  getUniqueUsers(): Promise<string[]>;
}
