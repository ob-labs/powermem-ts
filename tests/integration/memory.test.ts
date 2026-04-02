import { describe, it, expect, afterEach } from 'vitest';
import { Memory } from '../../src/core/memory.js';
import { MockEmbeddings, MockLLM } from '../mocks.js';

describe('Memory facade', () => {
  let memory: Memory;

  afterEach(async () => {
    if (memory) await memory.close();
  });

  it('creates with explicit LangChain instances', async () => {
    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });
    expect(memory).toBeDefined();
  });

  it('init is a no-op and does not throw', async () => {
    await expect(Memory.init()).resolves.toBeUndefined();
  });

  it('full lifecycle: add → search → get → update → delete', async () => {
    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    // Add
    const addResult = await memory.add('hello world', { infer: false });
    expect(addResult.memories).toHaveLength(1);
    const id = addResult.memories[0].memoryId;

    // Search
    const searchResult = await memory.search('hello');
    expect(searchResult.results.length).toBeGreaterThan(0);

    // Get
    const mem = await memory.get(id);
    expect(mem).not.toBeNull();
    expect(mem!.content).toBe('hello world');

    // Update
    const updated = await memory.update(id, 'hello updated');
    expect(updated.content).toBe('hello updated');

    // Delete
    const deleted = await memory.delete(id);
    expect(deleted).toBe(true);
    expect(await memory.get(id)).toBeNull();
  });

  it('full lifecycle with infer', async () => {
    const factResponse = JSON.stringify({ facts: ['Name is Alice'] });
    const actionResponse = JSON.stringify({
      memory: [{ id: '0', text: 'Name is Alice', event: 'ADD' }],
    });

    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      llm: new MockLLM([factResponse, actionResponse]),
      dbPath: ':memory:',
    });

    const result = await memory.add("I'm Alice", { userId: 'u1' });
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content).toBe('Name is Alice');

    // Search
    const search = await memory.search('Alice', { userId: 'u1' });
    expect(search.results.length).toBeGreaterThan(0);
  });

  it('getAll and deleteAll work through facade', async () => {
    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    await memory.add('a', { infer: false });
    await memory.add('b', { infer: false });

    const all = await memory.getAll();
    expect(all.total).toBe(2);

    await memory.deleteAll();
    const empty = await memory.getAll();
    expect(empty.total).toBe(0);
  });

  it('addBatch works through facade', async () => {
    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    const result = await memory.addBatch(
      [{ content: 'x' }, { content: 'y' }],
      { infer: false }
    );
    expect(result.memories).toHaveLength(2);
  });

  it('reset clears all memories', async () => {
    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    await memory.add('a', { infer: false });
    await memory.reset();
    const all = await memory.getAll();
    expect(all.total).toBe(0);
  });

  it('count returns correct number', async () => {
    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    await memory.add('a', { userId: 'alice', infer: false });
    await memory.add('b', { userId: 'bob', infer: false });
    await memory.add('c', { userId: 'alice', infer: false });

    expect(await memory.count()).toBe(3);
    expect(await memory.count({ userId: 'alice' })).toBe(2);
  });
});
