/**
 * Combinatorial tests: sortBy × order × pagination
 * Ported from Python's test_list_memories_sorting.py
 *
 * Tests every combination of sort field, order direction, and pagination params
 * to ensure SQLite ORDER BY json_extract works correctly across all axes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NativeProvider } from '../../src/core/native-provider.js';
import { MockEmbeddings } from '../mocks.js';

describe('getAll sorting — combinatorial', () => {
  let provider: NativeProvider;

  // Seed data: 5 records with varying timestamps and categories
  const records = [
    { content: 'oldest', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z', category: 'beta' },
    { content: 'early',  created_at: '2024-02-01T00:00:00Z', updated_at: '2024-05-01T00:00:00Z', category: 'alpha' },
    { content: 'middle', created_at: '2024-03-01T00:00:00Z', updated_at: '2024-04-01T00:00:00Z', category: 'gamma' },
    { content: 'late',   created_at: '2024-04-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z', category: 'alpha' },
    { content: 'newest', created_at: '2024-05-01T00:00:00Z', updated_at: '2024-02-01T00:00:00Z', category: 'beta' },
  ];

  beforeAll(async () => {
    provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });
    for (const r of records) {
      await provider.add({
        content: r.content,
        category: r.category,
        infer: false,
      });
    }
    // Patch timestamps directly in SQLite for deterministic sorting
    // (add() auto-generates timestamps, so we override)
    const all = await provider.getAll({ limit: 100 });
    const store = (provider as any).store;
    for (let i = 0; i < all.memories.length; i++) {
      const mem = all.memories[all.memories.length - 1 - i]; // reverse because default sort is DESC
      const r = records[i];
      store.db.prepare(`
        UPDATE memories SET payload = json_set(json_set(payload,
          '$.created_at', ?), '$.updated_at', ?)
        WHERE id = ?
      `).run(r.created_at, r.updated_at, mem.id);
    }
  });

  afterAll(async () => {
    await provider.close();
  });

  // ── sortBy × order combinations ──────────────────────────────────────

  it('created_at × asc', async () => {
    const { memories } = await provider.getAll({ sortBy: 'created_at', order: 'asc' });
    const contents = memories.map((m) => m.content);
    expect(contents).toEqual(['oldest', 'early', 'middle', 'late', 'newest']);
  });

  it('created_at × desc', async () => {
    const { memories } = await provider.getAll({ sortBy: 'created_at', order: 'desc' });
    const contents = memories.map((m) => m.content);
    expect(contents).toEqual(['newest', 'late', 'middle', 'early', 'oldest']);
  });

  it('updated_at × asc', async () => {
    const { memories } = await provider.getAll({ sortBy: 'updated_at', order: 'asc' });
    const contents = memories.map((m) => m.content);
    expect(contents).toEqual(['newest', 'late', 'middle', 'early', 'oldest']);
  });

  it('updated_at × desc', async () => {
    const { memories } = await provider.getAll({ sortBy: 'updated_at', order: 'desc' });
    const contents = memories.map((m) => m.content);
    expect(contents).toEqual(['oldest', 'early', 'middle', 'late', 'newest']);
  });

  it('category × asc', async () => {
    const { memories } = await provider.getAll({ sortBy: 'category', order: 'asc' });
    const categories = memories.map((m) => m.category);
    // alpha, alpha, beta, beta, gamma
    expect(categories).toEqual(['alpha', 'alpha', 'beta', 'beta', 'gamma']);
  });

  it('category × desc', async () => {
    const { memories } = await provider.getAll({ sortBy: 'category', order: 'desc' });
    const categories = memories.map((m) => m.category);
    expect(categories).toEqual(['gamma', 'beta', 'beta', 'alpha', 'alpha']);
  });

  // ── Sorting × pagination ─────────────────────────────────────────────

  it('created_at asc with limit=2 offset=0 returns first page', async () => {
    const { memories, total } = await provider.getAll({
      sortBy: 'created_at', order: 'asc', limit: 2, offset: 0,
    });
    expect(total).toBe(5);
    expect(memories.map((m) => m.content)).toEqual(['oldest', 'early']);
  });

  it('created_at asc with limit=2 offset=2 returns second page', async () => {
    const { memories } = await provider.getAll({
      sortBy: 'created_at', order: 'asc', limit: 2, offset: 2,
    });
    expect(memories.map((m) => m.content)).toEqual(['middle', 'late']);
  });

  it('created_at asc with limit=2 offset=4 returns last page', async () => {
    const { memories } = await provider.getAll({
      sortBy: 'created_at', order: 'asc', limit: 2, offset: 4,
    });
    expect(memories.map((m) => m.content)).toEqual(['newest']);
  });

  it('default sort (no sortBy) uses id desc', async () => {
    const { memories } = await provider.getAll();
    // IDs are snowflake, monotonically increasing → desc means last-added first
    expect(memories[0].content).toBe('newest');
  });

  it('unknown sortBy falls back to default id desc', async () => {
    const { memories } = await provider.getAll({ sortBy: 'nonexistent_field' });
    expect(memories[0].content).toBe('newest');
  });
});
