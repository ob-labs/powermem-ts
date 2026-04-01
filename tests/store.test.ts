import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStore } from '../src/provider/native/store.js';

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

  it('insert and retrieve by ID', () => {
    store.insert('1000', [1, 0], makePayload({ data: 'hello' }));
    const rec = store.getById('1000');
    expect(rec).not.toBeNull();
    expect(rec!.id).toBe('1000');
    expect(rec!.content).toBe('hello');
  });

  it('returns null for non-existent ID', () => {
    expect(store.getById('9999')).toBeNull();
  });

  it('access control — userId mismatch returns null', () => {
    store.insert('1000', [1, 0], makePayload({ user_id: 'alice' }));
    expect(store.getById('1000', 'alice')).not.toBeNull();
    expect(store.getById('1000', 'bob')).toBeNull();
  });

  it('access control — agentId mismatch returns null', () => {
    store.insert('1000', [1, 0], makePayload({ agent_id: 'agent1' }));
    expect(store.getById('1000', undefined, 'agent1')).not.toBeNull();
    expect(store.getById('1000', undefined, 'agent2')).toBeNull();
  });

  it('update content', () => {
    store.insert('1000', [1, 0], makePayload({ data: 'old' }));
    store.update('1000', [0, 1], makePayload({ data: 'new' }));
    const rec = store.getById('1000');
    expect(rec!.content).toBe('new');
  });

  it('delete record', () => {
    store.insert('1000', [1, 0], makePayload());
    expect(store.remove('1000')).toBe(true);
    expect(store.getById('1000')).toBeNull();
  });

  it('delete non-existent returns false', () => {
    expect(store.remove('9999')).toBe(false);
  });

  it('list with filters', () => {
    store.insert('1', [1, 0], makePayload({ user_id: 'alice', data: 'a1' }));
    store.insert('2', [0, 1], makePayload({ user_id: 'bob', data: 'b1' }));
    store.insert('3', [1, 1], makePayload({ user_id: 'alice', data: 'a2' }));

    const { records, total } = store.list({ userId: 'alice' });
    expect(total).toBe(2);
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.userId === 'alice')).toBe(true);
  });

  it('list with pagination', () => {
    for (let i = 1; i <= 10; i++) {
      store.insert(String(i), [i, 0], makePayload({ data: `item${i}` }));
    }

    const page = store.list({}, 3, 2);
    expect(page.total).toBe(10);
    expect(page.records).toHaveLength(3);
  });

  it('search returns ranked results', () => {
    store.insert('1', [1, 0, 0], makePayload({ data: 'x-axis' }));
    store.insert('2', [0, 1, 0], makePayload({ data: 'y-axis' }));
    store.insert('3', [0.9, 0.1, 0], makePayload({ data: 'near-x' }));

    const results = store.search([1, 0, 0], {}, 10);
    expect(results.length).toBe(3);
    expect(results[0].content).toBe('x-axis');
    expect(results[0].score).toBeCloseTo(1.0, 3);
    expect(results[1].content).toBe('near-x');
  });

  it('search respects filters', () => {
    store.insert('1', [1, 0], makePayload({ user_id: 'alice', data: 'alice data' }));
    store.insert('2', [1, 0], makePayload({ user_id: 'bob', data: 'bob data' }));

    const results = store.search([1, 0], { userId: 'alice' }, 10);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('alice data');
  });

  it('search respects limit', () => {
    for (let i = 1; i <= 10; i++) {
      store.insert(String(i), [i, 0], makePayload({ data: `item${i}` }));
    }
    const results = store.search([1, 0], {}, 3);
    expect(results).toHaveLength(3);
  });

  it('removeAll clears everything', () => {
    store.insert('1', [1, 0], makePayload());
    store.insert('2', [0, 1], makePayload());
    store.removeAll();
    const { total } = store.list();
    expect(total).toBe(0);
  });

  it('removeAll with filter only removes matching', () => {
    store.insert('1', [1, 0], makePayload({ user_id: 'alice' }));
    store.insert('2', [0, 1], makePayload({ user_id: 'bob' }));
    store.removeAll({ userId: 'alice' });
    const { records, total } = store.list();
    expect(total).toBe(1);
    expect(records[0].userId).toBe('bob');
  });

  // ── New features ──────────────────────────────────────────────────────

  it('count returns correct number', () => {
    store.insert('1', [1, 0], makePayload({ user_id: 'alice' }));
    store.insert('2', [0, 1], makePayload({ user_id: 'bob' }));
    store.insert('3', [1, 1], makePayload({ user_id: 'alice' }));
    expect(store.count()).toBe(3);
    expect(store.count({ userId: 'alice' })).toBe(2);
    expect(store.count({ userId: 'bob' })).toBe(1);
    expect(store.count({ userId: 'nobody' })).toBe(0);
  });

  it('list with sortBy created_at asc', () => {
    store.insert('1', [1, 0], makePayload({ data: 'old', created_at: '2024-01-01T00:00:00Z' }));
    store.insert('2', [0, 1], makePayload({ data: 'new', created_at: '2024-06-01T00:00:00Z' }));
    store.insert('3', [1, 1], makePayload({ data: 'mid', created_at: '2024-03-01T00:00:00Z' }));

    const { records } = store.list({}, 100, 0, { sortBy: 'created_at', order: 'asc' });
    expect(records[0].content).toBe('old');
    expect(records[1].content).toBe('mid');
    expect(records[2].content).toBe('new');
  });

  it('list with sortBy created_at desc', () => {
    store.insert('1', [1, 0], makePayload({ data: 'old', created_at: '2024-01-01T00:00:00Z' }));
    store.insert('2', [0, 1], makePayload({ data: 'new', created_at: '2024-06-01T00:00:00Z' }));
    const { records } = store.list({}, 100, 0, { sortBy: 'created_at', order: 'desc' });
    expect(records[0].content).toBe('new');
  });

  it('incrementAccessCount', () => {
    store.insert('1', [1, 0], makePayload({ access_count: 0 }));
    expect(store.getById('1')!.accessCount).toBe(0);
    store.incrementAccessCount('1');
    expect(store.getById('1')!.accessCount).toBe(1);
    store.incrementAccessCount('1');
    expect(store.getById('1')!.accessCount).toBe(2);
  });

  it('incrementAccessCountBatch', () => {
    store.insert('1', [1, 0], makePayload({ access_count: 0 }));
    store.insert('2', [0, 1], makePayload({ access_count: 5 }));
    store.incrementAccessCountBatch(['1', '2']);
    expect(store.getById('1')!.accessCount).toBe(1);
    expect(store.getById('2')!.accessCount).toBe(6);
  });

  it('search returns createdAt, updatedAt, accessCount', () => {
    store.insert('1', [1, 0], makePayload({
      data: 'test',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
      access_count: 3,
    }));
    const results = store.search([1, 0], {}, 10);
    expect(results[0].createdAt).toBe('2024-01-01T00:00:00Z');
    expect(results[0].updatedAt).toBe('2024-06-01T00:00:00Z');
    expect(results[0].accessCount).toBe(3);
  });

  it('toRecord parses scope and category', () => {
    store.insert('1', [1, 0], makePayload({ scope: 'personal', category: 'preference' }));
    const rec = store.getById('1');
    expect(rec!.scope).toBe('personal');
    expect(rec!.category).toBe('preference');
  });
});
