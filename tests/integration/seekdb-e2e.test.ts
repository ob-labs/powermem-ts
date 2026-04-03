/**
 * SeekDB end-to-end integration tests — exercises the full stack through
 * Memory facade with SeekDB as the vector store backend.
 *
 * Covers: data correctness, user isolation, CLI-equivalent operations,
 * dashboard API-equivalent operations, all over SeekDB.
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

async function seekdbAvailable(): Promise<boolean> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-avail-'));
  try {
    const store = await SeekDBStore.create({ path: dir, database: 'check', collectionName: 'c', dimension: 3 });
    await store.close();
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const available = await seekdbAvailable();
const describeIf = available ? describe : describe.skip;

describeIf('SeekDB E2E — full stack', () => {
  let tmpDir: string;

  function freshDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-e2e-'));
    return tmpDir;
  }

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: Memory facade over SeekDB (CLI-equivalent operations)
  // ═══════════════════════════════════════════════════════════════

  describe('Memory facade over SeekDB', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: new MockEmbeddings(),
        seekdb: { path: freshDir(), database: 'test', collectionName: 'mem', dimension: 8 },
      });
    });

    afterAll(async () => { await memory.close(); });

    it('add + get round-trip preserves content', async () => {
      const result = await memory.add('SeekDB round-trip test', { userId: 'u1', infer: false });
      expect(result.memories).toHaveLength(1);
      const id = result.memories[0].memoryId;

      const fetched = await memory.get(id);
      expect(fetched).not.toBeNull();
      expect(fetched!.content).toBe('SeekDB round-trip test');
      expect(fetched!.userId).toBe('u1');
    });

    it('search returns relevant results with scores', async () => {
      await memory.add('I love dark roast coffee', { userId: 'u1', infer: false });
      const result = await memory.search('coffee', { userId: 'u1', limit: 5 });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].score).toBeGreaterThan(0);
      expect(result.results[0].score).toBeLessThanOrEqual(1);
    });

    it('update changes content and re-embeds', async () => {
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

    it('getAll with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await memory.add(`paginated ${i}`, { userId: 'page-u', infer: false });
      }
      const page1 = await memory.getAll({ userId: 'page-u', limit: 2, offset: 0 });
      const page2 = await memory.getAll({ userId: 'page-u', limit: 2, offset: 2 });
      expect(page1.total).toBe(5);
      expect(page1.memories).toHaveLength(2);
      expect(page2.memories).toHaveLength(2);

      const ids1 = new Set(page1.memories.map(m => m.id));
      const ids2 = new Set(page2.memories.map(m => m.id));
      for (const id of ids2) expect(ids1.has(id)).toBe(false);
    });

    it('count returns accurate number', async () => {
      const count = await memory.count({ userId: 'page-u' });
      expect(count).toBe(5);
    });

    it('deleteAll clears user memories', async () => {
      await memory.deleteAll({ userId: 'page-u' });
      expect(await memory.count({ userId: 'page-u' })).toBe(0);
    });

    it('addBatch stores multiple memories', async () => {
      const result = await memory.addBatch(
        [{ content: 'batch 1' }, { content: 'batch 2' }, { content: 'batch 3' }],
        { userId: 'batch-u', infer: false }
      );
      expect(result.memories).toHaveLength(3);
      expect(await memory.count({ userId: 'batch-u' })).toBe(3);
    });

    it('reset clears everything', async () => {
      await memory.reset();
      // Only the memories added after reset should survive
      const all = await memory.getAll({ limit: 1000 });
      expect(all.total).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: User isolation over SeekDB
  // ═══════════════════════════════════════════════════════════════

  describe('User isolation over SeekDB', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: new MockEmbeddings(),
        seekdb: { path: freshDir(), database: 'iso', collectionName: 'mem', dimension: 8 },
      });
    });

    afterAll(async () => { await memory.close(); });

    it('user A data not visible to user B', async () => {
      await memory.add('Alice secret', { userId: 'alice', infer: false });
      await memory.add('Bob secret', { userId: 'bob', infer: false });

      const aliceList = await memory.getAll({ userId: 'alice' });
      const bobList = await memory.getAll({ userId: 'bob' });

      expect(aliceList.memories.every(m => m.userId === 'alice')).toBe(true);
      expect(bobList.memories.every(m => m.userId === 'bob')).toBe(true);
      expect(aliceList.memories.some(m => m.content.includes('Bob'))).toBe(false);
    });

    it('search isolation between users', async () => {
      const aliceSearch = await memory.search('secret', { userId: 'alice' });
      const bobSearch = await memory.search('secret', { userId: 'bob' });

      expect(aliceSearch.results.every(r => r.content.includes('Alice'))).toBe(true);
      expect(bobSearch.results.every(r => r.content.includes('Bob'))).toBe(true);
    });

    it('deleteAll scoped to user', async () => {
      await memory.deleteAll({ userId: 'bob' });
      expect(await memory.count({ userId: 'alice' })).toBe(1);
      expect(await memory.count({ userId: 'bob' })).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: Data type fidelity over SeekDB
  // ═══════════════════════════════════════════════════════════════

  describe('Data fidelity over SeekDB', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: new MockEmbeddings(),
        seekdb: { path: freshDir(), database: 'fidelity', collectionName: 'mem', dimension: 8 },
      });
    });

    afterAll(async () => { await memory.close(); });

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
      expect(fetched!.metadata).toEqual({ tags: ['test', 'seekdb'], nested: { deep: true } });
    });

    it('scope and category round-trip', async () => {
      const result = await memory.add('scoped', {
        userId: 'scope',
        scope: 'personal',
        category: 'preference',
        infer: false,
      });
      const fetched = await memory.get(result.memories[0].memoryId);
      expect(fetched!.scope).toBe('personal');
      expect(fetched!.category).toBe('preference');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: Stats calculation over SeekDB
  // ═══════════════════════════════════════════════════════════════

  describe('Stats over SeekDB', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: new MockEmbeddings(),
        seekdb: { path: freshDir(), database: 'stats', collectionName: 'mem', dimension: 8 },
      });
      for (let i = 0; i < 5; i++) {
        await memory.add(`Stats item ${i}`, { userId: 'stats-u', infer: false });
      }
    });

    afterAll(async () => { await memory.close(); });

    it('stats reflect correct total', async () => {
      const all = await memory.getAll({ userId: 'stats-u', limit: 10000 });
      const stats = calculateStatsFromMemories(all.memories as any);
      expect(stats.totalMemories).toBe(5);
    });

    it('age distribution has entries', async () => {
      const all = await memory.getAll({ userId: 'stats-u', limit: 10000 });
      const stats = calculateStatsFromMemories(all.memories as any);
      expect(stats.ageDistribution['< 1 day']).toBe(5);
    });

    it('growth trend includes today', async () => {
      const all = await memory.getAll({ userId: 'stats-u', limit: 10000 });
      const stats = calculateStatsFromMemories(all.memories as any);
      const today = new Date().toISOString().split('T')[0];
      expect(stats.growthTrend[today]).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: Intelligent add over SeekDB
  // ═══════════════════════════════════════════════════════════════

  describe('Intelligent add over SeekDB', () => {
    it('infer extracts and stores facts', async () => {
      const memory = await Memory.create({
        embeddings: new MockEmbeddings(),
        llm: new MockLLM([JSON.stringify({ facts: ['Likes tea', 'Lives in Tokyo'] })]),
        seekdb: { path: freshDir(), database: 'infer', collectionName: 'mem', dimension: 8 },
      });

      const result = await memory.add('I like tea and live in Tokyo', { userId: 'infer-u' });
      expect(result.memories.length).toBeGreaterThanOrEqual(1);

      const all = await memory.getAll({ userId: 'infer-u' });
      expect(all.total).toBeGreaterThanOrEqual(1);

      await memory.close();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: VectorStoreFactory creates SeekDB
  // ═══════════════════════════════════════════════════════════════

  describe('VectorStoreFactory with SeekDB', () => {
    it('factory creates SeekDBStore', async () => {
      const { VectorStoreFactory } = await import('../../src/storage/factory.js');
      const store = await VectorStoreFactory.create('seekdb', {
        path: freshDir(), database: 'factory', collectionName: 'test', dimension: 3,
      });
      expect(store).toBeDefined();
      await store.insert('1', [1, 0, 0], {
        data: 'factory test', user_id: null, agent_id: null, run_id: null,
        hash: 'h', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        scope: null, category: null, access_count: 0, metadata: {},
      });
      expect(await store.count()).toBe(1);
      await store.close();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: NativeProvider with injected SeekDBStore
  // ═══════════════════════════════════════════════════════════════

  describe('NativeProvider + SeekDBStore injection', () => {
    it('provider accepts injected SeekDBStore', async () => {
      const store = await SeekDBStore.create({
        path: freshDir(), database: 'inject', collectionName: 'mem', dimension: 8,
      });
      const provider = await NativeProvider.create({
        embeddings: new MockEmbeddings(),
        store,
      });

      const result = await provider.add({ content: 'injected store test', infer: false });
      expect(result.memories).toHaveLength(1);

      const search = await provider.search({ query: 'injected' });
      expect(search.results.length).toBeGreaterThan(0);

      await provider.close();
    });
  });
});
