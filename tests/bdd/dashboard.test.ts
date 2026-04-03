/**
 * BDD-style Dashboard UI tests — using dev-browser for headless browser testing.
 * Requires the dashboard server to be running on port 8000.
 *
 * Run: Start server first with `npx tsx src/dashboard/server.ts`,
 *      then `npx vitest run tests/bdd/dashboard.test.ts`
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';

function devBrowser(script: string): string {
  try {
    return execSync(`dev-browser --headless --timeout 15 <<'DBSCRIPT'\n${script}\nDBSCRIPT`, {
      encoding: 'utf-8',
      timeout: 25000,
      env: { ...process.env },
    }).trim();
  } catch (err: any) {
    return ((err.stdout ?? '') + (err.stderr ?? '')).trim();
  }
}

/** Check if dashboard server is running */
async function serverReady(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:8000/api/v1/system/health');
    return res.ok;
  } catch { return false; }
}

describe('BDD: Dashboard UI', async () => {
  const ready = await serverReady();
  if (!ready) {
    it.skip('Dashboard server not running — skipping UI tests', () => {});
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Feature: Dashboard Overview Page
  // ═══════════════════════════════════════════════════════════════

  describe('Feature: Dashboard Overview Page', () => {
    it('Scenario: Dashboard loads and shows stats cards', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-overview");
        await page.goto("http://localhost:8000/dashboard");
        await page.waitForTimeout(3000);
        const text = await page.evaluate(() => document.body.innerText);
        console.log(text.includes("TOTAL MEMORIES") ? "PASS:stats_cards" : "FAIL:stats_cards");
        console.log(text.includes("AVG IMPORTANCE") ? "PASS:avg_importance" : "FAIL:avg_importance");
        console.log(text.includes("ACCESS DENSITY") ? "PASS:access_density" : "FAIL:access_density");
        console.log(text.includes("ACTIVE DAYS") ? "PASS:active_days" : "FAIL:active_days");
      `);
      expect(output).toContain('PASS:stats_cards');
      expect(output).toContain('PASS:avg_importance');
      expect(output).toContain('PASS:access_density');
      expect(output).toContain('PASS:active_days');
    });

    it('Scenario: Dashboard shows system health panel', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-overview");
        const text = await page.evaluate(() => document.body.innerText);
        console.log(text.includes("System Health") ? "PASS:health" : "FAIL:health");
        console.log(text.includes("running") ? "PASS:status" : "FAIL:status");
        console.log(text.includes("sqlite") ? "PASS:storage" : "FAIL:storage");
        console.log(text.includes("0.3.0") ? "PASS:version" : "FAIL:version");
      `);
      expect(output).toContain('PASS:health');
      expect(output).toContain('PASS:status');
      expect(output).toContain('PASS:storage');
      expect(output).toContain('PASS:version');
    });

    it('Scenario: Dashboard shows growth trend chart', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-overview");
        const text = await page.evaluate(() => document.body.innerText);
        console.log(text.includes("Growth Trend") ? "PASS:growth" : "FAIL:growth");
      `);
      expect(output).toContain('PASS:growth');
    });

    it('Scenario: Dashboard shows age distribution', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-overview");
        const text = await page.evaluate(() => document.body.innerText);
        console.log(text.includes("Age Distribution") ? "PASS:age" : "FAIL:age");
        console.log(text.includes("< 1 day") ? "PASS:age_bucket" : "FAIL:age_bucket");
      `);
      expect(output).toContain('PASS:age');
      expect(output).toContain('PASS:age_bucket');
    });

    it('Scenario: Dashboard shows hot memories table', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-overview");
        const text = await page.evaluate(() => document.body.innerText);
        console.log(text.includes("Hot Memories") ? "PASS:hot" : "FAIL:hot");
        console.log(text.includes("CONTENT") ? "PASS:header" : "FAIL:header");
        console.log(text.includes("HITS") ? "PASS:hits" : "FAIL:hits");
      `);
      expect(output).toContain('PASS:hot');
      expect(output).toContain('PASS:header');
      expect(output).toContain('PASS:hits');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: Navigation and Theme
  // ═══════════════════════════════════════════════════════════════

  describe('Feature: Navigation and Theme', () => {
    it('Scenario: Theme toggle switches to dark mode', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-theme");
        await page.goto("http://localhost:8000/dashboard");
        await page.waitForTimeout(1500);
        const before = await page.evaluate(() => document.documentElement.dataset.theme);
        await page.click('button:has-text("Theme")');
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => document.documentElement.dataset.theme);
        console.log("before:" + before);
        console.log("after:" + after);
        console.log(before !== after ? "PASS:toggle" : "FAIL:toggle");
      `);
      expect(output).toContain('PASS:toggle');
    });

    it('Scenario: Navigate to Memories page', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-nav");
        await page.goto("http://localhost:8000/dashboard");
        await page.waitForTimeout(2000);
        await page.click('a[data-page="memories"]');
        await page.waitForTimeout(2000);
        const visible = await page.evaluate(() => document.getElementById('memories-page')?.style.display !== 'none');
        console.log(visible ? "PASS:nav_memories" : "FAIL:nav_memories");
        const tableText = await page.evaluate(() => document.getElementById('memTable')?.innerText ?? '');
        console.log(tableText.includes("Content") ? "PASS:table_header" : "FAIL:table_header");
      `);
      expect(output).toContain('PASS:nav_memories');
      expect(output).toContain('PASS:table_header');
    });

    it('Scenario: Navigate to Settings page', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-nav-settings");
        await page.goto("http://localhost:8000/dashboard");
        await page.waitForTimeout(2000);
        await page.click('a[data-page="settings"]');
        await page.waitForTimeout(2000);
        const visible = await page.evaluate(() => document.getElementById('settings-page')?.style.display !== 'none');
        console.log(visible ? "PASS:nav_settings" : "FAIL:nav_settings");
        const content = await page.evaluate(() => document.getElementById('settingsContent')?.innerText ?? '');
        console.log(content.includes("version") ? "PASS:settings_loaded" : "FAIL:settings_loaded");
      `);
      expect(output).toContain('PASS:nav_settings');
      expect(output).toContain('PASS:settings_loaded');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: Memories Page
  // ═══════════════════════════════════════════════════════════════

  describe('Feature: Memories Page', () => {
    it('Scenario: Memories page lists memories with table', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-mem-list");
        await page.goto("http://localhost:8000/dashboard");
        await page.waitForTimeout(2000);
        await page.click('a[data-page="memories"]');
        await page.waitForTimeout(2000);
        const text = await page.evaluate(() => document.getElementById('memTable')?.innerText ?? '');
        // Check table structure (headers + delete buttons) and that rows exist
        console.log(text.includes("Content") ? "PASS:has_header" : "FAIL:has_header");
        console.log(text.includes("Del") ? "PASS:has_delete_btn" : "FAIL:has_delete_btn");
        // Check that at least one memory row is present (any content)
        const rowCount = (text.match(/Del/g) || []).length;
        console.log(rowCount > 0 ? "PASS:has_rows" : "FAIL:has_rows");
        console.log("rows:" + rowCount);
      `);
      expect(output).toContain('PASS:has_header');
      expect(output).toContain('PASS:has_delete_btn');
      expect(output).toContain('PASS:has_rows');
    });

    it('Scenario: Page info shows pagination', () => {
      const output = devBrowser(`
        const page = await browser.getPage("bdd-memories");
        const info = await page.evaluate(() => document.getElementById('memPageInfo')?.innerText ?? '');
        console.log(info.includes("of") ? "PASS:pagination" : "FAIL:pagination");
        console.log("page_info:" + info);
      `);
      expect(output).toContain('PASS:pagination');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature: API Endpoints (verified through dashboard)
  // ═══════════════════════════════════════════════════════════════

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
