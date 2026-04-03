/**
 * Data correctness tests — prove that data written via CLI or API
 * is stored accurately and returned correctly through all output paths.
 *
 * Requires dashboard server running on port 8000.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const API = 'http://localhost:8000/api/v1';

async function api(endpoint: string, opts: RequestInit = {}): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API}${endpoint}`, {
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

async function serverReady(): Promise<boolean> {
  try { const r = await fetch(`${API}/system/health`); return r.ok; }
  catch { return false; }
}

describe('Data Correctness: Input → Storage → Output', async () => {
  const ready = await serverReady();
  if (!ready) {
    it.skip('Server not running', () => {});
    return;
  }

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
  // Feature: API write → Dashboard read (cross-channel)
  // ═══════════════════════════════════════════════════════════════

  describe('API write → Dashboard displays correctly', () => {
    it('memory added via API appears in dashboard memories page', () => {
      const output = execSync(`dev-browser --headless --timeout 20 <<'SCRIPT'
const page = await browser.getPage("data-verify-mem");
await page.goto("http://localhost:8000/dashboard");
await page.waitForTimeout(2000);
await page.click('a[data-page="memories"]');
await page.waitForTimeout(2000);
const tableText = await page.evaluate(() => document.getElementById('memTable')?.innerText ?? '');
// Check that at least one of our test memories appears
console.log(tableText.includes("dark roast coffee") ? "PASS:content_visible" : "FAIL:content_visible");
console.log(tableText.includes("verify-user-1") ? "PASS:user_visible" : "FAIL:user_visible");
SCRIPT`, { encoding: 'utf-8', timeout: 30000 }).trim();

      expect(output).toContain('PASS:content_visible');
      expect(output).toContain('PASS:user_visible');
    });

    it('stats cards show non-zero total after API writes', () => {
      const output = execSync(`dev-browser --headless --timeout 15 <<'SCRIPT'
const page = await browser.getPage("data-verify-stats");
await page.goto("http://localhost:8000/dashboard");
await page.waitForTimeout(3000);
const totalText = await page.evaluate(() => {
  const cards = document.querySelectorAll('.card-value');
  return cards[0]?.textContent ?? '0';
});
const total = parseInt(totalText);
console.log("total:" + total);
console.log(total > 0 ? "PASS:nonzero_total" : "FAIL:zero_total");
SCRIPT`, { encoding: 'utf-8', timeout: 25000 }).trim();

      expect(output).toContain('PASS:nonzero_total');
    });

    it('growth trend shows today in chart data', () => {
      const output = execSync(`dev-browser --headless --timeout 15 <<'SCRIPT'
const page = await browser.getPage("data-verify-growth");
await page.goto("http://localhost:8000/dashboard");
await page.waitForTimeout(3000);
const chartText = await page.evaluate(() => document.getElementById('growthChart')?.innerText ?? '');
const today = new Date().toISOString().slice(5, 10);
console.log("chart:" + chartText.substring(0, 100));
console.log(chartText.includes(today) ? "PASS:today_in_chart" : "FAIL:today_not_in_chart");
SCRIPT`, { encoding: 'utf-8', timeout: 25000 }).trim();

      expect(output).toContain('PASS:today_in_chart');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: User isolation — data written for user A not visible to user B
  // ═══════════════════════════════════════════════════════════════

  describe('User isolation across API and dashboard', () => {
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
