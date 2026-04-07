/**
 * Memory optimizer tests — port of Python unit/intelligence/test_memory_optimizer.py
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryOptimizer } from '../../../src/powermem/intelligence/memory-optimizer.js';
import { SQLiteStore } from '../../../src/powermem/storage/sqlite/sqlite.js';

describe('MemoryOptimizer', () => {
  let store: SQLiteStore;
  let optimizer: MemoryOptimizer;

  function makePayload(data: string, hash?: string, userId?: string): Record<string, unknown> {
    return {
      data, user_id: userId ?? null, agent_id: null, run_id: null,
      hash: hash ?? require('crypto').createHash('md5').update(data, 'utf-8').digest('hex'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      scope: null, category: null, access_count: 0, metadata: {},
    };
  }

  beforeEach(() => {
    store = new SQLiteStore(':memory:');
    optimizer = new MemoryOptimizer(store);
  });

  afterEach(async () => {
    await store.close();
  });

  describe('exact deduplication', () => {
    it('removes exact duplicates by hash', async () => {
      const payload = makePayload('duplicate content');
      await store.insert('1', [1, 0], payload);
      await store.insert('2', [1, 0], { ...payload, created_at: new Date(Date.now() + 1000).toISOString() });
      await store.insert('3', [1, 0], { ...payload, created_at: new Date(Date.now() + 2000).toISOString() });

      const result = await optimizer.deduplicate('exact');
      expect(result.totalChecked).toBe(3);
      expect(result.duplicatesFound).toBe(2);
      expect(result.deletedCount).toBe(2);

      // Only oldest should remain
      expect(await store.count()).toBe(1);
      expect(await store.getById('1')).not.toBeNull();
    });

    it('preserves unique memories', async () => {
      await store.insert('1', [1, 0], makePayload('unique A'));
      await store.insert('2', [0, 1], makePayload('unique B'));
      await store.insert('3', [1, 1], makePayload('unique C'));

      const result = await optimizer.deduplicate('exact');
      expect(result.duplicatesFound).toBe(0);
      expect(result.deletedCount).toBe(0);
      expect(await store.count()).toBe(3);
    });

    it('filters by userId', async () => {
      await store.insert('1', [1, 0], makePayload('dup', 'hash1', 'alice'));
      await store.insert('2', [1, 0], makePayload('dup', 'hash1', 'alice'));
      await store.insert('3', [0, 1], makePayload('dup', 'hash1', 'bob'));

      const result = await optimizer.deduplicate('exact', 'alice');
      expect(result.deletedCount).toBe(1);
      // Bob's memory untouched
      expect(await store.getById('3')).not.toBeNull();
    });
  });

  describe('semantic deduplication', () => {
    it('removes semantically similar memories', async () => {
      // Very similar vectors (cosine > 0.95)
      await store.insert('1', [1, 0, 0], makePayload('fact A'));
      await store.insert('2', [0.99, 0.01, 0], makePayload('fact A similar'));
      await store.insert('3', [0, 1, 0], makePayload('different fact'));

      const result = await optimizer.deduplicate('semantic', undefined, 0.95);
      expect(result.duplicatesFound).toBeGreaterThanOrEqual(1);
      // Different fact should survive
      expect(await store.getById('3')).not.toBeNull();
    });

    it('no-op when all memories are unique', async () => {
      await store.insert('1', [1, 0, 0], makePayload('x'));
      await store.insert('2', [0, 1, 0], makePayload('y'));
      await store.insert('3', [0, 0, 1], makePayload('z'));

      const result = await optimizer.deduplicate('semantic', undefined, 0.95);
      expect(result.duplicatesFound).toBe(0);
      expect(await store.count()).toBe(3);
    });
  });

  describe('cosine similarity calculation', () => {
    it('identical vectors return ~1.0', async () => {
      // Tested via semantic dedup — insert identical vectors
      await store.insert('1', [1, 0], makePayload('a'));
      await store.insert('2', [1, 0], makePayload('b'));

      const result = await optimizer.deduplicate('semantic', undefined, 0.99);
      expect(result.duplicatesFound).toBe(1);
    });
  });
});
