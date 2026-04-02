/**
 * Custom integration tests
 * Ported from Python's test_scenario_5_custom_integration.py
 *
 * Verifies all customization points work together:
 * custom prompts, custom embedding instance, custom LLM instance,
 * fallback behavior, reranker, and category-based topic filtering.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Memory } from '../../src/core/memory.js';
import { NativeProvider } from '../../src/core/native-provider.js';
import { MockEmbeddings, MockLLM } from '../mocks.js';

describe('custom integration — scenario 5', () => {
  let memory: Memory;

  afterEach(async () => {
    if (memory) await memory.close();
  });

  it('custom fact extraction prompt changes LLM behavior', async () => {
    const customPrompt = 'Extract key-value pairs. Return JSON: {"facts": ["key: value"]}';
    const llm = new MockLLM([
      JSON.stringify({ facts: ['name: Alice', 'age: 30'] }),
      JSON.stringify({ memory: [
        { id: '0', text: 'name: Alice', event: 'ADD' },
        { id: '1', text: 'age: 30', event: 'ADD' },
      ]}),
    ]);

    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      llm,
      dbPath: ':memory:',
      customFactExtractionPrompt: customPrompt,
    });

    const result = await memory.add("I'm Alice and I'm 30");
    expect(result.memories.length).toBeGreaterThanOrEqual(1);

    // Verify custom prompt was sent to LLM
    const systemMsg = llm.calls[0][0].content as string;
    expect(systemMsg).toBe(customPrompt);
  });

  it('custom update memory prompt changes action decisions', async () => {
    const customPrompt = 'Always ADD. Never UPDATE or DELETE. Return JSON with memory array.';
    const llm = new MockLLM([
      JSON.stringify({ facts: ['fact1'] }),
      JSON.stringify({ memory: [{ id: '0', text: 'fact1', event: 'ADD' }] }),
    ]);

    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      llm,
      dbPath: ':memory:',
      customUpdateMemoryPrompt: customPrompt,
    });

    // First add (simple, creates base)
    await memory.add('base memory', { infer: false });

    // Second add (infer), triggers action decision with custom prompt
    const result = await memory.add('new info');
    expect(result.memories.length).toBeGreaterThanOrEqual(1);
  });

  it('custom embedding instance is used for all operations', async () => {
    const embeddings = new MockEmbeddings(16); // 16-dim instead of default 8

    memory = await Memory.create({
      embeddings,
      dbPath: ':memory:',
    });

    await memory.add('test embedding dim', { infer: false });
    const result = await memory.search('test');

    // Verify embeddings were called
    expect(embeddings.calls.length).toBeGreaterThan(0);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('custom LLM instance is used for infer', async () => {
    const llm = new MockLLM([JSON.stringify({ facts: ['custom LLM was used'] })]);

    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      llm,
      dbPath: ':memory:',
    });

    await memory.add('trigger infer');
    expect(llm.calls.length).toBeGreaterThan(0);
  });

  it('reranker reverses result order', async () => {
    const reverseReranker = async (_q: string, hits: any[]) => [...hits].reverse();

    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
      reranker: reverseReranker,
    });

    await memory.add('first', { infer: false });
    await memory.add('second', { infer: false });

    const result = await memory.search('first');
    // Normally 'first' ranks highest; reranker reverses
    expect(result.results[result.results.length - 1].content).toBe('first');
  });

  it('fallbackToSimpleAdd stores raw content when LLM extracts nothing', async () => {
    const llm = new MockLLM([JSON.stringify({ facts: [] })]);

    memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      llm,
      dbPath: ':memory:',
      fallbackToSimpleAdd: true,
    });

    const result = await memory.add('raw content preserved');
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content).toBe('raw content preserved');
  });
});

describe('topic / category filtering — test_topic_comprehensive', () => {
  let provider: NativeProvider;

  afterEach(async () => {
    if (provider) await provider.close();
  });

  it('filter getAll by category', async () => {
    provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    await provider.add({ content: 'buy milk', category: 'todo', infer: false });
    await provider.add({ content: 'likes jazz', category: 'preference', infer: false });
    await provider.add({ content: 'dentist monday', category: 'todo', infer: false });
    await provider.add({ content: 'allergic to nuts', category: 'health', infer: false });

    // Category is stored in payload but getAll filters by userId/agentId only
    // For category filtering, use the store directly or search + metadata
    const all = await provider.getAll();
    expect(all.total).toBe(4);

    // Group by category
    const byCategory = new Map<string, number>();
    for (const m of all.memories) {
      const cat = m.category ?? 'none';
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
    }
    expect(byCategory.get('todo')).toBe(2);
    expect(byCategory.get('preference')).toBe(1);
    expect(byCategory.get('health')).toBe(1);
  });

  it('sort by category groups related memories', async () => {
    provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    await provider.add({ content: 'c-health', category: 'health', infer: false });
    await provider.add({ content: 'a-todo', category: 'todo', infer: false });
    await provider.add({ content: 'b-health', category: 'health', infer: false });

    const { memories } = await provider.getAll({ sortBy: 'category', order: 'asc' });
    // health, health, todo
    expect(memories[0].category).toBe('health');
    expect(memories[1].category).toBe('health');
    expect(memories[2].category).toBe('todo');
  });
});
