import { describe, it, expect } from 'vitest';
import { createDashboardServer } from '../../src/dashboard/server.js';
import { Memory } from '../../src/core/memory.js';
import { SQLiteStore } from '../../src/storage/sqlite/sqlite.js';
import { Embeddings } from '@langchain/core/embeddings';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Minimal mock embeddings
class MockEmbeddings extends Embeddings {
  async embedQuery(text: string) { return Array.from({ length: 8 }, (_, i) => text.charCodeAt(i % text.length) / 256); }
  async embedDocuments(docs: string[]) { return Promise.all(docs.map(d => this.embedQuery(d))); }
}

async function createTestServer(config: Record<string, unknown> = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-mw-'));
  const mem = await Memory.create({ dbPath: path.join(tmp, 'test.db'), embeddings: new MockEmbeddings({}) });
  const { app, memory } = await createDashboardServer({
    memory: mem,
    config: { authEnabled: true, apiKeys: ['valid-key'], rateLimitEnabled: false, ...config } as any,
  });
  const server = app.listen(0);
  const port = (server.address() as any).port;
  return { server, memory, port, tmp, base: `http://localhost:${port}` };
}

async function api(base: string, method: string, urlPath: string, body?: unknown, headers: Record<string, string> = {}) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(base + urlPath, opts);
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: text }; }
}

describe('Dashboard auth middleware', () => {
  it('rejects requests without API key', async () => {
    const { server, memory, base, tmp } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/memories');
    expect(r.status).toBe(401);
    expect(r.data.code).toBe('unauthorized');
    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('rejects invalid API key', async () => {
    const { server, memory, base, tmp } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/memories', undefined, { 'X-API-Key': 'wrong' });
    expect(r.status).toBe(401);
    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('accepts valid X-API-Key header', async () => {
    const { server, memory, base, tmp } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/memories', undefined, { 'X-API-Key': 'valid-key' });
    expect(r.status).toBe(200);
    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('accepts api_key query param', async () => {
    const { server, memory, base, tmp } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/memories?api_key=valid-key');
    expect(r.status).toBe(200);
    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('health endpoint is public', async () => {
    const { server, memory, base, tmp } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/system/health');
    expect(r.status).toBe(200);
    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips auth when disabled', async () => {
    const { server, memory, base, tmp } = await createTestServer({ authEnabled: false });
    const r = await api(base, 'GET', '/api/v1/memories');
    expect(r.status).toBe(200);
    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('Dashboard routes', () => {
  it('GET /memories/count', async () => {
    const { server, memory, base, tmp } = await createTestServer();
    const H = { 'X-API-Key': 'valid-key' };
    const r = await api(base, 'GET', '/api/v1/memories/count', undefined, H);
    expect(r.data.data.count).toBe(0);
    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('POST + GET + PUT + DELETE memory lifecycle', async () => {
    const { server, memory, base, tmp } = await createTestServer();
    const H = { 'X-API-Key': 'valid-key' };

    // Create
    const add = await api(base, 'POST', '/api/v1/memories', { content: 'test', user_id: 'u1' }, H);
    expect(add.status).toBe(200);
    const id = add.data.data?.memories?.[0]?.memoryId;

    // Get
    const get = await api(base, 'GET', `/api/v1/memories/${id}`, undefined, H);
    expect(get.status).toBe(200);
    expect(get.data.data.content).toBe('test');

    // 404
    const get404 = await api(base, 'GET', '/api/v1/memories/nonexistent', undefined, H);
    expect(get404.status).toBe(404);

    // Update
    const put = await api(base, 'PUT', `/api/v1/memories/${id}`, { content: 'updated' }, H);
    expect(put.status).toBe(200);

    // Delete
    const del = await api(base, 'DELETE', `/api/v1/memories/${id}`, undefined, H);
    expect(del.status).toBe(200);

    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('GET /openapi.json returns valid spec', async () => {
    const { server, memory, base, tmp } = await createTestServer();
    const H = { 'X-API-Key': 'valid-key' };
    const r = await api(base, 'GET', '/openapi.json', undefined, H);
    expect(r.data.openapi).toBe('3.0.3');
    expect(Object.keys(r.data.paths).length).toBeGreaterThan(10);
    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('GET /api/v1/system/metrics returns Prometheus format', async () => {
    const { server, memory, base, tmp } = await createTestServer();
    const H = { 'X-API-Key': 'valid-key' };
    // Make a request first to generate metrics
    await api(base, 'GET', '/api/v1/memories', undefined, H);
    const r = await api(base, 'GET', '/api/v1/system/metrics', undefined, H);
    expect(r.status).toBe(200);
    expect(typeof r.data).toBe('string');
    expect((r.data as string)).toContain('powermem_api_requests_total');
    server.close(); await memory.close(); fs.rmSync(tmp, { recursive: true, force: true });
  });
});
