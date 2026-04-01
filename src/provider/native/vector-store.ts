/**
 * VectorStore interface — abstract storage layer.
 *
 * SQLiteStore is the current implementation.
 * Future backends (OceanBase, PgVector) implement this same interface.
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
  insert(id: string, vector: number[], payload: Record<string, unknown>): void;
  getById(id: string, userId?: string, agentId?: string): VectorStoreRecord | null;
  update(id: string, vector: number[], payload: Record<string, unknown>): void;
  remove(id: string): boolean;
  list(
    filters?: VectorStoreFilter,
    limit?: number,
    offset?: number,
    options?: VectorStoreListOptions
  ): { records: VectorStoreRecord[]; total: number };
  search(
    queryVector: number[],
    filters?: VectorStoreFilter,
    limit?: number
  ): VectorStoreSearchMatch[];
  count(filters?: VectorStoreFilter): number;
  incrementAccessCount(id: string): void;
  incrementAccessCountBatch(ids: string[]): void;
  removeAll(filters?: VectorStoreFilter): void;
  close(): void;
}
