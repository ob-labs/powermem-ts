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
