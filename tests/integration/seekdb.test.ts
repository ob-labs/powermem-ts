/**
 * Integration test: NativeProvider + SeekDBStore + MockEmbeddings
 * Verifies the full stack works end-to-end with SeekDB as the backend.
 * Skipped when seekdb native bindings are unavailable.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NativeProvider } from '../../src/core/native-provider.js';
import { SeekDBStore } from '../../src/storage/seekdb/seekdb.js';
import { MockEmbeddings, MockLLM } from '../mocks.js';

async function tryCreateStore(tmpDir: string, name: string, dim = 8) {
  try {
    return await SeekDBStore.create({
      path: tmpDir,
      database: 'test',
      collectionName: name,
      dimension: dim,
    });
  } catch {
    return null;
  }
}

let seekdbAvailable = false;
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-check2-'));
  try {
    const s = await tryCreateStore(dir, 'check');
    seekdbAvailable = s != null;
    await s?.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const describeIf = seekdbAvailable ? describe : describe.skip;

describeIf('NativeProvider + SeekDBStore integration', () => {
  let provider: NativeProvider;
  let tmpDir: string;

  async function createProvider(llmResponses?: string[]) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-int-'));
    const store = await SeekDBStore.create({
      path: tmpDir,
      database: 'test',
      collectionName: `int_${Date.now()}`,
      dimension: 8,
    });
    const embeddings = new MockEmbeddings();
    const llm = llmResponses ? new MockLLM(llmResponses) : undefined;
    return NativeProvider.create({ embeddings, llm, store, dbPath: ':memory:' });
  }

  afterEach(async () => {
    if (provider) await provider.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('simple add + get + search', async () => {
    provider = await createProvider();

    const result = await provider.add({ content: 'hello seekdb', infer: false });
    expect(result.memories).toHaveLength(1);
    const id = result.memories[0].id;

    const mem = await provider.get(id);
    expect(mem).not.toBeNull();
    expect(mem!.content).toBe('hello seekdb');

    const search = await provider.search({ query: 'hello' });
    expect(search.results.length).toBeGreaterThan(0);
    expect(search.results[0].memoryId).toBe(id);
  });

  it('update re-embeds content', async () => {
    provider = await createProvider();

    const result = await provider.add({ content: 'old', infer: false });
    const id = result.memories[0].id;

    await provider.update(id, { content: 'new' });
    const mem = await provider.get(id);
    expect(mem!.content).toBe('new');
  });

  it('delete removes memory', async () => {
    provider = await createProvider();

    const result = await provider.add({ content: 'ephemeral', infer: false });
    const id = result.memories[0].id;

    expect(await provider.delete(id)).toBe(true);
    expect(await provider.get(id)).toBeNull();
  });

  it('getAll with pagination', async () => {
    provider = await createProvider();

    for (let i = 0; i < 5; i++) {
      await provider.add({ content: `item ${i}`, infer: false });
    }

    const all = await provider.getAll();
    expect(all.total).toBe(5);

    const page = await provider.getAll({ limit: 2, offset: 0 });
    expect(page.memories).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  it('count with filter', async () => {
    provider = await createProvider();

    await provider.add({ content: 'a', userId: 'alice', infer: false });
    await provider.add({ content: 'b', userId: 'bob', infer: false });

    expect(await provider.count()).toBe(2);
    expect(await provider.count({ userId: 'alice' })).toBe(1);
  });

  it('deleteAll + reset', async () => {
    provider = await createProvider();

    await provider.add({ content: 'a', infer: false });
    await provider.add({ content: 'b', infer: false });

    await provider.reset();
    expect(await provider.count()).toBe(0);
  });

  it('intelligent add with LLM', async () => {
    provider = await createProvider([
      JSON.stringify({ facts: ['Fact A', 'Fact B'] }),
    ]);

    const result = await provider.add({ content: 'complex input' });
    expect(result.memories.length).toBeGreaterThanOrEqual(1);
  });

  it('multi-user isolation', async () => {
    provider = await createProvider();

    await provider.add({ content: 'alice data', userId: 'alice', infer: false });
    await provider.add({ content: 'bob data', userId: 'bob', infer: false });

    const aliceSearch = await provider.search({ query: 'data', userId: 'alice' });
    expect(aliceSearch.results).toHaveLength(1);
    expect(aliceSearch.results[0].content).toBe('alice data');
  });
});
