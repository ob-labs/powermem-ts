/**
 * SeekDBStore unit tests — mirrors store.test.ts structure.
 * Requires `seekdb` + `@seekdb/js-bindings` to be installed. Skipped otherwise.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SeekDBStore } from '../../../src/powermem/storage/seekdb/seekdb.js';

/** Try to create a SeekDBStore — returns null if seekdb native bindings unavailable */
async function tryCreateStore(tmpDir: string, collectionName: string) {
  try {
    return await SeekDBStore.create({
      path: tmpDir,
      database: 'test',
      collectionName,
      distance: 'cosine',
      dimension: 3,
    });
  } catch {
    return null;
  }
}

let seekdbAvailable = false;
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-check-'));
  try {
    const s = await tryCreateStore(dir, 'check');
    seekdbAvailable = s != null;
    // Don't call close() — SeekDB embedded may SIGABRT on cleanup
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

const describeIf = seekdbAvailable ? describe : describe.skip;

describeIf('SeekDBStore', () => {
  let store: SeekDBStore;
  let tmpDir: string;

  function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      data: 'test content',
      user_id: null,
      agent_id: null,
      run_id: null,
      hash: 'abc123',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      scope: null,
      category: null,
      access_count: 0,
      metadata: {},
      ...overrides,
    };
  }

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-test-'));
    store = (await tryCreateStore(tmpDir, `mem_${Date.now()}`))!;
  });

  afterEach(async () => {
    if (store) await store.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('insert and retrieve by ID', async () => {
    await store.insert('1000', [1, 0, 0], makePayload({ data: 'hello' }));
    const rec = await store.getById('1000');
    expect(rec).not.toBeNull();
    expect(rec!.id).toBe('1000');
    expect(rec!.content).toBe('hello');
  });

  it('returns null for non-existent ID', async () => {
    expect(await store.getById('9999')).toBeNull();
  });

  it('access control — userId mismatch returns null', async () => {
    await store.insert('1000', [1, 0, 0], makePayload({ user_id: 'alice' }));
    expect(await store.getById('1000', 'alice')).not.toBeNull();
    expect(await store.getById('1000', 'bob')).toBeNull();
  });

  it('update content', async () => {
    await store.insert('1000', [1, 0, 0], makePayload({ data: 'old' }));
    await store.update('1000', [0, 1, 0], makePayload({ data: 'new' }));
    const rec = await store.getById('1000');
    expect(rec!.content).toBe('new');
  });

  it('delete record', async () => {
    await store.insert('1000', [1, 0, 0], makePayload());
    expect(await store.remove('1000')).toBe(true);
    expect(await store.getById('1000')).toBeNull();
  });

  it('delete non-existent returns false', async () => {
    expect(await store.remove('9999')).toBe(false);
  });

  it('list returns all records', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ data: 'a' }));
    await store.insert('2', [0, 1, 0], makePayload({ data: 'b' }));
    const { records, total } = await store.list();
    expect(total).toBe(2);
    expect(records).toHaveLength(2);
  });

  it('list with filters', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ user_id: 'alice', data: 'a1' }));
    await store.insert('2', [0, 1, 0], makePayload({ user_id: 'bob', data: 'b1' }));
    await store.insert('3', [0, 0, 1], makePayload({ user_id: 'alice', data: 'a2' }));

    const { records, total } = await store.list({ userId: 'alice' });
    expect(total).toBe(2);
    expect(records).toHaveLength(2);
  });

  it('list with pagination', async () => {
    for (let i = 1; i <= 5; i++) {
      await store.insert(String(i), [i, 0, 0], makePayload({ data: `item${i}` }));
    }
    const page = await store.list({}, 2, 0);
    expect(page.total).toBe(5);
    expect(page.records).toHaveLength(2);
  });

  it('search returns ranked results', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ data: 'x-axis' }));
    await store.insert('2', [0, 1, 0], makePayload({ data: 'y-axis' }));
    await store.insert('3', [0.9, 0.1, 0], makePayload({ data: 'near-x' }));

    const results = await store.search([1, 0, 0], {}, 10);
    expect(results.length).toBe(3);
    expect(results[0].content).toBe('x-axis');
    expect(results[0].score).toBeGreaterThan(results[2].score);
  });

  it('search respects filters', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ user_id: 'alice', data: 'alice data' }));
    await store.insert('2', [1, 0, 0], makePayload({ user_id: 'bob', data: 'bob data' }));

    const results = await store.search([1, 0, 0], { userId: 'alice' }, 10);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('alice data');
  });

  it('hybridSearch promotes keyword matches by query text', async () => {
    await store.insert('1', [0, 1, 0], makePayload({ data: 'TypeScript hybrid retrieval notes' }));
    await store.insert('2', [1, 0, 0], makePayload({ data: 'Completely unrelated content' }));

    const results = await store.hybridSearch([1, 0, 0], 'TypeScript hybrid', {}, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('TypeScript');
    expect(results[0].metadata?._quality_score).toBeDefined();
  });

  it('search and hybridSearch respect scope/category filters', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ scope: 'private', category: 'prefs', data: 'coffee preference' }));
    await store.insert('2', [1, 0, 0], makePayload({ scope: 'shared', category: 'notes', data: 'coffee note' }));

    const scoped = await store.search([1, 0, 0], { scope: 'private', category: 'prefs' }, 10);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].content).toBe('coffee preference');

    const hybrid = await store.hybridSearch([0, 1, 0], 'coffee', { scope: 'shared', category: 'notes' }, 10);
    expect(hybrid).toHaveLength(1);
    expect(hybrid[0].content).toBe('coffee note');
  });

  it('count', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ user_id: 'alice' }));
    await store.insert('2', [0, 1, 0], makePayload({ user_id: 'bob' }));
    expect(await store.count()).toBe(2);
    expect(await store.count({ userId: 'alice' })).toBe(1);
  });

  it('removeAll clears everything', async () => {
    await store.insert('1', [1, 0, 0], makePayload());
    await store.insert('2', [0, 1, 0], makePayload());
    await store.removeAll();
    expect(await store.count()).toBe(0);
  });

  it('removeAll with filter', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ user_id: 'alice' }));
    await store.insert('2', [0, 1, 0], makePayload({ user_id: 'bob' }));
    await store.removeAll({ userId: 'alice' });
    expect(await store.count()).toBe(1);
  });

  it('incrementAccessCount', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ access_count: 0 }));
    await store.incrementAccessCount('1');
    await store.incrementAccessCount('1');
    const rec = await store.getById('1');
    expect(rec!.accessCount).toBe(2);
  });

  it('metadata round-trip', async () => {
    // Metadata is base64-encoded to bypass SeekDB C engine JSON limitations
    await store.insert('1', [1, 0, 0], makePayload({
      data: 'with meta',
      metadata: { key: 'value', nested: { deep: true }, tags: [1, 2, 3] },
    }));
    const rec = await store.getById('1');
    expect(rec!.metadata).toEqual({ key: 'value', nested: { deep: true }, tags: [1, 2, 3] });
  });

  it('scope and category round-trip', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ scope: 'personal', category: 'pref' }));
    const rec = await store.getById('1');
    expect(rec!.scope).toBe('personal');
    expect(rec!.category).toBe('pref');
  });

  // ── SeekDB-specific edge cases (differ from SQLite behavior) ─────────

  describe('seekdb-specific: duplicate ID', () => {
    it('insert duplicate ID throws (unlike SQLite which overwrites)', async () => {
      await store.insert('dup', [1, 0, 0], makePayload({ data: 'first' }));
      await expect(
        store.insert('dup', [0, 1, 0], makePayload({ data: 'second' }))
      ).rejects.toThrow();
    });
  });

  describe('seekdb-specific: dimension mismatch', () => {
    it('insert with wrong vector dimension throws', async () => {
      // Store configured for dimension=3, inserting dimension=2
      await expect(
        store.insert('bad', [1, 0], makePayload())
      ).rejects.toThrow();
    });

    it('search with wrong query dimension throws', async () => {
      await store.insert('1', [1, 0, 0], makePayload());
      await expect(
        store.search([1, 0], {}, 10) // dimension=2, should be 3
      ).rejects.toThrow();
    });

    it('valid operation succeeds after dimension error', async () => {
      // First: trigger error
      await expect(store.insert('bad', [1, 0], makePayload())).rejects.toThrow();
      // Then: valid operation should still work
      await store.insert('good', [1, 0, 0], makePayload({ data: 'recovered' }));
      const rec = await store.getById('good');
      expect(rec!.content).toBe('recovered');
    });
  });

  describe('seekdb-specific: removeAll edge cases', () => {
    it('removeAll on empty collection is safe', async () => {
      await expect(store.removeAll()).resolves.not.toThrow();
    });

    it('removeAll with filter on empty collection is safe', async () => {
      await expect(store.removeAll({ userId: 'nobody' })).resolves.not.toThrow();
    });
  });

  describe('seekdb-specific: close lifecycle', () => {
    it('double close does not throw', async () => {
      await store.close();
      await expect(store.close()).resolves.not.toThrow();
      // Recreate store for afterEach cleanup
      store = (await tryCreateStore(tmpDir, `mem_close_${Date.now()}`))!;
    });
  });

  describe('seekdb-specific: distanceToScore conversion', () => {
    it('cosine: distance 0 → score 1, distance 2 → score 0', () => {
      // Default store uses cosine
      const fn = (store as any).distanceToScore.bind(store);
      expect(fn(0)).toBeCloseTo(1);
      expect(fn(2)).toBeCloseTo(0);
      expect(fn(1)).toBeCloseTo(0.5);
    });

    it('cosine: negative distance is clamped to 0', () => {
      const fn = (store as any).distanceToScore.bind(store);
      // distance > 2 should clamp to 0
      expect(fn(3)).toBe(0);
    });

    it('l2: distance 0 → score 1, distance 1 → score 0.5', async () => {
      const l2Store = await SeekDBStore.create({
        path: tmpDir,
        database: 'test',
        collectionName: `l2_${Date.now()}`,
        distance: 'l2',
        dimension: 3,
      });
      const fn = (l2Store as any).distanceToScore.bind(l2Store);
      expect(fn(0)).toBeCloseTo(1);
      expect(fn(1)).toBeCloseTo(0.5);
      expect(fn(9)).toBeCloseTo(0.1);
      await l2Store.close();
    });

    it('inner_product: negative distance (high similarity) → score near 1', async () => {
      const ipStore = await SeekDBStore.create({
        path: tmpDir,
        database: 'test',
        collectionName: `ip_${Date.now()}`,
        distance: 'inner_product',
        dimension: 3,
      });
      const fn = (ipStore as any).distanceToScore.bind(ipStore);
      // distance = -1 → innerProd = 1 → (1+1)/2 = 1.0
      expect(fn(-1)).toBeCloseTo(1);
      // distance = 0 → innerProd = 0 → (0+1)/2 = 0.5
      expect(fn(0)).toBeCloseTo(0.5);
      // distance = 1 → innerProd = -1 → (-1+1)/2 = 0
      expect(fn(1)).toBeCloseTo(0);
      await ipStore.close();
    });

    it('null/undefined distance returns 0', () => {
      const fn = (store as any).distanceToScore.bind(store);
      expect(fn(null)).toBe(0);
      expect(fn(undefined)).toBe(0);
    });
  });

  describe('seekdb-specific: search score conversion', () => {
    it('identical vectors produce score close to 1', async () => {
      await store.insert('1', [1, 0, 0], makePayload({ data: 'exact' }));
      const results = await store.search([1, 0, 0], {}, 1);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThan(0.9);
    });

    it('orthogonal vectors produce score close to 0.5', async () => {
      await store.insert('1', [1, 0, 0], makePayload({ data: 'x-axis' }));
      const results = await store.search([0, 1, 0], {}, 1);
      expect(results).toHaveLength(1);
      // For cosine distance, orthogonal vectors have distance ~= 1, mapped to score ~= 0.5
      expect(results[0].score).toBeGreaterThan(0.4);
      expect(results[0].score).toBeLessThan(0.6);
    });
  });

  describe('seekdb-specific: query boundary cases', () => {
    it('search with limit=0 returns empty', async () => {
      await store.insert('1', [1, 0, 0], makePayload());
      const results = await store.search([1, 0, 0], {}, 0);
      expect(results).toHaveLength(0);
    });

    it('search with nResults > collection size returns all', async () => {
      await store.insert('1', [1, 0, 0], makePayload({ data: 'a' }));
      await store.insert('2', [0, 1, 0], makePayload({ data: 'b' }));
      const results = await store.search([1, 0, 0], {}, 100);
      expect(results).toHaveLength(2);
    });

    it('search on empty collection returns empty', async () => {
      const results = await store.search([1, 0, 0], {}, 10);
      expect(results).toHaveLength(0);
    });
  });

  describe('seekdb-specific: null/empty data edge cases', () => {
    it('empty string document round-trips', async () => {
      await store.insert('1', [1, 0, 0], makePayload({ data: '' }));
      const rec = await store.getById('1');
      expect(rec!.content).toBe('');
    });

    it('empty metadata object round-trips', async () => {
      await store.insert('1', [1, 0, 0], makePayload({ metadata: {} }));
      const rec = await store.getById('1');
      expect(rec!.metadata).toEqual({});
    });
  });

  describe('seekdb-specific: persistence across re-create', () => {
    it('data persists after close and re-create on same path', async () => {
      const collectionName = `persist_${Date.now()}`;

      // Create first store and insert
      const store1 = await SeekDBStore.create({
        path: tmpDir, database: 'test',
        collectionName, distance: 'cosine', dimension: 3,
      });
      await store1.insert('persist-1', [1, 0, 0], makePayload({ data: 'survives' }));
      await store1.close();

      // Re-create on same path/collection
      const store2 = await SeekDBStore.create({
        path: tmpDir, database: 'test',
        collectionName, distance: 'cosine', dimension: 3,
      });
      const rec = await store2.getById('persist-1');
      expect(rec).not.toBeNull();
      expect(rec!.content).toBe('survives');
      await store2.close();
    });
  });

  describe('seekdb-specific: count edge cases', () => {
    it('count on empty collection returns 0', async () => {
      expect(await store.count()).toBe(0);
    });

    it('count with non-matching filter returns 0', async () => {
      await store.insert('1', [1, 0, 0], makePayload({ user_id: 'alice' }));
      expect(await store.count({ userId: 'nobody' })).toBe(0);
    });
  });

  describe('seekdb-specific: incrementAccessCountBatch edge cases', () => {
    it('batch increment with empty array is safe', async () => {
      await expect(store.incrementAccessCountBatch([])).resolves.not.toThrow();
    });

    it('batch increment skips non-existent IDs gracefully', async () => {
      await store.insert('1', [1, 0, 0], makePayload({ access_count: 0 }));
      // Mix of existing and non-existing IDs
      await store.incrementAccessCountBatch(['1', 'nonexistent']);
      const rec = await store.getById('1');
      expect(rec!.accessCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('seekdb-specific: list client-side sorting', () => {
    it('offset beyond total returns empty records', async () => {
      await store.insert('1', [1, 0, 0], makePayload({ data: 'only' }));
      const { records, total } = await store.list({}, 10, 100);
      expect(total).toBe(1);
      expect(records).toHaveLength(0);
    });

    it('sortBy created_at asc works client-side', async () => {
      await store.insert('1', [1, 0, 0], makePayload({ data: 'old', created_at: '2024-01-01T00:00:00Z' }));
      await store.insert('2', [0, 1, 0], makePayload({ data: 'new', created_at: '2024-06-01T00:00:00Z' }));
      const { records } = await store.list({}, 100, 0, { sortBy: 'createdAt', order: 'asc' });
      expect(records[0].content).toBe('old');
      expect(records[1].content).toBe('new');
    });
  });

  describe('seekdb-specific: unicode in documents and metadata', () => {
    it('CJK + emoji document round-trips', async () => {
      const content = '测试 🚀 中文 日本語 한국어';
      await store.insert('1', [1, 0, 0], makePayload({ data: content }));
      const rec = await store.getById('1');
      expect(rec!.content).toBe(content);
    });

    it('unicode metadata values round-trip', async () => {
      // Metadata is base64-encoded to handle unicode safely
      await store.insert('1', [1, 0, 0], makePayload({
        metadata: { '标签': '重要', emoji: '🏷️' },
      }));
      const rec = await store.getById('1');
      expect(rec!.metadata).toEqual({ '标签': '重要', emoji: '🏷️' });
    });
  });
});
