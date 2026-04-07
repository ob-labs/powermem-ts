/**
 * Storage adapter — bridges VectorStore with the Memory core layer.
 * Port of Python powermem/storage/adapter.py.
 *
 * Wraps a VectorStore and provides higher-level operations:
 * - Filtered memory operations (userId/agentId/runId)
 * - Statistics aggregation
 * - Unique user listing
 */
import type {
  VectorStore,
  VectorStoreRecord,
  VectorStoreFilter,
  VectorStoreSearchMatch,
  VectorStoreListOptions,
} from './base.js';

export class StorageAdapter {
  constructor(private readonly store: VectorStore) {}

  async addMemory(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.store.insert(id, vector, payload);
  }

  async searchMemories(
    queryVector: number[],
    filters: VectorStoreFilter = {},
    limit = 30
  ): Promise<VectorStoreSearchMatch[]> {
    return this.store.search(queryVector, filters, limit);
  }

  async getMemory(id: string, userId?: string, agentId?: string): Promise<VectorStoreRecord | null> {
    return this.store.getById(id, userId, agentId);
  }

  async updateMemory(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.store.update(id, vector, payload);
  }

  async deleteMemory(id: string): Promise<boolean> {
    return this.store.remove(id);
  }

  async listMemories(
    filters: VectorStoreFilter = {},
    limit = 100,
    offset = 0,
    options: VectorStoreListOptions = {}
  ): Promise<{ records: VectorStoreRecord[]; total: number }> {
    return this.store.list(filters, limit, offset, options);
  }

  async countMemories(filters: VectorStoreFilter = {}): Promise<number> {
    return this.store.count(filters);
  }

  async deleteAllMemories(filters: VectorStoreFilter = {}): Promise<void> {
    await this.store.removeAll(filters);
  }

  async incrementAccessCount(id: string): Promise<void> {
    await this.store.incrementAccessCount(id);
  }

  async incrementAccessCountBatch(ids: string[]): Promise<void> {
    await this.store.incrementAccessCountBatch(ids);
  }

  async getStatistics(filters: VectorStoreFilter = {}): Promise<Record<string, unknown>> {
    const total = await this.store.count(filters);
    const { records } = await this.store.list(filters, 1, 0, { sortBy: 'created_at', order: 'asc' });
    const oldest = records[0]?.createdAt;
    const { records: newest } = await this.store.list(filters, 1, 0, { sortBy: 'created_at', order: 'desc' });
    const newestAt = newest[0]?.createdAt;

    return {
      totalMemories: total,
      oldestMemory: oldest,
      newestMemory: newestAt,
    };
  }

  async getUniqueUsers(limit = 1000): Promise<string[]> {
    const { records } = await this.store.list({}, limit);
    const users = new Set<string>();
    for (const r of records) {
      if (r.userId) users.add(r.userId);
    }
    return Array.from(users);
  }

  async reset(): Promise<void> {
    await this.store.removeAll();
  }

  async close(): Promise<void> {
    await this.store.close();
  }

  /** Direct access to the underlying VectorStore. */
  get raw(): VectorStore {
    return this.store;
  }
}
