/**
 * SeekDB end-to-end integration tests — single shared Memory instance.
 * SeekDB embedded engine is single-instance, so all tests share one DB.
 *
 * Auto-skips when SeekDB native bindings are unavailable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Memory } from '../../src/core/memory.js';
import { SeekDBStore } from '../../src/storage/seekdb/seekdb.js';
import { NativeProvider } from '../../src/core/native-provider.js';
import { MockEmbeddings, MockLLM } from '../mocks.js';
import { calculateStatsFromMemories } from '../../src/utils/stats.js';

async function tryCreateStore(tmpDir: string, name: string, dim = 8) {
  try {
    return await SeekDBStore.create({
      path: tmpDir, database: 'test', collectionName: name, dimension: dim,
    });
  } catch {
    return null;
  }
}

let seekdbAvailable = false;
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-e2e-check-'));
  try {
    const s = await tryCreateStore(dir, 'check');
    seekdbAvailable = s != null;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

const describeIf = seekdbAvailable ? describe : describe.skip;

describeIf('SeekDB E2E — full stack (shared instance)', () => {
  let memory: Memory;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-e2e-'));
    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      seekdb: { path: tmpDir, database: 'test', collectionName: 'memories', dimension: 8 },
    });
  });

  afterAll(async () => {
    if (memory) await memory.close();
    if (tmpDir) try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  // ─── CRUD ──────────────────────────────────────────────────────────

  it('add + get round-trip preserves content', async () => {
    const result = await memory.add('SeekDB round-trip test', { userId: 'u1', infer: false });
    expect(result.memories).toHaveLength(1);
    const id = result.memories[0].memoryId;
    const fetched = await memory.get(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe('SeekDB round-trip test');
  });

  it('search returns results with scores', async () => {
    await memory.add('I love dark roast coffee', { userId: 'u1', infer: false });
    const result = await memory.search('coffee', { userId: 'u1', limit: 5 });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].score).toBeGreaterThan(0);
    expect(result.results[0].score).toBeLessThanOrEqual(1);
  });

  it('update changes content', async () => {
    const added = await memory.add('old content', { userId: 'u1', infer: false });
    const id = added.memories[0].memoryId;
    await memory.update(id, 'new content');
    const fetched = await memory.get(id);
    expect(fetched!.content).toBe('new content');
  });

  it('delete removes memory', async () => {
    const added = await memory.add('ephemeral', { userId: 'u1', infer: false });
    const id = added.memories[0].memoryId;
    expect(await memory.delete(id)).toBe(true);
    expect(await memory.get(id)).toBeNull();
  });

  // ─── Pagination ────────────────────────────────────────────────────

  it('getAll with pagination — no ID overlap', async () => {
    const userId = `page-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      await memory.add(`paginated ${i}`, { userId, infer: false });
    }
    const page1 = await memory.getAll({ userId, limit: 2, offset: 0 });
    const page2 = await memory.getAll({ userId, limit: 2, offset: 2 });
    expect(page1.total).toBe(5);
    expect(page1.memories).toHaveLength(2);
    expect(page2.memories).toHaveLength(2);
    const ids1 = new Set(page1.memories.map(m => m.id));
    const ids2 = new Set(page2.memories.map(m => m.id));
    for (const id of ids2) expect(ids1.has(id)).toBe(false);
  });

  it('count returns accurate number', async () => {
    const userId = `count-${Date.now()}`;
    await memory.add('a', { userId, infer: false });
    await memory.add('b', { userId, infer: false });
    expect(await memory.count({ userId })).toBe(2);
  });

  it('addBatch stores multiple', async () => {
    const userId = `batch-${Date.now()}`;
    const result = await memory.addBatch(
      [{ content: 'b1' }, { content: 'b2' }, { content: 'b3' }],
      { userId, infer: false }
    );
    expect(result.memories).toHaveLength(3);
  });

  // ─── User isolation ────────────────────────────────────────────────

  it('user A data not visible to user B', async () => {
    const ts = Date.now();
    await memory.add('Alice secret', { userId: `alice-${ts}`, infer: false });
    await memory.add('Bob secret', { userId: `bob-${ts}`, infer: false });

    const aliceList = await memory.getAll({ userId: `alice-${ts}` });
    expect(aliceList.memories.every(m => m.content.includes('Alice'))).toBe(true);
    expect(aliceList.memories.some(m => m.content.includes('Bob'))).toBe(false);
  });

  it('search isolation between users', async () => {
    const ts = Date.now();
    await memory.add('Alpha keyword XYZ', { userId: `searchA-${ts}`, infer: false });
    await memory.add('Beta keyword XYZ', { userId: `searchB-${ts}`, infer: false });

    const searchA = await memory.search('keyword XYZ', { userId: `searchA-${ts}` });
    expect(searchA.results.every(r => r.content.includes('Alpha'))).toBe(true);
  });

  // ─── Data fidelity ─────────────────────────────────────────────────

  it('Chinese content round-trip', async () => {
    const content = '用户喜欢喝咖啡，住在上海';
    const result = await memory.add(content, { userId: 'cn', infer: false });
    const fetched = await memory.get(result.memories[0].memoryId);
    expect(fetched!.content).toBe(content);
  });

  it('emoji round-trip', async () => {
    const content = 'I love 🐱 cats and ☕ coffee!';
    const result = await memory.add(content, { userId: 'emoji', infer: false });
    const fetched = await memory.get(result.memories[0].memoryId);
    expect(fetched!.content).toBe(content);
  });

  it('metadata round-trip', async () => {
    const result = await memory.add('with meta', {
      userId: 'meta',
      metadata: { tags: ['test', 'seekdb'], nested: { deep: true } },
      infer: false,
    });
    const fetched = await memory.get(result.memories[0].memoryId);
    expect(fetched!.metadata).toMatchObject({ tags: ['test', 'seekdb'], nested: { deep: true } });
  });

  it('scope and category round-trip', async () => {
    const result = await memory.add('scoped', {
      userId: 'scope', scope: 'personal', category: 'preference', infer: false,
    });
    const fetched = await memory.get(result.memories[0].memoryId);
    expect(fetched!.scope).toBe('personal');
    expect(fetched!.category).toBe('preference');
  });

  // ─── Stats ─────────────────────────────────────────────────────────

  it('stats reflect correct data', async () => {
    const userId = `stats-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await memory.add(`Stats item ${i}`, { userId, infer: false });
    }
    const all = await memory.getAll({ userId, limit: 10000 });
    const stats = calculateStatsFromMemories(all.memories as any);
    expect(stats.totalMemories).toBe(3);
    expect(stats.ageDistribution['< 1 day']).toBe(3);
  });

  // ─── Intelligent add ───────────────────────────────────────────────

  it('infer extracts and stores facts', async () => {
    const mem2 = await Memory.create({
      embeddings: new MockEmbeddings(),
      llm: new MockLLM([JSON.stringify({ facts: ['Likes tea', 'Lives in Tokyo'] })]),
      seekdb: { path: tmpDir, database: 'test', collectionName: `infer_${Date.now()}`, dimension: 8 },
    });
    const result = await mem2.add('I like tea and live in Tokyo', { userId: 'infer-u' });
    expect(result.memories.length).toBeGreaterThanOrEqual(1);
    await mem2.close();
  });
});
