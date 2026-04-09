/**
 * Unit tests for system routes (src/server/api/v1/system.ts).
 * Covers GET /system/health, GET /system/status, GET /system/metrics,
 * DELETE /system/delete-all-memories.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServerApp } from '../../../src/server/main.js';
import type { Memory } from '../../../src/powermem/core/memory.js';
import { MockEmbeddings } from '../../mocks.js';

let server: Server;
let memory: Memory;
let base = '';

beforeAll(async () => {
  const app = await createServerApp({
    dbPath: ':memory:',
    embeddings: new MockEmbeddings(),
  });
  memory = app.memory;
  server = app.app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  await memory.close();
});

describe('GET /system/health', () => {
  it('returns ok status', async () => {
    const res = await fetch(`${base}/system/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ok');
  });
});

describe('GET /system/status', () => {
  it('returns version and running status', async () => {
    const res = await fetch(`${base}/system/status`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.version).toBeDefined();
    expect(json.data.status).toBe('running');
    expect(json.data.storageType).toBe('sqlite');
  });

  it('returns uptime as a number', async () => {
    const res = await fetch(`${base}/system/status`);
    const json = await res.json();
    expect(typeof json.data.uptime).toBe('number');
    expect(json.data.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns nodeVersion matching process.version', async () => {
    const res = await fetch(`${base}/system/status`);
    const json = await res.json();
    expect(json.data.nodeVersion).toBe(process.version);
  });

  it('returns memoryUsage with expected fields', async () => {
    const res = await fetch(`${base}/system/status`);
    const json = await res.json();
    expect(json.data.memoryUsage).toBeDefined();
    expect(typeof json.data.memoryUsage.heapUsed).toBe('number');
    expect(typeof json.data.memoryUsage.heapTotal).toBe('number');
    expect(typeof json.data.memoryUsage.rss).toBe('number');
  });
});

describe('GET /system/metrics', () => {
  it('returns Prometheus format text', async () => {
    const res = await fetch(`${base}/system/metrics`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('text/plain');
    const text = await res.text();
    expect(typeof text).toBe('string');
  });

  it('includes metric names after API calls', async () => {
    // Make a request to generate metrics
    await fetch(`${base}/system/health`);
    const res = await fetch(`${base}/system/metrics`);
    const text = await res.text();
    expect(text).toContain('powermem_');
  });
});

describe('DELETE /system/delete-all-memories', () => {
  it('deletes all memories and returns success', async () => {
    // Seed some data first
    await fetch(`${base}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'to be deleted via system',
        user_id: 'sys-del-user',
        infer: false,
      }),
    });

    const res = await fetch(`${base}/system/delete-all-memories`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.deleted).toBe(true);
  });

  it('deletes only memories for specified user_id', async () => {
    // Seed data for two users
    for (const uid of ['sys-keep', 'sys-remove']) {
      await fetch(`${base}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `data for ${uid}`,
          user_id: uid,
          infer: false,
        }),
      });
    }

    const res = await fetch(
      `${base}/system/delete-all-memories?user_id=sys-remove`,
      { method: 'DELETE' },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Verify sys-keep data still exists
    const listRes = await fetch(`${base}/memories?user_id=sys-keep`);
    const listJson = await listRes.json();
    expect(listJson.data.memories.length).toBeGreaterThan(0);
  });

  it('supports agent_id filter', async () => {
    const res = await fetch(
      `${base}/system/delete-all-memories?agent_id=some-agent`,
      { method: 'DELETE' },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
