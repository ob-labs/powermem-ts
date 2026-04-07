/**
 * StorageAdapter tests — verifies the adapter layer over VectorStore.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageAdapter } from '../../../src/powermem/storage/adapter.js';
import { SQLiteStore } from '../../../src/powermem/storage/sqlite/sqlite.js';

describe('StorageAdapter', () => {
  let adapter: StorageAdapter;

  beforeEach(() => {
    const store = new SQLiteStore(':memory:');
    adapter = new StorageAdapter(store);
  });

  afterEach(async () => {
    await adapter.close();
  });

  function makePayload(data: string, userId?: string): Record<string, unknown> {
    return {
      data, user_id: userId ?? null, agent_id: null, run_id: null,
      hash: 'h', created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), scope: null,
      category: null, access_count: 0, metadata: {},
    };
  }

  it('addMemory + getMemory', async () => {
    await adapter.addMemory('1', [1, 0], makePayload('hello'));
    const mem = await adapter.getMemory('1');
    expect(mem).not.toBeNull();
    expect(mem!.content).toBe('hello');
  });

  it('searchMemories returns ranked results', async () => {
    await adapter.addMemory('1', [1, 0, 0], makePayload('x-axis'));
    await adapter.addMemory('2', [0, 1, 0], makePayload('y-axis'));
    const results = await adapter.searchMemories([1, 0, 0], {}, 10);
    expect(results[0].content).toBe('x-axis');
  });

  it('updateMemory + getMemory', async () => {
    await adapter.addMemory('1', [1, 0], makePayload('old'));
    await adapter.updateMemory('1', [0, 1], makePayload('new'));
    const mem = await adapter.getMemory('1');
    expect(mem!.content).toBe('new');
  });

  it('deleteMemory', async () => {
    await adapter.addMemory('1', [1, 0], makePayload('del'));
    expect(await adapter.deleteMemory('1')).toBe(true);
    expect(await adapter.getMemory('1')).toBeNull();
  });

  it('listMemories with pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await adapter.addMemory(String(i), [i, 0], makePayload(`item${i}`));
    }
    const { records, total } = await adapter.listMemories({}, 2, 0);
    expect(total).toBe(5);
    expect(records).toHaveLength(2);
  });

  it('countMemories', async () => {
    await adapter.addMemory('1', [1, 0], makePayload('a', 'alice'));
    await adapter.addMemory('2', [0, 1], makePayload('b', 'bob'));
    expect(await adapter.countMemories()).toBe(2);
    expect(await adapter.countMemories({ userId: 'alice' })).toBe(1);
  });

  it('deleteAllMemories with filter', async () => {
    await adapter.addMemory('1', [1, 0], makePayload('a', 'alice'));
    await adapter.addMemory('2', [0, 1], makePayload('b', 'bob'));
    await adapter.deleteAllMemories({ userId: 'alice' });
    expect(await adapter.countMemories()).toBe(1);
  });

  it('getStatistics', async () => {
    await adapter.addMemory('1', [1, 0], makePayload('a'));
    await adapter.addMemory('2', [0, 1], makePayload('b'));
    const stats = await adapter.getStatistics();
    expect(stats.totalMemories).toBe(2);
  });

  it('getUniqueUsers', async () => {
    await adapter.addMemory('1', [1, 0], makePayload('a', 'alice'));
    await adapter.addMemory('2', [0, 1], makePayload('b', 'bob'));
    await adapter.addMemory('3', [1, 1], makePayload('c', 'alice'));
    const users = await adapter.getUniqueUsers();
    expect(users.sort()).toEqual(['alice', 'bob']);
  });

  it('reset clears all', async () => {
    await adapter.addMemory('1', [1, 0], makePayload('a'));
    await adapter.reset();
    expect(await adapter.countMemories()).toBe(0);
  });

  it('raw returns underlying store', () => {
    expect(adapter.raw).toBeInstanceOf(SQLiteStore);
  });
});
