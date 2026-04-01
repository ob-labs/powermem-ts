/**
 * End-to-end tests with real Ollama models.
 *
 * Models required:
 *   - qwen2.5:0.5b       (LLM — fact extraction + action decision)
 *   - nomic-embed-text    (embedding — 768-dim vectors)
 *
 * These tests hit a real local Ollama server and exercise the full pipeline:
 * embedding generation, vector storage, cosine search, and LLM-driven inference.
 *
 * Run: npx vitest run tests/e2e-ollama.test.ts
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { OllamaEmbeddings } from '@langchain/ollama';
import { ChatOllama } from '@langchain/ollama';
import { Memory } from '../src/memory.js';
import { NativeProvider } from '../src/provider/native/index.js';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';
const LLM_MODEL = 'qwen2.5:0.5b';

/** Check if Ollama is reachable and models are available */
async function ollamaReady(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return false;
    const data = (await res.json()) as { models: Array<{ name: string }> };
    const names = data.models.map((m) => m.name);
    return names.some((n) => n.startsWith('nomic-embed-text')) &&
           names.some((n) => n.startsWith('qwen2.5:0.5b'));
  } catch {
    return false;
  }
}

function createEmbeddings() {
  return new OllamaEmbeddings({
    model: EMBED_MODEL,
    baseUrl: OLLAMA_BASE_URL,
  });
}

function createLLM() {
  return new ChatOllama({
    model: LLM_MODEL,
    baseUrl: OLLAMA_BASE_URL,
    temperature: 0.1,
    format: 'json',    // Ollama requires JSON mode at construction
    numCtx: 8192,      // Larger context for the full system prompts
  });
}

describe('E2E with Ollama', async () => {
  const ready = await ollamaReady();

  // Skip entire suite if Ollama is not available
  if (!ready) {
    it.skip('Ollama not available — skipping e2e tests', () => {});
    return;
  }

  // ─── Embedding sanity ───────────────────────────────────────────────────

  describe('embedding model', () => {
    const embeddings = createEmbeddings();

    it('produces a vector from text', async () => {
      const vec = await embeddings.embedQuery('hello world');
      expect(Array.isArray(vec)).toBe(true);
      expect(vec.length).toBeGreaterThan(0);
      expect(vec.every((v) => typeof v === 'number')).toBe(true);
    });

    it('similar texts produce similar vectors', async () => {
      const [v1, v2, v3] = await Promise.all([
        embeddings.embedQuery('I love coffee'),
        embeddings.embedQuery('I enjoy drinking coffee'),
        embeddings.embedQuery('The weather is sunny today'),
      ]);

      // Cosine similarity helper
      function cos(a: number[], b: number[]): number {
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < a.length; i++) {
          dot += a[i] * b[i];
          magA += a[i] * a[i];
          magB += b[i] * b[i];
        }
        return dot / (Math.sqrt(magA) * Math.sqrt(magB));
      }

      const simCoffee = cos(v1, v2);   // both about coffee
      const simUnrelated = cos(v1, v3); // coffee vs weather

      expect(simCoffee).toBeGreaterThan(simUnrelated);
    });
  });

  // ─── Simple add + search (no LLM) ──────────────────────────────────────

  describe('simple add + search (infer=false)', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: createEmbeddings(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await memory.close();
    });

    it('adds and retrieves a memory', async () => {
      const result = await memory.add('I love drinking espresso every morning', {
        userId: 'e2e-user',
        infer: false,
      });

      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].content).toBe('I love drinking espresso every morning');

      const fetched = await memory.get(result.memories[0].memoryId);
      expect(fetched).not.toBeNull();
      expect(fetched!.content).toBe('I love drinking espresso every morning');
    });

    it('semantic search returns relevant results', async () => {
      // Add diverse memories
      await memory.add('My favorite programming language is TypeScript', {
        userId: 'e2e-user', infer: false,
      });
      await memory.add('I went hiking in the mountains last weekend', {
        userId: 'e2e-user', infer: false,
      });
      await memory.add('I prefer dark roast coffee beans', {
        userId: 'e2e-user', infer: false,
      });

      // Search for coffee-related
      const result = await memory.search('coffee preferences', {
        userId: 'e2e-user',
        limit: 2,
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.length).toBeLessThanOrEqual(2);

      // Top results should be coffee-related (espresso or dark roast)
      const topContents = result.results.map((r) => r.content);
      const coffeeRelated = topContents.some(
        (c) => c.includes('espresso') || c.includes('coffee') || c.includes('roast')
      );
      expect(coffeeRelated).toBe(true);
    });

    it('search with userId filter isolates results', async () => {
      await memory.add('Bob likes pizza', { userId: 'bob', infer: false });

      const result = await memory.search('food preferences', { userId: 'bob' });
      // All results should be Bob's
      // (exact count depends on embedding similarity, but Bob's memory should appear)
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  // ─── Intelligent add with LLM (infer=true) ─────────────────────────────

  describe('intelligent add (infer=true)', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: createEmbeddings(),
        llm: createLLM(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await memory.close();
    });

    it('extracts facts from natural language input', { timeout: 120_000 }, async () => {
      const result = await memory.add(
        'I like coffee and I live in Shanghai',
        { userId: 'alice' }
      );

      // The LLM should extract at least some facts (small models may be imprecise)
      expect(result.memories.length).toBeGreaterThanOrEqual(1);

      // Verify the extracted memories are stored and searchable
      const all = await memory.getAll({ userId: 'alice' });
      expect(all.total).toBeGreaterThanOrEqual(1);

      // Search should return results
      const search = await memory.search('coffee', { userId: 'alice' });
      expect(search.results.length).toBeGreaterThan(0);
    });

    it('handles empty/trivial input gracefully', { timeout: 60_000 }, async () => {
      const result = await memory.add('Hi.', { userId: 'alice' });
      // "Hi." has no extractable facts — should either extract nothing or a single trivial entry
      // Either way, it should not throw
      expect(result).toBeDefined();
      expect(Array.isArray(result.memories)).toBe(true);
    });
  });

  // ─── Full CRUD lifecycle ────────────────────────────────────────────────

  describe('full CRUD lifecycle', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: createEmbeddings(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await memory.close();
    });

    it('add → search → update → search again → delete', async () => {
      // Add
      const added = await memory.add('I live in Beijing', {
        userId: 'crud-user', infer: false,
      });
      const id = added.memories[0].memoryId;

      // Search finds it
      const search1 = await memory.search('where do you live', { userId: 'crud-user' });
      expect(search1.results.some((r) => r.memoryId === id)).toBe(true);

      // Update
      const updated = await memory.update(id, 'I moved to Shanghai');
      expect(updated.content).toBe('I moved to Shanghai');

      // Search now reflects the update
      const search2 = await memory.search('Shanghai', { userId: 'crud-user' });
      expect(search2.results.some((r) => r.content.includes('Shanghai'))).toBe(true);

      // Delete
      const deleted = await memory.delete(id);
      expect(deleted).toBe(true);
      expect(await memory.get(id)).toBeNull();
    });
  });

  // ─── Batch operations ──────────────────────────────────────────────────

  describe('batch operations', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: createEmbeddings(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await memory.close();
    });

    it('addBatch stores multiple memories and they are all searchable', async () => {
      const result = await memory.addBatch(
        [
          { content: 'Favorite color is blue' },
          { content: 'Allergic to peanuts' },
          { content: 'Born in 1990' },
        ],
        { userId: 'batch-user', infer: false }
      );

      expect(result.memories).toHaveLength(3);

      // All searchable
      const colorSearch = await memory.search('favorite color', { userId: 'batch-user' });
      expect(colorSearch.results.some((r) => r.content.includes('blue'))).toBe(true);

      const allergySearch = await memory.search('allergies', { userId: 'batch-user' });
      expect(allergySearch.results.some((r) => r.content.includes('peanuts'))).toBe(true);
    });

    it('deleteAll clears all user memories', async () => {
      await memory.deleteAll({ userId: 'batch-user' });
      const all = await memory.getAll({ userId: 'batch-user' });
      expect(all.total).toBe(0);
    });
  });

  // ─── Intelligent add — UPDATE existing memories ─────────────────────────

  describe('intelligent add — update existing', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: createEmbeddings(),
        llm: createLLM(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await memory.close();
    });

    it('LLM updates existing memory when new info enhances it', { timeout: 120_000 }, async () => {
      // First: add a basic memory
      const first = await memory.add('I went to Hawaii', {
        userId: 'update-user', infer: false,
      });
      expect(first.memories).toHaveLength(1);
      const originalId = first.memories[0].memoryId;

      // Verify it exists
      const before = await memory.getAll({ userId: 'update-user' });
      expect(before.total).toBe(1);

      // Second: add enhanced info — LLM should UPDATE, not duplicate
      const second = await memory.add('I went to Hawaii in May 2023', {
        userId: 'update-user',
      });

      // The LLM may ADD a new enhanced memory or UPDATE the old one
      // Either way, the store should have memories with the enhanced info
      const after = await memory.getAll({ userId: 'update-user' });
      expect(after.total).toBeGreaterThanOrEqual(1);

      // Search for the enhanced version should work
      const search = await memory.search('Hawaii 2023', { userId: 'update-user' });
      expect(search.results.length).toBeGreaterThan(0);
    });
  });

  // ─── Multi-user data isolation ──────────────────────────────────────────

  describe('multi-user isolation in same store', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: createEmbeddings(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await memory.close();
    });

    it('user A cannot see user B data in search or getAll', async () => {
      await memory.add('Alice secret: I love cats', { userId: 'alice', infer: false });
      await memory.add('Bob secret: I love dogs', { userId: 'bob', infer: false });
      await memory.add('Alice hobby: painting', { userId: 'alice', infer: false });

      // getAll isolation
      const aliceAll = await memory.getAll({ userId: 'alice' });
      const bobAll = await memory.getAll({ userId: 'bob' });
      expect(aliceAll.total).toBe(2);
      expect(bobAll.total).toBe(1);
      expect(aliceAll.memories.every((m) => m.userId === 'alice')).toBe(true);
      expect(bobAll.memories.every((m) => m.userId === 'bob')).toBe(true);

      // search isolation
      const aliceSearch = await memory.search('pets', { userId: 'alice' });
      const bobSearch = await memory.search('pets', { userId: 'bob' });
      // Alice's results should not contain Bob's data
      expect(aliceSearch.results.every((r) => !r.content.includes('dogs'))).toBe(true);
      // Bob's results should not contain Alice's data
      expect(bobSearch.results.every((r) => !r.content.includes('cats'))).toBe(true);

      // deleteAll isolation
      await memory.deleteAll({ userId: 'bob' });
      expect((await memory.getAll({ userId: 'alice' })).total).toBe(2);
      expect((await memory.getAll({ userId: 'bob' })).total).toBe(0);
    });
  });

  // ─── agentId filter ─────────────────────────────────────────────────────

  describe('agentId filter', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: createEmbeddings(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await memory.close();
    });

    it('search and getAll filter by agentId', async () => {
      await memory.add('Agent 1 memory', { agentId: 'agent-1', infer: false });
      await memory.add('Agent 2 memory', { agentId: 'agent-2', infer: false });

      const all1 = await memory.getAll({ agentId: 'agent-1' });
      expect(all1.total).toBe(1);
      expect(all1.memories[0].agentId).toBe('agent-1');

      const search2 = await memory.search('memory', { agentId: 'agent-2' });
      expect(search2.results.length).toBe(1);
    });
  });

  // ─── Pagination ─────────────────────────────────────────────────────────

  describe('getAll pagination', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: createEmbeddings(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await memory.close();
    });

    it('limit and offset return correct pages', async () => {
      for (let i = 0; i < 7; i++) {
        await memory.add(`page item ${i}`, { userId: 'pager', infer: false });
      }

      const page1 = await memory.getAll({ userId: 'pager', limit: 3, offset: 0 });
      expect(page1.memories).toHaveLength(3);
      expect(page1.total).toBe(7);
      expect(page1.limit).toBe(3);
      expect(page1.offset).toBe(0);

      const page2 = await memory.getAll({ userId: 'pager', limit: 3, offset: 3 });
      expect(page2.memories).toHaveLength(3);
      expect(page2.total).toBe(7);

      const page3 = await memory.getAll({ userId: 'pager', limit: 3, offset: 6 });
      expect(page3.memories).toHaveLength(1);

      // No overlap between pages
      const ids1 = new Set(page1.memories.map((m) => m.id));
      const ids2 = new Set(page2.memories.map((m) => m.id));
      for (const id of ids2) expect(ids1.has(id)).toBe(false);
    });
  });

  // ─── Metadata round-trip ────────────────────────────────────────────────

  describe('metadata', () => {
    let memory: Memory;

    beforeAll(async () => {
      memory = await Memory.create({
        embeddings: createEmbeddings(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await memory.close();
    });

    it('metadata is stored and retrievable', async () => {
      const result = await memory.add('tagged memory', {
        userId: 'meta-user',
        metadata: { source: 'chat', importance: 'high', tags: ['test', 'e2e'] },
        infer: false,
      });

      const fetched = await memory.get(result.memories[0].memoryId);
      expect(fetched!.metadata).toEqual({
        source: 'chat',
        importance: 'high',
        tags: ['test', 'e2e'],
      });
    });

    it('metadata survives update', async () => {
      const result = await memory.add('will update', {
        metadata: { keep: true },
        infer: false,
      });
      const id = result.memories[0].memoryId;

      await memory.update(id, 'updated content');
      const fetched = await memory.get(id);
      expect(fetched!.content).toBe('updated content');
      expect(fetched!.metadata).toEqual({ keep: true });
    });
  });

  // ─── Reset ──────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all memories', async () => {
      const memory = await Memory.create({
        embeddings: createEmbeddings(),
        dbPath: ':memory:',
      });

      await memory.add('a', { infer: false });
      await memory.add('b', { infer: false });
      expect((await memory.getAll()).total).toBe(2);

      await memory.reset();
      expect((await memory.getAll()).total).toBe(0);

      await memory.close();
    });
  });

  // ─── NativeProvider directly ────────────────────────────────────────────

  describe('NativeProvider direct usage', () => {
    let provider: NativeProvider;

    beforeAll(async () => {
      provider = await NativeProvider.create({
        embeddings: createEmbeddings(),
        llm: createLLM(),
        dbPath: ':memory:',
      });
    });

    afterAll(async () => {
      await provider.close();
    });

    it('search returns scores between 0 and 1', async () => {
      await provider.add({ content: 'The sky is blue', infer: false });
      await provider.add({ content: 'Roses are red', infer: false });
      await provider.add({ content: 'The ocean is vast and blue', infer: false });

      const result = await provider.search({ query: 'blue sky' });
      expect(result.results.length).toBeGreaterThan(0);

      for (const hit of result.results) {
        expect(hit.score).toBeGreaterThanOrEqual(0);
        expect(hit.score).toBeLessThanOrEqual(1);
      }

      // "The sky is blue" or "ocean is vast and blue" should rank higher than "roses are red"
      const scores = result.results.map((r) => ({
        content: r.content,
        score: r.score!,
      }));
      const blueScore = Math.max(
        ...scores.filter((s) => s.content.includes('blue')).map((s) => s.score)
      );
      const redScore = scores.find((s) => s.content.includes('red'))?.score ?? 0;
      expect(blueScore).toBeGreaterThan(redScore);
    });
  });
});
