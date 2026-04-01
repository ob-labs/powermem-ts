/**
 * E2E: Multi-round agent memory accumulation
 * Ported from Python's test_agent_memory_e2e.py + test_e2e_scenarios.py
 *
 * Tests real-world scenarios with real Ollama models:
 * - Personal assistant: remembers preferences across rounds
 * - Multi-round conversation: memory grows, early memories still findable
 * - Agent isolation: different agents don't leak data
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Memory } from '../src/memory.js';

const OLLAMA_BASE_URL = 'http://localhost:11434';

async function ollamaReady(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return false;
    const data = (await res.json()) as { models: Array<{ name: string }> };
    const names = data.models.map((m) => m.name);
    return names.some((n) => n.startsWith('nomic-embed-text'));
  } catch {
    return false;
  }
}

describe('E2E agent scenarios', async () => {
  const ready = await ollamaReady();
  if (!ready) {
    it.skip('Ollama not available', () => {});
    return;
  }

  const { OllamaEmbeddings } = await import('@langchain/ollama');
  function createEmbeddings() {
    return new OllamaEmbeddings({ model: 'nomic-embed-text', baseUrl: OLLAMA_BASE_URL });
  }

  // ── Scenario: Personal assistant ──────────────────────────────────────

  describe('personal assistant — remembers preferences', () => {
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

    it('accumulates preferences and retrieves them semantically', async () => {
      // Round 1: user states preferences
      await memory.add('I prefer dark roast coffee', { userId: 'user1', infer: false });
      await memory.add('My favorite cuisine is Japanese', { userId: 'user1', infer: false });
      await memory.add('I exercise every morning at 6am', { userId: 'user1', infer: false });

      // Round 2: more preferences
      await memory.add('I am allergic to shellfish', { userId: 'user1', infer: false });
      await memory.add('I work from home on Fridays', { userId: 'user1', infer: false });

      // Verify total
      const count = await memory.count({ userId: 'user1' });
      expect(count).toBe(5);

      // Semantic search for food preferences
      const foodSearch = await memory.search('food preferences and diet', { userId: 'user1' });
      const foodContents = foodSearch.results.map((r) => r.content);
      // Should find Japanese cuisine and/or shellfish allergy
      expect(foodContents.some((c) => c.includes('Japanese') || c.includes('shellfish'))).toBe(true);

      // Semantic search for daily routine
      const routineSearch = await memory.search('daily schedule', { userId: 'user1' });
      const routineContents = routineSearch.results.map((r) => r.content);
      expect(routineContents.some((c) => c.includes('exercise') || c.includes('morning') || c.includes('Friday'))).toBe(true);
    });
  });

  // ── Scenario: Multi-round conversation ────────────────────────────────

  describe('multi-round conversation memory', () => {
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

    it('10 rounds of conversation — all memories retained and searchable', async () => {
      const rounds = [
        'My name is Alex',
        'I just moved to San Francisco',
        'I work at a startup as CTO',
        'We are building an AI product',
        'Our team has 15 engineers',
        'I previously worked at Google for 5 years',
        'I studied computer science at MIT',
        'My hobby is rock climbing',
        'I have a dog named Max',
        'I am planning a trip to Japan next month',
      ];

      for (const msg of rounds) {
        await memory.add(msg, { userId: 'alex', infer: false });
      }

      // All 10 stored
      expect(await memory.count({ userId: 'alex' })).toBe(10);

      // Early memories still findable
      const nameSearch = await memory.search('name', { userId: 'alex', limit: 3 });
      expect(nameSearch.results.some((r) => r.content.includes('Alex'))).toBe(true);

      // Recent memories findable
      const travelSearch = await memory.search('travel plans', { userId: 'alex', limit: 3 });
      expect(travelSearch.results.some((r) => r.content.includes('Japan'))).toBe(true);

      // Cross-topic: work history
      const workSearch = await memory.search('career experience', { userId: 'alex', limit: 5 });
      const workContents = workSearch.results.map((r) => r.content);
      expect(workContents.some((c) => c.includes('Google') || c.includes('CTO') || c.includes('startup'))).toBe(true);
    });
  });

  // ── Scenario: Multi-agent memory isolation ────────────────────────────

  describe('multi-agent memory isolation with real embeddings', () => {
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

    it('agent A and B have separate memory spaces for same user', async () => {
      const user = 'shared';

      // Agent A: customer support context
      await memory.add('Customer reported a bug in the payment flow', {
        userId: user, agentId: 'support-agent', infer: false,
      });
      await memory.add('Issue was resolved by clearing the cache', {
        userId: user, agentId: 'support-agent', infer: false,
      });

      // Agent B: personal assistant context
      await memory.add('User prefers email over phone calls', {
        userId: user, agentId: 'personal-agent', infer: false,
      });

      // Support agent can only see support memories
      const supportSearch = await memory.search('bug', {
        userId: user, agentId: 'support-agent',
      });
      expect(supportSearch.results.length).toBeGreaterThan(0);
      expect(supportSearch.results.every((r) => !r.content.includes('email'))).toBe(true);

      // Personal agent can only see personal memories
      const personalAll = await memory.getAll({ userId: user, agentId: 'personal-agent' });
      expect(personalAll.total).toBe(1);
      expect(personalAll.memories[0].content).toContain('email');
    });
  });
});
