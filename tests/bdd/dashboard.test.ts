/**
 * BDD-style API tests.
 * Requires the server to be running on port 8000.
 *
 * Run: Start server first with `npx tsx src/dashboard/server.ts`,
 *      then `npx vitest run tests/bdd/dashboard.test.ts`
 */
import { describe, it, expect } from 'vitest';

/** Check if server is running */
async function serverReady(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:8000/api/v1/system/health');
    return res.ok;
  } catch { return false; }
}

describe('BDD: REST API', async () => {
  const ready = await serverReady();
  if (!ready) {
    it.skip('Server not running — skipping API tests', () => {});
    return;
  }

  describe('Feature: REST API', () => {
    it('Scenario: Health endpoint returns ok', async () => {
      // Retry once on transient socket errors
      let json: any;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch('http://localhost:8000/api/v1/system/health');
          json = await res.json();
          break;
        } catch {
          if (attempt === 1) throw new Error('Health endpoint unreachable after retry');
          await new Promise(r => setTimeout(r, 500));
        }
      }
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('ok');
    });

    it('Scenario: Status endpoint returns version and uptime', async () => {
      const res = await fetch('http://localhost:8000/api/v1/system/status');
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.version).toBe('0.3.0');
      expect(json.data.status).toBe('running');
      expect(typeof json.data.uptime).toBe('number');
    });

    it('Scenario: Stats endpoint returns memory statistics', async () => {
      const res = await fetch('http://localhost:8000/api/v1/memories/stats');
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalMemories).toBeGreaterThanOrEqual(0);
      expect(json.data.ageDistribution).toBeDefined();
    });

    it('Scenario: Memories list endpoint returns array', async () => {
      const res = await fetch('http://localhost:8000/api/v1/memories?limit=5');
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.memories).toBeDefined();
      expect(Array.isArray(json.data.memories)).toBe(true);
    });

    it('Scenario: Create memory via POST', async () => {
      const res = await fetch('http://localhost:8000/api/v1/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'BDD test memory', user_id: 'bdd-user', infer: false }),
      });
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.memories.length).toBeGreaterThanOrEqual(1);
    });

    it('Scenario: Search memories via POST', async () => {
      const res = await fetch('http://localhost:8000/api/v1/memories/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'BDD test', limit: 5 }),
      });
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.results).toBeDefined();
    });
  });
});
