/**
 * Data correctness tests — prove that data written via API
 * is stored accurately and returned correctly through all output paths.
 *
 * Uses an isolated in-process server instead of relying on a shared localhost instance.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServerApp } from '../../src/server/main.js';
import { MockEmbeddings } from '../mocks.js';

let server: Server;
let apiBase = '';
let closeApp: (() => Promise<void>) | undefined;
let tmpDir = '';

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdd-data-correctness-'));
  const appState = await createServerApp({
    dbPath: path.join(tmpDir, 'bdd.db'),
    embeddings: new MockEmbeddings(),
  });
  closeApp = appState.close;
  server = appState.app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  apiBase = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await closeApp?.();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function api(endpoint: string, opts: RequestInit = {}): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${apiBase}${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      return json.data;
    } catch (err: any) {
      if (attempt === 2 || !err.message?.includes('fetch failed')) throw err;
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

describe('Data Correctness: Input → Storage → Output', () => {
  // ═══════════════════════════════════════════════════════════════
  // Feature: API Create → API Read (round-trip fidelity)
  // ═══════════════════════════════════════════════════════════════

  describe('API write → API read round-trip', () => {
    it('content, userId, metadata survive round-trip', async () => {
      // Write
      const created = await api('/memories', {
        method: 'POST',
        body: JSON.stringify({
          content: 'User likes dark roast coffee',
          user_id: 'verify-user-1',
          metadata: { source: 'test', priority: 'high' },
          infer: false,
        }),
      });

      expect(created.memories).toHaveLength(1);
      const mem = created.memories[0];
      expect(mem.content).toBe('User likes dark roast coffee');
      expect(mem.userId).toBe('verify-user-1');

      // Read back via list
      const listed = await api('/memories?user_id=verify-user-1&limit=10');
      const found = listed.memories.find((m: any) => m.memoryId === mem.memoryId || m.id === mem.id);
      expect(found).toBeDefined();
      expect(found.content).toBe('User likes dark roast coffee');
      expect(found.userId).toBe('verify-user-1');
    });

    it('search returns the correct memory with score', async () => {
      // Add a known memory
      await api('/memories', {
        method: 'POST',
        body: JSON.stringify({
          content: 'Alice works at Google as a software engineer',
          user_id: 'verify-user-2',
          infer: false,
        }),
      });

      // Search for it
      const searchResult = await api('/memories/search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'software engineer Google',
          user_id: 'verify-user-2',
          limit: 5,
        }),
      });

      expect(searchResult.results.length).toBeGreaterThan(0);
      const topResult = searchResult.results[0];
      expect(topResult.content).toContain('Google');
      expect(topResult.content).toContain('engineer');
      expect(typeof topResult.score).toBe('number');
      expect(topResult.score).toBeGreaterThan(0);
      expect(topResult.score).toBeLessThanOrEqual(1);
    });

    it('delete removes the memory and it is no longer retrievable', async () => {
      const created = await api('/memories', {
        method: 'POST',
        body: JSON.stringify({
          content: 'Ephemeral memory to delete',
          user_id: 'verify-user-3',
          infer: false,
        }),
      });

      const memId = created.memories[0].memoryId ?? created.memories[0].id;

      // Delete
      const deleteResult = await api(`/memories/${memId}`, { method: 'DELETE' });
      expect(deleteResult.deleted).toBe(true);

      // Verify not in list
      const listed = await api('/memories?user_id=verify-user-3&limit=100');
      const found = listed.memories.find((m: any) => (m.memoryId ?? m.id) === memId);
      expect(found).toBeUndefined();
    });

    it('stats reflect accurate counts after writes', async () => {
      const userId = `verify-stats-${Date.now()}`;

      // Empty stats
      const before = await api(`/memories/stats?user_id=${userId}`);
      expect(before.totalMemories).toBe(0);

      // Add 3 memories
      for (let i = 0; i < 3; i++) {
        await api('/memories', {
          method: 'POST',
          body: JSON.stringify({ content: `Stats test ${i}`, user_id: userId, infer: false }),
        });
      }

      // Stats should reflect 3
      const after = await api(`/memories/stats?user_id=${userId}`);
      expect(after.totalMemories).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: User isolation — data written for user A not visible to user B
  // ═══════════════════════════════════════════════════════════════

  describe('User isolation across API responses', () => {
    it('user A memories not visible in user B list', async () => {
      const tsA = Date.now();
      const userA = `isolated-A-${tsA}`;
      const userB = `isolated-B-${tsA}`;

      await api('/memories', {
        method: 'POST',
        body: JSON.stringify({ content: 'Secret A data', user_id: userA, infer: false }),
      });
      await api('/memories', {
        method: 'POST',
        body: JSON.stringify({ content: 'Secret B data', user_id: userB, infer: false }),
      });

      // List for A should not contain B's data
      const listA = await api(`/memories?user_id=${userA}&limit=100`);
      const contentsA = listA.memories.map((m: any) => m.content);
      expect(contentsA).toContain('Secret A data');
      expect(contentsA).not.toContain('Secret B data');

      // List for B should not contain A's data
      const listB = await api(`/memories?user_id=${userB}&limit=100`);
      const contentsB = listB.memories.map((m: any) => m.content);
      expect(contentsB).toContain('Secret B data');
      expect(contentsB).not.toContain('Secret A data');
    });

    it('search for user A does not return user B results', async () => {
      const ts = Date.now();
      const userA = `search-iso-A-${ts}`;
      const userB = `search-iso-B-${ts}`;

      await api('/memories', {
        method: 'POST',
        body: JSON.stringify({ content: 'Alpha unique keyword XYZ', user_id: userA, infer: false }),
      });
      await api('/memories', {
        method: 'POST',
        body: JSON.stringify({ content: 'Beta unique keyword XYZ', user_id: userB, infer: false }),
      });

      const searchA = await api('/memories/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'unique keyword XYZ', user_id: userA, limit: 10 }),
      });

      const searchB = await api('/memories/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'unique keyword XYZ', user_id: userB, limit: 10 }),
      });

      // A's search should only contain A's memory
      expect(searchA.results.every((r: any) => r.content.includes('Alpha'))).toBe(true);
      // B's search should only contain B's memory
      expect(searchB.results.every((r: any) => r.content.includes('Beta'))).toBe(true);
    });

    it('stats for user A reflect only A count', async () => {
      const ts = Date.now();
      const userA = `stats-iso-A-${ts}`;
      const userB = `stats-iso-B-${ts}`;

      await api('/memories', { method: 'POST', body: JSON.stringify({ content: 'A1', user_id: userA, infer: false }) });
      await api('/memories', { method: 'POST', body: JSON.stringify({ content: 'A2', user_id: userA, infer: false }) });
      await api('/memories', { method: 'POST', body: JSON.stringify({ content: 'B1', user_id: userB, infer: false }) });

      const statsA = await api(`/memories/stats?user_id=${userA}`);
      const statsB = await api(`/memories/stats?user_id=${userB}`);

      expect(statsA.totalMemories).toBe(2);
      expect(statsB.totalMemories).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: Data type fidelity (unicode, special chars, long content)
  // ═══════════════════════════════════════════════════════════════

  describe('Data type fidelity', () => {
    it('Chinese content survives API round-trip', async () => {
      const content = '用户喜欢喝咖啡，住在上海浦东新区';
      const created = await api('/memories', {
        method: 'POST',
        body: JSON.stringify({ content, user_id: 'unicode-user', infer: false }),
      });
      expect(created.memories[0].content).toBe(content);

      const listed = await api('/memories?user_id=unicode-user&limit=10');
      const found = listed.memories.find((m: any) => m.content === content);
      expect(found).toBeDefined();
    });

    it('emoji content survives API round-trip', async () => {
      const content = 'I love 🐱 cats and ☕ coffee! 🎉🚀';
      const created = await api('/memories', {
        method: 'POST',
        body: JSON.stringify({ content, user_id: 'emoji-user', infer: false }),
      });
      expect(created.memories[0].content).toBe(content);
    });

    it('special characters survive API round-trip', async () => {
      const content = 'line1\nline2\ttab "quotes" \'apostrophe\' <html>&amp;';
      const created = await api('/memories', {
        method: 'POST',
        body: JSON.stringify({ content, user_id: 'special-user', infer: false }),
      });
      expect(created.memories[0].content).toBe(content);
    });

    it('moderately long content (500 chars) survives API round-trip', async () => {
      const content = 'The quick brown fox jumps over the lazy dog. '.repeat(11); // ~495 chars
      const created = await api('/memories', {
        method: 'POST',
        body: JSON.stringify({ content, user_id: 'long-user', infer: false }),
      });
      expect(created.memories[0].content).toBe(content);
      expect(created.memories[0].content.length).toBeGreaterThan(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: Pagination correctness
  // ═══════════════════════════════════════════════════════════════

  describe('Pagination data correctness', () => {
    it('offset/limit returns correct page with no overlap', { timeout: 30000 }, async () => {
      const userId = `page-test-${Date.now()}`;
      // Insert 5 items (fewer to stay within embedding timeout)
      for (let i = 0; i < 5; i++) {
        await api('/memories', {
          method: 'POST',
          body: JSON.stringify({ content: `Page ${i}`, user_id: userId, infer: false }),
        });
      }

      const page1 = await api(`/memories?user_id=${userId}&limit=2&offset=0`);
      const page2 = await api(`/memories?user_id=${userId}&limit=2&offset=2`);
      const page3 = await api(`/memories?user_id=${userId}&limit=2&offset=4`);

      expect(page1.total).toBe(5);
      expect(page1.memories).toHaveLength(2);
      expect(page2.memories).toHaveLength(2);
      expect(page3.memories).toHaveLength(1);

      // No overlap
      const ids1 = new Set(page1.memories.map((m: any) => m.memoryId ?? m.id));
      const ids2 = new Set(page2.memories.map((m: any) => m.memoryId ?? m.id));
      for (const id of ids2) expect(ids1.has(id)).toBe(false);
    });
  });
});
