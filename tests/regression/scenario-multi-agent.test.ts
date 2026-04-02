/**
 * Multi-agent isolation + concurrency safety tests
 * Ported from Python's test_scenario_3_multi_agent.py + test_scenario_4_async_operations.py
 *
 * Verifies:
 * - Same userId, different agentId → complete data isolation
 * - Agent A writes, Agent B cannot read
 * - Concurrent adds don't lose data or corrupt state
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NativeProvider } from '../../src/core/native-provider.js';
import { MockEmbeddings } from '../mocks.js';

describe('multi-agent isolation', () => {
  let provider: NativeProvider;

  beforeAll(async () => {
    provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });
  });

  afterAll(async () => {
    await provider.close();
  });

  it('same userId, different agentId — data fully isolated', async () => {
    const user = 'shared-user';

    await provider.add({ content: 'Agent 1 secret', userId: user, agentId: 'agent-1', infer: false });
    await provider.add({ content: 'Agent 1 note', userId: user, agentId: 'agent-1', infer: false });
    await provider.add({ content: 'Agent 2 secret', userId: user, agentId: 'agent-2', infer: false });

    // getAll isolation
    const agent1All = await provider.getAll({ userId: user, agentId: 'agent-1' });
    const agent2All = await provider.getAll({ userId: user, agentId: 'agent-2' });
    expect(agent1All.total).toBe(2);
    expect(agent2All.total).toBe(1);

    // count isolation
    expect(await provider.count({ userId: user, agentId: 'agent-1' })).toBe(2);
    expect(await provider.count({ userId: user, agentId: 'agent-2' })).toBe(1);
  });

  it('agent A writes, agent B search cannot find it', async () => {
    const user = 'isolated-user';

    await provider.add({ content: 'Agent A private data', userId: user, agentId: 'A', infer: false });

    const searchB = await provider.search({ query: 'private data', userId: user, agentId: 'B' });
    expect(searchB.results).toHaveLength(0);

    const searchA = await provider.search({ query: 'private data', userId: user, agentId: 'A' });
    expect(searchA.results.length).toBeGreaterThan(0);
  });

  it('deleteAll scoped to agentId preserves other agent data', async () => {
    const user = 'delete-test-user';

    await provider.add({ content: 'keep me', userId: user, agentId: 'keeper', infer: false });
    await provider.add({ content: 'delete me', userId: user, agentId: 'victim', infer: false });

    await provider.deleteAll({ userId: user, agentId: 'victim' });

    expect(await provider.count({ userId: user, agentId: 'keeper' })).toBe(1);
    expect(await provider.count({ userId: user, agentId: 'victim' })).toBe(0);
  });
});

describe('concurrency safety', () => {
  it('10 concurrent adds — no data loss', async () => {
    const provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    const promises = Array.from({ length: 10 }, (_, i) =>
      provider.add({ content: `concurrent-${i}`, userId: 'parallel', infer: false })
    );

    const results = await Promise.all(promises);

    // All 10 should succeed
    expect(results.every((r) => r.memories.length === 1)).toBe(true);

    // All 10 should be in store
    const all = await provider.getAll({ userId: 'parallel' });
    expect(all.total).toBe(10);

    // All IDs unique
    const ids = new Set(all.memories.map((m) => m.id));
    expect(ids.size).toBe(10);

    await provider.close();
  });

  it('concurrent search does not corrupt state', async () => {
    const provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    // Seed data
    for (let i = 0; i < 5; i++) {
      await provider.add({ content: `item-${i}`, infer: false });
    }

    // 10 concurrent searches
    const promises = Array.from({ length: 10 }, (_, i) =>
      provider.search({ query: `item-${i % 5}` })
    );

    const results = await Promise.all(promises);
    expect(results.every((r) => r.results.length > 0)).toBe(true);

    // Store still intact
    expect(await provider.count()).toBe(5);

    await provider.close();
  });

  it('concurrent add + search interleaved', async () => {
    const provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    // Seed
    await provider.add({ content: 'base', infer: false });

    // Interleave adds and searches
    const promises = Array.from({ length: 10 }, (_, i) => {
      if (i % 2 === 0) {
        return provider.add({ content: `interleaved-${i}`, infer: false });
      }
      return provider.search({ query: 'base' });
    });

    await Promise.all(promises);

    // At least 1 (seed) + 5 (even indices) = 6
    expect(await provider.count()).toBeGreaterThanOrEqual(6);

    await provider.close();
  });
});
