/**
 * PgVectorStore tests — requires running PostgreSQL with pgvector extension.
 *
 * Skip condition: if VECTOR_STORE_CONNECTION_STRING is not set and local postgres is not reachable.
 *
 * Run: POSTGRES_DATABASE=powermem_test npx vitest run tests/unit/storage/pgvector.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgVectorStore } from '../../../src/powermem/storage/pgvector/pgvector.js';

const TEST_TABLE = `pgvector_test_${Date.now()}`;
const DIMS = 8; // small for testing
const CONNECTION = process.env.VECTOR_STORE_CONNECTION_STRING
  ?? `postgresql://${process.env.POSTGRES_USER ?? process.env.USER ?? 'postgres'}@${process.env.POSTGRES_HOST ?? 'localhost'}/${process.env.POSTGRES_DATABASE ?? 'powermem_test'}`;

function vec(...vals: number[]): number[] {
  const v = new Array(DIMS).fill(0);
  for (let i = 0; i < vals.length && i < DIMS; i++) v[i] = vals[i];
  return v;
}

const now = () => new Date().toISOString();

function payload(content: string, extra: Record<string, unknown> = {}) {
  return {
    data: content,
    user_id: extra.user_id ?? null,
    agent_id: extra.agent_id ?? null,
    run_id: extra.run_id ?? null,
    hash: '',
    scope: extra.scope ?? null,
    category: extra.category ?? null,
    access_count: 0,
    metadata: extra.metadata ?? {},
    created_at: now(),
    updated_at: now(),
  };
}

// Check if Postgres is reachable before defining tests
async function pgReachable(): Promise<boolean> {
  try {
    const pg = await import('pg');
    const Pool = pg.default?.Pool ?? pg.Pool;
    const pool = new Pool({ connectionString: CONNECTION });
    await pool.query('SELECT 1');
    await pool.end();
    return true;
  } catch { return false; }
}

const canRun = await pgReachable();

describe.skipIf(!canRun)('PgVectorStore', () => {
  let store: PgVectorStore;

  beforeAll(async () => {
    store = await PgVectorStore.create({
      connectionString: CONNECTION,
      tableName: TEST_TABLE,
      dimensions: DIMS,
    });
  });

  afterAll(async () => {
    try {
      const pg = await import('pg');
      const Pool = pg.default?.Pool ?? pg.Pool;
      const pool = new Pool({ connectionString: CONNECTION });
      await pool.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
      await pool.end();
    } catch { /* ok */ }
    await store?.close();
  });

  beforeEach(async () => {
    await store.removeAll();
  });

  it('insert and getById', async () => {
    await store.insert('id1', vec(1, 0), payload('hello world', { user_id: 'u1' }));
    const rec = await store.getById('id1');
    expect(rec).not.toBeNull();
    expect(rec!.id).toBe('id1');
    expect(rec!.content).toBe('hello world');
    expect(rec!.userId).toBe('u1');
  });

  it('getById returns null for missing', async () => {
    const rec = await store.getById('nonexistent');
    expect(rec).toBeNull();
  });

  it('getById filters by userId', async () => {
    await store.insert('id1', vec(1), payload('test', { user_id: 'u1' }));
    expect(await store.getById('id1', 'u1')).not.toBeNull();
    expect(await store.getById('id1', 'u2')).toBeNull();
  });

  it('update replaces content and vector', async () => {
    await store.insert('id1', vec(1, 0), payload('original'));
    await store.update('id1', vec(0, 1), payload('updated'));
    const rec = await store.getById('id1');
    expect(rec!.content).toBe('updated');
  });

  it('remove deletes record', async () => {
    await store.insert('id1', vec(1), payload('test'));
    expect(await store.remove('id1')).toBe(true);
    expect(await store.getById('id1')).toBeNull();
  });

  it('remove returns false for missing', async () => {
    expect(await store.remove('nonexistent')).toBe(false);
  });

  it('count with and without filters', async () => {
    await store.insert('a', vec(1), payload('a', { user_id: 'u1' }));
    await store.insert('b', vec(0, 1), payload('b', { user_id: 'u1' }));
    await store.insert('c', vec(0, 0, 1), payload('c', { user_id: 'u2' }));

    expect(await store.count()).toBe(3);
    expect(await store.count({ userId: 'u1' })).toBe(2);
    expect(await store.count({ userId: 'u2' })).toBe(1);
    expect(await store.count({ userId: 'u99' })).toBe(0);
  });

  it('list with pagination', async () => {
    await store.insert('a', vec(1), payload('a'));
    await store.insert('b', vec(0, 1), payload('b'));
    await store.insert('c', vec(0, 0, 1), payload('c'));

    const page1 = await store.list({}, 2, 0);
    expect(page1.total).toBe(3);
    expect(page1.records).toHaveLength(2);

    const page2 = await store.list({}, 2, 2);
    expect(page2.records).toHaveLength(1);
  });

  it('list with userId filter', async () => {
    await store.insert('a', vec(1), payload('a', { user_id: 'u1' }));
    await store.insert('b', vec(0, 1), payload('b', { user_id: 'u2' }));

    const result = await store.list({ userId: 'u1' });
    expect(result.total).toBe(1);
    expect(result.records[0].userId).toBe('u1');
  });

  it('list with sorting', async () => {
    await store.insert('a', vec(1), { ...payload('a'), created_at: '2020-01-01T00:00:00Z' });
    await store.insert('b', vec(0, 1), { ...payload('b'), created_at: '2025-01-01T00:00:00Z' });

    const asc = await store.list({}, 10, 0, { sortBy: 'created_at', order: 'asc' });
    expect(asc.records[0].id).toBe('a');

    const desc = await store.list({}, 10, 0, { sortBy: 'created_at', order: 'desc' });
    expect(desc.records[0].id).toBe('b');
  });

  it('search returns scored results sorted by similarity', async () => {
    await store.insert('a', vec(1, 0, 0, 0, 0, 0, 0, 0), payload('close'));
    await store.insert('b', vec(0, 1, 0, 0, 0, 0, 0, 0), payload('far'));
    await store.insert('c', vec(0.9, 0.1, 0, 0, 0, 0, 0, 0), payload('closer'));

    const results = await store.search(vec(1, 0, 0, 0, 0, 0, 0, 0), {}, 10);
    expect(results.length).toBe(3);
    // First result should be the exact match or closest
    expect(results[0].id).toBe('a');
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[0].score).toBeCloseTo(1.0, 1);
  });

  it('search respects limit', async () => {
    await store.insert('a', vec(1), payload('a'));
    await store.insert('b', vec(0, 1), payload('b'));
    await store.insert('c', vec(0, 0, 1), payload('c'));

    const results = await store.search(vec(1), {}, 2);
    expect(results).toHaveLength(2);
  });

  it('search filters by userId', async () => {
    await store.insert('a', vec(1, 0), payload('a', { user_id: 'u1' }));
    await store.insert('b', vec(0.9, 0.1), payload('b', { user_id: 'u2' }));

    const results = await store.search(vec(1, 0), { userId: 'u1' }, 10);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
  });

  it('search filters by agentId and runId', async () => {
    await store.insert('a', vec(1), payload('a', { agent_id: 'agent1', run_id: 'run1' }));
    await store.insert('b', vec(0.9, 0.1), payload('b', { agent_id: 'agent1', run_id: 'run2' }));
    await store.insert('c', vec(0.8, 0.2), payload('c', { agent_id: 'agent2' }));

    expect((await store.search(vec(1), { agentId: 'agent1' }, 10)).length).toBe(2);
    expect((await store.search(vec(1), { agentId: 'agent1', runId: 'run1' }, 10)).length).toBe(1);
  });

  it('incrementAccessCount', async () => {
    await store.insert('a', vec(1), payload('a'));
    await store.incrementAccessCount('a');
    await store.incrementAccessCount('a');
    const rec = await store.getById('a');
    expect(rec!.accessCount).toBe(2);
  });

  it('incrementAccessCountBatch', async () => {
    await store.insert('a', vec(1), payload('a'));
    await store.insert('b', vec(0, 1), payload('b'));
    await store.incrementAccessCountBatch(['a', 'b']);
    expect((await store.getById('a'))!.accessCount).toBe(1);
    expect((await store.getById('b'))!.accessCount).toBe(1);
  });

  it('removeAll with no filter clears everything', async () => {
    await store.insert('a', vec(1), payload('a'));
    await store.insert('b', vec(0, 1), payload('b'));
    await store.removeAll();
    expect(await store.count()).toBe(0);
  });

  it('removeAll with userId filter', async () => {
    await store.insert('a', vec(1), payload('a', { user_id: 'u1' }));
    await store.insert('b', vec(0, 1), payload('b', { user_id: 'u2' }));
    await store.removeAll({ userId: 'u1' });
    expect(await store.count()).toBe(1);
    expect((await store.getById('b'))!.userId).toBe('u2');
  });

  it('upsert on duplicate id', async () => {
    await store.insert('a', vec(1), payload('original'));
    await store.insert('a', vec(0, 1), payload('replaced'));
    const rec = await store.getById('a');
    expect(rec!.content).toBe('replaced');
    expect(await store.count()).toBe(1);
  });

  it('metadata round-trip', async () => {
    const meta = { tags: ['test', 'pgvector'], nested: { deep: true } };
    await store.insert('m1', vec(1), payload('with meta', { metadata: meta }));
    const rec = await store.getById('m1');
    expect(rec!.metadata).toMatchObject(meta);
  });

  it('VectorStoreFactory creates pgvector', async () => {
    const { VectorStoreFactory } = await import('../../../src/powermem/storage/factory.js');
    const s = await VectorStoreFactory.create('pgvector', {
      connectionString: CONNECTION,
      tableName: `factory_test_${Date.now()}`,
      dimensions: DIMS,
    });
    expect(s).toBeInstanceOf(PgVectorStore);
    // Cleanup
    const pg = await import('pg');
    const Pool = pg.default?.Pool ?? pg.Pool;
    const pool = new Pool({ connectionString: CONNECTION });
    await pool.query(`DROP TABLE IF EXISTS factory_test_${(s as any).tableName?.split('_').pop()}`);
    await pool.end();
    await s.close();
  });
});
