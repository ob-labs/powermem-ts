/**
 * VectorStoreFactory tests — port of Python storage factory tests.
 */
import { describe, it, expect } from 'vitest';
import { VectorStoreFactory } from '../../../src/powermem/storage/factory.js';

describe('VectorStoreFactory', () => {
  it('lists built-in providers', () => {
    const providers = VectorStoreFactory.getSupportedProviders();
    expect(providers).toContain('sqlite');
    expect(providers).toContain('seekdb');
    expect(providers).toContain('oceanbase');
  });

  it('hasProvider returns true for registered providers', () => {
    expect(VectorStoreFactory.hasProvider('sqlite')).toBe(true);
    expect(VectorStoreFactory.hasProvider('SQLite')).toBe(true);
    expect(VectorStoreFactory.hasProvider('seekdb')).toBe(true);
    expect(VectorStoreFactory.hasProvider('oceanbase')).toBe(true);
  });

  it('hasProvider returns false for unknown', () => {
    expect(VectorStoreFactory.hasProvider('nonexistent')).toBe(false);
  });

  it('creates SQLiteStore via factory', async () => {
    const store = await VectorStoreFactory.create('sqlite', { path: ':memory:' });
    expect(store).toBeDefined();
    // Verify it works
    await store.insert('1', [1, 0], {
      data: 'test', user_id: null, agent_id: null, run_id: null,
      hash: 'h', created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), category: null,
      scope: null, access_count: 0, metadata: {},
    });
    expect(await store.count()).toBe(1);
    await store.close();
  });

  it('throws for unsupported provider', async () => {
    await expect(VectorStoreFactory.create('nonexistent'))
      .rejects.toThrow('Unsupported VectorStore provider');
  });

  it('register adds a custom provider', async () => {
    VectorStoreFactory.register('custom', async () => {
      // Return a minimal mock store
      return {
        insert: async () => {},
        getById: async () => null,
        update: async () => {},
        remove: async () => false,
        list: async () => ({ records: [], total: 0 }),
        search: async () => [],
        count: async () => 0,
        incrementAccessCount: async () => {},
        incrementAccessCountBatch: async () => {},
        removeAll: async () => {},
        close: async () => {},
      };
    });

    expect(VectorStoreFactory.hasProvider('custom')).toBe(true);
    const store = await VectorStoreFactory.create('custom');
    expect(store).toBeDefined();
    expect(await store.count()).toBe(0);
  });
});
