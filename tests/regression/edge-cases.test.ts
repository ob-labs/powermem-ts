/**
 * Edge case / boundary tests
 * Ported from Python's test_update_noexist.py
 *
 * Tests error handling and boundary conditions: nonexistent IDs,
 * empty content, idempotent deletes, empty queries, null/edge values.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NativeProvider } from '../../src/core/native-provider.js';
import { PowerMemError } from '../../src/errors/index.js';
import { MockEmbeddings } from '../mocks.js';

describe('edge cases and boundary conditions', () => {
  let provider: NativeProvider;

  beforeEach(async () => {
    provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });
  });

  afterEach(async () => {
    await provider.close();
  });

  // ── get() with invalid IDs ──────────────────────────────────────────

  describe('get — invalid IDs', () => {
    it('nonexistent ID returns null', async () => {
      expect(await provider.get('999999999')).toBeNull();
    });

    it('negative ID returns null', async () => {
      expect(await provider.get('-1')).toBeNull();
    });

    it('zero ID returns null', async () => {
      expect(await provider.get('0')).toBeNull();
    });

    it('very large ID returns null', async () => {
      expect(await provider.get('99999999999999999999')).toBeNull();
    });

    it('empty string ID returns null', async () => {
      expect(await provider.get('')).toBeNull();
    });
  });

  // ── update() with invalid IDs ───────────────────────────────────────

  describe('update — invalid IDs', () => {
    it('nonexistent ID throws PowerMemError', async () => {
      await expect(provider.update('999999999', { content: 'x' }))
        .rejects.toThrow('Memory not found');
      await expect(provider.update('999999999', { content: 'x' }))
        .rejects.toBeInstanceOf(PowerMemError);
    });

    it('empty string ID throws PowerMemError', async () => {
      await expect(provider.update('', { content: 'x' }))
        .rejects.toThrow('Memory not found');
      await expect(provider.update('', { content: 'x' }))
        .rejects.toBeInstanceOf(PowerMemError);
    });
  });

  // ── delete() edge cases ─────────────────────────────────────────────

  describe('delete — edge cases', () => {
    it('nonexistent ID returns false', async () => {
      expect(await provider.delete('999999999')).toBe(false);
    });

    it('delete is idempotent — second delete returns false', async () => {
      const res = await provider.add({ content: 'ephemeral', infer: false });
      const id = res.memories[0].id;

      expect(await provider.delete(id)).toBe(true);
      expect(await provider.delete(id)).toBe(false);
      expect(await provider.delete(id)).toBe(false);
    });
  });

  // ── search() edge cases ─────────────────────────────────────────────

  describe('search — edge cases', () => {
    it('search on empty store returns empty results', async () => {
      const result = await provider.search({ query: 'anything' });
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('search with limit=0 returns empty', async () => {
      await provider.add({ content: 'exists', infer: false });
      const result = await provider.search({ query: 'exists', limit: 0 });
      expect(result.results).toHaveLength(0);
    });

    it('search with very high threshold returns empty', async () => {
      await provider.add({ content: 'data', infer: false });
      const result = await provider.search({ query: 'totally different', threshold: 1.0 });
      expect(result.results).toHaveLength(0);
    });

    it('search with threshold=0 returns all', async () => {
      await provider.add({ content: 'a', infer: false });
      await provider.add({ content: 'b', infer: false });
      const result = await provider.search({ query: 'x', threshold: 0 });
      // Even dissimilar results have score > 0 (mock embeddings), so all pass
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  // ── getAll() edge cases ─────────────────────────────────────────────

  describe('getAll — edge cases', () => {
    it('empty store returns zero total', async () => {
      const result = await provider.getAll();
      expect(result.total).toBe(0);
      expect(result.memories).toHaveLength(0);
    });

    it('offset beyond total returns empty page', async () => {
      await provider.add({ content: 'only one', infer: false });
      const result = await provider.getAll({ offset: 100 });
      expect(result.total).toBe(1);
      expect(result.memories).toHaveLength(0);
    });

    it('limit=0 returns empty memories but correct total', async () => {
      await provider.add({ content: 'a', infer: false });
      await provider.add({ content: 'b', infer: false });
      const result = await provider.getAll({ limit: 0 });
      expect(result.total).toBe(2);
      expect(result.memories).toHaveLength(0);
    });
  });

  // ── count() edge cases ──────────────────────────────────────────────

  describe('count — edge cases', () => {
    it('empty store returns 0', async () => {
      expect(await provider.count()).toBe(0);
    });

    it('nonexistent userId returns 0', async () => {
      await provider.add({ content: 'a', userId: 'alice', infer: false });
      expect(await provider.count({ userId: 'nobody' })).toBe(0);
    });
  });

  // ── deleteAll() edge cases ──────────────────────────────────────────

  describe('deleteAll — edge cases', () => {
    it('deleteAll on empty store returns true', async () => {
      expect(await provider.deleteAll()).toBe(true);
    });

    it('deleteAll with nonexistent userId is no-op', async () => {
      await provider.add({ content: 'a', userId: 'alice', infer: false });
      await provider.deleteAll({ userId: 'nobody' });
      expect(await provider.count({ userId: 'alice' })).toBe(1);
    });
  });

  // ── Content edge cases ──────────────────────────────────────────────

  describe('content edge cases', () => {
    it('stores and retrieves very long content', async () => {
      const longContent = 'a'.repeat(10_000);
      const res = await provider.add({ content: longContent, infer: false });
      const mem = await provider.get(res.memories[0].id);
      expect(mem!.content).toBe(longContent);
      expect(mem!.content.length).toBe(10_000);
    });

    it('stores and retrieves content with special characters', async () => {
      const special = 'line1\nline2\ttab "quotes" \'apostrophe\' back\\slash <html>&amp;';
      const res = await provider.add({ content: special, infer: false });
      const mem = await provider.get(res.memories[0].id);
      expect(mem!.content).toBe(special);
    });
  });
});
