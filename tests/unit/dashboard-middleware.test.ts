import { describe, it, expect } from 'vitest';
import { createServerApp } from '../../src/server/main.js';
import { Memory } from '../../src/powermem/core/memory.js';
import { Embeddings } from '@langchain/core/embeddings';
import { MockLLM } from '../mocks.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Minimal mock embeddings
class MockEmbeddings extends Embeddings {
  async embedQuery(text: string) { return Array.from({ length: 8 }, (_, i) => text.charCodeAt(i % text.length) / 256); }
  async embedDocuments(docs: string[]) { return Promise.all(docs.map(d => this.embedQuery(d))); }
}

async function createTestServer(config: Record<string, unknown> = {}, llm?: MockLLM) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-mw-'));
  const { app, memory, userMemory, services, close } = await createServerApp({
    dbPath: path.join(tmp, 'test.db'),
    embeddings: new MockEmbeddings({}),
    llm,
    config: { authEnabled: true, apiKeys: ['valid-key'], rateLimitEnabled: false, ...config } as any,
  });
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const shutdown = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await close();
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  return { server, memory, userMemory, services, port, tmp, base: `http://localhost:${port}`, shutdown };
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
    const { base, shutdown } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/memories');
    expect(r.status).toBe(401);
    expect(r.data.error.code).toBe('UNAUTHORIZED');
    await shutdown();
  });

  it('rejects invalid API key', async () => {
    const { base, shutdown } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/memories', undefined, { 'X-API-Key': 'wrong' });
    expect(r.status).toBe(401);
    expect(r.data.error.code).toBe('UNAUTHORIZED');
    await shutdown();
  });

  it('accepts valid X-API-Key header', async () => {
    const { base, shutdown } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/memories', undefined, { 'X-API-Key': 'valid-key' });
    expect(r.status).toBe(200);
    await shutdown();
  });

  it('accepts api_key query param', async () => {
    const { base, shutdown } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/memories?api_key=valid-key');
    expect(r.status).toBe(200);
    await shutdown();
  });

  it('health endpoint is public', async () => {
    const { base, shutdown } = await createTestServer();
    const r = await api(base, 'GET', '/api/v1/system/health');
    expect(r.status).toBe(200);
    expect(r.data.timestamp).toBeTruthy();
    await shutdown();
  });

  it('skips auth when disabled', async () => {
    const { base, shutdown } = await createTestServer({ authEnabled: false });
    const r = await api(base, 'GET', '/api/v1/memories');
    expect(r.status).toBe(200);
    await shutdown();
  });
});

describe('Dashboard routes', () => {
  it('GET /memories/count', async () => {
    const { base, shutdown } = await createTestServer();
    const H = { 'X-API-Key': 'valid-key' };
    const r = await api(base, 'GET', '/api/v1/memories/count', undefined, H);
    expect(r.data.data.count).toBe(0);
    expect(r.data.timestamp).toBeTruthy();
    await shutdown();
  });

  it('POST + GET + PUT + DELETE memory lifecycle', async () => {
    const { base, shutdown } = await createTestServer();
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

    await shutdown();
  });

  it('GET /openapi.json returns valid spec', async () => {
    const { base, shutdown } = await createTestServer();
    const H = { 'X-API-Key': 'valid-key' };
    const r = await api(base, 'GET', '/openapi.json', undefined, H);
    expect(r.data.openapi).toBe('3.0.3');
    expect(Object.keys(r.data.paths).length).toBeGreaterThan(10);
    await shutdown();
  });

  it('GET /api/v1/system/metrics returns Prometheus format', async () => {
    const { base, shutdown } = await createTestServer();
    const H = { 'X-API-Key': 'valid-key' };
    // Make a request first to generate metrics
    await api(base, 'GET', '/api/v1/memories', undefined, H);
    const r = await api(base, 'GET', '/api/v1/system/metrics', undefined, H);
    expect(r.status).toBe(200);
    expect(typeof r.data).toBe('string');
    expect((r.data as string)).toContain('powermem_api_requests_total');
    await shutdown();
  });

  it('POST + GET + DELETE user profile lifecycle', async () => {
    const llm = new MockLLM(['User enjoys coffee and lives in Hangzhou.']);
    const { base, shutdown } = await createTestServer({}, llm);
    const H = { 'X-API-Key': 'valid-key' };

    const add = await api(base, 'POST', '/api/v1/users/u-profile/profile', {
      messages: [
        { role: 'user', content: 'I enjoy coffee.' },
        { role: 'assistant', content: 'Coffee is tasty.' },
        { role: 'user', content: 'I live in Hangzhou.' },
      ],
      include_roles: ['user'],
      exclude_roles: ['assistant'],
      infer: false,
    }, H);
    expect(add.status).toBe(200);
    expect(add.data.data.profile_content).toBe('User enjoys coffee and lives in Hangzhou.');
    expect(add.data.timestamp).toBeTruthy();

    const get = await api(base, 'GET', '/api/v1/users/u-profile/profile', undefined, H);
    expect(get.status).toBe(200);
    expect(get.data.data.user_id).toBe('u-profile');
    expect(get.data.data.profile_content).toBe('User enjoys coffee and lives in Hangzhou.');

    const del = await api(base, 'DELETE', '/api/v1/users/u-profile/profile', undefined, H);
    expect(del.status).toBe(200);

    const get404 = await api(base, 'GET', '/api/v1/users/u-profile/profile', undefined, H);
    expect(get404.status).toBe(404);
    expect(get404.data.error.code).toBe('USER_PROFILE_NOT_FOUND');

    const memories = await api(base, 'GET', '/api/v1/users/u-profile/memories', undefined, H);
    expect(memories.status).toBe(200);
    expect(memories.data.data.total).toBeGreaterThanOrEqual(1);

    await shutdown();
  });

  it('GET /users/profiles returns real profile list', async () => {
    const llm = new MockLLM([
      'User likes tea.',
      'User likes coding.',
    ]);
    const { base, shutdown } = await createTestServer({}, llm);
    const H = { 'X-API-Key': 'valid-key' };

    await api(base, 'POST', '/api/v1/users/u-a/profile', { messages: 'I like tea.', infer: false }, H);
    await api(base, 'POST', '/api/v1/users/u-b/profile', { messages: 'I like coding.', infer: false }, H);

    const list = await api(base, 'GET', '/api/v1/users/profiles?limit=10', undefined, H);
    expect(list.status).toBe(200);
    expect(list.data.data.total).toBe(2);
    expect(Array.isArray(list.data.data.profiles)).toBe(true);
    expect(list.data.data.profiles[0].profile_content || list.data.data.profiles[1].profile_content).toBeTruthy();

    await shutdown();
  });

  it('createServerApp initializes distinct services from shared config', async () => {
    const { services, shutdown } = await createTestServer({ authEnabled: false });
    expect(services.memoryService).toBeTruthy();
    expect(services.searchService).toBeTruthy();
    expect(services.userService).toBeTruthy();
    expect(services.memoryService?.getMemory()).not.toBe(services.searchService?.getMemory());
    expect(services.userService?.getUserMemory().getMemory()).not.toBe(services.memoryService?.getMemory());
    await shutdown();
  });

  it('returns 503 envelope when services fail to initialize', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-mw-fail-'));
    const { app, close } = await createServerApp({
      embeddings: new MockEmbeddings({}),
      memoryConfig: { vectorStore: { provider: 'invalid-provider', config: {} } } as any,
      config: { authEnabled: false, rateLimitEnabled: false } as any,
    });
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const base = `http://localhost:${port}`;
    const response = await api(base, 'GET', '/api/v1/users/profiles');
    expect(response.status).toBe(503);
    expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
