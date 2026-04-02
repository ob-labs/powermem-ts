import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStore } from '../../../src/storage/sqlite/sqlite.js';

describe('SQLiteStore', () => {
  let store: SQLiteStore;

  beforeEach(() => {
    store = new SQLiteStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      data: 'test content',
      user_id: null,
      agent_id: null,
      run_id: null,
      hash: 'abc123',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      category: null,
      metadata: {},
      ...overrides,
    };
  }

  it('insert and retrieve by ID', async () => {
    await store.insert('1000', [1, 0], makePayload({ data: 'hello' }));
    const rec = await store.getById('1000');
    expect(rec).not.toBeNull();
    expect(rec!.id).toBe('1000');
    expect(rec!.content).toBe('hello');
  });

  it('returns null for non-existent ID', async () => {
    expect(await store.getById('9999')).toBeNull();
  });

  it('access control — userId mismatch returns null', async () => {
    await store.insert('1000', [1, 0], makePayload({ user_id: 'alice' }));
    expect(await store.getById('1000', 'alice')).not.toBeNull();
    expect(await store.getById('1000', 'bob')).toBeNull();
  });

  it('access control — agentId mismatch returns null', async () => {
    await store.insert('1000', [1, 0], makePayload({ agent_id: 'agent1' }));
    expect(await store.getById('1000', undefined, 'agent1')).not.toBeNull();
    expect(await store.getById('1000', undefined, 'agent2')).toBeNull();
  });

  it('update content', async () => {
    await store.insert('1000', [1, 0], makePayload({ data: 'old' }));
    await store.update('1000', [0, 1], makePayload({ data: 'new' }));
    const rec = await store.getById('1000');
    expect(rec!.content).toBe('new');
  });

  it('delete record', async () => {
    await store.insert('1000', [1, 0], makePayload());
    expect(await store.remove('1000')).toBe(true);
    expect(await store.getById('1000')).toBeNull();
  });

  it('delete non-existent returns false', async () => {
    expect(await store.remove('9999')).toBe(false);
  });

  it('list with filters', async () => {
    await store.insert('1', [1, 0], makePayload({ user_id: 'alice', data: 'a1' }));
    await store.insert('2', [0, 1], makePayload({ user_id: 'bob', data: 'b1' }));
    await store.insert('3', [1, 1], makePayload({ user_id: 'alice', data: 'a2' }));

    const { records, total } = await store.list({ userId: 'alice' });
    expect(total).toBe(2);
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.userId === 'alice')).toBe(true);
  });

  it('list with pagination', async () => {
    for (let i = 1; i <= 10; i++) {
      await store.insert(String(i), [i, 0], makePayload({ data: `item${i}` }));
    }

    const page = await store.list({}, 3, 2);
    expect(page.total).toBe(10);
    expect(page.records).toHaveLength(3);
  });

  it('search returns ranked results', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ data: 'x-axis' }));
    await store.insert('2', [0, 1, 0], makePayload({ data: 'y-axis' }));
    await store.insert('3', [0.9, 0.1, 0], makePayload({ data: 'near-x' }));

    const results = await store.search([1, 0, 0], {}, 10);
    expect(results.length).toBe(3);
    expect(results[0].content).toBe('x-axis');
    expect(results[0].score).toBeCloseTo(1.0, 3);
    expect(results[1].content).toBe('near-x');
  });

  it('search respects filters', async () => {
    await store.insert('1', [1, 0], makePayload({ user_id: 'alice', data: 'alice data' }));
    await store.insert('2', [1, 0], makePayload({ user_id: 'bob', data: 'bob data' }));

    const results = await store.search([1, 0], { userId: 'alice' }, 10);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('alice data');
  });

  it('search respects limit', async () => {
    for (let i = 1; i <= 10; i++) {
      await store.insert(String(i), [i, 0], makePayload({ data: `item${i}` }));
    }
    const results = await store.search([1, 0], {}, 3);
    expect(results).toHaveLength(3);
  });

  it('removeAll clears everything', async () => {
    await store.insert('1', [1, 0], makePayload());
    await store.insert('2', [0, 1], makePayload());
    await store.removeAll();
    const { total } = await store.list();
    expect(total).toBe(0);
  });

  it('removeAll with filter only removes matching', async () => {
    await store.insert('1', [1, 0], makePayload({ user_id: 'alice' }));
    await store.insert('2', [0, 1], makePayload({ user_id: 'bob' }));
    await store.removeAll({ userId: 'alice' });
    const { records, total } = await store.list();
    expect(total).toBe(1);
    expect(records[0].userId).toBe('bob');
  });

  // ── New features ──────────────────────────────────────────────────────

  it('count returns correct number', async () => {
    await store.insert('1', [1, 0], makePayload({ user_id: 'alice' }));
    await store.insert('2', [0, 1], makePayload({ user_id: 'bob' }));
    await store.insert('3', [1, 1], makePayload({ user_id: 'alice' }));
    expect(await store.count()).toBe(3);
    expect(await store.count({ userId: 'alice' })).toBe(2);
    expect(await store.count({ userId: 'bob' })).toBe(1);
    expect(await store.count({ userId: 'nobody' })).toBe(0);
  });

  it('list with sortBy created_at asc', async () => {
    await store.insert('1', [1, 0], makePayload({ data: 'old', created_at: '2024-01-01T00:00:00Z' }));
    await store.insert('2', [0, 1], makePayload({ data: 'new', created_at: '2024-06-01T00:00:00Z' }));
    await store.insert('3', [1, 1], makePayload({ data: 'mid', created_at: '2024-03-01T00:00:00Z' }));

    const { records } = await store.list({}, 100, 0, { sortBy: 'created_at', order: 'asc' });
    expect(records[0].content).toBe('old');
    expect(records[1].content).toBe('mid');
    expect(records[2].content).toBe('new');
  });

  it('list with sortBy created_at desc', async () => {
    await store.insert('1', [1, 0], makePayload({ data: 'old', created_at: '2024-01-01T00:00:00Z' }));
    await store.insert('2', [0, 1], makePayload({ data: 'new', created_at: '2024-06-01T00:00:00Z' }));
    const { records } = await store.list({}, 100, 0, { sortBy: 'created_at', order: 'desc' });
    expect(records[0].content).toBe('new');
  });

  it('incrementAccessCount', async () => {
    await store.insert('1', [1, 0], makePayload({ access_count: 0 }));
    expect((await store.getById('1'))!.accessCount).toBe(0);
    await store.incrementAccessCount('1');
    expect((await store.getById('1'))!.accessCount).toBe(1);
    await store.incrementAccessCount('1');
    expect((await store.getById('1'))!.accessCount).toBe(2);
  });

  it('incrementAccessCountBatch', async () => {
    await store.insert('1', [1, 0], makePayload({ access_count: 0 }));
    await store.insert('2', [0, 1], makePayload({ access_count: 5 }));
    await store.incrementAccessCountBatch(['1', '2']);
    expect((await store.getById('1'))!.accessCount).toBe(1);
    expect((await store.getById('2'))!.accessCount).toBe(6);
  });

  it('search returns createdAt, updatedAt, accessCount', async () => {
    await store.insert('1', [1, 0], makePayload({
      data: 'test',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
      access_count: 3,
    }));
    const results = await store.search([1, 0], {}, 10);
    expect(results[0].createdAt).toBe('2024-01-01T00:00:00Z');
    expect(results[0].updatedAt).toBe('2024-06-01T00:00:00Z');
    expect(results[0].accessCount).toBe(3);
  });

  it('toRecord parses scope and category', async () => {
    await store.insert('1', [1, 0], makePayload({ scope: 'personal', category: 'preference' }));
    const rec = await store.getById('1');
    expect(rec!.scope).toBe('personal');
    expect(rec!.category).toBe('preference');
  });
});
