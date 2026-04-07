import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Memory } from '../../src/core/memory.js';
import { Embeddings } from '@langchain/core/embeddings';

class MockEmbed extends Embeddings {
  async embedQuery(text: string) { return Array.from({ length: 8 }, (_, i) => text.charCodeAt(i % text.length) / 256); }
  async embedDocuments(docs: string[]) { return Promise.all(docs.map(d => this.embedQuery(d))); }
}

describe('Memory extended API', () => {
  let mem: Memory;

  beforeAll(async () => {
    mem = await Memory.create({ dbPath: ':memory:', embeddings: new MockEmbed({}) });
    await mem.add('Alice likes TypeScript', { userId: 'alice', infer: false });
    await mem.add('Bob likes Python', { userId: 'bob', infer: false });
    await mem.add('Alice also likes Rust', { userId: 'alice', infer: false });
  });

  afterAll(async () => { await mem.close(); });

  it('getStatistics returns data', async () => {
    const stats = await mem.getStatistics({ userId: 'alice' });
    expect(typeof stats.totalMemories).toBe('number');
  });

  it('getUsers returns unique users', async () => {
    const users = await mem.getUsers();
    expect(users).toContain('alice');
    expect(users).toContain('bob');
  });

  it('exportMemories returns records', async () => {
    const exported = await mem.exportMemories({ userId: 'alice' });
    expect(exported).toHaveLength(2);
    expect(exported[0].content).toBeTruthy();
  });

  it('importMemories adds records', async () => {
    const result = await mem.importMemories([
      { content: 'Charlie likes Go', userId: 'charlie' },
    ], { infer: false });
    expect(result.imported).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('optimize runs dedup', async () => {
    const result = await mem.optimize('exact', 'alice');
    expect(typeof (result as any).totalChecked).toBe('number');
  });

  it('multimodal add works', async () => {
    const result = await mem.add([
      { role: 'user', content: 'Hello from messages API' },
    ], { userId: 'alice', infer: false });
    expect(result.memories.length).toBeGreaterThan(0);
    expect(result.memories[0].content).toContain('Hello from messages API');
  });

  it('migrateToSubStore throws when no router', async () => {
    await expect(mem.migrateToSubStore('test')).rejects.toThrow('No SubStorageRouter');
  });
});

describe('AsyncMemory alias', () => {
  it('AsyncMemory === Memory', async () => {
    const { AsyncMemory } = await import('../../src/index.js');
    expect(AsyncMemory).toBe(Memory);
  });
});
